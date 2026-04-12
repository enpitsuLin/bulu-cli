use napi_derive::napi;
use tcx_eth::transaction::{
  AccessList as TcxEthAccessList, EthMessageInput as TcxEthMessageInput,
  EthTxInput as TcxEthTxInput, SignatureType as TcxEthSignatureType,
};
use tcx_tron::transaction::{
  TronMessageInput as TcxTronMessageInput, TronTxInput as TcxTronTxInput,
};

#[napi(string_enum = "UPPERCASE")]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
/// Ethereum message signing mode.
pub enum EthMessageSignatureType {
  /// Prefix with the `Ethereum Signed Message` header before hashing.
  #[napi(value = "PERSONAL_SIGN")]
  PersonalSign,
  /// Hash the raw payload bytes with keccak256 before signing.
  #[napi(value = "EC_SIGN")]
  EcSign,
}

#[napi(object)]
#[derive(Clone, Debug, PartialEq, Eq)]
/// Ethereum message signing payload.
pub struct EthMessageInput {
  /// UTF-8 text or a hex string prefixed with `0x`.
  pub message: String,
  /// Signing mode. Defaults to `PERSONAL_SIGN`.
  #[napi(js_name = "signatureType")]
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
/// Ethereum access list item used for EIP-2930/EIP-1559 transactions.
pub struct EthAccessListItem {
  /// Accessed contract address.
  pub address: String,
  /// Accessed storage keys.
  #[napi(js_name = "storageKeys")]
  pub storage_keys: Vec<String>,
}

#[napi(object)]
#[derive(Clone, Debug, PartialEq, Eq)]
/// Ethereum transaction signing payload.
pub struct EthTransactionInput {
  pub nonce: String,
  #[napi(js_name = "gasPrice")]
  pub gas_price: String,
  #[napi(js_name = "gasLimit")]
  pub gas_limit: String,
  pub to: String,
  pub value: String,
  pub data: String,
  #[napi(js_name = "chainId")]
  pub chain_id: String,
  #[napi(js_name = "txType")]
  pub tx_type: String,
  #[napi(js_name = "maxFeePerGas")]
  pub max_fee_per_gas: String,
  #[napi(js_name = "maxPriorityFeePerGas")]
  pub max_priority_fee_per_gas: String,
  #[napi(js_name = "accessList")]
  pub access_list: Vec<EthAccessListItem>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
/// Tron transaction signing payload (internal use only, not exposed to JS).
pub struct TronTransactionInput {
  /// Hex-encoded raw transaction bytes.
  pub raw_data: String,
}

#[napi(object)]
#[derive(Clone, Debug, PartialEq, Eq)]
/// Ethereum signed transaction result.
pub struct EthSignedTransaction {
  /// Serialized signed transaction payload.
  pub signature: String,
  /// Transaction hash.
  #[napi(js_name = "txHash")]
  pub tx_hash: String,
}

#[napi(object)]
#[derive(Clone, Debug, PartialEq, Eq)]
/// Tron signed transaction result.
pub struct TronSignedTransaction {
  /// Array of hex-encoded signatures.
  pub signatures: Vec<String>,
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

impl From<EthAccessListItem> for TcxEthAccessList {
  fn from(value: EthAccessListItem) -> Self {
    Self {
      address: value.address,
      storage_keys: value.storage_keys,
    }
  }
}

impl From<EthTransactionInput> for TcxEthTxInput {
  fn from(value: EthTransactionInput) -> Self {
    Self {
      nonce: value.nonce,
      gas_price: value.gas_price,
      gas_limit: value.gas_limit,
      to: value.to,
      value: value.value,
      data: value.data,
      chain_id: value.chain_id,
      tx_type: value.tx_type,
      max_fee_per_gas: value.max_fee_per_gas,
      max_priority_fee_per_gas: value.max_priority_fee_per_gas,
      access_list: value.access_list.into_iter().map(Into::into).collect(),
    }
  }
}

impl From<TronTransactionInput> for TcxTronTxInput {
  fn from(value: TronTransactionInput) -> Self {
    Self {
      raw_data: value.raw_data,
    }
  }
}
