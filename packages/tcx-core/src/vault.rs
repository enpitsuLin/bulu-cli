use napi::Result;

use std::fs;
use std::path::{Path, PathBuf};

use crate::error::{require_trimmed, to_napi_err};
use crate::types::WalletInfo;
use crate::wallet::parse_wallet_info;

/// Vault directory name for storing wallet files
const WALLETS_DIR: &str = "wallets";
const WALLET_FILE_EXTENSION: &str = "json";

/// Directory permissions: owner-only (rwx------)
#[cfg(unix)]
const DIR_PERMISSIONS: u32 = 0o700;

/// File permissions: owner read/write only (rw-------)
#[cfg(unix)]
const FILE_PERMISSIONS: u32 = 0o600;

/// Returns the wallets directory path for the given vault path
fn wallets_dir(vault_path: &str) -> PathBuf {
  Path::new(vault_path).join(WALLETS_DIR)
}

/// Returns the wallet file path for the given wallet id
fn wallet_file_path(vault_path: &str, wallet_id: &str) -> PathBuf {
  wallets_dir(vault_path).join(format!("{wallet_id}.{WALLET_FILE_EXTENSION}"))
}

/// Validates and normalizes the vault path
fn normalize_vault_path(vault_path: String) -> Result<String> {
  require_trimmed(vault_path, "vaultPath")
}

/// Set directory permissions to 0o700 (owner-only).
#[cfg(unix)]
fn set_dir_permissions(path: &Path) {
  use std::os::unix::fs::PermissionsExt;
  let permissions = fs::Permissions::from_mode(DIR_PERMISSIONS);
  if let Err(err) = fs::set_permissions(path, permissions) {
    eprintln!("Warning: failed to set directory permissions for `{}`: {err}", path.display());
  }
}

/// Set file permissions to 0o600 (owner read/write only).
#[cfg(unix)]
fn set_file_permissions(path: &Path) {
  use std::os::unix::fs::PermissionsExt;
  let permissions = fs::Permissions::from_mode(FILE_PERMISSIONS);
  if let Err(err) = fs::set_permissions(path, permissions) {
    eprintln!("Warning: failed to set file permissions for `{}`: {err}", path.display());
  }
}

/// Warn if a directory has permissions more open than 0o700.
#[cfg(unix)]
pub fn check_vault_permissions(path: &Path) {
  use std::os::unix::fs::PermissionsExt;
  
  let metadata = match fs::metadata(path) {
    Ok(m) => m,
    Err(_) => return,
  };
  
  let mode = metadata.permissions().mode();
  // Check if permissions are more open than 0o700 (owner-only)
  // We check the group and other bits (lower 6 bits)
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
pub fn check_vault_permissions(_path: &Path) {}

/// Ensures the vault wallets directory exists, creating it if necessary
fn ensure_vault_dir(vault_path: &str) -> Result<PathBuf> {
  let vault_dir = wallets_dir(vault_path);

  if !vault_dir.exists() {
    fs::create_dir_all(&vault_dir).map_err(|err| {
      napi::Error::from_reason(format!(
        "failed to create vault directory `{}`: {err}",
        vault_dir.display()
      ))
    })?;
    // Set restrictive permissions on newly created directory
    set_dir_permissions(&vault_dir);
  }

  Ok(vault_dir)
}

/// Saves a wallet info to the vault directory
///
/// The wallet is saved as `<vault_path>/wallets/<wallet_id>.json`
pub fn save_wallet(wallet_info: &WalletInfo, vault_path: String) -> Result<()> {
  let vault_path = normalize_vault_path(vault_path)?;
  ensure_vault_dir(&vault_path)?;

  let path = wallet_file_path(&vault_path, &wallet_info.meta.id);
  let payload =
    serde_json::to_string_pretty(&crate::wallet::wallet_info_to_json(wallet_info)).map_err(to_napi_err)?;

  fs::write(&path, payload).map_err(|err| {
    napi::Error::from_reason(format!(
      "failed to write wallet vault `{}`: {err}",
      path.display()
    ))
  })?;

  // Set restrictive permissions on the wallet file
  set_file_permissions(&path);

  Ok(())
}

/// Lists all wallets in the vault directory
///
/// Returns an empty vector if the vault path is None or the wallets directory doesn't exist
pub fn list_wallets(vault_path_opt: Option<String>) -> Result<Vec<WalletInfo>> {
  let Some(vault_path) = vault_path_opt else {
    return Ok(Vec::new());
  };

  let vault_path = normalize_vault_path(vault_path)?;
  let wallets_dir = wallets_dir(&vault_path);

  if !wallets_dir.exists() {
    return Ok(Vec::new());
  }

  // Check vault directory permissions
  check_vault_permissions(&wallets_dir);

  let mut wallet_infos = Vec::new();

  let entries = fs::read_dir(&wallets_dir).map_err(|err| {
    napi::Error::from_reason(format!(
      "failed to read vault directory `{}`: {err}",
      wallets_dir.display()
    ))
  })?;

  for entry in entries {
    let entry = entry.map_err(|err| {
      napi::Error::from_reason(format!(
        "failed to read entry in vault directory `{}`: {err}",
        wallets_dir.display()
      ))
    })?;

    let path = entry.path();
    if path.extension().and_then(|ext| ext.to_str()) != Some(WALLET_FILE_EXTENSION) {
      continue;
    }

    let content = match fs::read_to_string(&path) {
      Ok(content) => content,
      Err(_) => continue,
    };

    let wallet_info = match parse_wallet_info(&content) {
      Ok(info) => info,
      Err(_) => continue,
    };

    wallet_infos.push(wallet_info);
  }

  Ok(wallet_infos)
}

/// Finds a wallet by name in the vault directory and returns its keystore JSON
///
/// Returns an error if the wallet is not found
pub fn find_wallet_keystore_by_name(name: &str, vault_path: String) -> Result<String> {
  let vault_path = normalize_vault_path(vault_path)?;
  let wallets_dir = wallets_dir(&vault_path);

  if !wallets_dir.exists() {
    return Err(napi::Error::from_reason(format!(
      "wallets directory does not exist: {}",
      wallets_dir.display()
    )));
  }

  // Check vault directory permissions
  check_vault_permissions(&wallets_dir);

  let entries = fs::read_dir(&wallets_dir).map_err(|err| {
    napi::Error::from_reason(format!(
      "failed to read vault directory `{}`: {err}",
      wallets_dir.display()
    ))
  })?;

  for entry in entries {
    let entry = entry.map_err(|err| {
      napi::Error::from_reason(format!(
        "failed to read entry in vault directory `{}`: {err}",
        wallets_dir.display()
      ))
    })?;

    let path = entry.path();
    if path.extension().and_then(|ext| ext.to_str()) != Some(WALLET_FILE_EXTENSION) {
      continue;
    }

    let content = match fs::read_to_string(&path) {
      Ok(content) => content,
      Err(_) => continue,
    };

    // Parse JSON and check if name matches
    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
      if let Some(meta_name) = json
        .get("meta")
        .and_then(|m| m.get("name"))
        .and_then(|n| n.as_str())
      {
        if meta_name == name {
          // Return the keystore JSON from the wallet file
          if let Some(keystore) = json.get("keystore") {
            return serde_json::to_string(keystore).map_err(to_napi_err);
          }
        }
      }
    }
  }

  Err(napi::Error::from_reason(format!(
    "wallet with name '{}' not found in vault: {}",
    name,
    wallets_dir.display()
  )))
}


