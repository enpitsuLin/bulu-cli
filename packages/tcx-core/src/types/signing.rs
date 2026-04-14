use napi_derive::napi;

#[napi(object)]
#[derive(Clone, Debug, PartialEq, Eq)]
/// Message signature returned to JavaScript.
pub struct SignedMessage {
  /// Hex-encoded recoverable signature.
  pub signature: String,
  /// Signature format identifier (e.g. "base64").
  #[napi(ts_type = "'base64' | undefined")]
  pub format: Option<String>,
}

#[napi(object)]
#[derive(Clone, Debug, PartialEq, Eq)]
/// Unified signed transaction result.
pub struct SignedTransactionResult {
  /// Hex-encoded recoverable signature (65 bytes).
  pub signature: String,
  /// Signature format identifier (e.g. "base64").
  #[napi(ts_type = "'base64' | undefined")]
  pub format: Option<String>,
}
