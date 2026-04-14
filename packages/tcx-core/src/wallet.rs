use tcx_keystore::keystore::IdentityNetwork;
use tcx_keystore::{Keystore as TcxKeystore, KeystoreGuard, Source};

use crate::derivation::derive_accounts_for_wallet;
use crate::error::{require_non_empty, require_trimmed, CoreError, CoreResult, ResultExt};
use crate::types::{DerivationInput, WalletAccount, WalletInfo};
use crate::utils::{build_metadata, create_mnemonic, normalize_mnemonic};
use crate::vault::VaultRepository;

pub(crate) fn list_wallets(vault_path: String) -> CoreResult<Vec<WalletInfo>> {
  VaultRepository::new(vault_path)?.list_wallets()
}

pub(crate) fn get_wallet(name_or_id: String, vault_path: String) -> CoreResult<WalletInfo> {
  VaultRepository::new(vault_path)?.get_wallet(&name_or_id)
}

pub(crate) fn delete_wallet(name_or_id: String, vault_path: String) -> CoreResult<()> {
  let vault = VaultRepository::new(vault_path)?;
  let wallet = vault.get_wallet(&name_or_id)?;

  if vault.list_stored_api_keys()?.iter().any(|api_key| {
    api_key
      .info
      .wallet_ids
      .iter()
      .any(|wallet_id| wallet_id == &wallet.meta.id)
  }) {
    return Err(CoreError::new(format!(
      "Wallet \"{}\" is still referenced by an API key",
      wallet.meta.name
    )));
  }

  vault.delete_wallet(&wallet.meta.id)
}

pub(crate) fn create_wallet(
  name: String,
  passphrase: String,
  vault_path: String,
  index: Option<u32>,
) -> CoreResult<WalletInfo> {
  require_non_empty(&passphrase, "passphrase")?;

  let vault = VaultRepository::new(vault_path)?;
  if vault.wallet_name_exists(&name)? {
    return Err(CoreError::new(format!(
      r#"Wallet "{}" already exists"#,
      name
    )));
  }

  let mnemonic = create_mnemonic(None)?;
  let metadata = build_metadata(
    Some(name),
    None,
    IdentityNetwork::Mainnet,
    Source::NewMnemonic,
    "New Wallet",
  );
  let keystore = TcxKeystore::from_mnemonic(&mnemonic, &passphrase, metadata).map_core_err()?;
  let wallet_info = build_wallet_info(keystore, &passphrase, None, index)?;
  vault.save_wallet(&wallet_info)?;
  Ok(wallet_info)
}

pub(crate) fn import_wallet_mnemonic(
  name: String,
  mnemonic: String,
  passphrase: String,
  vault_path: String,
  index: Option<u32>,
) -> CoreResult<WalletInfo> {
  require_non_empty(&passphrase, "passphrase")?;

  let normalized_mnemonic = normalize_mnemonic(&mnemonic);
  require_non_empty(&normalized_mnemonic, "mnemonic")?;

  let vault = VaultRepository::new(vault_path)?;
  if vault.wallet_name_exists(&name)? {
    return Err(CoreError::new(format!(
      r#"Wallet "{}" already exists"#,
      name
    )));
  }

  let metadata = build_metadata(
    Some(name),
    None,
    IdentityNetwork::Mainnet,
    Source::Mnemonic,
    "Imported Mnemonic Wallet",
  );
  let keystore =
    TcxKeystore::from_mnemonic(&normalized_mnemonic, &passphrase, metadata).map_core_err()?;
  let wallet_info = build_wallet_info(keystore, &passphrase, None, index)?;
  vault.save_wallet(&wallet_info)?;
  Ok(wallet_info)
}

pub(crate) fn import_wallet_private_key(
  name: String,
  private_key: String,
  passphrase: String,
  vault_path: String,
  _index: Option<u32>,
) -> CoreResult<WalletInfo> {
  require_non_empty(&passphrase, "passphrase")?;

  let normalized_private_key = require_trimmed(private_key, "privateKey")?;
  let vault = VaultRepository::new(vault_path)?;
  if vault.wallet_name_exists(&name)? {
    return Err(CoreError::new(format!(
      r#"Wallet "{}" already exists"#,
      name
    )));
  }

  let metadata = build_metadata(
    Some(name),
    None,
    IdentityNetwork::Mainnet,
    Source::Private,
    "Imported Private Key",
  );
  let keystore = TcxKeystore::from_private_key(
    &normalized_private_key,
    &passphrase,
    tcx_constants::CurveType::SECP256k1,
    metadata,
    None,
  )
  .map_core_err()?;
  let wallet_info = build_wallet_info(keystore, &passphrase, None, None)?;
  vault.save_wallet(&wallet_info)?;
  Ok(wallet_info)
}

