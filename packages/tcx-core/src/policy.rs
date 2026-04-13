use crate::error::{require_trimmed, CoreError, CoreResult};
use crate::policy_engine::validate_policy_rules;
use crate::types::{PolicyCreateInput, PolicyInfo};
use crate::utils::{new_record_id, now_timestamp};
use crate::vault::VaultRepository;

pub(crate) fn list_policies(vault_path: String) -> CoreResult<Vec<PolicyInfo>> {
  VaultRepository::new(vault_path)?.list_policies()
}

pub(crate) fn get_policy(name_or_id: String, vault_path: String) -> CoreResult<PolicyInfo> {
  VaultRepository::new(vault_path)?.get_policy(&name_or_id)
}

pub(crate) fn delete_policy(name_or_id: String, vault_path: String) -> CoreResult<()> {
  let vault = VaultRepository::new(vault_path)?;
  let policy = vault.get_policy(&name_or_id)?;

  if vault.list_stored_api_keys()?.iter().any(|api_key| {
    api_key
      .info
      .policy_ids
      .iter()
      .any(|policy_id| policy_id == &policy.id)
  }) {
    return Err(CoreError::new(format!(
      "Policy \"{}\" is still referenced by an API key",
      policy.name
    )));
  }

  vault.delete_policy(&policy.id)
}

pub(crate) fn create_policy(
  input: PolicyCreateInput,
  vault_path: String,
) -> CoreResult<PolicyInfo> {
  let normalized_name = require_trimmed(input.name, "name")?;
  let normalized_rules = validate_policy_rules(input.rules)?;

  let vault = VaultRepository::new(vault_path)?;
  if vault.policy_name_exists(&normalized_name)? {
    return Err(CoreError::new(format!(
      r#"Policy "{}" already exists"#,
      normalized_name
    )));
  }

  let policy = PolicyInfo {
    id: new_record_id(),
    name: normalized_name,
    version: 1,
    created_at: now_timestamp(),
    rules: normalized_rules,
    action: "deny".to_string(),
  };
  vault.save_policy(&policy)?;
  Ok(policy)
}
