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

#[napi(string_enum = "UPPERCASE")]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum WalletNetwork {
  Mainnet,
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
pub enum WalletChain {
  Ethereum,
  Tron,
}

#[napi(string_enum = "UPPERCASE")]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum WalletSource {
  #[napi(value = "WIF")]
  Wif,
  #[napi(value = "PRIVATE")]
  Private,
  #[napi(value = "KEYSTORE_V3")]
  KeystoreV3,
  #[napi(value = "SUBSTRATE_KEYSTORE")]
  SubstrateKeystore,
  #[napi(value = "MNEMONIC")]
  Mnemonic,
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
pub struct CreateWalletInput {
  pub password: String,
  pub name: Option<String>,
  #[napi(js_name = "passwordHint")]
  pub password_hint: Option<String>,
  pub network: Option<WalletNetwork>,
  pub entropy: Option<String>,
  pub derivations: Option<Vec<DerivationInput>>,
}

#[napi(object)]
pub struct ImportWalletMnemonicInput {
  pub mnemonic: String,
  pub password: String,
  pub name: Option<String>,
  #[napi(js_name = "passwordHint")]
  pub password_hint: Option<String>,
  pub network: Option<WalletNetwork>,
  pub derivations: Option<Vec<DerivationInput>>,
}

#[napi(object)]
pub struct ImportWalletPrivateKeyInput {
  #[napi(js_name = "privateKey")]
  pub private_key: String,
  pub password: String,
  pub name: Option<String>,
  #[napi(js_name = "passwordHint")]
  pub password_hint: Option<String>,
  pub network: Option<WalletNetwork>,
  pub derivations: Option<Vec<DerivationInput>>,
}

#[napi(object)]
pub struct LoadWalletInput {
  #[napi(js_name = "keystoreJson")]
  pub keystore_json: String,
  pub password: String,
  pub derivations: Option<Vec<DerivationInput>>,
}

#[napi(object)]
pub struct DeriveAccountsInput {
  #[napi(js_name = "keystoreJson")]
  pub keystore_json: String,
  pub password: String,
  pub derivations: Option<Vec<DerivationInput>>,
}

#[napi(object)]
pub struct DerivationInput {
  pub chain: WalletChain,
  #[napi(js_name = "derivationPath")]
  pub derivation_path: Option<String>,
  pub network: Option<WalletNetwork>,
  #[napi(js_name = "chainId")]
  pub chain_id: Option<String>,
}

#[napi(object)]
pub struct WalletAccount {
  pub chain: WalletChain,
  pub address: String,
  #[napi(js_name = "publicKey")]
  pub public_key: String,
  #[napi(js_name = "derivationPath")]
  pub derivation_path: Option<String>,
  #[napi(js_name = "extPubKey")]
  pub ext_pub_key: Option<String>,
}

#[napi(object)]
pub struct WalletMeta {
  pub id: String,
  pub version: i64,
  #[napi(js_name = "sourceFingerprint")]
  pub source_fingerprint: String,
  pub source: WalletSource,
  pub network: WalletNetwork,
  pub name: String,
  #[napi(js_name = "passwordHint")]
  pub password_hint: Option<String>,
  pub timestamp: i64,
  pub derivable: bool,
  pub curve: Option<String>,
  #[napi(js_name = "identifiedChainTypes")]
  pub identified_chain_types: Option<Vec<String>>,
}

#[napi(object)]
pub struct WalletResult {
  #[napi(js_name = "keystoreJson")]
  pub keystore_json: String,
  pub meta: WalletMeta,
  pub accounts: Vec<WalletAccount>,
  pub mnemonic: Option<String>,
}

#[derive(Clone, Copy)]
struct ResolvedDerivation {
  chain: WalletChain,
  network: IdentityNetwork,
}

struct DerivationRequest {
  resolved: ResolvedDerivation,
  derivation_path: String,
  chain_id: String,
}

