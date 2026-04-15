use std::fs;
use std::path::{Path, PathBuf};

use serde::de::DeserializeOwned;
use serde::Serialize;

use crate::error::{require_trimmed, CoreError, CoreResult, ResultExt};
use crate::types::{ApiKeyInfo, PolicyInfo, StoredApiKey, WalletInfo};

const WALLETS_DIR: &str = "wallets";
const POLICIES_DIR: &str = "policies";
const KEYS_DIR: &str = "keys";
const JSON_FILE_EXTENSION: &str = "json";

#[cfg(unix)]
const DIR_PERMISSIONS: u32 = 0o700;

#[cfg(unix)]
const FILE_PERMISSIONS: u32 = 0o600;

pub(crate) struct VaultRepository {
  vault_path: String,
  wallets_dir: PathBuf,
  policies_dir: PathBuf,
  keys_dir: PathBuf,
}

impl VaultRepository {
  pub(crate) fn new(vault_path: String) -> CoreResult<Self> {
    let vault_path = require_trimmed(&vault_path, "vaultPath")?;
    Ok(Self {
      wallets_dir: Path::new(&vault_path).join(WALLETS_DIR),
      policies_dir: Path::new(&vault_path).join(POLICIES_DIR),
      keys_dir: Path::new(&vault_path).join(KEYS_DIR),
      vault_path,
    })
  }

  pub(crate) fn wallet_name_exists(&self, name: &str) -> CoreResult<bool> {
    let wallets = self.list_wallets()?;
    Ok(wallets.iter().any(|wallet| wallet.meta.name == name))
  }

  pub(crate) fn policy_name_exists(&self, name: &str) -> CoreResult<bool> {
    let policies = self.list_policies()?;
    Ok(policies.iter().any(|policy| policy.name == name))
  }

  pub(crate) fn api_key_name_exists(&self, name: &str) -> CoreResult<bool> {
    let api_keys = self.list_stored_api_keys()?;
    Ok(api_keys.iter().any(|api_key| api_key.info.name == name))
  }

  pub(crate) fn is_wallet_referenced(&self, wallet_id: &str) -> CoreResult<bool> {
    Ok(
      self
        .list_stored_api_keys()?
        .iter()
        .any(|api_key| api_key.info.wallet_ids.iter().any(|id| id == wallet_id)),
    )
  }

  pub(crate) fn is_policy_referenced(&self, policy_id: &str) -> CoreResult<bool> {
    Ok(
      self
        .list_stored_api_keys()?
        .iter()
        .any(|api_key| api_key.info.policy_ids.iter().any(|id| id == policy_id)),
    )
  }

  pub(crate) fn save_wallet(&self, wallet_info: &WalletInfo) -> CoreResult<()> {
    self.save_json_record(
      &self.wallets_dir,
      &wallet_info.meta.id,
      "wallet vault",
      wallet_info,
    )
  }

  pub(crate) fn save_policy(&self, policy_info: &PolicyInfo) -> CoreResult<()> {
    self.save_json_record(
      &self.policies_dir,
      &policy_info.id,
      "policy vault",
      policy_info,
    )
  }

  pub(crate) fn save_api_key(&self, api_key: &StoredApiKey) -> CoreResult<()> {
    self.save_json_record(&self.keys_dir, &api_key.info.id, "API key vault", api_key)
  }

  pub(crate) fn list_wallets(&self) -> CoreResult<Vec<WalletInfo>> {
    self.list_json_records_lossy(&self.wallets_dir)
  }

  pub(crate) fn list_policies(&self) -> CoreResult<Vec<PolicyInfo>> {
    self.list_json_records_strict(&self.policies_dir)
  }

  pub(crate) fn list_api_keys(&self) -> CoreResult<Vec<ApiKeyInfo>> {
    Ok(
      self
        .list_stored_api_keys()?
        .into_iter()
        .map(|api_key| api_key.info)
        .collect(),
    )
  }

  pub(crate) fn list_stored_api_keys(&self) -> CoreResult<Vec<StoredApiKey>> {
    self.list_json_records_strict(&self.keys_dir)
  }

  pub(crate) fn get_wallet(&self, identifier: &str) -> CoreResult<WalletInfo> {
    let normalized_identifier = require_trimmed(identifier, "nameOrId")?;
    let wallets = self.list_wallets()?;
    let wallet = resolve_named_record(
      &normalized_identifier,
      &wallets,
      &self.vault_path,
      "Wallet",
      "wallets",
      |wallet| &wallet.meta.id,
      |wallet| &wallet.meta.name,
    )?;
    Ok(wallet.clone())
  }

  pub(crate) fn get_policy(&self, identifier: &str) -> CoreResult<PolicyInfo> {
    let normalized_identifier = require_trimmed(identifier, "nameOrId")?;
    let policies = self.list_policies()?;
    let policy = resolve_named_record(
      &normalized_identifier,
      &policies,
      &self.vault_path,
      "Policy",
      "policies",
      |policy| &policy.id,
      |policy| &policy.name,
    )?;
    Ok(policy.clone())
  }

