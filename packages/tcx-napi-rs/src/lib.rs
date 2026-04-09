#![deny(clippy::all)]

use napi::{Either, Error, Result};
use napi_derive::napi;
use rlp::Rlp;
use tcx_common::{parse_u64, random_u8_16, FromHex, ToHex};
use tcx_constants::{CoinInfo, CurveType};
use tcx_eth::{
  address::EthAddress,
  transaction::{
    AccessList as TcxEthAccessList, EthMessageInput as TcxEthMessageInput,
    EthMessageOutput as TcxEthMessageOutput, EthTxInput as TcxEthTxInput,
    EthTxOutput as TcxEthTxOutput, SignatureType as TcxEthSignatureType,
  },
};
use tcx_keystore::keystore::IdentityNetwork;
use tcx_keystore::{
  Keystore as TcxKeystore, KeystoreGuard, MessageSigner, Metadata, SignatureParameters, Source,
  TransactionSigner,
};
use tcx_primitive::{mnemonic_from_entropy, TypedPublicKey};
use tcx_tron::{
  transaction::{
    TronMessageInput as TcxTronMessageInput, TronMessageOutput as TcxTronMessageOutput,
    TronTxInput as TcxTronTxInput, TronTxOutput as TcxTronTxOutput,
  },
  TronAddress,
};

