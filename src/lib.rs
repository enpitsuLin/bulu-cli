#![deny(clippy::all)]

use napi::{Error, Result};
use napi_derive::napi;
use tcx_common::{random_u8_16, FromHex, ToHex};
use tcx_constants::{CoinInfo, CurveType};
use tcx_eth::address::EthAddress;
use tcx_keystore::keystore::IdentityNetwork;
use tcx_keystore::{Keystore, Metadata, Source};
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

#[napi(object)]
pub struct CreateWalletInput {
  pub password: String,
  pub name: Option<String>,
  #[napi(js_name = "passwordHint")]
  pub password_hint: Option<String>,
  pub network: Option<WalletNetwork>,
  pub entropy: Option<String>,
}

#[napi(object)]
pub struct ImportWalletMnemonicInput {
  pub mnemonic: String,
  pub password: String,
  pub name: Option<String>,
  #[napi(js_name = "passwordHint")]
  pub password_hint: Option<String>,
  pub network: Option<WalletNetwork>,
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
}

#[napi(object)]
pub struct WalletAccount {
  pub chain: String,
  pub address: String,
  #[napi(js_name = "publicKey")]
  pub public_key: String,
  #[napi(js_name = "derivationPath")]
  pub derivation_path: Option<String>,
  #[napi(js_name = "extPubKey")]
  pub ext_pub_key: Option<String>,
}

#[napi(object)]
pub struct WalletResult {
  pub id: String,
  pub source: String,
  pub network: WalletNetwork,
  pub mnemonic: Option<String>,
  #[napi(js_name = "keystoreJson")]
  pub keystore_json: String,
  pub accounts: Vec<WalletAccount>,
}

#[napi(js_name = "createWallet")]
pub fn create_wallet(input: CreateWalletInput) -> Result<WalletResult> {
  let CreateWalletInput {
    password,
    name,
    password_hint,
    network,
    entropy,
  } = input;

  require_non_empty(&password, "password")?;

  let mnemonic = create_mnemonic(entropy)?;
  build_hd_wallet(
    mnemonic,
    password,
    name,
    password_hint,
    network,
    Source::NewMnemonic,
    "New Wallet",
    true,
  )
}

#[napi(js_name = "importWalletMnemonic")]
pub fn import_wallet_mnemonic(input: ImportWalletMnemonicInput) -> Result<WalletResult> {
  let ImportWalletMnemonicInput {
    mnemonic,
    password,
    name,
    password_hint,
    network,
  } = input;

  require_non_empty(&password, "password")?;

  let normalized_mnemonic = normalize_mnemonic(&mnemonic);
  require_non_empty(&normalized_mnemonic, "mnemonic")?;

  build_hd_wallet(
    normalized_mnemonic,
    password,
    name,
    password_hint,
    network,
    Source::Mnemonic,
    "Imported Mnemonic Wallet",
    false,
  )
}

