use napi_derive::napi;

#[napi(object)]
#[derive(Clone, Debug, PartialEq, Eq)]
/// Message signature returned to JavaScript.
pub struct SignedMessage {
  /// Hex-encoded recoverable signature.
  pub signature: String,
}

#[napi(object)]
#[derive(Clone, Debug, PartialEq, Eq)]
/// Unified signed transaction result.
pub struct SignedTransactionResult {
  /// Hex-encoded signature.
  pub signature: String,
}
