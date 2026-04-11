use napi_derive::napi;
use serde::{Deserialize, Serialize};
use tcx_eth::transaction::{
  AccessList as TcxEthAccessList, EthMessageInput as TcxEthMessageInput,
  EthTxInput as TcxEthTxInput, SignatureType as TcxEthSignatureType,
};
use tcx_keystore::Keystore as TcxKeystore;
use tcx_tron::transaction::{
  TronMessageInput as TcxTronMessageInput, TronTxInput as TcxTronTxInput,
};

use crate::error::{CoreResult, ResultExt};

#[napi(object)]
#[derive(Clone, Debug, PartialEq, Eq)]
/// A requested account derivation.
pub struct DerivationInput {
  /// CAIP-2 chain id, for example `eip155:1` or `tron:0x2b6653dc`.
  #[napi(js_name = "chainId")]
  pub chain_id: String,
  /// Derivation path to use for derivable wallets.
  #[napi(js_name = "derivationPath")]
  pub derivation_path: Option<String>,
  /// Network to use for this derivation. Defaults to the wallet network.
  #[napi(ts_type = "'MAINNET' | 'TESTNET'")]
  pub network: Option<String>,
}

#[napi(object)]
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
/// A derived account returned to JavaScript.
pub struct WalletAccount {
  /// CAIP-2 chain id of the derived account.
  #[napi(js_name = "chainId")]
  pub chain_id: String,
  /// Chain-specific account address.
  pub address: String,
  /// Hex-encoded public key.
  #[napi(js_name = "publicKey")]
  pub public_key: String,
  /// Derivation path used for this account when available.
  #[napi(js_name = "derivationPath")]
  #[serde(skip_serializing_if = "Option::is_none")]
  pub derivation_path: Option<String>,
  /// Extended public key when supported by the wallet source.
  #[napi(js_name = "extPubKey")]
  #[serde(skip_serializing_if = "Option::is_none")]
  pub ext_pub_key: Option<String>,
}

#[napi(object)]
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
/// Wallet metadata exposed to JavaScript.
pub struct WalletMeta {
  /// Keystore identifier.
  pub id: String,
  /// Keystore version.
  pub version: i64,
  /// Fingerprint of the original wallet source.
  #[napi(js_name = "sourceFingerprint")]
  pub source_fingerprint: String,
  /// Source used to create or import the wallet.
  #[napi(
    ts_type = "'WIF' | 'PRIVATE' | 'KEYSTORE_V3' | 'SUBSTRATE_KEYSTORE' | 'MNEMONIC' | 'NEW_MNEMONIC'"
  )]
  pub source: String,
  /// Wallet network stored in metadata.
  #[napi(ts_type = "'MAINNET' | 'TESTNET'")]
  pub network: String,
  /// Wallet name stored in metadata.
  pub name: String,
  /// Optional password hint stored in metadata.
  #[napi(js_name = "passwordHint")]
  #[serde(skip_serializing_if = "Option::is_none")]
  pub password_hint: Option<String>,
  /// Metadata timestamp from the keystore.
  pub timestamp: i64,
  /// Whether the wallet can derive child accounts from paths.
  pub derivable: bool,
  /// Curve name when available.
  #[serde(skip_serializing_if = "Option::is_none")]
  pub curve: Option<String>,
  /// Optional chain types identified by the underlying keystore.
  #[napi(js_name = "identifiedChainTypes")]
  #[serde(skip_serializing_if = "Option::is_none")]
  pub identified_chain_types: Option<Vec<String>>,
}

#[napi(object)]
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
/// Encrypted key pair containing encrypted string and nonce.
pub struct EncPairData {
  /// Encrypted string (hex-encoded).
  #[napi(js_name = "encStr")]
  pub enc_str: String,
  /// Nonce (hex-encoded).
  pub nonce: String,
}

#[napi(object)]
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
/// Cipher parameters for encryption.
pub struct CipherParams {
  /// Initialization vector (hex-encoded).
  pub iv: String,
}

#[napi(object)]
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
/// KDF parameters union type - can be either PBKDF2 or SCrypt.
///
/// The fields present depend on the kdf type:
/// - PBKDF2: c, prf, dklen, salt
/// - SCrypt: n, p, r, dklen, salt
pub struct KdfParams {
  /// Iteration count (PBKDF2 only).
  #[serde(skip_serializing_if = "Option::is_none")]
  pub c: Option<u32>,
  /// Pseudorandom function (PBKDF2 only).
  #[serde(skip_serializing_if = "Option::is_none")]
  pub prf: Option<String>,
  /// CPU/memory cost parameter (SCrypt only).
  #[serde(skip_serializing_if = "Option::is_none")]
  pub n: Option<u32>,
  /// Parallelization parameter (SCrypt only).
  #[serde(skip_serializing_if = "Option::is_none")]
  pub p: Option<u32>,
  /// Block size parameter (SCrypt only).
  #[serde(skip_serializing_if = "Option::is_none")]
  pub r: Option<u32>,
  /// Derived key length.
  #[napi(js_name = "dklen")]
  pub dklen: u32,
  /// Salt (hex-encoded).
  pub salt: String,
}