#[napi(js_name = "createWallet")]
pub fn create_wallet(input: CreateWalletInput) -> Result<WalletResult> {
  let CreateWalletInput {
    password,
    name,
    password_hint,
    network,
    entropy,
    derivations,
  } = input;

  require_non_empty(&password, "password")?;

  let mnemonic = create_mnemonic(entropy)?;
  let network = resolve_network(network);
  let metadata = build_metadata(
    name,
    password_hint,
    network,
    Source::NewMnemonic,
    "New Wallet",
  );
  let keystore = TcxKeystore::from_mnemonic(&mnemonic, &password, metadata).map_err(to_napi_err)?;

  finalize_wallet(keystore, &password, Some(mnemonic), derivations)
}

#[napi(js_name = "importWalletMnemonic")]
pub fn import_wallet_mnemonic(input: ImportWalletMnemonicInput) -> Result<WalletResult> {
  let ImportWalletMnemonicInput {
    mnemonic,
    password,
    name,
    password_hint,
    network,
    derivations,
  } = input;

  require_non_empty(&password, "password")?;

  let normalized_mnemonic = normalize_mnemonic(&mnemonic);
  require_non_empty(&normalized_mnemonic, "mnemonic")?;

  let network = resolve_network(network);
  let metadata = build_metadata(
    name,
    password_hint,
    network,
    Source::Mnemonic,
    "Imported Mnemonic Wallet",
  );
  let keystore =
    TcxKeystore::from_mnemonic(&normalized_mnemonic, &password, metadata).map_err(to_napi_err)?;

  finalize_wallet(keystore, &password, Some(normalized_mnemonic), derivations)
}

#[napi(js_name = "importWalletPrivateKey")]
pub fn import_wallet_private_key(input: ImportWalletPrivateKeyInput) -> Result<WalletResult> {
  let ImportWalletPrivateKeyInput {
    private_key,
    password,
    name,
    password_hint,
    network,
    derivations,
  } = input;

  require_non_empty(&password, "password")?;

  let normalized_private_key = require_trimmed(private_key, "privateKey")?;
  let network = resolve_network(network);
  let metadata = build_metadata(
    name,
    password_hint,
    network,
    Source::Private,
    "Imported Private Key",
  );
  let keystore = TcxKeystore::from_private_key(
    &normalized_private_key,
    &password,
    CurveType::SECP256k1,
    metadata,
    None,
  )
  .map_err(to_napi_err)?;

  finalize_wallet(keystore, &password, None, derivations)
}

#[napi(js_name = "loadWallet")]
pub fn load_wallet(input: LoadWalletInput) -> Result<WalletResult> {
  let LoadWalletInput {
    keystore_json,
    password,
    derivations,
  } = input;

  require_non_empty(&password, "password")?;

  let normalized_keystore_json = require_trimmed(keystore_json, "keystoreJson")?;
  let keystore = TcxKeystore::from_json(&normalized_keystore_json).map_err(to_napi_err)?;

  finalize_wallet(keystore, &password, None, derivations)
}

#[napi(js_name = "deriveAccounts")]
pub fn derive_accounts(input: DeriveAccountsInput) -> Result<Vec<WalletAccount>> {
  let DeriveAccountsInput {
    keystore_json,
    password,
    derivations,
  } = input;

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
  let requests = resolve_derivations(derivations, network, keystore.derivable());
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
) -> Vec<DerivationRequest> {
  match derivations.filter(|items| !items.is_empty()) {
    Some(items) => items
      .into_iter()
      .map(|item| resolve_derivation(item, network, derivable))
      .collect(),
    None => default_derivations(network, derivable),
  }
}

fn resolve_derivation(
  derivation: DerivationInput,
  wallet_network: IdentityNetwork,
  derivable: bool,
) -> DerivationRequest {
  let resolved = ResolvedDerivation {
    chain: derivation.chain,
    network: resolve_derivation_network(wallet_network, derivation.network),
  };
  let derivation_path = if derivable {
    sanitize_optional_text(derivation.derivation_path)
      .unwrap_or_else(|| default_derivation_path(resolved.chain).to_string())
  } else {
    String::new()
  };

  DerivationRequest {
    resolved,
    derivation_path,
    chain_id: sanitize_optional_text(derivation.chain_id).unwrap_or_default(),
  }
}

