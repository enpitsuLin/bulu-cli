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
  /// Hex-encoded recoverable signature (65 bytes).
  pub signature: String,
  /// For chains that embed the signature into the transaction (e.g. EVM),
  /// this is the complete encoded signed transaction ready for broadcast.
  pub raw_transaction: Option<String>,
}
