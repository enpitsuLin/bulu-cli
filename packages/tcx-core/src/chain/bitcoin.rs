use tcx_btc_kin::transaction::{BtcMessageInput, PsbtInput};
use tcx_btc_kin::{sign_psbt, BtcKinAddress};
use tcx_common::FromHex;
use tcx_constants::CurveType;
use tcx_keystore::keystore::IdentityNetwork;
use tcx_keystore::{Keystore as TcxKeystore, MessageSigner};
use tcx_primitive::get_account_path;

use crate::chain::{Caip2ChainId, ChainSigner};
use crate::error::{CoreError, CoreResult, ResultExt};
use crate::types::{SignedMessage, SignedTransactionResult};

#[derive(Debug)]
pub(crate) struct BitcoinSigner;
pub(crate) const BITCOIN_SIGNER: BitcoinSigner = BitcoinSigner;

impl ChainSigner for BitcoinSigner {
  fn coin_name(&self) -> &'static str {
    "BITCOIN"
  }

  fn namespace(&self) -> &'static str {
    "bip122"
  }

  fn default_chain_id(&self, network: IdentityNetwork) -> &'static str {
    match network {
      IdentityNetwork::Mainnet => "bip122:000000000019d6689c085ae165831e93",
      IdentityNetwork::Testnet => "bip122:000000000933ea01ad0ee984209779ba",
    }
  }

  fn default_derivation_path(&self, index: u32) -> String {
    format!("m/84'/0'/0'/0/{index}")
  }

  fn derive_address(
    &self,
    keystore: &mut TcxKeystore,
    derivation_path: &str,
    network: &str,
  ) -> CoreResult<String> {
    let coin_info = tcx_constants::CoinInfo {
      chain_id: String::new(),
      coin: "BITCOIN".to_string(),
      derivation_path: derivation_path.to_string(),
      curve: CurveType::SECP256k1,
      network: network.to_string(),
      seg_wit: "VERSION_0".to_string(),
      contract_code: String::new(),
    };
    let account = keystore
      .derive_coin::<BtcKinAddress>(&coin_info)
      .map_core_err()?;
    Ok(account.address)
  }

  fn sign_message(
    &self,
    keystore: &mut TcxKeystore,
    derivation_path: &str,
    message: &[u8],
  ) -> CoreResult<SignedMessage> {
    let account_path = get_account_path(derivation_path).map_core_err()?;
    let network = match keystore.store().meta.network {
      IdentityNetwork::Mainnet => "MAINNET",
      IdentityNetwork::Testnet => "TESTNET",
    };
    let params = tcx_keystore::SignatureParameters {
      curve: CurveType::SECP256k1,
      chain_type: "BITCOIN".to_string(),
      network: network.to_string(),
      seg_wit: "VERSION_0".to_string(),
      derivation_path: account_path,
    };
    let message_str = String::from_utf8_lossy(message).to_string();
    let output = keystore
      .sign_message(
        &params,
        &BtcMessageInput {
          message: message_str,
        },
      )
      .map_core_err()?;
    let signature_bytes = Vec::from_hex_auto(&output.signature).map_core_err()?;
    let signature_base64 = base64::encode(signature_bytes);
    Ok(SignedMessage {
      signature: signature_base64,
      format: Some("base64".to_string()),
    })
  }

  fn sign_transaction(
    &self,
    keystore: &mut TcxKeystore,
    _chain_id: &Caip2ChainId,
    derivation_path: &str,
    tx_bytes: &[u8],
  ) -> CoreResult<SignedTransactionResult> {
    let psbt_hex = std::str::from_utf8(tx_bytes).map_err(|e| CoreError::new(e.to_string()))?;
    let account_path = get_account_path(derivation_path).map_core_err()?;
    let psbt_input = PsbtInput {
      psbt: psbt_hex.to_string(),
      auto_finalize: true,
    };
    let output = sign_psbt("BITCOIN", &account_path, keystore, psbt_input).map_core_err()?;
    Ok(SignedTransactionResult {
      signature: output.psbt,
      format: None,
    })
  }
}