fn default_derivations(network: IdentityNetwork, derivable: bool) -> Vec<DerivationRequest> {
  [WalletChain::Ethereum, WalletChain::Tron]
    .into_iter()
    .map(|chain| {
      let resolved = ResolvedDerivation { chain, network };
      let derivation_path = if derivable {
        default_derivation_path(chain).to_string()
      } else {
        String::new()
      };

      DerivationRequest {
        resolved,
        derivation_path,
        chain_id: String::new(),
      }
    })
    .collect()
}

fn default_derivation_path(chain: WalletChain) -> &'static str {
  match chain {
    WalletChain::Ethereum => DEFAULT_ETH_DERIVATION_PATH,
    WalletChain::Tron => DEFAULT_TRON_DERIVATION_PATH,
  }
}

fn derive_account(keystore: &mut TcxKeystore, request: &DerivationRequest) -> Result<WalletAccount> {
  let coin_info = CoinInfo {
    chain_id: request.chain_id.clone(),
    coin: chain_name(request.resolved.chain).to_string(),
    derivation_path: request.derivation_path.clone(),
    curve: CurveType::SECP256k1,
    network: request.resolved.network.to_string(),
    seg_wit: String::new(),
    contract_code: String::new(),
  };

  let account = match request.resolved.chain {
    WalletChain::Ethereum => keystore.derive_coin::<EthAddress>(&coin_info),
    WalletChain::Tron => keystore.derive_coin::<TronAddress>(&coin_info),
  }
  .map_err(to_napi_err)?;

  Ok(WalletAccount {
    chain: request.resolved.chain,
    address: account.address,
    public_key: encode_public_key(&account.public_key),
    derivation_path: empty_to_none(account.derivation_path),
    ext_pub_key: empty_to_none(account.ext_pub_key),
  })
}

