use napi::Result;
use napi_derive::napi;

use crate::error::CoreResultExt;
use crate::service;
use crate::types::{ApiKeyInfo, CreatedApiKey};

#[napi(js_name = "listApiKey")]
/// Lists all persisted API keys in the vault.
pub fn list_api_key(vault_path: String) -> Result<Vec<ApiKeyInfo>> {
  service::list_api_keys(vault_path).into_napi()
}

#[napi(js_name = "getApiKey")]
/// Loads a persisted API key by key id, exact name, or unique id prefix.
pub fn get_api_key(name_or_id: String, vault_path: String) -> Result<ApiKeyInfo> {
  service::get_api_key(name_or_id, vault_path).into_napi()
}

#[napi(
  js_name = "createApiKey",
  ts_args_type = "name: string, walletIds: Array<string>, policyIds: Array<string>, passphrase: string, expiresAt?: string, vaultPathOpt?: string"
)]
/// Creates an API key bound to one or more wallets and optional declarative policies.
pub fn create_api_key(
  name: String,
  wallet_ids: Vec<String>,
  policy_ids: Vec<String>,
  passphrase: String,
  expires_at: Option<String>,
  vault_path_opt: Option<String>,
) -> Result<CreatedApiKey> {
  service::create_api_key(
    name,
    wallet_ids,
    policy_ids,
    passphrase,
    expires_at,
    vault_path_opt,
  )
  .into_napi()
}

#[napi(js_name = "revokeApiKey")]
/// Revokes an API key by removing its persisted record from the vault.
pub fn revoke_api_key(name_or_id: String, vault_path: String) -> Result<()> {
  service::revoke_api_key(name_or_id, vault_path).into_napi()
}
