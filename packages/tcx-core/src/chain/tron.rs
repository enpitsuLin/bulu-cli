use tcx_common::{keccak256, FromHex, ToHex};
use tcx_constants::CurveType;
use tcx_keystore::keystore::IdentityNetwork;
use tcx_keystore::{Keystore as TcxKeystore, SignatureParameters, Signer, TransactionSigner};
use tcx_tron::transaction::{
  TronMessageInput as TcxTronMessageInput, TronTxInput, TronTxOutput as TcxTronTxOutput,
};
use tcx_tron::TronAddress;

use crate::chain::ChainSigner;
use crate::derivation::ResolvedDerivation;
use crate::error::{CoreError, CoreResult, ResultExt};
use crate::strings::strip_hex_prefix;
use crate::types::{SignedMessage, SignedTransactionResult};

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct TronMessageInput {
  pub(crate) value: String,
  pub(crate) header: Option<String>,
  pub(crate) version: Option<u32>,
}

impl From<TronMessageInput> for TcxTronMessageInput {
  fn from(value: TronMessageInput) -> Self {
    Self {
      value: value.value,
      header: value.header.unwrap_or_else(|| "TRON".to_string()),
      version: value.version.unwrap_or(1),
    }
  }
}

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
    message: &str,
  ) -> CoreResult<SignedMessage> {
    // tcx-tron's MessageSigner implementation is incompatible with tronWeb.trx.verifyMessageV2.
    // For version 1 it hardcodes '\n32' in the header regardless of actual message length.
    // For version 2 it omits the length entirely.
    // tronWeb expects: keccak256('\x19TRON Signed Message:\n' + len(message) + message).
    // We bypass tcx-tron and hash/sign manually to match tronWeb's standard behavior.
    let data = if message.to_lowercase().starts_with("0x") {
      Vec::from_hex_auto(message).map_core_err()?
    } else {
      message.as_bytes().to_vec()
    };

    let prefix = "\x19TRON Signed Message:\n";
    let len_str = data.len().to_string();
    let to_hash = [prefix.as_bytes(), len_str.as_bytes(), &data].concat();
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
    resolved: &ResolvedDerivation,
    derivation_path: &str,
    tx_hex: &str,
  ) -> CoreResult<SignedTransactionResult> {
    let tx = TronTxInput {
      raw_data: strip_hex_prefix(tx_hex).to_string(),
    };
    let params = SignatureParameters {
      curve: CurveType::SECP256k1,
      derivation_path: derivation_path.to_string(),
      chain_type: "TRON".to_string(),
      network: resolved.network.to_string(),
      seg_wit: String::new(),
    };
    let signed: TcxTronTxOutput = keystore.sign_transaction(&params, &tx).map_core_err()?;
    let signature = signed
      .signatures
      .first()
      .cloned()
      .ok_or_else(|| CoreError::new("tron transaction signing produced no signatures"))?;
    Ok(SignedTransactionResult { signature })
  }
}
