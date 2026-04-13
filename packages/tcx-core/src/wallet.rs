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
