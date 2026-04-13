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