#[napi(object)]
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
/// Crypto section of the keystore containing encrypted private key.
pub struct CryptoData {
  /// Cipher algorithm name.
  pub cipher: String,
  /// Cipher parameters.
  #[napi(js_name = "cipherparams")]
  #[serde(rename = "cipherparams")]
  pub cipher_params: CipherParams,
  /// Encrypted ciphertext (hex-encoded).
  pub ciphertext: String,
  /// KDF type name ("pbkdf2" or "scrypt").
  pub kdf: String,
  /// KDF parameters serialized as the `kdfparams` field.
  pub kdfparams: KdfParams,
  /// Message authentication code (hex-encoded).
  pub mac: String,
}

#[napi(object)]
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
/// Identity information for the keystore.
pub struct IdentityData {
  /// Encrypted authentication key.
  #[napi(js_name = "encAuthKey")]
  pub enc_auth_key: EncPairData,
  /// Encryption key (hex-encoded).
  #[napi(js_name = "encKey")]
  pub enc_key: String,
  /// Identifier string.
  pub identifier: String,
  /// IPFS identifier.
  #[napi(js_name = "ipfsId")]
  pub ipfs_id: String,
}

#[napi(object)]
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
/// Metadata stored in the keystore (imTokenMeta section).
pub struct KeystoreMetadata {
  /// Wallet name.
  pub name: String,
  /// Optional password hint.
  #[napi(js_name = "passwordHint")]
  #[serde(skip_serializing_if = "Option::is_none")]
  pub password_hint: Option<String>,
  /// Timestamp of keystore creation.
  pub timestamp: i64,
  /// Source of the wallet (e.g., "MNEMONIC", "PRIVATE").
  #[napi(
    ts_type = "'WIF' | 'PRIVATE' | 'KEYSTORE_V3' | 'SUBSTRATE_KEYSTORE' | 'MNEMONIC' | 'NEW_MNEMONIC'"
  )]
  pub source: String,
  /// Network type ("MAINNET" or "TESTNET").
  #[napi(ts_type = "'MAINNET' | 'TESTNET'")]
  pub network: String,
  /// Optional identified chain types.
  #[napi(js_name = "identifiedChainTypes")]
  #[serde(skip_serializing_if = "Option::is_none")]
  pub identified_chain_types: Option<Vec<String>>,
}

#[napi(object)]
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
/// Keystore data structure matching tcx-keystore Store.
pub struct KeystoreData {
  /// Keystore identifier (UUID).
  pub id: String,
  /// Keystore version number.
  pub version: i64,
  /// Fingerprint of the wallet source.
  #[napi(js_name = "sourceFingerprint")]
  pub source_fingerprint: String,
  /// Crypto section containing encrypted private key.
  pub crypto: CryptoData,
  /// Identity information.
  pub identity: IdentityData,
  /// Optional curve type.
  #[serde(skip_serializing_if = "Option::is_none")]
  pub curve: Option<String>,
  /// Encrypted original data (mnemonic or private key).
  #[napi(js_name = "encOriginal")]
  pub enc_original: EncPairData,
  /// Metadata.
  #[napi(js_name = "imTokenMeta")]
  #[serde(rename = "imTokenMeta")]
  pub meta: KeystoreMetadata,
}

#[napi(object)]
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
/// Wallet payload returned by create, import, and load operations.
pub struct WalletInfo {
  /// Wallet metadata.
  pub meta: WalletMeta,
  /// Keystore data object.
  pub keystore: KeystoreData,
  /// Derived accounts requested for the operation.
  pub accounts: Vec<WalletAccount>,
}

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

#[napi(object)]
#[derive(Clone, Debug, PartialEq, Eq)]
/// Tron message signing payload.
pub struct TronMessageInput {
  /// UTF-8 text or a hex string prefixed with `0x`.
  pub value: String,
  /// Header mode, for example `TRON`, `ETH`, or `NONE`. Defaults to `TRON`.
  #[napi(skip_typescript)]
  pub header: Option<String>,
  /// Message signing version. Defaults to `1`.
  #[napi(skip_typescript)]
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

#[napi(object)]
#[derive(Clone, Debug, PartialEq, Eq)]
/// Tron transaction signing payload.
pub struct TronTransactionInput {
  /// Hex-encoded raw transaction bytes.
  #[napi(js_name = "rawData")]
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

impl KeystoreData {
  pub(crate) fn to_json_string(&self) -> CoreResult<String> {
    serde_json::to_string(self).map_core_err()
  }

  pub(crate) fn try_from_keystore(value: &TcxKeystore) -> CoreResult<Self> {
    serde_json::from_str(&value.to_json()).map_core_err()
  }
}

impl WalletInfo {
  pub(crate) fn try_from_keystore(
    keystore: &TcxKeystore,
    accounts: Vec<WalletAccount>,
  ) -> CoreResult<Self> {
    Ok(Self {
      meta: WalletMeta::from(keystore),
      keystore: KeystoreData::try_from_keystore(keystore)?,
      accounts,
    })
  }
}

impl From<&TcxKeystore> for WalletMeta {
  fn from(value: &TcxKeystore) -> Self {
    let store = value.store();
    let meta = &store.meta;

    Self {
      id: store.id.clone(),
      version: store.version,
      source_fingerprint: store.source_fingerprint.clone(),
      source: meta.source.to_string(),
      network: meta.network.to_string(),
      name: meta.name.clone(),
      password_hint: meta.password_hint.clone(),
      timestamp: meta.timestamp,
      derivable: value.derivable(),
      curve: store.curve.map(|curve| curve.as_str().to_string()),
      identified_chain_types: meta.identified_chain_types.clone(),
    }
  }
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