pub(crate) fn load_wallet(
  keystore_json: String,
  password: String,
  derivations: Option<Vec<DerivationInput>>,
) -> CoreResult<WalletInfo> {
  require_non_empty(&password, "password")?;
  let keystore = load_tcx_keystore(keystore_json)?;
  build_wallet_info(keystore, &password, derivations, None)
}

pub(crate) fn import_wallet_keystore(
  name: String,
  keystore_json: String,
  password: String,
  vault_path: String,
  derivations: Option<Vec<DerivationInput>>,
) -> CoreResult<WalletInfo> {
  require_non_empty(&password, "password")?;

  let normalized_name = require_trimmed(name, "name")?;
  let vault = VaultRepository::new(vault_path)?;
  if vault.wallet_name_exists(&normalized_name)? {
    return Err(CoreError::new(format!(
      r#"Wallet "{}" already exists"#,
      normalized_name
    )));
  }

  let mut keystore = load_tcx_keystore(keystore_json)?;
  keystore.store_mut().meta.name = normalized_name;

  let wallet_info = build_wallet_info(keystore, &password, derivations, None)?;
  vault.save_wallet(&wallet_info)?;
  Ok(wallet_info)
}

pub(crate) fn derive_accounts(
  keystore_json: String,
  password: String,
  derivations: Option<Vec<DerivationInput>>,
) -> CoreResult<Vec<WalletAccount>> {
  require_non_empty(&password, "password")?;

  let mut keystore = load_tcx_keystore(keystore_json)?;
  let network = keystore.store().meta.network;

  with_unlocked_keystore(&mut keystore, &password, move |wallet| {
    derive_accounts_for_wallet(wallet, network, derivations, None)
  })
}

pub(crate) fn export_wallet(
  name_or_id: String,
  password: String,
  vault_path: String,
) -> CoreResult<String> {
  require_non_empty(&password, "password")?;

  let wallet = VaultRepository::new(vault_path)?.get_wallet(&name_or_id)?;
  let mut keystore = stored_keystore(&wallet)?;

  with_unlocked_keystore(&mut keystore, &password, move |unlocked_keystore| {
    unlocked_keystore.export().map_core_err()
  })
}

fn build_wallet_info(
  mut keystore: TcxKeystore,
  password: &str,
  derivations: Option<Vec<DerivationInput>>,
  index: Option<u32>,
) -> CoreResult<WalletInfo> {
  let network = keystore.store().meta.network;

  with_unlocked_keystore(&mut keystore, password, move |unlocked_keystore| {
    let accounts = derive_accounts_for_wallet(unlocked_keystore, network, derivations, index)?;
    WalletInfo::try_from_keystore(unlocked_keystore, accounts)
  })
}

pub(crate) fn with_unlocked_keystore<T>(
  keystore: &mut TcxKeystore,
  password: &str,
  f: impl FnOnce(&mut TcxKeystore) -> CoreResult<T>,
) -> CoreResult<T> {
  let mut guard = KeystoreGuard::unlock_by_password(keystore, password).map_core_err()?;
  f(guard.keystore_mut())
}

pub(crate) fn load_tcx_keystore(keystore_json: String) -> CoreResult<TcxKeystore> {
  let normalized_keystore_json = require_trimmed(keystore_json, "keystoreJson")?;
  TcxKeystore::from_json(&normalized_keystore_json).map_core_err()
}

pub(crate) fn stored_keystore(wallet: &WalletInfo) -> CoreResult<TcxKeystore> {
  TcxKeystore::from_json(&wallet.keystore.to_json_string()?).map_core_err()
}

pub(crate) fn resolve_wallets(
  vault: &VaultRepository,
  wallet_ids: Vec<String>,
) -> CoreResult<Vec<WalletInfo>> {
  if wallet_ids.is_empty() {
    return Err(CoreError::new("walletIds must not be empty"));
  }

  let mut resolved = Vec::new();
  for wallet_id in wallet_ids {
    let wallet = vault.get_wallet(&wallet_id)?;
    if !resolved
      .iter()
      .any(|existing: &WalletInfo| existing.meta.id == wallet.meta.id)
    {
      resolved.push(wallet);
    }
  }

  Ok(resolved)
}