const DEFAULT_ETH_DERIVATION_PATH: &str = "m/44'/60'/0'/0/0";
const DEFAULT_TRON_DERIVATION_PATH: &str = "m/44'/195'/0'/0/0";
const DEFAULT_ETH_MAINNET_CHAIN_ID: &str = "eip155:1";
const DEFAULT_ETH_TESTNET_CHAIN_ID: &str = "eip155:11155111";
const DEFAULT_TRON_MAINNET_CHAIN_ID: &str = "tron:0x2b6653dc";
const DEFAULT_TRON_TESTNET_CHAIN_ID: &str = "tron:0xcd8690dc";

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

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum ChainKind {
  Ethereum,
  Tron,
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
/// Wallet payload returned by create, import, and load operations.
pub struct WalletResult {
  /// Serialized keystore JSON.
  #[napi(js_name = "keystoreJson")]
  pub keystore_json: String,
  /// Wallet metadata.
  pub meta: WalletMeta,
  /// Derived accounts requested for the operation.
  pub accounts: Vec<WalletAccount>,
  /// Mnemonic phrase when creating or importing from mnemonic.
  pub mnemonic: Option<String>,
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

#[derive(Clone)]
struct ResolvedDerivation {
  chain_kind: ChainKind,
  network: IdentityNetwork,
  chain_id: String,
}

struct DerivationRequest {
  resolved: ResolvedDerivation,
  derivation_path: String,
}

#[napi(js_name = "createWallet")]
/// Creates a new mnemonic-backed wallet.
///
/// If `entropy` is omitted, random 16-byte entropy is generated.
/// If `derivations` is omitted, default Ethereum and Tron accounts are derived
/// for the selected wallet network.
pub fn create_wallet(name: String, passphrase: String) -> Result<WalletResult> {
  require_non_empty(&passphrase, "passphrase")?;

  let mnemonic = create_mnemonic(None)?;
  let metadata = build_metadata(
    Some(name),
    None,
    resolve_network(None),
    Source::NewMnemonic,
    "New Wallet",
  );
  let keystore =
    TcxKeystore::from_mnemonic(&mnemonic, &passphrase, metadata).map_err(to_napi_err)?;

  finalize_wallet(keystore, &passphrase, Some(mnemonic), None)
}

#[napi(js_name = "importWalletMnemonic")]
/// Imports an existing mnemonic-backed wallet.
///
/// If `derivations` is omitted, default Ethereum and Tron accounts are derived
/// for the selected wallet network.
pub fn import_wallet_mnemonic(
  name: String,
  mnemonic: String,
  passphrase: String,
) -> Result<WalletResult> {
  require_non_empty(&passphrase, "passphrase")?;

  let normalized_mnemonic = normalize_mnemonic(&mnemonic);
  require_non_empty(&normalized_mnemonic, "mnemonic")?;

  let metadata = build_metadata(
    Some(name),
    None,
    resolve_network(None),
    Source::Mnemonic,
    "Imported Mnemonic Wallet",
  );
  let keystore =
    TcxKeystore::from_mnemonic(&normalized_mnemonic, &passphrase, metadata).map_err(to_napi_err)?;

  finalize_wallet(keystore, &passphrase, Some(normalized_mnemonic), None)
}

#[napi(js_name = "importWalletPrivateKey")]
/// Imports a private key as a non-derivable wallet.
///
/// If `derivations` is omitted, default Ethereum and Tron accounts are
/// returned. Derivation paths are ignored for non-derivable wallets.
pub fn import_wallet_private_key(
  name: String,
  private_key: String,
  passphrase: String,
) -> Result<WalletResult> {
  require_non_empty(&passphrase, "passphrase")?;

  let normalized_private_key = require_trimmed(private_key, "privateKey")?;
  let metadata = build_metadata(
    Some(name),
    None,
    resolve_network(None),
    Source::Private,
    "Imported Private Key",
  );
  let keystore = TcxKeystore::from_private_key(
    &normalized_private_key,
    &passphrase,
    CurveType::SECP256k1,
    metadata,
    None,
  )
  .map_err(to_napi_err)?;

  finalize_wallet(keystore, &passphrase, None, None)
}

#[napi(js_name = "loadWallet")]
/// Loads a serialized keystore JSON and derives accounts from it.
///
/// If `derivations` is omitted, default Ethereum and Tron accounts are derived
/// for the wallet network stored in the keystore.
pub fn load_wallet(
  keystore_json: String,
  password: String,
  derivations: Option<Vec<DerivationInput>>,
) -> Result<WalletResult> {
  require_non_empty(&password, "password")?;

  let normalized_keystore_json = require_trimmed(keystore_json, "keystoreJson")?;
  let keystore = TcxKeystore::from_json(&normalized_keystore_json).map_err(to_napi_err)?;

  finalize_wallet(keystore, &password, None, derivations)
}

#[napi(js_name = "deriveAccounts")]
/// Derives accounts from a serialized keystore JSON in a single unlock flow.
///
/// If `derivations` is omitted, default Ethereum and Tron accounts are derived
/// for the wallet network stored in the keystore.
pub fn derive_accounts(
  keystore_json: String,
  password: String,
  derivations: Option<Vec<DerivationInput>>,
) -> Result<Vec<WalletAccount>> {
  require_non_empty(&password, "password")?;

  let normalized_keystore_json = require_trimmed(keystore_json, "keystoreJson")?;
  let mut keystore = TcxKeystore::from_json(&normalized_keystore_json).map_err(to_napi_err)?;
  let network = keystore.store().meta.network;

  with_unlocked_keystore(&mut keystore, &password, move |wallet| {
    derive_accounts_for_wallet(wallet, network, derivations)
  })
}

#[napi(js_name = "signMessage")]
/// Signs a plain chain-specific message using the default chain conventions.
///
/// `chain_id` selects the signer implementation. Ethereum uses personal-sign
/// semantics, while Tron uses the default TRON message header and version.
pub fn sign_message(
  keystore_json: String,
  chain_id: String,
  message: String,
  password: String,
) -> Result<SignedMessage> {
  require_non_empty(&password, "password")?;
  require_non_empty(&message, "message")?;

  let normalized_keystore_json = require_trimmed(keystore_json, "keystoreJson")?;
  let mut keystore = TcxKeystore::from_json(&normalized_keystore_json).map_err(to_napi_err)?;
  let network = keystore.store().meta.network;

  with_unlocked_keystore(&mut keystore, &password, move |wallet| {
    let request = resolve_derivation(
      DerivationInput {
        chain_id,
        derivation_path: None,
        network: None,
      },
      network,
      wallet.derivable(),
    )?;
    let params = build_signature_parameters(&request);

    match request.resolved.chain_kind {
      ChainKind::Ethereum => {
        let signed: TcxEthMessageOutput = wallet
          .sign_message(
            &params,
            &TcxEthMessageInput::from(EthMessageInput {
              message,
              signature_type: Some(EthMessageSignatureType::PersonalSign),
            }),
          )
          .map_err(to_napi_err)?;
        Ok(SignedMessage {
          signature: signed.signature,
        })
      }
      ChainKind::Tron => {
        let signed: TcxTronMessageOutput = wallet
          .sign_message(
            &params,
            &TcxTronMessageInput::from(TronMessageInput {
              value: message,
              header: Some("TRON".to_string()),
              version: Some(1),
            }),
          )
          .map_err(to_napi_err)?;
        Ok(SignedMessage {
          signature: signed.signature,
        })
      }
    }
  })
}

#[napi(js_name = "signTransaction")]
/// Signs an unsigned chain-specific transaction hex using the default chain
/// conventions.
///
/// `chain_id` selects the signer implementation. Ethereum expects an unsigned
/// RLP-encoded transaction hex, while Tron expects raw transaction bytes hex.
pub fn sign_transaction(
  keystore_json: String,
  chain_id: String,
  tx_hex: String,
  password: String,
) -> Result<Either<EthSignedTransaction, TronSignedTransaction>> {
  require_non_empty(&password, "password")?;
  let normalized_tx_hex = require_trimmed(tx_hex, "txHex")?;

  let normalized_keystore_json = require_trimmed(keystore_json, "keystoreJson")?;
  let mut keystore = TcxKeystore::from_json(&normalized_keystore_json).map_err(to_napi_err)?;
  let network = keystore.store().meta.network;

  with_unlocked_keystore(&mut keystore, &password, move |wallet| {
    let request = resolve_derivation(
      DerivationInput {
        chain_id,
        derivation_path: None,
        network: None,
      },
      network,
      wallet.derivable(),
    )?;
    let params = build_signature_parameters(&request);

    match request.resolved.chain_kind {
      ChainKind::Ethereum => {
        let tx = parse_eth_transaction_hex(&normalized_tx_hex, &request.resolved.chain_id)?;
        let signed: TcxEthTxOutput = wallet.sign_transaction(&params, &tx).map_err(to_napi_err)?;
        Ok(Either::A(EthSignedTransaction {
          signature: signed.signature,
          tx_hash: signed.tx_hash,
        }))
      }
      ChainKind::Tron => {
        let signed: TcxTronTxOutput = wallet
          .sign_transaction(
            &params,
            &TcxTronTxInput {
              raw_data: strip_hex_prefix(&normalized_tx_hex).to_string(),
            },
          )
          .map_err(to_napi_err)?;
        Ok(Either::B(TronSignedTransaction {
          signatures: signed.signatures,
        }))
      }
    }
  })
}

fn finalize_wallet(
  mut keystore: TcxKeystore,
  password: &str,
  mnemonic: Option<String>,
  derivations: Option<Vec<DerivationInput>>,
) -> Result<WalletResult> {
  let network = keystore.store().meta.network;

  with_unlocked_keystore(&mut keystore, password, move |wallet| {
    let accounts = derive_accounts_for_wallet(wallet, network, derivations)?;
    Ok(build_wallet_result(wallet, accounts, mnemonic))
  })
}

fn with_unlocked_keystore<T>(
  keystore: &mut TcxKeystore,
  password: &str,
  f: impl FnOnce(&mut TcxKeystore) -> Result<T>,
) -> Result<T> {
  let mut guard = KeystoreGuard::unlock_by_password(keystore, password).map_err(to_napi_err)?;
  f(guard.keystore_mut())
}

fn to_napi_err(err: impl std::fmt::Display) -> Error {
  Error::from_reason(err.to_string())
}

fn require_non_empty(value: &str, field_name: &str) -> Result<()> {
  if value.trim().is_empty() {
    return Err(Error::from_reason(format!(
      "{field_name} must not be empty"
    )));
  }

  Ok(())
}

fn require_trimmed(value: String, field_name: &str) -> Result<String> {
  let trimmed = value.trim();
  if trimmed.is_empty() {
    return Err(Error::from_reason(format!(
      "{field_name} must not be empty"
    )));
  }

  Ok(trimmed.to_string())
}

fn strip_hex_prefix(value: &str) -> &str {
  value
    .strip_prefix("0x")
    .or_else(|| value.strip_prefix("0X"))
    .unwrap_or(value)
}

fn parse_eth_transaction_hex(tx_hex: &str, request_chain_id: &str) -> Result<TcxEthTxInput> {
  let tx_bytes = Vec::from_hex_auto(tx_hex).map_err(to_napi_err)?;
  if tx_bytes.is_empty() {
    return Err(Error::from_reason("txHex must not be empty"));
  }

  match tx_bytes[0] {
    0x01 => parse_eip2930_transaction(&tx_bytes[1..], request_chain_id),
    0x02 => parse_eip1559_transaction(&tx_bytes[1..], request_chain_id),
    _ => parse_legacy_transaction(&tx_bytes, request_chain_id),
  }
}

fn parse_legacy_transaction(tx_bytes: &[u8], request_chain_id: &str) -> Result<TcxEthTxInput> {
  let tx = Rlp::new(tx_bytes);
  let item_count = expect_list_item_count(&tx, "txHex")?;

  let chain_id = match item_count {
    6 => ethereum_chain_reference(request_chain_id)?,
    9 => {
      ensure_zero_signature_placeholders(&tx, "legacy")?;
      let parsed_chain_id = rlp_uint_hex_at(&tx, 6)?;
      validate_eth_chain_id(request_chain_id, &parsed_chain_id)?;
      parsed_chain_id
    }
    _ => {
      return Err(Error::from_reason(
        "txHex must be an unsigned Ethereum legacy transaction",
      ));
    }
  };

  Ok(TcxEthTxInput {
    nonce: rlp_uint_hex_at(&tx, 0)?,
    gas_price: rlp_uint_hex_at(&tx, 1)?,
    gas_limit: rlp_uint_hex_at(&tx, 2)?,
    to: rlp_address_hex_at(&tx, 3)?,
    value: rlp_uint_hex_at(&tx, 4)?,
    data: rlp_bytes_hex_at(&tx, 5)?,
    chain_id,
    tx_type: String::new(),
    max_fee_per_gas: String::new(),
    max_priority_fee_per_gas: String::new(),
    access_list: vec![],
  })
}

fn parse_eip2930_transaction(tx_bytes: &[u8], request_chain_id: &str) -> Result<TcxEthTxInput> {
  let tx = Rlp::new(tx_bytes);
  let item_count = expect_list_item_count(&tx, "txHex")?;
  if item_count != 8 {
    return Err(Error::from_reason(
      "txHex must be an unsigned Ethereum EIP-2930 transaction",
    ));
  }

  let chain_id = rlp_uint_hex_at(&tx, 0)?;
  validate_eth_chain_id(request_chain_id, &chain_id)?;

  Ok(TcxEthTxInput {
    chain_id,
    nonce: rlp_uint_hex_at(&tx, 1)?,
    gas_price: rlp_uint_hex_at(&tx, 2)?,
    gas_limit: rlp_uint_hex_at(&tx, 3)?,
    to: rlp_address_hex_at(&tx, 4)?,
    value: rlp_uint_hex_at(&tx, 5)?,
    data: rlp_bytes_hex_at(&tx, 6)?,
    tx_type: "0x01".to_string(),
    max_fee_per_gas: String::new(),
    max_priority_fee_per_gas: String::new(),
    access_list: parse_eth_access_list(&tx.at(7).map_err(to_napi_err)?)?,
  })
}

fn parse_eip1559_transaction(tx_bytes: &[u8], request_chain_id: &str) -> Result<TcxEthTxInput> {
  let tx = Rlp::new(tx_bytes);
  let item_count = expect_list_item_count(&tx, "txHex")?;
  if item_count != 9 {
    return Err(Error::from_reason(
      "txHex must be an unsigned Ethereum EIP-1559 transaction",
    ));
  }

  let chain_id = rlp_uint_hex_at(&tx, 0)?;
  validate_eth_chain_id(request_chain_id, &chain_id)?;

  Ok(TcxEthTxInput {
    chain_id,
    nonce: rlp_uint_hex_at(&tx, 1)?,
    gas_price: String::new(),
    gas_limit: rlp_uint_hex_at(&tx, 4)?,
    to: rlp_address_hex_at(&tx, 5)?,
    value: rlp_uint_hex_at(&tx, 6)?,
    data: rlp_bytes_hex_at(&tx, 7)?,
    tx_type: "0x02".to_string(),
    max_fee_per_gas: rlp_uint_hex_at(&tx, 3)?,
    max_priority_fee_per_gas: rlp_uint_hex_at(&tx, 2)?,
    access_list: parse_eth_access_list(&tx.at(8).map_err(to_napi_err)?)?,
  })
}

fn expect_list_item_count(rlp: &Rlp, field_name: &str) -> Result<usize> {
  if !rlp.is_list() {
    return Err(Error::from_reason(format!(
      "{field_name} must encode an RLP list"
    )));
  }

  rlp.item_count().map_err(to_napi_err)
}

fn ensure_zero_signature_placeholders(rlp: &Rlp, tx_kind: &str) -> Result<()> {
  if !rlp_item_is_zero(rlp, 7)? || !rlp_item_is_zero(rlp, 8)? {
    return Err(Error::from_reason(format!(
      "txHex must be an unsigned Ethereum {tx_kind} transaction"
    )));
  }

  Ok(())
}

fn rlp_item_is_zero(rlp: &Rlp, index: usize) -> Result<bool> {
  Ok(rlp_item_bytes(rlp, index)?.iter().all(|value| *value == 0))
}

fn rlp_item_bytes(rlp: &Rlp, index: usize) -> Result<Vec<u8>> {
  rlp
    .at(index)
    .map_err(to_napi_err)?
    .data()
    .map(|bytes| bytes.to_vec())
    .map_err(to_napi_err)
}

fn rlp_uint_hex_at(rlp: &Rlp, index: usize) -> Result<String> {
  let bytes = rlp_item_bytes(rlp, index)?;
  Ok(if bytes.is_empty() {
    "0x0".to_string()
  } else {
    format!("0x{}", bytes.to_hex())
  })
}

fn rlp_bytes_hex_at(rlp: &Rlp, index: usize) -> Result<String> {
  let bytes = rlp_item_bytes(rlp, index)?;
  Ok(if bytes.is_empty() {
    String::new()
  } else {
    format!("0x{}", bytes.to_hex())
  })
}

fn rlp_address_hex_at(rlp: &Rlp, index: usize) -> Result<String> {
  let bytes = rlp_item_bytes(rlp, index)?;
  Ok(if bytes.is_empty() {
    String::new()
  } else {
    format!("0x{}", bytes.to_hex())
  })
}

fn parse_eth_access_list(access_list: &Rlp) -> Result<Vec<TcxEthAccessList>> {
  let item_count = expect_list_item_count(access_list, "txHex")?;
  let mut parsed = Vec::with_capacity(item_count);

  for index in 0..item_count {
    let item = access_list.at(index).map_err(to_napi_err)?;
    if expect_list_item_count(&item, "txHex")? != 2 {
      return Err(Error::from_reason(
        "txHex contains an invalid Ethereum access list entry",
      ));
    }

    let storage_keys_rlp = item.at(1).map_err(to_napi_err)?;
    let storage_key_count = expect_list_item_count(&storage_keys_rlp, "txHex")?;
    let mut storage_keys = Vec::with_capacity(storage_key_count);
    for storage_index in 0..storage_key_count {
      let storage_key = rlp_item_bytes(&storage_keys_rlp, storage_index)?;
      storage_keys.push(format!("0x{}", storage_key.to_hex()));
    }

    parsed.push(TcxEthAccessList {
      address: rlp_address_hex_at(&item, 0)?,
      storage_keys,
    });
  }

  Ok(parsed)
}

fn ethereum_chain_reference(chain_id: &str) -> Result<String> {
  let (namespace, reference) = parse_caip2_chain_id(chain_id)?;
  if namespace != "eip155" {
    return Err(Error::from_reason(format!(
      "unsupported chainId namespace `{namespace}`"
    )));
  }

  parse_u64(reference).map_err(|_| {
    Error::from_reason(format!(
      "chainId must use a numeric eip155 reference, received `{chain_id}`"
    ))
  })?;

  Ok(reference.to_string())
}

fn validate_eth_chain_id(request_chain_id: &str, tx_chain_id: &str) -> Result<()> {
  let expected_chain_id =
    parse_u64(&ethereum_chain_reference(request_chain_id)?).map_err(to_napi_err)?;
  let actual_chain_id = parse_u64(tx_chain_id).map_err(to_napi_err)?;

  if expected_chain_id != actual_chain_id {
    return Err(Error::from_reason(format!(
      "txHex chain id `{tx_chain_id}` does not match chainId `{request_chain_id}`"
    )));
  }

  Ok(())
}

fn normalize_mnemonic(mnemonic: &str) -> String {
  mnemonic.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn create_mnemonic(entropy: Option<String>) -> Result<String> {
  match entropy {
    Some(entropy_hex) => {
      let entropy = Vec::from_hex_auto(entropy_hex.trim()).map_err(to_napi_err)?;
      mnemonic_from_entropy(&entropy).map_err(to_napi_err)
    }
    None => mnemonic_from_entropy(&random_u8_16()).map_err(to_napi_err),
  }
}

fn resolve_network(network: Option<WalletNetwork>) -> IdentityNetwork {
  network.unwrap_or(WalletNetwork::Mainnet).into()
}

fn resolve_derivation_network(
  fallback_network: IdentityNetwork,
  network: Option<WalletNetwork>,
) -> IdentityNetwork {
  network.map(Into::into).unwrap_or(fallback_network)
}

fn sanitize_optional_text(value: Option<String>) -> Option<String> {
  value.and_then(|text| {
    let trimmed = text.trim();
    if trimmed.is_empty() {
      None
    } else {
      Some(trimmed.to_string())
    }
  })
}

fn build_metadata(
  name: Option<String>,
  password_hint: Option<String>,
  network: IdentityNetwork,
  source: Source,
  default_name: &str,
) -> Metadata {
  Metadata {
    name: sanitize_optional_text(name).unwrap_or_else(|| default_name.to_string()),
    password_hint: sanitize_optional_text(password_hint),
    source,
    network,
    ..Metadata::default()
  }
}

fn build_wallet_result(
  keystore: &TcxKeystore,
  accounts: Vec<WalletAccount>,
  mnemonic: Option<String>,
) -> WalletResult {
  WalletResult {
    keystore_json: keystore.to_json(),
    meta: build_wallet_meta(keystore),
    accounts,
    mnemonic,
  }
}

fn build_wallet_meta(keystore: &TcxKeystore) -> WalletMeta {
  let store = keystore.store();
  let meta = &store.meta;

  WalletMeta {
    id: store.id.clone(),
    version: store.version,
    source_fingerprint: store.source_fingerprint.clone(),
    source: meta.source.into(),
    network: meta.network.into(),
    name: meta.name.clone(),
    password_hint: meta.password_hint.clone(),
    timestamp: meta.timestamp,
    derivable: keystore.derivable(),
    curve: store.curve.map(|curve| curve.as_str().to_string()),
    identified_chain_types: meta.identified_chain_types.clone(),
  }
}

fn build_signature_parameters(request: &DerivationRequest) -> SignatureParameters {
  SignatureParameters {
    curve: CurveType::SECP256k1,
    derivation_path: request.derivation_path.clone(),
    chain_type: chain_name(request.resolved.chain_kind).to_string(),
    network: request.resolved.network.to_string(),
    seg_wit: String::new(),
  }
}

fn derive_accounts_for_wallet(
  keystore: &mut TcxKeystore,
  network: IdentityNetwork,
  derivations: Option<Vec<DerivationInput>>,
) -> Result<Vec<WalletAccount>> {
  let requests = resolve_derivations(derivations, network, keystore.derivable())?;
  let mut accounts = Vec::with_capacity(requests.len());

  for request in requests {
    accounts.push(derive_account(keystore, &request)?);
  }

  Ok(accounts)
}

fn resolve_derivations(
  derivations: Option<Vec<DerivationInput>>,
  network: IdentityNetwork,
  derivable: bool,
) -> Result<Vec<DerivationRequest>> {
  match derivations.filter(|items| !items.is_empty()) {
    Some(items) => items
      .into_iter()
      .map(|item| resolve_derivation(item, network, derivable))
      .collect(),
    None => Ok(default_derivations(network, derivable)),
  }
}

fn resolve_derivation(
  derivation: DerivationInput,
  wallet_network: IdentityNetwork,
  derivable: bool,
) -> Result<DerivationRequest> {
  let chain_id = normalize_chain_id(derivation.chain_id)?;
  let resolved = ResolvedDerivation {
    chain_kind: chain_kind_from_chain_id(&chain_id)?,
    network: resolve_derivation_network(wallet_network, derivation.network),
    chain_id,
  };
  let derivation_path = if derivable {
    sanitize_optional_text(derivation.derivation_path)
      .unwrap_or_else(|| default_derivation_path(resolved.chain_kind).to_string())
  } else {
    String::new()
  };

  Ok(DerivationRequest {
    resolved,
    derivation_path,
  })
}

fn default_derivations(network: IdentityNetwork, derivable: bool) -> Vec<DerivationRequest> {
  [ChainKind::Ethereum, ChainKind::Tron]
    .into_iter()
    .map(|chain_kind| {
      let resolved = ResolvedDerivation {
        chain_kind,
        network,
        chain_id: default_chain_id(chain_kind, network).to_string(),
      };
      let derivation_path = if derivable {
        default_derivation_path(chain_kind).to_string()
      } else {
        String::new()
      };

      DerivationRequest {
        resolved,
        derivation_path,
      }
    })
    .collect()
}

fn default_chain_id(chain_kind: ChainKind, network: IdentityNetwork) -> &'static str {
  match (chain_kind, network) {
    (ChainKind::Ethereum, IdentityNetwork::Mainnet) => DEFAULT_ETH_MAINNET_CHAIN_ID,
    (ChainKind::Ethereum, IdentityNetwork::Testnet) => DEFAULT_ETH_TESTNET_CHAIN_ID,
    (ChainKind::Tron, IdentityNetwork::Mainnet) => DEFAULT_TRON_MAINNET_CHAIN_ID,
    (ChainKind::Tron, IdentityNetwork::Testnet) => DEFAULT_TRON_TESTNET_CHAIN_ID,
  }
}

fn normalize_chain_id(chain_id: String) -> Result<String> {
  let chain_id = require_trimmed(chain_id, "chainId")?;
  let (namespace, reference) = parse_caip2_chain_id(&chain_id)?;
  Ok(format!("{namespace}:{reference}"))
}

fn parse_caip2_chain_id(chain_id: &str) -> Result<(String, &str)> {
  let Some((namespace, reference)) = chain_id.split_once(':') else {
    return Err(Error::from_reason(format!(
      "chainId must be a CAIP-2 chain id, received `{chain_id}`"
    )));
  };

  let namespace = namespace.to_ascii_lowercase();
  if namespace.is_empty()
    || reference.is_empty()
    || reference.contains(':')
    || !namespace
      .chars()
      .all(|char| char.is_ascii_lowercase() || char.is_ascii_digit() || char == '-')
    || !reference
      .chars()
      .all(|char| char.is_ascii_alphanumeric() || char == '-' || char == '_')
  {
    return Err(Error::from_reason(format!(
      "chainId must be a valid CAIP-2 chain id, received `{chain_id}`"
    )));
  }

  Ok((namespace, reference))
}

fn chain_kind_from_chain_id(chain_id: &str) -> Result<ChainKind> {
  let (namespace, _) = parse_caip2_chain_id(chain_id)?;
  match namespace.as_str() {
    "eip155" => Ok(ChainKind::Ethereum),
    "tron" => Ok(ChainKind::Tron),
    _ => Err(Error::from_reason(format!(
      "unsupported chainId namespace `{namespace}`"
    ))),
  }
}

fn default_derivation_path(chain_kind: ChainKind) -> &'static str {
  match chain_kind {
    ChainKind::Ethereum => DEFAULT_ETH_DERIVATION_PATH,
    ChainKind::Tron => DEFAULT_TRON_DERIVATION_PATH,
  }
}

fn derive_account(
  keystore: &mut TcxKeystore,
  request: &DerivationRequest,
) -> Result<WalletAccount> {
  let coin_info = CoinInfo {
    chain_id: request.resolved.chain_id.clone(),
    coin: chain_name(request.resolved.chain_kind).to_string(),
    derivation_path: request.derivation_path.clone(),
    curve: CurveType::SECP256k1,
    network: request.resolved.network.to_string(),
    seg_wit: String::new(),
    contract_code: String::new(),
  };

  let account = match request.resolved.chain_kind {
    ChainKind::Ethereum => keystore.derive_coin::<EthAddress>(&coin_info),
    ChainKind::Tron => keystore.derive_coin::<TronAddress>(&coin_info),
  }
  .map_err(to_napi_err)?;

  Ok(WalletAccount {
    chain_id: request.resolved.chain_id.clone(),
    address: account.address,
    public_key: encode_public_key(&account.public_key),
    derivation_path: empty_to_none(account.derivation_path),
    ext_pub_key: empty_to_none(account.ext_pub_key),
  })
}

fn chain_name(chain_kind: ChainKind) -> &'static str {
  match chain_kind {
    ChainKind::Ethereum => "ETHEREUM",
    ChainKind::Tron => "TRON",
  }
}

