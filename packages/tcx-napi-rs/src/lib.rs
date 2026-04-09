#![deny(clippy::all)]

use napi::{Error, Result};
use napi_derive::napi;
use tcx_common::{random_u8_16, FromHex, ToHex};
use tcx_constants::{CoinInfo, CurveType};
use tcx_eth::address::EthAddress;
use tcx_keystore::keystore::IdentityNetwork;
use tcx_keystore::{Keystore as TcxKeystore, KeystoreGuard, Metadata, Source};
use tcx_primitive::{mnemonic_from_entropy, TypedPublicKey};
use tcx_tron::TronAddress;

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

#[cfg(test)]
mod tests {
  use super::*;

  const TEST_PASSWORD: &str = "imToken";
  const TEST_MNEMONIC: &str =
    "inject kidney empty canal shadow pact comfort wife crush horse wife sketch";
  const TEST_PRIVATE_KEY: &str = "a392604efc2fad9c0b3da43b5f698a2e3f270f170d859912be0d54742275c5f6";

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
}