#[cfg(test)]
mod tests {
  use std::env;
  use std::fs;
  use std::path::{Path, PathBuf};
  use std::time::{SystemTime, UNIX_EPOCH};

  use serde_json::Value;
  use tcx_keystore::keystore::IdentityNetwork;

  use super::{
    create_wallet, delete_wallet, export_wallet, get_wallet, import_wallet_keystore,
    import_wallet_mnemonic, import_wallet_private_key, list_wallets, load_wallet,
  };
  use crate::chain::Chain;
  use crate::types::{DerivationInput, KeystoreData, WalletInfo};

  const TEST_PASSWORD: &str = "imToken";
  const TEST_MNEMONIC: &str =
    "inject kidney empty canal shadow pact comfort wife crush horse wife sketch";
  const TEST_PRIVATE_KEY: &str = "a392604efc2fad9c0b3da43b5f698a2e3f270f170d859912be0d54742275c5f6";

  fn temp_vault_dir(test_name: &str) -> PathBuf {
    let timestamp = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .expect("system clock should be after Unix epoch")
      .as_nanos();

    env::temp_dir().join(format!(
      "tcx-core-{test_name}-{}-{timestamp}",
      std::process::id()
    ))
  }

  fn temp_vault(test_name: &str) -> (PathBuf, String) {
    let vault_dir = temp_vault_dir(test_name);
    let vault_path = vault_dir.to_string_lossy().into_owned();
    (vault_dir, vault_path)
  }

  fn read_vault_json(path: &Path) -> Value {
    let persisted = fs::read_to_string(path).expect("vault JSON should be readable");
    serde_json::from_str(&persisted).expect("vault JSON should parse")
  }

  fn read_vault_text(path: &Path) -> String {
    fs::read_to_string(path).expect("vault JSON should be readable")
  }

  fn wallet_vault_path(vault_dir: &Path, wallet_id: &str) -> PathBuf {
    vault_dir.join("wallets").join(format!("{wallet_id}.json"))
  }

  fn keystore_json_value(wallet: &WalletInfo) -> Value {
    serde_json::to_value(&wallet.keystore).expect("keystore JSON should serialize")
  }

  fn keystore_json(wallet: &WalletInfo) -> String {
    wallet
      .keystore
      .to_json_string()
      .expect("keystore JSON should serialize")
  }

