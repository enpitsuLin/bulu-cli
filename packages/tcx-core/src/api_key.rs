use tcx_common::{FromHex, ToHex};
use tcx_crypto::aes::ctr256;

use crate::error::{require_non_empty, require_trimmed, CoreError, CoreResult, ResultExt};
use crate::policy_engine::normalize_timestamp;
use crate::strings::sanitize_optional_text;
use crate::types::{
  ApiKeyInfo, CreatedApiKey, EncPairData, StoredApiKey, StoredEncryptedWalletKey,
};
use crate::utils::{new_record_id, now_timestamp};
use crate::vault::VaultRepository;
use crate::wallet::{resolve_wallets, stored_keystore};

pub(crate) const API_KEY_TOKEN_PREFIX: &str = "bulu_key_";

pub(crate) fn list_api_keys(vault_path: String) -> CoreResult<Vec<ApiKeyInfo>> {
  VaultRepository::new(vault_path)?.list_api_keys()
}

pub(crate) fn get_api_key(name_or_id: String, vault_path: String) -> CoreResult<ApiKeyInfo> {
  VaultRepository::new(vault_path)?.get_api_key(&name_or_id)
}

pub(crate) fn revoke_api_key(name_or_id: String, vault_path: String) -> CoreResult<()> {
  VaultRepository::new(vault_path)?.revoke_api_key(&name_or_id)
}

pub(crate) fn create_api_key(
  name: String,
  wallet_ids: Vec<String>,
  policy_ids: Vec<String>,
  passphrase: String,
  expires_at: Option<String>,
  vault_path_opt: Option<String>,
) -> CoreResult<CreatedApiKey> {
  require_non_empty(&passphrase, "passphrase")?;

  let normalized_name = require_trimmed(name, "name")?;
  let vault_path = resolve_optional_vault_path(vault_path_opt);
  let vault = VaultRepository::new(vault_path)?;
  if vault.api_key_name_exists(&normalized_name)? {
    return Err(CoreError::new(format!(
      r#"API key "{}" already exists"#,
      normalized_name
    )));
  }

  let resolved_wallets = resolve_wallets(&vault, wallet_ids)?;
  let wallet_ids = resolved_wallets
    .iter()
    .map(|wallet| wallet.meta.id.clone())
    .collect::<Vec<_>>();
  let policy_ids = resolve_policy_ids(&vault, policy_ids)?;
  let normalized_expires_at = match expires_at {
    Some(timestamp) => Some(normalize_timestamp(&timestamp)?),
    None => None,
  };

  let secret = tcx_common::random_u8_32();
  let nonce = tcx_common::random_u8_16();
  let encrypted_wallet_keys = resolved_wallets
    .iter()
    .map(|wallet| {
      let mut keystore = stored_keystore(wallet)?;
      let derived_key = keystore.get_derived_key(&passphrase).map_core_err()?;
      let encrypted_derived_key =
        ctr256::encrypt_nopadding(derived_key.as_bytes(), &secret, &nonce).map_core_err()?;

      Ok(StoredEncryptedWalletKey {
        wallet_id: wallet.meta.id.clone(),
        encrypted_derived_key: EncPairData {
          enc_str: encrypted_derived_key.to_hex(),
          nonce: nonce.to_hex(),
        },
      })
    })
    .collect::<CoreResult<Vec<_>>>()?;

  let api_key = StoredApiKey {
    info: ApiKeyInfo {
      id: new_record_id(),
      name: normalized_name,
      version: 1,
      created_at: now_timestamp(),
      wallet_ids,
      policy_ids,
      expires_at: normalized_expires_at,
    },
    token_hash: hash_secret(&secret),
    encrypted_wallet_keys,
  };
  vault.save_api_key(&api_key)?;

  let secret_hex = secret.to_hex();
  Ok(CreatedApiKey {
    id: api_key.info.id.clone(),
    api_key: api_key.info.clone(),
    token: format!("{API_KEY_TOKEN_PREFIX}{}_{}", api_key.info.id, secret_hex),
  })
}

