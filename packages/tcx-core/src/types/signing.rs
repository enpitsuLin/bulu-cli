use napi_derive::napi;
use tcx_eth::transaction::{
  EthMessageInput as TcxEthMessageInput, SignatureType as TcxEthSignatureType,
};
use tcx_tron::transaction::TronMessageInput as TcxTronMessageInput;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
/// Ethereum message signing mode.
pub enum EthMessageSignatureType {
  /// Prefix with the `Ethereum Signed Message` header before hashing.
  PersonalSign,
  /// Hash the raw payload bytes with keccak256 before signing.
  EcSign,
}

#[derive(Clone, Debug, PartialEq, Eq)]
/// Ethereum message signing payload.
pub struct EthMessageInput {
  /// UTF-8 text or a hex string prefixed with `0x`.
  pub message: String,
  /// Signing mode. Defaults to `PERSONAL_SIGN`.
  pub signature_type: Option<EthMessageSignatureType>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
/// Tron message signing payload (internal use only, not exposed to JS).
pub struct TronMessageInput {
  /// UTF-8 text or a hex string prefixed with `0x`.
  pub value: String,
  /// Header mode, for example `TRON`, `ETH`, or `NONE`. Defaults to `TRON`.
  pub header: Option<String>,
  /// Message signing version. Defaults to `1`.
  pub version: Option<u32>,
}

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

impl From<EthMessageSignatureType> for i32 {
  fn from(value: EthMessageSignatureType) -> Self {
    match value {
      EthMessageSignatureType::PersonalSign => TcxEthSignatureType::PersonalSign as i32,
      EthMessageSignatureType::EcSign => TcxEthSignatureType::EcSign as i32,
    }
  }
}

impl From<EthMessageInput> for TcxEthMessageInput {
  fn from(value: EthMessageInput) -> Self {
    Self {
      message: value.message,
      signature_type: value
        .signature_type
        .unwrap_or(EthMessageSignatureType::PersonalSign)
        .into(),
    }
  }
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