  fn default_eth_mainnet_chain_id() -> &'static str {
    Chain::Ethereum.default_chain_id(IdentityNetwork::Mainnet)
  }

  fn default_tron_mainnet_chain_id() -> &'static str {
    Chain::Tron.default_chain_id(IdentityNetwork::Mainnet)
  }

  fn default_eth_derivation_path(index: u32) -> String {
    Chain::Ethereum.default_derivation_path(index)
  }

  fn default_tron_derivation_path(index: u32) -> String {
    Chain::Tron.default_derivation_path(index)
  }

  #[test]
  fn create_wallet_returns_keystore_json_and_default_accounts() {
    let (vault_dir, vault_path) = temp_vault("create-wallet-defaults");
    let wallet = create_wallet(
      "Created".to_string(),
      TEST_PASSWORD.to_string(),
      vault_path,
      None,
    )
    .expect("create wallet should succeed");

    assert_eq!(wallet.meta.source, "NEW_MNEMONIC");
    assert_eq!(wallet.meta.network, "MAINNET");
    assert_eq!(wallet.accounts.len(), 2);
    assert_eq!(wallet.accounts[0].chain_id, default_eth_mainnet_chain_id());
    assert_eq!(wallet.accounts[1].chain_id, default_tron_mainnet_chain_id());
    assert_eq!(wallet.meta.version, 12000);
    assert!(wallet.meta.derivable);
    assert_eq!(wallet.keystore.version, 12000);

    let _ = fs::remove_dir_all(vault_dir);
  }

  #[test]
  fn create_wallet_persists_wallet_info_when_vault_path_is_provided() {
    let (vault_dir, vault_path) = temp_vault("create-wallet");
    let wallet = create_wallet(
      "Created".to_string(),
      TEST_PASSWORD.to_string(),
      vault_path,
      None,
    )
    .expect("create wallet should succeed");
    let wallet_path = wallet_vault_path(&vault_dir, &wallet.meta.id);
    let persisted = read_vault_json(&wallet_path);
    let persisted_text = read_vault_text(&wallet_path);

    assert!(wallet_path.exists());
    assert!(
      persisted_text.find("\"meta\"").expect("meta should exist")
        < persisted_text
          .find("\"keystore\"")
          .expect("keystore should exist")
    );
    assert!(
      persisted_text
        .find("\"keystore\"")
        .expect("keystore should exist")
        < persisted_text
          .find("\"accounts\"")
          .expect("accounts should exist")
    );
    assert_eq!(persisted["keystore"], keystore_json_value(&wallet));
    assert_eq!(persisted["meta"]["id"], wallet.meta.id);
    assert_eq!(persisted["meta"]["source"], "NEW_MNEMONIC");
    assert_eq!(
      persisted["accounts"][0]["chainId"],
      default_eth_mainnet_chain_id()
    );
    assert_eq!(
      persisted["accounts"][0]["accountId"],
      format!(
        "{}:{}",
        default_eth_mainnet_chain_id(),
        wallet.accounts[0].address
      )
    );
    assert_eq!(
      persisted["accounts"][1]["chainId"],
      default_tron_mainnet_chain_id()
    );
    assert_eq!(
      persisted["accounts"][1]["accountId"],
      format!(
        "{}:{}",
        default_tron_mainnet_chain_id(),
        wallet.accounts[1].address
      )
    );

    let _ = fs::remove_dir_all(vault_dir);
  }

  #[test]
  fn import_wallet_mnemonic_returns_default_accounts() {
    let (vault_dir, vault_path) = temp_vault("import-mnemonic-defaults");
    let wallet = import_wallet_mnemonic(
      "Imported mnemonic".to_string(),
      TEST_MNEMONIC.to_string(),
      TEST_PASSWORD.to_string(),
      vault_path,
      None,
    )
    .expect("mnemonic import should succeed");

    assert_eq!(wallet.meta.source, "MNEMONIC");
    assert_eq!(wallet.meta.network, "MAINNET");
    assert_eq!(wallet.accounts.len(), 2);
    assert_eq!(wallet.accounts[0].chain_id, default_eth_mainnet_chain_id());
    assert_eq!(
      wallet.accounts[0].account_id,
      format!(
        "{}:{}",
        default_eth_mainnet_chain_id(),
        wallet.accounts[0].address
      )
    );
    assert_eq!(wallet.accounts[1].chain_id, default_tron_mainnet_chain_id());
    assert_eq!(
      wallet.accounts[1].account_id,
      format!(
        "{}:{}",
        default_tron_mainnet_chain_id(),
        wallet.accounts[1].address
      )
    );

    let _ = fs::remove_dir_all(vault_dir);
  }

  #[test]
  fn import_wallet_mnemonic_uses_index_for_default_derivations_and_persists_wallet_info() {
    let (default_vault_dir, default_vault_path) = temp_vault("import-mnemonic-default");
    let default_wallet = import_wallet_mnemonic(
      "Default mnemonic".to_string(),
      TEST_MNEMONIC.to_string(),
      TEST_PASSWORD.to_string(),
      default_vault_path,
      None,
    )
    .expect("mnemonic import should succeed");
    let (vault_dir, vault_path) = temp_vault("import-mnemonic");
    let indexed_wallet = import_wallet_mnemonic(
      "Indexed mnemonic".to_string(),
      TEST_MNEMONIC.to_string(),
      TEST_PASSWORD.to_string(),
      vault_path,
      Some(1),
    )
    .expect("indexed mnemonic import should succeed");
    let wallet_path = wallet_vault_path(&vault_dir, &indexed_wallet.meta.id);
    let persisted = read_vault_json(&wallet_path);

    assert_eq!(
      indexed_wallet.accounts[0].derivation_path,
      default_eth_derivation_path(1)
    );
    assert_eq!(
      indexed_wallet.accounts[1].derivation_path,
      default_tron_derivation_path(1)
    );
    assert_ne!(
      indexed_wallet.accounts[0].address,
      default_wallet.accounts[0].address
    );
    assert_eq!(persisted["keystore"], keystore_json_value(&indexed_wallet));
    assert_eq!(
      persisted["accounts"][0]["derivationPath"],
      default_eth_derivation_path(1)
    );
    assert_eq!(
      persisted["accounts"][1]["derivationPath"],
      default_tron_derivation_path(1)
    );

    let _ = fs::remove_dir_all(default_vault_dir);
    let _ = fs::remove_dir_all(vault_dir);
  }

  #[test]
  fn import_wallet_private_key_returns_non_derivable_accounts() {
    let (vault_dir, vault_path) = temp_vault("import-private-key-defaults");
    let wallet = import_wallet_private_key(
      "Imported private key".to_string(),
      TEST_PRIVATE_KEY.to_string(),
      TEST_PASSWORD.to_string(),
      vault_path,
      None,
    )
    .expect("private key import should succeed");

    assert_eq!(wallet.meta.source, "PRIVATE");
    assert_eq!(wallet.meta.network, "MAINNET");
    assert_eq!(wallet.accounts.len(), 2);
    assert_eq!(wallet.accounts[0].chain_id, default_eth_mainnet_chain_id());
    assert_eq!(wallet.accounts[1].chain_id, default_tron_mainnet_chain_id());
    assert_eq!(
      wallet.accounts[0].account_id,
      format!(
        "{}:{}",
        default_eth_mainnet_chain_id(),
        wallet.accounts[0].address
      )
    );
    assert_eq!(
      wallet.accounts[1].account_id,
      format!(
        "{}:{}",
        default_tron_mainnet_chain_id(),
        wallet.accounts[1].address
      )
    );
    assert_eq!(wallet.accounts[0].derivation_path, "");
    assert_eq!(wallet.accounts[1].derivation_path, "");
    assert_eq!(wallet.meta.version, 12001);
    assert_eq!(wallet.meta.curve.as_deref(), Some("secp256k1"));
    assert!(!wallet.meta.derivable);

    let _ = fs::remove_dir_all(vault_dir);
  }

  #[test]
  fn import_wallet_private_key_persists_wallet_info_and_ignores_index() {
    let (vault_dir, vault_path) = temp_vault("import-private-key");
    let wallet = import_wallet_private_key(
      "Imported private key".to_string(),
      TEST_PRIVATE_KEY.to_string(),
      TEST_PASSWORD.to_string(),
      vault_path,
      Some(9),
    )
    .expect("private key import should succeed");
    let wallet_path = wallet_vault_path(&vault_dir, &wallet.meta.id);
    let persisted = read_vault_json(&wallet_path);

    assert!(!wallet.meta.derivable);
    assert_eq!(wallet.accounts[0].derivation_path, "");
    assert_eq!(wallet.accounts[1].derivation_path, "");
    assert_eq!(persisted["keystore"], keystore_json_value(&wallet));
    assert_eq!(
      persisted["accounts"][0]["accountId"],
      format!(
        "{}:{}",
        wallet.accounts[0].chain_id, wallet.accounts[0].address
      )
    );
    assert_eq!(persisted["accounts"][0]["derivationPath"], "");
    assert!(persisted["accounts"][0].get("extPubKey").is_none());
    assert!(persisted["accounts"][0].get("publicKey").is_none());

    let _ = fs::remove_dir_all(vault_dir);
  }

  #[test]
  fn load_wallet_restores_wallet_from_keystore_json() {
    let (vault_dir, vault_path) = temp_vault("load-wallet-source");
    let source_wallet = import_wallet_mnemonic(
      "Imported mnemonic".to_string(),
      TEST_MNEMONIC.to_string(),
      TEST_PASSWORD.to_string(),
      vault_path,
      None,
    )
    .expect("mnemonic import should succeed");

    let wallet = load_wallet(
      keystore_json(&source_wallet),
      TEST_PASSWORD.to_string(),
      Some(vec![DerivationInput {
        chain_id: default_eth_mainnet_chain_id().to_string(),
        derivation_path: Some(default_eth_derivation_path(1)),
        network: None,
      }]),
    )
    .expect("load wallet should succeed");

    assert_eq!(wallet.meta.source, "MNEMONIC");
    assert_eq!(wallet.meta.network, "MAINNET");
    assert_eq!(wallet.accounts.len(), 1);
    assert_eq!(
      wallet.accounts[0].derivation_path,
      default_eth_derivation_path(1)
    );

    let _ = fs::remove_dir_all(vault_dir);
  }

  #[test]
  fn wallet_info_and_keystore_data_round_trip_with_serde() {
    let (vault_dir, vault_path) = temp_vault("wallet-serde-round-trip");
    let wallet = import_wallet_mnemonic(
      "Round trip".to_string(),
      TEST_MNEMONIC.to_string(),
      TEST_PASSWORD.to_string(),
      vault_path,
      Some(1),
    )
    .expect("mnemonic import should succeed");

    let wallet_json = serde_json::to_value(&wallet).expect("wallet should serialize");
    let reparsed_wallet: WalletInfo =
      serde_json::from_value(wallet_json.clone()).expect("wallet should deserialize");
    assert_eq!(
      serde_json::to_value(&reparsed_wallet).expect("wallet should reserialize"),
      wallet_json
    );

    let keystore_json = keystore_json_value(&wallet);
    let reparsed_keystore: KeystoreData =
      serde_json::from_value(keystore_json.clone()).expect("keystore should deserialize");
    assert_eq!(
      serde_json::to_value(&reparsed_keystore).expect("keystore should reserialize"),
      keystore_json
    );

    let _ = fs::remove_dir_all(vault_dir);
  }

  #[test]
  fn import_wallet_keystore_renames_and_persists_wallet() {
    let (source_vault_dir, source_vault_path) = temp_vault("import-keystore-source");
    let source_wallet = import_wallet_mnemonic(
      "Source".to_string(),
      TEST_MNEMONIC.to_string(),
      TEST_PASSWORD.to_string(),
      source_vault_path,
      None,
    )
    .expect("source wallet import should succeed");

    let (vault_dir, vault_path) = temp_vault("import-keystore");
    let wallet = import_wallet_keystore(
      "Imported keystore".to_string(),
      keystore_json(&source_wallet),
      TEST_PASSWORD.to_string(),
      vault_path,
      None,
    )
    .expect("keystore import should succeed");
    let persisted = read_vault_json(&wallet_vault_path(&vault_dir, &wallet.meta.id));

    assert_eq!(wallet.meta.name, "Imported keystore");
    assert_eq!(wallet.keystore.meta.name, "Imported keystore");
    assert_eq!(wallet.accounts.len(), 2);
    assert_eq!(persisted["meta"]["name"], "Imported keystore");
    assert_eq!(
      persisted["keystore"]["imTokenMeta"]["name"],
      "Imported keystore"
    );

    let _ = fs::remove_dir_all(source_vault_dir);
    let _ = fs::remove_dir_all(vault_dir);
  }

  #[test]
  fn get_wallet_loads_wallets_by_name_and_unique_prefix() {
    let (vault_dir, vault_path) = temp_vault("get-wallet");
    let wallet_by_name = create_wallet(
      "Wallet by name".to_string(),
      TEST_PASSWORD.to_string(),
      vault_path.clone(),
      None,
    )
    .expect("wallet creation should succeed");
    let wallet_by_prefix = import_wallet_mnemonic(
      "Wallet by prefix".to_string(),
      TEST_MNEMONIC.to_string(),
      TEST_PASSWORD.to_string(),
      vault_path.clone(),
      None,
    )
    .expect("wallet import should succeed");

    let loaded_by_name = get_wallet("Wallet by name".to_string(), vault_path.clone())
      .expect("wallet should load by name");
    let loaded_by_prefix = get_wallet(
      wallet_by_prefix.meta.id[..8].to_string(),
      vault_path.clone(),
    )
    .expect("wallet should load by unique prefix");

    assert_eq!(loaded_by_name.meta.id, wallet_by_name.meta.id);
    assert_eq!(loaded_by_prefix.meta.id, wallet_by_prefix.meta.id);

    let _ = fs::remove_dir_all(vault_dir);
  }

  #[test]
  fn get_wallet_rejects_ambiguous_wallet_names() {
    let (vault_dir, vault_path) = temp_vault("get-wallet-ambiguous-name");
    let wallet1 = import_wallet_mnemonic(
      "Duplicate".to_string(),
      TEST_MNEMONIC.to_string(),
      TEST_PASSWORD.to_string(),
      vault_path.clone(),
      None,
    )
    .expect("first wallet import should succeed");

    let wallet2_id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    let wallet1_path = wallet_vault_path(&vault_dir, &wallet1.meta.id);
    let wallet2_path = wallet_vault_path(&vault_dir, wallet2_id);
    let wallet1_content = fs::read_to_string(&wallet1_path).expect("wallet should be readable");
    let mut wallet2: Value = serde_json::from_str(&wallet1_content).expect("wallet should parse");
    wallet2["meta"]["id"] = Value::String(wallet2_id.to_string());
    wallet2["keystore"]["id"] = Value::String(wallet2_id.to_string());
    fs::create_dir_all(
      wallet2_path
        .parent()
        .expect("wallet path should have parent"),
    )
    .expect("should create wallets dir");
    fs::write(
      &wallet2_path,
      serde_json::to_string_pretty(&wallet2).expect("wallet should serialize"),
    )
    .expect("should write second wallet");

    let err = get_wallet("Duplicate".to_string(), vault_path.clone())
      .expect_err("ambiguous wallet name should fail");
    assert!(err
      .to_string()
      .starts_with("Multiple wallets share the name \"Duplicate\"."));

    let remaining_wallets = list_wallets(vault_path).expect("listing wallets should succeed");
    assert_eq!(remaining_wallets.len(), 2);

    let _ = fs::remove_dir_all(vault_dir);
  }

  #[test]
  fn delete_wallet_deletes_wallets_by_name_and_unique_id_prefix() {
    let (vault_dir, vault_path) = temp_vault("delete-wallet");
    let wallet_by_name = create_wallet(
      "Wallet by name".to_string(),
      TEST_PASSWORD.to_string(),
      vault_path.clone(),
      None,
    )
    .expect("wallet creation should succeed");
    let wallet_by_prefix = import_wallet_mnemonic(
      "Wallet by prefix".to_string(),
      TEST_MNEMONIC.to_string(),
      TEST_PASSWORD.to_string(),
      vault_path.clone(),
      None,
    )
    .expect("wallet import should succeed");

    delete_wallet("Wallet by name".to_string(), vault_path.clone())
      .expect("wallet deletion by name should succeed");
    assert!(!wallet_vault_path(&vault_dir, &wallet_by_name.meta.id).exists());

    let unique_prefix = &wallet_by_prefix.meta.id[..8];
    delete_wallet(unique_prefix.to_string(), vault_path.clone())
      .expect("wallet deletion by id prefix should succeed");
    assert!(!wallet_vault_path(&vault_dir, &wallet_by_prefix.meta.id).exists());

    let remaining_wallets = list_wallets(vault_path).expect("listing wallets should succeed");
    assert!(remaining_wallets.is_empty());

    let _ = fs::remove_dir_all(vault_dir);
  }

  #[test]
  fn delete_wallet_rejects_ambiguous_wallet_names() {
    let (vault_dir, vault_path) = temp_vault("delete-wallet-ambiguous-name");
    let wallet1 = import_wallet_mnemonic(
      "Duplicate".to_string(),
      TEST_MNEMONIC.to_string(),
      TEST_PASSWORD.to_string(),
      vault_path.clone(),
      None,
    )
    .expect("first wallet import should succeed");

    let wallet2_id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    let wallet1_path = wallet_vault_path(&vault_dir, &wallet1.meta.id);
    let wallet2_path = wallet_vault_path(&vault_dir, wallet2_id);
    let wallet1_content = fs::read_to_string(&wallet1_path).expect("wallet should be readable");
    let mut wallet2: Value = serde_json::from_str(&wallet1_content).expect("wallet should parse");
    wallet2["meta"]["id"] = Value::String(wallet2_id.to_string());
    wallet2["keystore"]["id"] = Value::String(wallet2_id.to_string());
    fs::create_dir_all(
      wallet2_path
        .parent()
        .expect("wallet path should have parent"),
    )
    .expect("should create wallets dir");
    fs::write(
      &wallet2_path,
      serde_json::to_string_pretty(&wallet2).expect("wallet should serialize"),
    )
    .expect("should write second wallet");

    let err = delete_wallet("Duplicate".to_string(), vault_path.clone())
      .expect_err("ambiguous wallet name should fail");
    assert!(err
      .to_string()
      .starts_with("Multiple wallets share the name \"Duplicate\"."));

    let remaining_wallets = list_wallets(vault_path).expect("listing wallets should succeed");
    assert_eq!(remaining_wallets.len(), 2);

    let _ = fs::remove_dir_all(vault_dir);
  }

  #[test]
  fn export_wallet_returns_mnemonic_for_hd_wallet() {
    let (vault_dir, vault_path) = temp_vault("export-wallet-mnemonic");
    let wallet = import_wallet_mnemonic(
      "Test mnemonic wallet".to_string(),
      TEST_MNEMONIC.to_string(),
      TEST_PASSWORD.to_string(),
      vault_path.clone(),
      None,
    )
    .expect("mnemonic import should succeed");

    let exported = export_wallet(
      wallet.meta.name.clone(),
      TEST_PASSWORD.to_string(),
      vault_path.clone(),
    )
    .expect("export wallet should succeed");

    assert_eq!(exported, TEST_MNEMONIC);

    let _ = fs::remove_dir_all(vault_dir);
  }

  #[test]
  fn export_wallet_returns_private_key_for_private_key_wallet() {
    let (vault_dir, vault_path) = temp_vault("export-wallet-private-key");
    let wallet = import_wallet_private_key(
      "Test private key wallet".to_string(),
      TEST_PRIVATE_KEY.to_string(),
      TEST_PASSWORD.to_string(),
      vault_path.clone(),
      None,
    )
    .expect("private key import should succeed");

    let exported = export_wallet(
      wallet.meta.name.clone(),
      TEST_PASSWORD.to_string(),
      vault_path.clone(),
    )
    .expect("export wallet should succeed");

    assert_eq!(exported, TEST_PRIVATE_KEY);

    let _ = fs::remove_dir_all(vault_dir);
  }

  #[test]
  fn export_wallet_rejects_wrong_password() {
    let (vault_dir, vault_path) = temp_vault("export-wallet-wrong-password");
    let wallet = import_wallet_mnemonic(
      "Test wallet".to_string(),
      TEST_MNEMONIC.to_string(),
      TEST_PASSWORD.to_string(),
      vault_path.clone(),
      None,
    )
    .expect("mnemonic import should succeed");

    let err = export_wallet(
      wallet.meta.name.clone(),
      "wrong_password".to_string(),
      vault_path.clone(),
    )
    .expect_err("export wallet with wrong password should fail");

    assert_eq!(err.to_string(), "password_incorrect");

    let _ = fs::remove_dir_all(vault_dir);
  }

  #[test]
  fn export_wallet_rejects_empty_password() {
    let (vault_dir, vault_path) = temp_vault("export-wallet-empty-password");
    let wallet = import_wallet_mnemonic(
      "Test wallet".to_string(),
      TEST_MNEMONIC.to_string(),
      TEST_PASSWORD.to_string(),
      vault_path.clone(),
      None,
    )
    .expect("mnemonic import should succeed");

    let err = export_wallet(wallet.meta.name.clone(), "".to_string(), vault_path.clone())
      .expect_err("export wallet with empty password should fail");

    assert_eq!(err.to_string(), "password must not be empty");

    let _ = fs::remove_dir_all(vault_dir);
  }

  #[test]
  fn export_wallet_rejects_nonexistent_wallet() {
    let (vault_dir, vault_path) = temp_vault("export-wallet-nonexistent");

    let err = export_wallet(
      "NonExistentWallet".to_string(),
      TEST_PASSWORD.to_string(),
      vault_path.clone(),
    )
    .expect_err("export nonexistent wallet should fail");

    assert!(
      err.to_string().to_lowercase().contains("not found")
        || err.to_string().to_lowercase().contains("no wallets"),
      "expected 'not found' error, got: {}",
      err
    );

    let _ = fs::remove_dir_all(vault_dir);
  }

  #[test]
  fn export_wallet_works_with_wallet_id_prefix() {
    let (vault_dir, vault_path) = temp_vault("export-wallet-by-prefix");
    let wallet = import_wallet_mnemonic(
      "Test wallet".to_string(),
      TEST_MNEMONIC.to_string(),
      TEST_PASSWORD.to_string(),
      vault_path.clone(),
      None,
    )
    .expect("mnemonic import should succeed");

    let id_prefix = &wallet.meta.id[..8];

    let exported = export_wallet(
      id_prefix.to_string(),
      TEST_PASSWORD.to_string(),
      vault_path.clone(),
    )
    .expect("export wallet by id prefix should succeed");

    assert_eq!(exported, TEST_MNEMONIC);

    let _ = fs::remove_dir_all(vault_dir);
  }
}