fn empty_to_none(value: String) -> Option<String> {
  if value.is_empty() {
    None
  } else {
    Some(value)
  }
}

fn encode_public_key(public_key: &TypedPublicKey) -> String {
  public_key.to_bytes().to_hex()
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

#[cfg(test)]
mod tests {
  use super::*;
  use tcx_eth::transaction_types::Transaction as TcxEthTransaction;

  const TEST_PASSWORD: &str = "imToken";
  const TEST_MNEMONIC: &str =
    "inject kidney empty canal shadow pact comfort wife crush horse wife sketch";
  const TEST_PRIVATE_KEY: &str = "a392604efc2fad9c0b3da43b5f698a2e3f270f170d859912be0d54742275c5f6";

  fn encode_unsigned_eth_transaction(input: EthTransactionInput) -> String {
    let tx = TcxEthTransaction::try_from(&TcxEthTxInput::from(input))
      .expect("transaction input should encode");
    tx.encode(None).to_hex()
  }

  #[test]
  fn create_wallet_returns_mnemonic_and_default_accounts() {
    let wallet = create_wallet("Created".to_string(), TEST_PASSWORD.to_string())
      .expect("create wallet should succeed");

    assert_eq!(wallet.meta.source, WalletSource::NewMnemonic);
    assert_eq!(wallet.meta.network, WalletNetwork::Mainnet);
    assert_eq!(wallet.accounts.len(), 2);
    assert_eq!(wallet.accounts[0].chain_id, DEFAULT_ETH_MAINNET_CHAIN_ID);
    assert_eq!(wallet.accounts[1].chain_id, DEFAULT_TRON_MAINNET_CHAIN_ID);
    assert_eq!(wallet.meta.version, 12000);
    assert!(wallet.meta.derivable);
    assert!(wallet.keystore_json.contains("\"version\":12000"));
    assert!(wallet
      .mnemonic
      .as_deref()
      .is_some_and(|mnemonic| mnemonic.split_whitespace().count() == 12));
  }

  #[test]
  fn import_wallet_mnemonic_returns_default_accounts() {
    let wallet = import_wallet_mnemonic(
      "Imported mnemonic".to_string(),
      TEST_MNEMONIC.to_string(),
      TEST_PASSWORD.to_string(),
    )
    .expect("mnemonic import should succeed");

    assert_eq!(wallet.meta.source, WalletSource::Mnemonic);
    assert_eq!(wallet.meta.network, WalletNetwork::Mainnet);
    assert_eq!(wallet.accounts.len(), 2);
    assert_eq!(wallet.accounts[0].chain_id, DEFAULT_ETH_MAINNET_CHAIN_ID);
    assert_eq!(wallet.accounts[1].chain_id, DEFAULT_TRON_MAINNET_CHAIN_ID);
    assert_eq!(wallet.mnemonic.as_deref(), Some(TEST_MNEMONIC));
  }

  #[test]
  fn import_wallet_private_key_returns_non_derivable_accounts() {
    let wallet = import_wallet_private_key(
      "Imported private key".to_string(),
      TEST_PRIVATE_KEY.to_string(),
      TEST_PASSWORD.to_string(),
    )
    .expect("private key import should succeed");

    assert_eq!(wallet.meta.source, WalletSource::Private);
    assert_eq!(wallet.meta.network, WalletNetwork::Mainnet);
    assert_eq!(wallet.accounts.len(), 2);
    assert_eq!(wallet.accounts[0].chain_id, DEFAULT_ETH_MAINNET_CHAIN_ID);
    assert_eq!(wallet.accounts[1].chain_id, DEFAULT_TRON_MAINNET_CHAIN_ID);
    assert!(wallet.accounts[0].derivation_path.is_none());
    assert!(wallet.accounts[0].ext_pub_key.is_none());
    assert_eq!(wallet.meta.version, 12001);
    assert_eq!(wallet.meta.curve.as_deref(), Some("secp256k1"));
    assert!(!wallet.meta.derivable);
    assert!(wallet.mnemonic.is_none());
  }

  #[test]
  fn load_wallet_restores_wallet_from_keystore_json() {
    let source_wallet = import_wallet_mnemonic(
      "Imported mnemonic".to_string(),
      TEST_MNEMONIC.to_string(),
      TEST_PASSWORD.to_string(),
    )
    .expect("mnemonic import should succeed");

    let wallet = load_wallet(
      source_wallet.keystore_json.clone(),
      TEST_PASSWORD.to_string(),
      Some(vec![DerivationInput {
        chain_id: DEFAULT_ETH_MAINNET_CHAIN_ID.to_string(),
        derivation_path: Some("m/44'/60'/0'/0/1".to_string()),
        network: None,
      }]),
    )
    .expect("load wallet should succeed");

    assert_eq!(wallet.meta.source, WalletSource::Mnemonic);
    assert_eq!(wallet.meta.network, WalletNetwork::Mainnet);
    assert_eq!(wallet.accounts.len(), 1);
    assert_eq!(
      wallet.accounts[0].derivation_path.as_deref(),
      Some("m/44'/60'/0'/0/1")
    );
    assert!(wallet.mnemonic.is_none());
  }

  #[test]
  fn derive_accounts_returns_requested_accounts() {
    let source_wallet = import_wallet_mnemonic(
      "Imported mnemonic".to_string(),
      TEST_MNEMONIC.to_string(),
      TEST_PASSWORD.to_string(),
    )
    .expect("mnemonic import should succeed");

    let accounts = derive_accounts(
      source_wallet.keystore_json,
      TEST_PASSWORD.to_string(),
      Some(vec![
        DerivationInput {
          chain_id: DEFAULT_ETH_MAINNET_CHAIN_ID.to_string(),
          derivation_path: Some(DEFAULT_ETH_DERIVATION_PATH.to_string()),
          network: None,
        },
        DerivationInput {
          chain_id: DEFAULT_ETH_MAINNET_CHAIN_ID.to_string(),
          derivation_path: Some("m/44'/60'/0'/0/1".to_string()),
          network: None,
        },
      ]),
    )
    .expect("derive accounts should succeed");

    assert_eq!(accounts.len(), 2);
    assert_eq!(accounts[0].chain_id, DEFAULT_ETH_MAINNET_CHAIN_ID);
    assert_eq!(accounts[1].chain_id, DEFAULT_ETH_MAINNET_CHAIN_ID);
    assert_eq!(
      accounts[0].derivation_path.as_deref(),
      Some(DEFAULT_ETH_DERIVATION_PATH)
    );
    assert_eq!(
      accounts[1].derivation_path.as_deref(),
      Some("m/44'/60'/0'/0/1")
    );
    assert_ne!(accounts[0].address, accounts[1].address);
  }

  #[test]
  fn derive_accounts_rejects_unsupported_chain_id_namespace() {
    let source_wallet = import_wallet_mnemonic(
      "Imported mnemonic".to_string(),
      TEST_MNEMONIC.to_string(),
      TEST_PASSWORD.to_string(),
    )
    .expect("mnemonic import should succeed");

    let err = derive_accounts(
      source_wallet.keystore_json,
      TEST_PASSWORD.to_string(),
      Some(vec![DerivationInput {
        chain_id: "bip122:000000000019d6689c085ae165831e93".to_string(),
        derivation_path: None,
        network: None,
      }]),
    )
    .err()
    .expect("unsupported namespaces should fail");

    assert_eq!(err.reason, "unsupported chainId namespace `bip122`");
  }

  #[test]
  fn sign_message_signs_ethereum_personal_messages() {
    let wallet = import_wallet_mnemonic(
      "Imported mnemonic".to_string(),
      TEST_MNEMONIC.to_string(),
      TEST_PASSWORD.to_string(),
    )
    .expect("mnemonic import should succeed");

    let signed = sign_message(
      wallet.keystore_json,
      DEFAULT_ETH_MAINNET_CHAIN_ID.to_string(),
      "hello world".to_string(),
      TEST_PASSWORD.to_string(),
    )
    .expect("ethereum message signing should succeed");

    assert_eq!(
      signed.signature,
      "0x521d0e4b5808b7fbeb53bf1b17c7c6d60432f5b13b7aa3aaed963a894c3bd99e23a3755ec06fa7a61b031192fb5fab6256e180e086c2671e0a574779bb8593df1b"
    );
  }

  #[test]
  fn sign_message_signs_tron_messages() {
    let wallet = import_wallet_mnemonic(
      "Imported mnemonic".to_string(),
      TEST_MNEMONIC.to_string(),
      TEST_PASSWORD.to_string(),
    )
    .expect("mnemonic import should succeed");

    let signed = sign_message(
      wallet.keystore_json,
      DEFAULT_TRON_MAINNET_CHAIN_ID.to_string(),
      "hello world".to_string(),
      TEST_PASSWORD.to_string(),
    )
    .expect("tron message signing should succeed");

    assert_eq!(
      signed.signature,
      "0x8686cc3cf49e772d96d3a8147a59eb3df2659c172775f3611648bfbe7e3c48c11859b873d9d2185567a4f64a14fa38ce78dc385a7364af55109c5b6426e4c0f61b"
    );
  }

  #[test]
  fn sign_transaction_signs_ethereum_transactions() {
    let wallet = import_wallet_private_key(
      "Imported private key".to_string(),
      TEST_PRIVATE_KEY.to_string(),
      TEST_PASSWORD.to_string(),
    )
    .expect("private key import should succeed");

    let tx_hex = encode_unsigned_eth_transaction(EthTransactionInput {
      nonce: "8".to_string(),
      gas_price: "20000000008".to_string(),
      gas_limit: "189000".to_string(),
      to: "0x3535353535353535353535353535353535353535".to_string(),
      value: "512".to_string(),
      data: String::new(),
      chain_id: "0x38".to_string(),
      tx_type: String::new(),
      max_fee_per_gas: "1076634600920".to_string(),
      max_priority_fee_per_gas: "226".to_string(),
      access_list: vec![],
    });

    let signed = sign_transaction(
      wallet.keystore_json,
      "eip155:56".to_string(),
      tx_hex,
      TEST_PASSWORD.to_string(),
    )
    .expect("ethereum transaction signing should succeed");

    let Either::A(signed) = signed else {
      panic!("expected an Ethereum signed transaction");
    };

    assert_eq!(
      signed.tx_hash,
      "0x1a3c3947ea626e00d6ff1493bcf929b9320d15ff088046990ef88a45f7d37623"
    );
    assert_eq!(
      signed.signature,
      "f868088504a817c8088302e248943535353535353535353535353535353535353535820200808194a003479f1d6be72af58b1d60750e155c435e435726b5b690f4d3e59f34bd55e578a0314d2b03d29dc3f87ff95c3427658952add3cf718d3b6b8604068fc3105e4442"
    );
  }

  #[test]
  fn sign_transaction_signs_ethereum_eip1559_transaction_hex() {
    let wallet = import_wallet_mnemonic(
      "Imported mnemonic".to_string(),
      TEST_MNEMONIC.to_string(),
      TEST_PASSWORD.to_string(),
    )
    .expect("mnemonic import should succeed");

    let tx_hex = encode_unsigned_eth_transaction(EthTransactionInput {
      nonce: "8".to_string(),
      gas_price: String::new(),
      gas_limit: "4286".to_string(),
      to: "0x3535353535353535353535353535353535353535".to_string(),
      value: "3490361".to_string(),
      data: "0x200184c0486d5f082a27".to_string(),
      chain_id: "1".to_string(),
      tx_type: "02".to_string(),
      max_fee_per_gas: "1076634600920".to_string(),
      max_priority_fee_per_gas: "226".to_string(),
      access_list: vec![],
    });

    let signed = sign_transaction(
      wallet.keystore_json,
      DEFAULT_ETH_MAINNET_CHAIN_ID.to_string(),
      tx_hex,
      TEST_PASSWORD.to_string(),
    )
    .expect("eip1559 transaction signing should succeed");

    let Either::A(signed) = signed else {
      panic!("expected an Ethereum signed transaction");
    };

    assert_eq!(
      signed.tx_hash,
      "0x9a427f295369171f686d83a05b92d8849b822f1fa1c9ccb853e81de545f4625b"
    );
    assert_eq!(
      signed.signature,
      "02f875010881e285faac6c45d88210be943535353535353535353535353535353535353535833542398a200184c0486d5f082a27c001a0602501c9cfedf145810f9b54558de6cf866a89b7a65890ccde19dd6cec1fe32ca02769f3382ee526a372241238922da39f6283a9613215fd98c8ce37a0d03fa3bb"
    );
  }

  #[test]
  fn sign_transaction_signs_tron_transactions() {
    let wallet = import_wallet_mnemonic(
      "Imported mnemonic".to_string(),
      TEST_MNEMONIC.to_string(),
      TEST_PASSWORD.to_string(),
    )
    .expect("mnemonic import should succeed");

    let signed = sign_transaction(
      wallet.keystore_json,
      DEFAULT_TRON_MAINNET_CHAIN_ID.to_string(),
      "0a0208312208b02efdc02638b61e40f083c3a7c92d5a65080112610a2d747970652e676f6f676c65617069732e636f6d2f70726f746f636f6c2e5472616e73666572436f6e747261637412300a1541a1e81654258bf14f63feb2e8d1380075d45b0dac1215410b3e84ec677b3e63c99affcadb91a6b4e086798f186470a0bfbfa7c92d".to_string(),
      TEST_PASSWORD.to_string(),
    )
    .expect("tron transaction signing should succeed");

    let Either::B(signed) = signed else {
      panic!("expected a Tron signed transaction");
    };

    assert_eq!(
      signed.signatures,
      vec![
        "c65b4bde808f7fcfab7b0ef9c1e3946c83311f8ac0a5e95be2d8b6d2400cfe8b5e24dc8f0883132513e422f2aaad8a4ecc14438eae84b2683eefa626e3adffc601"
          .to_string()
      ]
    );
  }
}
