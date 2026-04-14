use tcx_common::{keccak256, sha256, ToHex};
use tcx_constants::CurveType;
use tcx_keystore::keystore::IdentityNetwork;
use tcx_keystore::{Keystore as TcxKeystore, Signer};
use tcx_tron::TronAddress;

use crate::chain::ChainSigner;
use crate::derivation::ResolvedDerivation;
use crate::error::{CoreResult, ResultExt};
use crate::types::{SignedMessage, SignedTransactionResult};

#[derive(Debug)]
pub(crate) struct TronSigner;
pub(crate) const TRON_SIGNER: TronSigner = TronSigner;

impl ChainSigner for TronSigner {
  fn coin_name(&self) -> &'static str {
    "TRON"
  }

  fn namespace(&self) -> &'static str {
    "tron"
  }

  fn default_chain_id(&self, network: IdentityNetwork) -> &'static str {
    match network {
      IdentityNetwork::Mainnet => "tron:0x2b6653dc",
      IdentityNetwork::Testnet => "tron:0xcd8690dc",
    }
  }

  fn default_derivation_path(&self, index: u32) -> String {
    format!("m/44'/195'/0'/0/{index}")
  }

  fn derive_address(
    &self,
    keystore: &mut TcxKeystore,
    derivation_path: &str,
    network: &str,
  ) -> CoreResult<String> {
    let coin_info = tcx_constants::CoinInfo {
      chain_id: String::new(),
      coin: "TRON".to_string(),
      derivation_path: derivation_path.to_string(),
      curve: CurveType::SECP256k1,
      network: network.to_string(),
      seg_wit: String::new(),
      contract_code: String::new(),
    };
    let account = keystore
      .derive_coin::<TronAddress>(&coin_info)
      .map_core_err()?;
    Ok(account.address)
  }

  fn sign_message(
    &self,
    keystore: &mut TcxKeystore,
    derivation_path: &str,
    message: &[u8],
  ) -> CoreResult<SignedMessage> {
    // tcx-tron's MessageSigner implementation is incompatible with tronWeb.trx.verifyMessageV2.
    // For version 1 it hardcodes '\n32' in the header regardless of actual message length.
    // For version 2 it omits the length entirely.
    // tronWeb expects: keccak256('\x19TRON Signed Message:\n' + len(message) + message_bytes).
    // We bypass tcx-tron and hash/sign manually to match tronWeb's standard behavior.
    let prefix = "\x19TRON Signed Message:\n";
    let len_str = message.len().to_string();
    let to_hash = [prefix.as_bytes(), len_str.as_bytes(), message].concat();
    let hash = keccak256(&to_hash);

    let mut sign_result = keystore
      .secp256k1_ecdsa_sign_recoverable(&hash, derivation_path)
      .map_core_err()?;
    sign_result[64] += 27;

    Ok(SignedMessage {
      signature: format!("0x{}", sign_result.to_hex()),
    })
  }

  fn sign_transaction(
    &self,
    keystore: &mut TcxKeystore,
    _resolved: &ResolvedDerivation,
    derivation_path: &str,
    tx_bytes: &[u8],
  ) -> CoreResult<SignedTransactionResult> {
    let hash = sha256(tx_bytes);
    let signature = keystore
      .secp256k1_ecdsa_sign_recoverable(&hash, derivation_path)
      .map_core_err()?;
    Ok(SignedTransactionResult {
      signature: signature.to_hex(),
      raw_transaction: None,
    })
  }
}