#[napi(js_name = "importWalletPrivateKey")]
pub fn import_wallet_private_key(input: ImportWalletPrivateKeyInput) -> Result<WalletResult> {
  let ImportWalletPrivateKeyInput {
    private_key,
    password,
    name,
    password_hint,
    network,
  } = input;

  require_non_empty(&password, "password")?;

  let normalized_private_key = private_key.trim().to_string();
  require_non_empty(&normalized_private_key, "privateKey")?;

  let network = resolve_network(network);
  let metadata = build_metadata(
    name,
    password_hint,
    network,
    Source::Private,
    "Imported Private Key",
  );

  let mut keystore = Keystore::from_private_key(
    &normalized_private_key,
    &password,
    CurveType::SECP256k1,
    metadata,
    None,
  )
  .map_err(to_napi_err)?;

  keystore
    .unlock_by_password(&password)
    .map_err(to_napi_err)?;

  let accounts = derive_private_accounts(&mut keystore, network)?;
  let wallet = build_wallet_result(&mut keystore, network, accounts, None);
  keystore.lock();

  Ok(wallet)
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

fn build_hd_wallet(
  mnemonic: String,
  password: String,
  name: Option<String>,
  password_hint: Option<String>,
  network: Option<WalletNetwork>,
  source: Source,
  default_name: &str,
  expose_mnemonic: bool,
) -> Result<WalletResult> {
  let network = resolve_network(network);
  let metadata = build_metadata(name, password_hint, network, source, default_name);

  let mut keystore =
    Keystore::from_mnemonic(&mnemonic, &password, metadata).map_err(to_napi_err)?;
  keystore
    .unlock_by_password(&password)
    .map_err(to_napi_err)?;

  let accounts = derive_hd_accounts(&mut keystore, network)?;
  let mnemonic = if expose_mnemonic {
    Some(mnemonic)
  } else {
    None
  };
  let wallet = build_wallet_result(&mut keystore, network, accounts, mnemonic);
  keystore.lock();

  Ok(wallet)
}

fn build_wallet_result(
  keystore: &mut Keystore,
  network: IdentityNetwork,
  accounts: Vec<WalletAccount>,
  mnemonic: Option<String>,
) -> WalletResult {
  let metadata = keystore.meta();

  WalletResult {
    id: keystore.id(),
    source: metadata.source.to_string(),
    network: network.into(),
    mnemonic,
    keystore_json: keystore.to_json(),
    accounts,
  }
}

fn derive_hd_accounts(
  keystore: &mut Keystore,
  network: IdentityNetwork,
) -> Result<Vec<WalletAccount>> {
  let network = network.to_string();
  Ok(vec![
    derive_eth_account(keystore, &network, Some(DEFAULT_ETH_DERIVATION_PATH), false)?,
    derive_tron_account(
      keystore,
      &network,
      Some(DEFAULT_TRON_DERIVATION_PATH),
      false,
    )?,
  ])
}

fn derive_private_accounts(
  keystore: &mut Keystore,
  network: IdentityNetwork,
) -> Result<Vec<WalletAccount>> {
  let network = network.to_string();
  Ok(vec![
    derive_eth_account(keystore, &network, None, true)?,
    derive_tron_account(keystore, &network, None, true)?,
  ])
}

fn derive_eth_account(
  keystore: &mut Keystore,
  network: &str,
  derivation_path: Option<&str>,
  preserve_empty_fields: bool,
) -> Result<WalletAccount> {
  let account = keystore
    .derive_coin::<EthAddress>(&eth_coin_info(network, derivation_path.unwrap_or_default()))
    .map_err(to_napi_err)?;

  Ok(WalletAccount {
    chain: "ETHEREUM".to_string(),
    address: account.address,
    public_key: encode_public_key(&account.public_key),
    derivation_path: account_text(account.derivation_path, preserve_empty_fields),
    ext_pub_key: account_text(account.ext_pub_key, preserve_empty_fields),
  })
}

fn derive_tron_account(
  keystore: &mut Keystore,
  network: &str,
  derivation_path: Option<&str>,
  preserve_empty_fields: bool,
) -> Result<WalletAccount> {
  let account = keystore
    .derive_coin::<TronAddress>(&tron_coin_info(
      network,
      derivation_path.unwrap_or_default(),
    ))
    .map_err(to_napi_err)?;

  Ok(WalletAccount {
    chain: "TRON".to_string(),
    address: account.address,
    public_key: encode_public_key(&account.public_key),
    derivation_path: account_text(account.derivation_path, preserve_empty_fields),
    ext_pub_key: account_text(account.ext_pub_key, preserve_empty_fields),
  })
}

fn eth_coin_info(network: &str, derivation_path: &str) -> CoinInfo {
  CoinInfo {
    chain_id: String::new(),
    coin: "ETHEREUM".to_string(),
    derivation_path: derivation_path.to_string(),
    curve: CurveType::SECP256k1,
    network: network.to_string(),
    seg_wit: String::new(),
    contract_code: String::new(),
  }
}

fn tron_coin_info(network: &str, derivation_path: &str) -> CoinInfo {
  CoinInfo {
    chain_id: String::new(),
    coin: "TRON".to_string(),
    derivation_path: derivation_path.to_string(),
    curve: CurveType::SECP256k1,
    network: network.to_string(),
    seg_wit: String::new(),
    contract_code: String::new(),
  }
}

fn account_text(value: String, preserve_empty: bool) -> Option<String> {
  if preserve_empty || !value.is_empty() {
    Some(value)
  } else {
    None
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
  fn create_wallet_returns_hd_keystore_and_accounts() {
    let wallet = create_wallet(CreateWalletInput {
      password: TEST_PASSWORD.to_string(),
      name: Some("Created".to_string()),
      password_hint: Some("hint".to_string()),
      network: Some(WalletNetwork::Testnet),
      entropy: Some("000102030405060708090a0b0c0d0e0f".to_string()),
    })
    .expect("create wallet should succeed");

    assert_eq!(wallet.source, "NEW_MNEMONIC");
    assert_eq!(wallet.network, WalletNetwork::Testnet);
    assert_eq!(wallet.accounts.len(), 2);
    assert!(wallet.mnemonic.is_some());
    assert!(wallet
      .accounts
      .iter()
      .all(|account| !account.address.is_empty()));

    let keystore = Keystore::from_json(&wallet.keystore_json).expect("keystore json should parse");
    assert!(keystore.derivable());
    assert_eq!(keystore.meta().source, Source::NewMnemonic);
    assert_eq!(keystore.meta().network, IdentityNetwork::Testnet);
  }

  #[test]
  fn import_wallet_mnemonic_returns_standard_keystore() {
    let wallet = import_wallet_mnemonic(ImportWalletMnemonicInput {
      mnemonic: TEST_MNEMONIC.to_string(),
      password: TEST_PASSWORD.to_string(),
      name: Some("Imported mnemonic".to_string()),
      password_hint: None,
      network: None,
    })
    .expect("mnemonic import should succeed");

    assert_eq!(wallet.source, "MNEMONIC");
    assert_eq!(wallet.network, WalletNetwork::Mainnet);
    assert_eq!(wallet.accounts.len(), 2);
    assert!(wallet.mnemonic.is_none());
    assert_eq!(
      wallet.accounts[0].derivation_path.as_deref(),
      Some(DEFAULT_ETH_DERIVATION_PATH)
    );

    let keystore = Keystore::from_json(&wallet.keystore_json).expect("keystore json should parse");
    assert!(keystore.derivable());
    assert_eq!(keystore.meta().source, Source::Mnemonic);
  }

  #[test]
  fn import_wallet_private_key_returns_private_keystore() {
    let wallet = import_wallet_private_key(ImportWalletPrivateKeyInput {
      private_key: TEST_PRIVATE_KEY.to_string(),
      password: TEST_PASSWORD.to_string(),
      name: Some("Imported private key".to_string()),
      password_hint: None,
      network: None,
    })
    .expect("private key import should succeed");

    assert_eq!(wallet.source, "PRIVATE");
    assert_eq!(wallet.accounts.len(), 2);
    assert!(wallet.accounts.iter().all(|account| {
      account.derivation_path.as_deref() == Some("") && account.ext_pub_key.as_deref() == Some("")
    }));

    let keystore = Keystore::from_json(&wallet.keystore_json).expect("keystore json should parse");
    assert!(!keystore.derivable());
    assert_eq!(keystore.meta().source, Source::Private);
  }
}
