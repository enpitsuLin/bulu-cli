use napi_derive::napi;
use serde::{Deserialize, Serialize};
use tcx_keystore::Keystore as TcxKeystore;

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
}

#[napi(object)]
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
/// A derived account returned to JavaScript.
pub struct WalletAccount {
  /// CAIP-2 chain id of the derived account.
  #[napi(js_name = "chainId")]
  pub chain_id: String,
  /// Stable account identifier in the form `<chain_id>:<address>`.
  #[napi(js_name = "accountId")]
  pub account_id: String,
  /// Chain-specific account address.
  pub address: String,
  /// Derivation path used for this account, or an empty string when unavailable.
  #[napi(js_name = "derivationPath")]
  pub derivation_path: String,
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
      name: meta.name.clone(),
      password_hint: meta.password_hint.clone(),
      timestamp: meta.timestamp,
      derivable: value.derivable(),
      curve: store.curve.map(|curve| curve.as_str().to_string()),
      identified_chain_types: meta.identified_chain_types.clone(),
    }
  }
}
