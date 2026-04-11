use std::fs;
use std::path::{Path, PathBuf};

use crate::error::{require_trimmed, CoreError, CoreResult, ResultExt};
use crate::types::WalletInfo;

const WALLETS_DIR: &str = "wallets";
const WALLET_FILE_EXTENSION: &str = "json";

#[cfg(unix)]
const DIR_PERMISSIONS: u32 = 0o700;

#[cfg(unix)]
const FILE_PERMISSIONS: u32 = 0o600;

pub(crate) struct VaultRepository {
  vault_path: String,
  wallets_dir: PathBuf,
}

impl VaultRepository {
  pub(crate) fn new(vault_path: String) -> CoreResult<Self> {
    let vault_path = require_trimmed(vault_path, "vaultPath")?;
    let wallets_dir = Path::new(&vault_path).join(WALLETS_DIR);

    Ok(Self {
      vault_path,
      wallets_dir,
    })
  }

  pub(crate) fn wallet_name_exists(&self, name: &str) -> CoreResult<bool> {
    let wallets = self.list_wallets()?;
    Ok(wallets.iter().any(|wallet| wallet.meta.name == name))
  }

  pub(crate) fn save_wallet(&self, wallet_info: &WalletInfo) -> CoreResult<()> {
    self.ensure_wallets_dir()?;

    let path = self.wallet_file_path(&wallet_info.meta.id);
    let payload = serde_json::to_string_pretty(wallet_info).map_core_err()?;

    fs::write(&path, payload)
      .core_context(format!("failed to write wallet vault `{}`", path.display()))?;

    set_file_permissions(&path);
    Ok(())
  }

  pub(crate) fn list_wallets(&self) -> CoreResult<Vec<WalletInfo>> {
    if !self.wallets_dir.exists() {
      return Ok(Vec::new());
    }

    check_vault_permissions(&self.wallets_dir);

    let entries = fs::read_dir(&self.wallets_dir).core_context(format!(
      "failed to read vault directory `{}`",
      self.wallets_dir.display()
    ))?;

    let mut wallet_infos = Vec::new();
    for entry in entries {
      let entry = entry.core_context(format!(
        "failed to read entry in vault directory `{}`",
        self.wallets_dir.display()
      ))?;

      let path = entry.path();
      if path.extension().and_then(|ext| ext.to_str()) != Some(WALLET_FILE_EXTENSION) {
        continue;
      }

      let content = match fs::read_to_string(&path) {
        Ok(content) => content,
        Err(_) => continue,
      };

      let wallet_info = match serde_json::from_str::<WalletInfo>(&content) {
        Ok(info) => info,
        Err(_) => continue,
      };

      wallet_infos.push(wallet_info);
    }

    Ok(wallet_infos)
  }

  pub(crate) fn get_wallet(&self, identifier: &str) -> CoreResult<WalletInfo> {
    let normalized_identifier = require_trimmed(identifier.to_string(), "nameOrId")?;
    let wallets = self.list_wallets()?;
    let wallet = resolve_wallet(&normalized_identifier, &wallets, &self.vault_path)?;
    Ok(wallet.clone())
  }

  pub(crate) fn delete_wallet(&self, identifier: &str) -> CoreResult<()> {
    let normalized_identifier = require_trimmed(identifier.to_string(), "nameOrId")?;
    let wallets = self.list_wallets()?;
    let wallet = resolve_wallet(&normalized_identifier, &wallets, &self.vault_path)?;
    let path = self.wallet_file_path(&wallet.meta.id);

    fs::remove_file(&path).core_context(format!(
      "failed to delete wallet vault `{}`",
      path.display()
    ))?;

    Ok(())
  }

  fn ensure_wallets_dir(&self) -> CoreResult<()> {
    let root_dir = Path::new(&self.vault_path);

    if !self.wallets_dir.exists() {
      fs::create_dir_all(&self.wallets_dir).core_context(format!(
        "failed to create vault directory `{}`",
        self.wallets_dir.display()
      ))?;
    }

    if root_dir.exists() {
      set_dir_permissions(root_dir);
    }
    set_dir_permissions(&self.wallets_dir);

    Ok(())
  }

  fn wallet_file_path(&self, wallet_id: &str) -> PathBuf {
    self
      .wallets_dir
      .join(format!("{wallet_id}.{WALLET_FILE_EXTENSION}"))
  }
}

fn format_wallet_candidates(wallets: &[&WalletInfo]) -> String {
  wallets
    .iter()
    .map(|wallet| format!("{} ({})", wallet.meta.name, wallet.meta.id))
    .collect::<Vec<_>>()
    .join(", ")
}

fn resolve_wallet<'a>(
  identifier: &str,
  wallets: &'a [WalletInfo],
  vault_path: &str,
) -> CoreResult<&'a WalletInfo> {
  if wallets.is_empty() {
    return Err(CoreError::new(format!(
      "No wallets found in vault: {vault_path}"
    )));
  }

  if let Some(wallet) = wallets.iter().find(|wallet| wallet.meta.id == identifier) {
    return Ok(wallet);
  }

  let exact_name_matches = wallets
    .iter()
    .filter(|wallet| wallet.meta.name == identifier)
    .collect::<Vec<_>>();
  if exact_name_matches.len() == 1 {
    return Ok(exact_name_matches[0]);
  }
  if exact_name_matches.len() > 1 {
    return Err(CoreError::new(format!(
      "Multiple wallets share the name \"{identifier}\". Use a wallet id instead: {}",
      format_wallet_candidates(&exact_name_matches)
    )));
  }

  let id_prefix_matches = wallets
    .iter()
    .filter(|wallet| wallet.meta.id.starts_with(identifier))
    .collect::<Vec<_>>();
  if id_prefix_matches.len() == 1 {
    return Ok(id_prefix_matches[0]);
  }
  if id_prefix_matches.len() > 1 {
    return Err(CoreError::new(format!(
      "Wallet id prefix \"{identifier}\" is ambiguous. Matches: {}",
      format_wallet_candidates(&id_prefix_matches)
    )));
  }

  Err(CoreError::new(format!("Wallet \"{identifier}\" not found")))
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
