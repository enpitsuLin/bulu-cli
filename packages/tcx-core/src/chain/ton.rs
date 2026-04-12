use tcx_common::{FromHex, ToHex};
use tcx_constants::CurveType;
use tcx_keystore::{Keystore as TcxKeystore, SignatureParameters, TransactionSigner};
use tcx_ton::transaction::{TonRawTxIn, TonTxOut};

use crate::derivation::ResolvedDerivation;
use crate::error::{CoreError, CoreResult, ResultExt};
use crate::types::{SignedMessage, SignedTransaction};

pub(crate) fn prepare_transaction(tx_hex: &str) -> CoreResult<TonRawTxIn> {
  let hash = Vec::from_hex_auto(tx_hex).map_core_err()?;
  if hash.is_empty() {
    return Err(CoreError::new("txHex must not be empty"));
  }
  if hash.len() != 32 {
    return Err(CoreError::new("txHex must be a 32-byte TON signing hash"));
  }

  Ok(TonRawTxIn {
    hash: format!("0x{}", hash.to_hex()),
  })
}

pub(crate) fn sign_message(
  _keystore: &mut TcxKeystore,
  _resolved: &ResolvedDerivation,
  _derivation_path: &str,
  _message: &str,
) -> CoreResult<SignedMessage> {
  Err(CoreError::new("TON signMessage is not supported"))
}

pub(crate) fn sign_transaction(
  keystore: &mut TcxKeystore,
  resolved: &ResolvedDerivation,
  derivation_path: &str,
  tx: TonRawTxIn,
) -> CoreResult<SignedTransaction> {
  let params = SignatureParameters {
    curve: CurveType::ED25519,
    derivation_path: derivation_path.to_string(),
    chain_type: resolved.chain.coin_name().to_string(),
    network: resolved.network.to_string(),
    seg_wit: String::new(),
  };
  let signed: TonTxOut = keystore.sign_transaction(&params, &tx).map_core_err()?;
  Ok(SignedTransaction {
    signature: signed.signature,
    tx_hash: None,
    signatures: None,
  })
}
