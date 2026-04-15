use std::collections::HashSet;

use tcx_keystore::{Keystore as TcxKeystore, KeystoreGuard};

use crate::derivation::derive_accounts_for_wallet;
use crate::error::{CoreError, CoreResult, ResultExt};
use crate::types::{DerivationInput, WalletInfo};
use crate::vault::VaultRepository;

pub(crate) fn build_wallet_info(
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
  let normalized_keystore_json = crate::error::require_trimmed(&keystore_json, "keystoreJson")?;
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
    return Err(CoreError::InvalidInput {
      field: "walletIds",
      reason: "must not be empty".into(),
    });
  }

  let mut seen = HashSet::with_capacity(wallet_ids.len());
  let mut resolved = Vec::with_capacity(wallet_ids.len());
  for wallet_id in wallet_ids {
    let wallet = vault.get_wallet(&wallet_id)?;
    if seen.insert(wallet.meta.id.clone()) {
      resolved.push(wallet);
    }
  }

  Ok(resolved)
}
