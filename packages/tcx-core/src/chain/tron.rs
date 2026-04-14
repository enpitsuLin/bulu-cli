use tcx_constants::CurveType;
use tcx_keystore::{
  Keystore as TcxKeystore, MessageSigner, SignatureParameters, TransactionSigner,
};
use tcx_tron::transaction::{
  TronMessageInput as TcxTronMessageInput, TronMessageOutput as TcxTronMessageOutput, TronTxInput,
  TronTxOutput as TcxTronTxOutput,
};
use tcx_tron::TronAddress;

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

pub(crate) fn derive_tron_address(
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

pub(crate) fn sign_tron_message(
  keystore: &mut TcxKeystore,
  derivation_path: &str,
  network: &str,
  message: &str,
) -> CoreResult<SignedMessage> {
  let params = SignatureParameters {
    curve: CurveType::SECP256k1,
    derivation_path: derivation_path.to_string(),
    chain_type: "TRON".to_string(),
    network: network.to_string(),
    seg_wit: String::new(),
  };
  let signed: TcxTronMessageOutput = keystore
    .sign_message(
      &params,
      &TcxTronMessageInput::from(TronMessageInput {
        value: message.to_string(),
        header: Some("TRON".to_string()),
        version: Some(1),
      }),
    )
    .map_core_err()?;
  Ok(SignedMessage {
    signature: signed.signature,
  })
}

pub(crate) fn sign_tron_transaction(
  keystore: &mut TcxKeystore,
  derivation_path: &str,
  network: &str,
  tx_hex: &str,
) -> CoreResult<SignedTransactionResult> {
  let tx = TronTxInput {
    raw_data: strip_hex_prefix(tx_hex).to_string(),
  };
  let params = SignatureParameters {
    curve: CurveType::SECP256k1,
    derivation_path: derivation_path.to_string(),
    chain_type: "TRON".to_string(),
    network: network.to_string(),
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
