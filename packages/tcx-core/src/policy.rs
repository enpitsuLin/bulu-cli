use napi::Result;
use napi_derive::napi;

use crate::error::CoreResultExt;
use crate::service;
use crate::types::{PolicyCreateInput, PolicyInfo};

#[napi(js_name = "listPolicy")]
/// Lists all persisted policies in the vault.
pub fn list_policy(vault_path: String) -> Result<Vec<PolicyInfo>> {
  service::list_policies(vault_path).into_napi()
}

#[napi(js_name = "getPolicy")]
/// Loads a persisted policy by policy id, exact name, or unique id prefix.
pub fn get_policy(name_or_id: String, vault_path: String) -> Result<PolicyInfo> {
  service::get_policy(name_or_id, vault_path).into_napi()
}

#[napi(js_name = "createPolicy")]
/// Creates and persists a declarative policy definition.
pub fn create_policy(input: PolicyCreateInput, vault_path: String) -> Result<PolicyInfo> {
  service::create_policy(input, vault_path).into_napi()
}

#[napi(js_name = "deletePolicy")]
/// Deletes a policy if no API key still references it.
pub fn delete_policy(name_or_id: String, vault_path: String) -> Result<()> {
  service::delete_policy(name_or_id, vault_path).into_napi()
}
