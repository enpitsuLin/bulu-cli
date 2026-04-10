use napi_derive::napi;
use tcx_eth::transaction::{
  AccessList as TcxEthAccessList, EthMessageInput as TcxEthMessageInput,
  EthTxInput as TcxEthTxInput, SignatureType as TcxEthSignatureType,
};
use tcx_keystore::keystore::IdentityNetwork;
use tcx_keystore::Source;
use tcx_tron::transaction::{
  TronMessageInput as TcxTronMessageInput, TronTxInput as TcxTronTxInput,
};

#[napi(string_enum = "UPPERCASE")]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
/// Wallet network used for metadata and default account derivations.
pub enum WalletNetwork {
  /// Production network defaults.
  Mainnet,
  /// Test network defaults.
  Testnet,
}

impl From<WalletNetwork> for IdentityNetwork {
  fn from(value: WalletNetwork) -> Self {
    match value {
      WalletNetwork::Mainnet => IdentityNetwork::Mainnet,
      WalletNetwork::Testnet => IdentityNetwork::Testnet,
    }
  }
}

impl From<IdentityNetwork> for WalletNetwork {
  fn from(value: IdentityNetwork) -> Self {
    match value {
      IdentityNetwork::Mainnet => WalletNetwork::Mainnet,
      IdentityNetwork::Testnet => WalletNetwork::Testnet,
    }
  }
}

#[napi(string_enum = "UPPERCASE")]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
/// Source used to create or import the wallet.
pub enum WalletSource {
  /// Imported from WIF.
  #[napi(value = "WIF")]
  Wif,
  /// Imported from a raw private key.
  #[napi(value = "PRIVATE")]
  Private,
  /// Imported from a V3 keystore JSON payload.
  #[napi(value = "KEYSTORE_V3")]
  KeystoreV3,
  /// Imported from a Substrate keystore payload.
  #[napi(value = "SUBSTRATE_KEYSTORE")]
  SubstrateKeystore,
  /// Imported from an existing mnemonic phrase.
  #[napi(value = "MNEMONIC")]
  Mnemonic,
  /// Created from a newly generated mnemonic phrase.
  #[napi(value = "NEW_MNEMONIC")]
  NewMnemonic,
}

impl From<Source> for WalletSource {
  fn from(value: Source) -> Self {
    match value {
      Source::Wif => WalletSource::Wif,
      Source::Private => WalletSource::Private,
      Source::KeystoreV3 => WalletSource::KeystoreV3,
      Source::SubstrateKeystore => WalletSource::SubstrateKeystore,
      Source::Mnemonic => WalletSource::Mnemonic,
      Source::NewMnemonic => WalletSource::NewMnemonic,
    }
  }
}

#[napi(object)]
/// A requested account derivation.
pub struct DerivationInput {
  /// CAIP-2 chain id, for example `eip155:1` or `tron:0x2b6653dc`.
  #[napi(js_name = "chainId")]
  pub chain_id: String,
  /// Derivation path to use for derivable wallets.
  #[napi(js_name = "derivationPath")]
  pub derivation_path: Option<String>,
  /// Network to use for this derivation. Defaults to the wallet network.
  pub network: Option<WalletNetwork>,
}

#[napi(object)]
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
  pub derivation_path: Option<String>,
  /// Extended public key when supported by the wallet source.
  #[napi(js_name = "extPubKey")]
  pub ext_pub_key: Option<String>,
}

#[napi(object)]
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
  pub source: WalletSource,
  /// Wallet network stored in metadata.
  pub network: WalletNetwork,
  /// Wallet name stored in metadata.
  pub name: String,
  /// Optional password hint stored in metadata.
  #[napi(js_name = "passwordHint")]
  pub password_hint: Option<String>,
  /// Metadata timestamp from the keystore.
  pub timestamp: i64,
  /// Whether the wallet can derive child accounts from paths.
  pub derivable: bool,
  /// Curve name when available.
  pub curve: Option<String>,
  /// Optional chain types identified by the underlying keystore.
  #[napi(js_name = "identifiedChainTypes")]
  pub identified_chain_types: Option<Vec<String>>,
}

#[napi(object)]
/// Encrypted key pair containing encrypted string and nonce.
pub struct EncPairData {
  /// Encrypted string (hex-encoded).
  #[napi(js_name = "encStr")]
  pub enc_str: String,
  /// Nonce (hex-encoded).
  pub nonce: String,
}