fn resolve_optional_vault_path(vault_path_opt: Option<String>) -> String {
  sanitize_optional_text(vault_path_opt).unwrap_or_else(|| ".bulu".to_string())
}

fn resolve_policy_ids(vault: &VaultRepository, policy_ids: Vec<String>) -> CoreResult<Vec<String>> {
  let mut resolved = Vec::new();

  for policy_id in policy_ids {
    let policy = vault.get_policy(&policy_id)?;
    if !resolved.iter().any(|existing| existing == &policy.id) {
      resolved.push(policy.id);
    }
  }

  Ok(resolved)
}

pub(crate) fn parse_api_token(credential: &str) -> CoreResult<ParsedApiToken> {
  let payload = credential
    .strip_prefix(API_KEY_TOKEN_PREFIX)
    .ok_or_else(invalid_credential_error)?;
  let (api_key_id, secret_hex) = payload
    .split_once('_')
    .ok_or_else(invalid_credential_error)?;

  let normalized_api_key_id = require_trimmed(api_key_id.to_string(), "credential")?;
  let secret = Vec::from_hex(secret_hex.trim()).map_err(|_| invalid_credential_error())?;
  if secret.len() != 32 {
    return Err(invalid_credential_error());
  }

  Ok(ParsedApiToken {
    api_key_id: normalized_api_key_id,
    secret,
  })
}

pub(crate) fn decrypt_derived_key(
  api_key: &StoredApiKey,
  wallet_id: &str,
  secret: &[u8],
) -> CoreResult<String> {
  let encrypted_wallet_key = api_key
    .encrypted_wallet_keys
    .iter()
    .find(|encrypted_wallet_key| encrypted_wallet_key.wallet_id == wallet_id)
    .ok_or_else(invalid_credential_error)?;
  let encrypted = Vec::from_hex_auto(&encrypted_wallet_key.encrypted_derived_key.enc_str)
    .map_err(|_| invalid_credential_error())?;
  let nonce = Vec::from_hex_auto(&encrypted_wallet_key.encrypted_derived_key.nonce)
    .map_err(|_| invalid_credential_error())?;
  let decrypted = ctr256::decrypt_nopadding(&encrypted, secret, &nonce)
    .map_err(|_| invalid_credential_error())?;
  let derived_key = String::from_utf8(decrypted).map_err(|_| invalid_credential_error())?;
  require_non_empty(&derived_key, "derivedKey")?;
  let _ = Vec::from_hex_auto(&derived_key).map_err(|_| invalid_credential_error())?;
  Ok(derived_key)
}

#[inline]
pub(crate) fn hash_secret(secret: &[u8]) -> String {
  tcx_common::sha256(secret).to_hex()
}

#[inline]
pub(crate) fn invalid_credential_error() -> CoreError {
  CoreError::new("credential is invalid")
}

pub(crate) struct ParsedApiToken {
  pub(crate) api_key_id: String,
  pub(crate) secret: Vec<u8>,
}

#[cfg(test)]
mod tests {
  use std::env;
  use std::fs;
  use std::path::{Path, PathBuf};
  use std::time::{SystemTime, UNIX_EPOCH};

  use tcx_keystore::keystore::IdentityNetwork;

  use super::{create_api_key, get_api_key, list_api_keys, revoke_api_key};
  use crate::chain::Chain;
  use crate::policy::{create_policy, delete_policy};
  use crate::types::{PolicyCreateInput, PolicyRule};
  use crate::wallet::{delete_wallet, import_wallet_mnemonic};

  const TEST_PASSWORD: &str = "imToken";
  const TEST_MNEMONIC: &str =
    "inject kidney empty canal shadow pact comfort wife crush horse wife sketch";

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

  fn read_vault_text(path: &Path) -> String {
    fs::read_to_string(path).expect("vault JSON should be readable")
  }

  fn api_key_vault_path(vault_dir: &Path, api_key_id: &str) -> PathBuf {
    vault_dir.join("keys").join(format!("{api_key_id}.json"))
  }