fn chain_name(chain: WalletChain) -> &'static str {
  match chain {
    WalletChain::Ethereum => "ETHEREUM",
    WalletChain::Tron => "TRON",
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
    let wallet = create_wallet(CreateWalletInput {
      password: TEST_PASSWORD.to_string(),
      name: Some("Created".to_string()),
      password_hint: Some("hint".to_string()),
      network: Some(WalletNetwork::Testnet),
      entropy: Some("000102030405060708090a0b0c0d0e0f".to_string()),
      derivations: None,
    })
    .expect("create wallet should succeed");

    assert_eq!(wallet.meta.source, WalletSource::NewMnemonic);
    assert_eq!(wallet.meta.network, WalletNetwork::Testnet);
    assert_eq!(wallet.accounts.len(), 2);
    assert_eq!(wallet.accounts[0].chain, WalletChain::Ethereum);
    assert_eq!(wallet.accounts[1].chain, WalletChain::Tron);
    assert_eq!(wallet.meta.version, 12000);
    assert!(wallet.meta.derivable);
    assert!(wallet.keystore_json.contains("\"version\":12000"));
    assert!(wallet
      .mnemonic
      .as_deref()
      .is_some_and(|mnemonic| mnemonic.split_whitespace().count() == 12));
  }

  #[test]
  fn import_wallet_mnemonic_supports_custom_derivations() {
    let wallet = import_wallet_mnemonic(ImportWalletMnemonicInput {
      mnemonic: TEST_MNEMONIC.to_string(),
      password: TEST_PASSWORD.to_string(),
      name: Some("Imported mnemonic".to_string()),
      password_hint: None,
      network: None,
      derivations: Some(vec![
        DerivationInput {
          chain: WalletChain::Tron,
          derivation_path: None,
          network: None,
          chain_id: None,
        },
        DerivationInput {
          chain: WalletChain::Ethereum,
          derivation_path: Some("m/44'/60'/0'/0/1".to_string()),
          network: None,
          chain_id: Some("1".to_string()),
        },
      ]),
    })
    .expect("mnemonic import should succeed");

    assert_eq!(wallet.meta.source, WalletSource::Mnemonic);
    assert_eq!(wallet.meta.network, WalletNetwork::Mainnet);
    assert_eq!(wallet.accounts.len(), 2);
    assert_eq!(wallet.accounts[0].chain, WalletChain::Tron);
    assert_eq!(
      wallet.accounts[1].derivation_path.as_deref(),
      Some("m/44'/60'/0'/0/1")
    );
    assert_eq!(wallet.mnemonic.as_deref(), Some(TEST_MNEMONIC));
  }

  #[test]
  fn import_wallet_private_key_returns_non_derivable_accounts() {
    let wallet = import_wallet_private_key(ImportWalletPrivateKeyInput {
      private_key: TEST_PRIVATE_KEY.to_string(),
      password: TEST_PASSWORD.to_string(),
      name: Some("Imported private key".to_string()),
      password_hint: None,
      network: None,
      derivations: Some(vec![DerivationInput {
        chain: WalletChain::Tron,
        derivation_path: Some("m/44'/195'/0'/0/99".to_string()),
        network: Some(WalletNetwork::Testnet),
        chain_id: None,
      }]),
    })
    .expect("private key import should succeed");

    assert_eq!(wallet.meta.source, WalletSource::Private);
    assert_eq!(wallet.meta.network, WalletNetwork::Mainnet);
    assert_eq!(wallet.accounts.len(), 1);
    assert_eq!(wallet.accounts[0].chain, WalletChain::Tron);
    assert!(wallet.accounts[0].derivation_path.is_none());
    assert!(wallet.accounts[0].ext_pub_key.is_none());
    assert_eq!(wallet.meta.version, 12001);
    assert_eq!(wallet.meta.curve.as_deref(), Some("secp256k1"));
    assert!(!wallet.meta.derivable);
    assert!(wallet.mnemonic.is_none());
  }

  #[test]
  fn load_wallet_restores_wallet_from_keystore_json() {
    let source_wallet = import_wallet_mnemonic(ImportWalletMnemonicInput {
      mnemonic: TEST_MNEMONIC.to_string(),
      password: TEST_PASSWORD.to_string(),
      name: Some("Imported mnemonic".to_string()),
      password_hint: None,
      network: None,
      derivations: None,
    })
    .expect("mnemonic import should succeed");

    let wallet = load_wallet(LoadWalletInput {
      keystore_json: source_wallet.keystore_json.clone(),
      password: TEST_PASSWORD.to_string(),
      derivations: Some(vec![DerivationInput {
        chain: WalletChain::Ethereum,
        derivation_path: Some("m/44'/60'/0'/0/1".to_string()),
        network: None,
        chain_id: None,
      }]),
    })
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
    let source_wallet = import_wallet_mnemonic(ImportWalletMnemonicInput {
      mnemonic: TEST_MNEMONIC.to_string(),
      password: TEST_PASSWORD.to_string(),
      name: Some("Imported mnemonic".to_string()),
      password_hint: None,
      network: None,
      derivations: None,
    })
    .expect("mnemonic import should succeed");

    let accounts = derive_accounts(DeriveAccountsInput {
      keystore_json: source_wallet.keystore_json,
      password: TEST_PASSWORD.to_string(),
      derivations: Some(vec![
        DerivationInput {
          chain: WalletChain::Ethereum,
          derivation_path: Some(DEFAULT_ETH_DERIVATION_PATH.to_string()),
          network: None,
          chain_id: Some("1".to_string()),
        },
        DerivationInput {
          chain: WalletChain::Ethereum,
          derivation_path: Some("m/44'/60'/0'/0/1".to_string()),
          network: None,
          chain_id: Some("1".to_string()),
        },
      ]),
    })
    .expect("derive accounts should succeed");

    assert_eq!(accounts.len(), 2);
    assert_eq!(accounts[0].chain, WalletChain::Ethereum);
    assert_eq!(accounts[1].chain, WalletChain::Ethereum);
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
}
