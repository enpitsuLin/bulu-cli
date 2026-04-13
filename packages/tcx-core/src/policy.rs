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

#[cfg(test)]
mod tests {
  use std::env;
  use std::fs;
  use std::path::{Path, PathBuf};
  use std::time::{SystemTime, UNIX_EPOCH};

  use serde_json::Value;
  use tcx_keystore::keystore::IdentityNetwork;

  use super::{create_policy, delete_policy, get_policy, list_policies};
  use crate::chain::Chain;
  use crate::types::{PolicyCreateInput, PolicyRule};

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

  fn read_vault_json(path: &Path) -> Value {
    let persisted = fs::read_to_string(path).expect("vault JSON should be readable");
    serde_json::from_str(&persisted).expect("vault JSON should parse")
  }

  fn policy_vault_path(vault_dir: &Path, policy_id: &str) -> PathBuf {
    vault_dir.join("policies").join(format!("{policy_id}.json"))
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
  fn policy_crud_round_trips_and_rejects_duplicate_names() {
    let (vault_dir, vault_path) = temp_vault("policy-crud");

    let policy = create_policy(
      PolicyCreateInput {
        name: "Base only".to_string(),
        rules: vec![allowed_chain_rule(default_eth_mainnet_chain_id())],
      },
      vault_path.clone(),
    )
    .expect("policy creation should succeed");

    let persisted = read_vault_json(&policy_vault_path(&vault_dir, &policy.id));
    assert_eq!(persisted["name"], "Base only");
    assert_eq!(persisted["action"], "deny");
    assert!(persisted["createdAt"].is_i64());

    let loaded = get_policy(policy.id.clone(), vault_path.clone()).expect("policy should load");
    assert_eq!(loaded, policy);

    let listed = list_policies(vault_path.clone()).expect("policies should list");
    assert_eq!(listed, vec![policy.clone()]);

    let err = create_policy(
      PolicyCreateInput {
        name: "Base only".to_string(),
        rules: vec![allowed_chain_rule(default_eth_mainnet_chain_id())],
      },
      vault_path.clone(),
    )
    .expect_err("duplicate policy name should fail");
    assert_eq!(err.to_string(), "Policy \"Base only\" already exists");

    delete_policy(policy.id.clone(), vault_path.clone()).expect("policy delete should succeed");
    assert!(
      !policy_vault_path(&vault_dir, &policy.id).exists(),
      "policy file should be removed"
    );

    let _ = fs::remove_dir_all(vault_dir);
  }
}