  pub(crate) fn get_policy_by_id(&self, policy_id: &str) -> CoreResult<PolicyInfo> {
    let normalized_policy_id = require_trimmed(policy_id, "policyId")?;
    self.read_json_record(
      &self.json_file_path(&self.policies_dir, &normalized_policy_id),
      "policy vault",
    )
  }

  pub(crate) fn get_api_key(&self, identifier: &str) -> CoreResult<ApiKeyInfo> {
    Ok(self.get_stored_api_key(identifier)?.info)
  }

  pub(crate) fn get_stored_api_key(&self, identifier: &str) -> CoreResult<StoredApiKey> {
    let normalized_identifier = require_trimmed(identifier, "nameOrId")?;
    let api_keys = self.list_stored_api_keys()?;
    let api_key = resolve_named_record(
      &normalized_identifier,
      &api_keys,
      &self.vault_path,
      "API key",
      "API keys",
      |api_key| &api_key.info.id,
      |api_key| &api_key.info.name,
    )?;
    Ok(api_key.clone())
  }

  pub(crate) fn get_stored_api_key_by_id(&self, api_key_id: &str) -> CoreResult<StoredApiKey> {
    let normalized_api_key_id = require_trimmed(api_key_id, "apiKeyId")?;
    self.read_json_record(
      &self.json_file_path(&self.keys_dir, &normalized_api_key_id),
      "API key vault",
    )
  }

  pub(crate) fn delete_wallet(&self, identifier: &str) -> CoreResult<()> {
    let normalized_identifier = require_trimmed(identifier, "nameOrId")?;
    let wallets = self.list_wallets()?;
    let wallet = resolve_named_record(
      &normalized_identifier,
      &wallets,
      &self.vault_path,
      "Wallet",
      "wallets",
      |wallet| &wallet.meta.id,
      |wallet| &wallet.meta.name,
    )?;
    self.remove_json_record(&self.wallets_dir, &wallet.meta.id, "wallet vault")
  }

  pub(crate) fn delete_policy(&self, identifier: &str) -> CoreResult<()> {
    let normalized_identifier = require_trimmed(identifier, "nameOrId")?;
    let policies = self.list_policies()?;
    let policy = resolve_named_record(
      &normalized_identifier,
      &policies,
      &self.vault_path,
      "Policy",
      "policies",
      |policy| &policy.id,
      |policy| &policy.name,
    )?;
    self.remove_json_record(&self.policies_dir, &policy.id, "policy vault")
  }

  pub(crate) fn revoke_api_key(&self, identifier: &str) -> CoreResult<()> {
    let normalized_identifier = require_trimmed(identifier, "nameOrId")?;
    let api_keys = self.list_stored_api_keys()?;
    let api_key = resolve_named_record(
      &normalized_identifier,
      &api_keys,
      &self.vault_path,
      "API key",
      "API keys",
      |api_key| &api_key.info.id,
      |api_key| &api_key.info.name,
    )?;
    self.remove_json_record(&self.keys_dir, &api_key.info.id, "API key vault")
  }

  fn save_json_record<T: Serialize>(
    &self,
    dir: &Path,
    record_id: &str,
    _label: &str,
    record: &T,
  ) -> CoreResult<()> {
    self.ensure_dir(dir)?;

    let path = self.json_file_path(dir, record_id);
    let payload = serde_json::to_string_pretty(record).map_core_err()?;

    fs::write(&path, payload).map_err(|err| CoreError::VaultIo {
      path: path.display().to_string(),
      source: err,
    })?;

    set_file_permissions(&path);
    Ok(())
  }

  fn list_json_records_lossy<T: DeserializeOwned>(&self, dir: &Path) -> CoreResult<Vec<T>> {
    if !dir.exists() {
      return Ok(Vec::new());
    }

    check_vault_permissions(dir);

    let mut records = Vec::new();
    for path in self.list_json_paths(dir)? {
      let content = match fs::read_to_string(&path) {
        Ok(content) => content,
        Err(_) => continue,
      };

      let record = match serde_json::from_str::<T>(&content) {
        Ok(record) => record,
        Err(_) => continue,
      };

      records.push(record);
    }

    Ok(records)
  }

  fn list_json_records_strict<T: DeserializeOwned>(&self, dir: &Path) -> CoreResult<Vec<T>> {
    if !dir.exists() {
      return Ok(Vec::new());
    }

    check_vault_permissions(dir);

    self
      .list_json_paths(dir)?
      .into_iter()
      .map(|path| self.read_json_record(&path, "vault record"))
      .collect()
  }

  fn read_json_record<T: DeserializeOwned>(&self, path: &Path, _label: &str) -> CoreResult<T> {
    let content = fs::read_to_string(path).map_err(|err| CoreError::VaultIo {
      path: path.display().to_string(),
      source: err,
    })?;
    serde_json::from_str(&content).map_err(|err| {
      CoreError::with_context(
        format!("failed to parse vault record `{}`", path.display()),
        err,
      )
    })
  }

