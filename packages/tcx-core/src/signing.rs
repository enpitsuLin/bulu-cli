use napi::Result;
use napi_derive::napi;

use crate::error::CoreResultExt;
use crate::service;
use crate::types::{SignedMessage, SignedTransaction};

#[napi(js_name = "signMessage")]
/// Signs a plain chain-specific message using the default chain conventions.
///
/// `chain_id` selects the signer implementation. Ethereum uses personal-sign
/// semantics, Tron uses the default TRON message header and version, and TON is
/// intentionally unsupported.
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
/// RLP-encoded transaction hex, Tron expects raw transaction bytes hex, and TON
/// expects a hex-encoded 32-byte signing hash.
pub fn sign_transaction(
  name: String,
  chain_id: String,
  tx_hex: String,
  password: String,
  vault_path: String,
) -> Result<SignedTransaction> {
  service::sign_transaction(name, chain_id, tx_hex, password, vault_path).into_napi()
}
