use tcx_constants::CurveType;
use tcx_keystore::{
  Keystore as TcxKeystore, MessageSigner, SignatureParameters, TransactionSigner,
};
use tcx_tron::transaction::{
  TronMessageInput as TcxTronMessageInput, TronMessageOutput as TcxTronMessageOutput, TronTxInput,
  TronTxOutput as TcxTronTxOutput,
};

use crate::derivation::ResolvedDerivation;
use crate::error::{CoreError, CoreResult, ResultExt};
use crate::strings::strip_hex_prefix;
use crate::types::{SignedMessage, TronMessageInput};

use super::SignedTransaction;

pub(crate) fn prepare_transaction(tx_hex: &str) -> CoreResult<TronTxInput> {
  // Tron transactions are passed as raw hex bytes without additional parsing
  Ok(TronTxInput {
    raw_data: strip_hex_prefix(tx_hex).to_string(),
  })
}

pub(crate) fn sign_message(
  keystore: &mut TcxKeystore,
  resolved: &ResolvedDerivation,
  derivation_path: &str,
  message: &str,
) -> CoreResult<SignedMessage> {
  let params = SignatureParameters {
    curve: CurveType::SECP256k1,
    derivation_path: derivation_path.to_string(),
    chain_type: resolved.chain.coin_name().to_string(),
    network: resolved.network.to_string(),
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

pub(crate) fn sign_transaction(
  keystore: &mut TcxKeystore,
  resolved: &ResolvedDerivation,
  derivation_path: &str,
  tx: TronTxInput,
) -> CoreResult<SignedTransaction> {
  let params = SignatureParameters {
    curve: CurveType::SECP256k1,
    derivation_path: derivation_path.to_string(),
    chain_type: resolved.chain.coin_name().to_string(),
    network: resolved.network.to_string(),
    seg_wit: String::new(),
  };
  let signed: TcxTronTxOutput = keystore.sign_transaction(&params, &tx).map_core_err()?;
  let signature = signed
    .signatures
    .first()
    .cloned()
    .ok_or_else(|| CoreError::new("Tron signer returned no signatures"))?;
  Ok(SignedTransaction {
    signature,
    tx_hash: None,
    signatures: Some(signed.signatures),
  })
}