  fn default_eth_mainnet_chain_id() -> &'static str {
    Chain::Ethereum.default_chain_id(IdentityNetwork::Mainnet)
  }

  fn allowed_chain_rule(chain_id: &str) -> PolicyRule {
    PolicyRule {
      rule_type: "allowed_chains".to_string(),
      chain_ids: Some(vec![chain_id.to_string()]),
      timestamp: None,
    }
  }

  #[test]
  fn create_api_key_persists_without_storing_plaintext_token() {
    let (vault_dir, vault_path) = temp_vault("api-key-create");
    let wallet = import_wallet_mnemonic(
      "API wallet".to_string(),
      TEST_MNEMONIC.to_string(),
      TEST_PASSWORD.to_string(),
      vault_path.clone(),
      None,
    )
    .expect("wallet import should succeed");
    let policy = create_policy(
      PolicyCreateInput {
        name: "ETH only".to_string(),
        rules: vec![allowed_chain_rule(default_eth_mainnet_chain_id())],
      },
      vault_path.clone(),
    )
    .expect("policy creation should succeed");

    let created = create_api_key(
      "Claude".to_string(),
      vec![wallet.meta.id.clone()],
      vec![policy.id.clone()],
      TEST_PASSWORD.to_string(),
      None,
      Some(vault_path.clone()),
    )
    .expect("API key creation should succeed");

    assert!(created
      .token
      .starts_with(&format!("bulu_key_{}_", created.api_key.id)));

    let listed = list_api_keys(vault_path.clone()).expect("API keys should list");
    assert_eq!(listed, vec![created.api_key.clone()]);

    let loaded =
      get_api_key(created.api_key.id.clone(), vault_path.clone()).expect("API key should load");
    assert_eq!(loaded, created.api_key);

    let persisted = read_vault_text(&api_key_vault_path(&vault_dir, &created.api_key.id));
    assert!(persisted.contains("\"tokenHash\""));
    assert!(!persisted.contains(&created.token));

    let _ = fs::remove_dir_all(vault_dir);
  }

  #[test]
  fn delete_policy_and_wallet_reject_when_api_key_still_references_them() {
    let (vault_dir, vault_path) = temp_vault("api-key-reference-guards");
    let wallet = import_wallet_mnemonic(
      "Treasury".to_string(),
      TEST_MNEMONIC.to_string(),
      TEST_PASSWORD.to_string(),
      vault_path.clone(),
      None,
    )
    .expect("wallet import should succeed");
    let policy = create_policy(
      PolicyCreateInput {
        name: "Guarded".to_string(),
        rules: vec![allowed_chain_rule(default_eth_mainnet_chain_id())],
      },
      vault_path.clone(),
    )
    .expect("policy creation should succeed");
    let api_key = create_api_key(
      "guard".to_string(),
      vec![wallet.meta.id.clone()],
      vec![policy.id.clone()],
      TEST_PASSWORD.to_string(),
      None,
      Some(vault_path.clone()),
    )
    .expect("API key creation should succeed");

    let delete_policy_err = delete_policy(policy.id.clone(), vault_path.clone())
      .expect_err("referenced policy should fail");
    assert_eq!(
      delete_policy_err.to_string(),
      "Policy \"Guarded\" is still referenced by an API key"
    );

    let delete_wallet_err = delete_wallet(wallet.meta.id.clone(), vault_path.clone())
      .expect_err("referenced wallet should fail");
    assert_eq!(
      delete_wallet_err.to_string(),
      "Wallet \"Treasury\" is still referenced by an API key"
    );

    revoke_api_key(api_key.api_key.id, vault_path.clone()).expect("API key revoke should succeed");
    delete_policy(policy.id, vault_path.clone()).expect("policy delete should succeed");
    delete_wallet(wallet.meta.id, vault_path.clone()).expect("wallet delete should succeed");

    let _ = fs::remove_dir_all(vault_dir);
  }
}
