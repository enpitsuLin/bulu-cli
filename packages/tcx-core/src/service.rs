use crate::chain::{
  prepare_transaction, sign_message as sign_chain_message,
  sign_transaction as sign_chain_transaction, SignedTransaction,
};
use crate::derivation::{derive_accounts_for_wallet, resolve_derivation};
use crate::error::{require_non_empty, require_trimmed, CoreError, CoreResult, ResultExt};
use crate::strings::sanitize_optional_text;
use crate::types::{DerivationInput, SignedMessage, WalletInfo};
use crate::vault::VaultRepository;
use tcx_common::FromHex;
use tcx_keystore::keystore::IdentityNetwork;
use tcx_keystore::{Keystore as TcxKeystore, KeystoreGuard, Metadata, Source};

pub(crate) fn list_wallets(vault_path: String) -> CoreResult<Vec<crate::types::WalletInfo>> {
  VaultRepository::new(vault_path)?.list_wallets()
}

pub(crate) fn get_wallet(name_or_id: String, vault_path: String) -> CoreResult<WalletInfo> {
  VaultRepository::new(vault_path)?.get_wallet(&name_or_id)
}

pub(crate) fn delete_wallet(name_or_id: String, vault_path: String) -> CoreResult<()> {
  VaultRepository::new(vault_path)?.delete_wallet(&name_or_id)
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
) -> CoreResult<Vec<crate::types::WalletAccount>> {
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

pub(crate) fn sign_message(
  name: String,
  chain_id: String,
  message: String,
  password: String,
  vault_path: String,
) -> CoreResult<SignedMessage> {
  require_non_empty(&password, "password")?;
  require_non_empty(&message, "message")?;

  with_signing_request(
    name,
    chain_id,
    password,
    vault_path,
    move |unlocked_keystore, request| {
      sign_chain_message(
        unlocked_keystore,
        &request.resolved,
        &request.derivation_path,
        &message,
      )
    },
  )
}

pub(crate) fn sign_transaction(
  name: String,
  chain_id: String,
  tx_hex: String,
  password: String,
  vault_path: String,
) -> CoreResult<SignedTransaction> {
  require_non_empty(&password, "password")?;
  let normalized_tx_hex = require_trimmed(tx_hex, "txHex")?;

  with_signing_request(
    name,
    chain_id,
    password,
    vault_path,
    move |unlocked_keystore, request| {
      let tx_data = prepare_transaction(&request.resolved, &normalized_tx_hex)?;
      sign_chain_transaction(
        unlocked_keystore,
        &request.resolved,
        &request.derivation_path,
        tx_data,
      )
    },
  )
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

fn with_unlocked_keystore<T>(
  keystore: &mut TcxKeystore,
  password: &str,
  f: impl FnOnce(&mut TcxKeystore) -> CoreResult<T>,
) -> CoreResult<T> {
  let mut guard = KeystoreGuard::unlock_by_password(keystore, password).map_core_err()?;
  f(guard.keystore_mut())
}

fn with_signing_request<T>(
  name: String,
  chain_id: String,
  password: String,
  vault_path: String,
  f: impl FnOnce(&mut TcxKeystore, crate::derivation::DerivationRequest) -> CoreResult<T>,
) -> CoreResult<T> {
  require_non_empty(&name, "name")?;

  let wallet = VaultRepository::new(vault_path)?.get_wallet(&name)?;
  let mut keystore = stored_keystore(&wallet)?;

  with_unlocked_keystore(&mut keystore, &password, move |unlocked_keystore| {
    let network = unlocked_keystore.store().meta.network;
    let request = resolve_derivation(
      DerivationInput {
        chain_id,
        derivation_path: None,
        network: None,
      },
      network,
      unlocked_keystore.derivable(),
    )?;

    f(unlocked_keystore, request)
  })
}

fn load_tcx_keystore(keystore_json: String) -> CoreResult<TcxKeystore> {
  let normalized_keystore_json = require_trimmed(keystore_json, "keystoreJson")?;
  TcxKeystore::from_json(&normalized_keystore_json).map_core_err()
}

fn stored_keystore(wallet: &WalletInfo) -> CoreResult<TcxKeystore> {
  TcxKeystore::from_json(&wallet.keystore.to_json_string()?).map_core_err()
}

fn normalize_mnemonic(mnemonic: &str) -> String {
  mnemonic.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn create_mnemonic(entropy: Option<String>) -> CoreResult<String> {
  match entropy {
    Some(entropy_hex) => {
      let entropy = Vec::from_hex_auto(entropy_hex.trim()).map_core_err()?;
      tcx_primitive::mnemonic_from_entropy(&entropy).map_core_err()
    }
    None => tcx_primitive::mnemonic_from_entropy(&tcx_common::random_u8_16()).map_core_err(),
  }
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
