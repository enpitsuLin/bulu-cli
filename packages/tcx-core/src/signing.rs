use napi::{Either, Result};
use napi_derive::napi;

use crate::chain::SignedTransaction;
use crate::error::CoreResultExt;
use crate::service;
use crate::types::{EthSignedTransaction, SignedMessage, TronSignedTransaction};

#[napi(js_name = "signMessage")]
/// Signs a plain chain-specific message using the default chain conventions.
///
/// `chain_id` selects the signer implementation. Ethereum uses personal-sign
/// semantics, while Tron uses the default TRON message header and version.
pub fn sign_message(
  name: String,
  chain_id: String,
  message: String,
  password: String,
  vault_path: String,
) -> Result<SignedMessage> {
  service::sign_message(name, chain_id, message, password, vault_path).into_napi()
}

#[napi(js_name = "signTransaction")]
/// Signs an unsigned chain-specific transaction hex using the default chain
/// conventions.
///
/// `chain_id` selects the signer implementation. Ethereum expects an unsigned
/// RLP-encoded transaction hex, while Tron expects raw transaction bytes hex.
pub fn sign_transaction(
  name: String,
  chain_id: String,
  tx_hex: String,
  password: String,
  vault_path: String,
) -> Result<Either<EthSignedTransaction, TronSignedTransaction>> {
  let signed =
    service::sign_transaction(name, chain_id, tx_hex, password, vault_path).into_napi()?;

  Ok(match signed {
    SignedTransaction::Ethereum(result) => Either::A(result),
    SignedTransaction::Tron(result) => Either::B(result),
  })
}