#[napi(object)]
/// Cipher parameters for encryption.
pub struct CipherParams {
  /// Initialization vector (hex-encoded).
  pub iv: String,
}

#[napi(object)]
/// PBKDF2 key derivation function parameters.
pub struct Pbkdf2Params {
  /// Iteration count.
  pub c: u32,
  /// Pseudorandom function.
  pub prf: String,
  /// Derived key length.
  #[napi(js_name = "dklen")]
  pub dklen: u32,
  /// Salt (hex-encoded).
  pub salt: String,
}

#[napi(object)]
/// SCrypt key derivation function parameters.
pub struct SCryptParams {
  /// CPU/memory cost parameter.
  pub n: u32,
  /// Parallelization parameter.
  pub p: u32,
  /// Block size parameter.
  pub r: u32,
  /// Derived key length.
  #[napi(js_name = "dklen")]
  pub dklen: u32,
  /// Salt (hex-encoded).
  pub salt: String,
}

#[napi(object)]
/// Crypto section of the keystore containing encrypted private key.
pub struct CryptoData {
  /// Cipher algorithm name.
  pub cipher: String,
  /// Cipher parameters.
  #[napi(js_name = "cipherparams")]
  pub cipher_params: CipherParams,
  /// Encrypted ciphertext (hex-encoded).
  pub ciphertext: String,
  /// KDF type name ("pbkdf2" or "scrypt").
  pub kdf: String,
  /// PBKDF2 parameters (when kdf is "pbkdf2").
  pub kdfparams: Option<Pbkdf2Params>,
  /// SCrypt parameters (when kdf is "scrypt").
  #[napi(js_name = "scryptParams")]
  pub scrypt_params: Option<SCryptParams>,
  /// Message authentication code (hex-encoded).
  pub mac: String,
}

#[napi(object)]
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
/// Metadata stored in the keystore (imTokenMeta section).
pub struct KeystoreMetadata {
  /// Wallet name.
  pub name: String,
  /// Optional password hint.
  #[napi(js_name = "passwordHint")]
  pub password_hint: Option<String>,
  /// Timestamp of keystore creation.
  pub timestamp: i64,
  /// Source of the wallet (e.g., "MNEMONIC", "PRIVATE").
  pub source: String,
  /// Network type ("MAINNET" or "TESTNET").
  pub network: String,
  /// Optional identified chain types.
  #[napi(js_name = "identifiedChainTypes")]
  pub identified_chain_types: Option<Vec<String>>,
}

#[napi(object)]
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
  pub curve: Option<String>,
  /// Encrypted original data (mnemonic or private key).
  #[napi(js_name = "encOriginal")]
  pub enc_original: EncPairData,
  /// Metadata.
  #[napi(js_name = "imTokenMeta")]
  pub meta: KeystoreMetadata,
}

#[napi(object)]
/// Wallet payload returned by create, import, and load operations.
pub struct WalletInfo {
  /// Keystore data object.
  #[napi(js_name = "keystore")]
  pub keystore: KeystoreData,
  /// Wallet metadata.
  pub meta: WalletMeta,
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
/// Ethereum message signing payload.
pub struct EthMessageInput {
  /// UTF-8 text or a hex string prefixed with `0x`.
  pub message: String,
  /// Signing mode. Defaults to `PERSONAL_SIGN`.
  #[napi(js_name = "signatureType")]
  pub signature_type: Option<EthMessageSignatureType>,
}

#[napi(object)]
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
/// Message signature returned to JavaScript.
pub struct SignedMessage {
  /// Hex-encoded recoverable signature.
  pub signature: String,
}

#[napi(object)]
/// Ethereum access list item used for EIP-2930/EIP-1559 transactions.
pub struct EthAccessListItem {
  /// Accessed contract address.
  pub address: String,
  /// Accessed storage keys.
  #[napi(js_name = "storageKeys")]
  pub storage_keys: Vec<String>,
}

#[napi(object)]
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
/// Tron transaction signing payload.
pub struct TronTransactionInput {
  /// Hex-encoded raw transaction bytes.
  #[napi(js_name = "rawData")]
  pub raw_data: String,
}

#[napi(object)]
/// Ethereum signed transaction result.
pub struct EthSignedTransaction {
  /// Serialized signed transaction payload.
  pub signature: String,
  /// Transaction hash.
  #[napi(js_name = "txHash")]
  pub tx_hash: String,
}

#[napi(object)]
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