  fn remove_json_record(&self, dir: &Path, record_id: &str, _label: &str) -> CoreResult<()> {
    let path = self.json_file_path(dir, record_id);
    fs::remove_file(&path)
      .map_err(|err| CoreError::VaultIo {
        path: path.display().to_string(),
        source: err,
      })
      .map_err(|err| {
        CoreError::with_context(
          format!("failed to delete vault record `{}`", path.display()),
          err,
        )
      })
  }

  fn ensure_dir(&self, dir: &Path) -> CoreResult<()> {
    let root_dir = Path::new(&self.vault_path);
    if !dir.exists() {
      fs::create_dir_all(dir).map_err(|err| CoreError::VaultIo {
        path: dir.display().to_string(),
        source: err,
      })?;
    }

    if root_dir.exists() {
      set_dir_permissions(root_dir);
    }
    set_dir_permissions(dir);
    Ok(())
  }

  fn list_json_paths(&self, dir: &Path) -> CoreResult<Vec<PathBuf>> {
    let entries = fs::read_dir(dir).map_err(|err| CoreError::VaultIo {
      path: dir.display().to_string(),
      source: err,
    })?;

    let mut paths = Vec::new();
    for entry in entries {
      let entry = entry.map_err(|err| CoreError::VaultIo {
        path: dir.display().to_string(),
        source: err,
      })?;
      let path = entry.path();
      if path.extension().and_then(|ext| ext.to_str()) == Some(JSON_FILE_EXTENSION) {
        paths.push(path);
      }
    }

    Ok(paths)
  }

  fn json_file_path(&self, dir: &Path, record_id: &str) -> PathBuf {
    dir.join(format!("{record_id}.{JSON_FILE_EXTENSION}"))
  }
}

fn format_record_candidates<T>(
  records: &[&T],
  id: impl Fn(&T) -> &str,
  name: impl Fn(&T) -> &str,
) -> String {
  records
    .iter()
    .map(|record| format!("{} ({})", name(record), id(record)))
    .collect::<Vec<_>>()
    .join(", ")
}

fn resolve_named_record<'a, T>(
  identifier: &str,
  records: &'a [T],
  vault_path: &str,
  singular_label: &'static str,
  plural_label: &str,
  id: impl Fn(&T) -> &str,
  name: impl Fn(&T) -> &str,
) -> CoreResult<&'a T> {
  if records.is_empty() {
    return Err(CoreError::NotFound {
      resource: singular_label,
      identifier: format!("any in vault: {vault_path}"),
    });
  }

  if let Some(record) = records.iter().find(|record| id(record) == identifier) {
    return Ok(record);
  }

  let exact_name_matches = records
    .iter()
    .filter(|record| name(record) == identifier)
    .collect::<Vec<_>>();
  if exact_name_matches.len() == 1 {
    return Ok(exact_name_matches[0]);
  }
  if exact_name_matches.len() > 1 {
    return Err(CoreError::new(format!(
      "Multiple {plural_label} share the name \"{identifier}\". Use a {singular_label} id instead: {}",
      format_record_candidates(&exact_name_matches, &id, &name)
    )));
  }

  let id_prefix_matches = records
    .iter()
    .filter(|record| id(record).starts_with(identifier))
    .collect::<Vec<_>>();
  if id_prefix_matches.len() == 1 {
    return Ok(id_prefix_matches[0]);
  }
  if id_prefix_matches.len() > 1 {
    return Err(CoreError::new(format!(
      "{singular_label} id prefix \"{identifier}\" is ambiguous. Matches: {}",
      format_record_candidates(&id_prefix_matches, &id, &name)
    )));
  }

  Err(CoreError::NotFound {
    resource: singular_label,
    identifier: identifier.into(),
  })
}

#[cfg(unix)]
fn set_dir_permissions(path: &Path) {
  use std::os::unix::fs::PermissionsExt;

  let permissions = fs::Permissions::from_mode(DIR_PERMISSIONS);
  if let Err(err) = fs::set_permissions(path, permissions) {
    eprintln!(
      "Warning: failed to set directory permissions for `{}`: {err}",
      path.display()
    );
  }
}

#[cfg(unix)]
fn set_file_permissions(path: &Path) {
  use std::os::unix::fs::PermissionsExt;

  let permissions = fs::Permissions::from_mode(FILE_PERMISSIONS);
  if let Err(err) = fs::set_permissions(path, permissions) {
    eprintln!(
      "Warning: failed to set file permissions for `{}`: {err}",
      path.display()
    );
  }
}

#[cfg(unix)]
fn check_vault_permissions(path: &Path) {
  use std::os::unix::fs::PermissionsExt;

  let metadata = match fs::metadata(path) {
    Ok(metadata) => metadata,
    Err(_) => return,
  };

  let mode = metadata.permissions().mode();
  if mode & 0o077 != 0 {
    eprintln!(
      "Warning: vault directory `{}` has permissions {:o}, which is more open than recommended (700). \
      Consider running: chmod 700 {}",
      path.display(),
      mode & 0o777,
      path.display()
    );
  }
}

#[cfg(not(unix))]
fn set_dir_permissions(_path: &Path) {}

#[cfg(not(unix))]
fn set_file_permissions(_path: &Path) {}

#[cfg(not(unix))]
fn check_vault_permissions(_path: &Path) {}
