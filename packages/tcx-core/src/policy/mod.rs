pub(crate) mod engine;

use crate::error::{require_trimmed, CoreError, CoreResult};
use crate::policy::engine::validate_policy_rules;
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

  if vault.is_policy_referenced(&policy.id)? {
    return Err(CoreError::StillReferenced {
      resource: "Policy",
      identifier: policy.name,
      reference: "API key",
    });
  }

  vault.delete_policy(&policy.id)
}

pub(crate) fn create_policy(
  input: PolicyCreateInput,
  vault_path: String,
) -> CoreResult<PolicyInfo> {
  let normalized_name = require_trimmed(&input.name, "name")?;
  let normalized_rules = validate_policy_rules(input.rules)?;

  let vault = VaultRepository::new(vault_path)?;
  if vault.policy_name_exists(&normalized_name)? {
    return Err(CoreError::AlreadyExists {
      resource: "Policy",
      name: normalized_name,
    });
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
  use std::fs;
  use std::path::{Path, PathBuf};

  use serde_json::Value;
  use tcx_keystore::keystore::IdentityNetwork;

  use super::{create_policy, delete_policy, get_policy, list_policies};
  use crate::chain::{ethereum::ETHEREUM_SIGNER, ChainSigner};
  use crate::test_utils::fixtures;
  use crate::types::{PolicyCreateInput, PolicyRule};

  fn read_vault_json(path: &Path) -> Value {
    let persisted = fs::read_to_string(path).expect("vault JSON should be readable");
    serde_json::from_str(&persisted).expect("vault JSON should parse")
  }

  fn policy_vault_path(vault_dir: &Path, policy_id: &str) -> PathBuf {
    vault_dir.join("policies").join(format!("{policy_id}.json"))
  }

  fn default_eth_mainnet_chain_id() -> &'static str {
    ETHEREUM_SIGNER.default_chain_id(IdentityNetwork::Mainnet)
  }

  fn allowed_chain_rule(chain_id: &str) -> PolicyRule {
    PolicyRule {
      rule_type: "allowed_chains".to_string(),
      chain_ids: Some(vec![chain_id.to_string()]),
      timestamp: None,
      primary_types: None,
      verifying_contracts: None,
    }
  }

  fn allowed_primary_types_rule(primary_types: &[&str]) -> PolicyRule {
    PolicyRule {
      rule_type: "allowed_primary_types".to_string(),
      chain_ids: None,
      timestamp: None,
      primary_types: Some(primary_types.iter().map(|s| s.to_string()).collect()),
      verifying_contracts: None,
    }
  }

  fn allowed_verifying_contracts_rule(contracts: &[&str]) -> PolicyRule {
    PolicyRule {
      rule_type: "allowed_verifying_contracts".to_string(),
      chain_ids: None,
      timestamp: None,
      primary_types: None,
      verifying_contracts: Some(contracts.iter().map(|s| s.to_string()).collect()),
    }
  }

  #[test]
  fn policy_crud_round_trips_and_rejects_duplicate_names() {
    let (vault_dir, vault_path) = fixtures::temp_vault("policy-crud");

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
    assert_eq!(err.to_string(), "Policy `Base only` already exists");

    delete_policy(policy.id.clone(), vault_path.clone()).expect("policy delete should succeed");
    assert!(
      !policy_vault_path(&vault_dir, &policy.id).exists(),
      "policy file should be removed"
    );

    let _ = fs::remove_dir_all(vault_dir);
  }

  #[test]
  fn policy_allows_matching_primary_type() {
    let (_, vault_path) = fixtures::temp_vault("policy-primary-type-allow");

    let policy = create_policy(
      PolicyCreateInput {
        name: "Permit only".to_string(),
        rules: vec![allowed_primary_types_rule(&["Permit"])],
      },
      vault_path.clone(),
    )
    .expect("policy creation should succeed");

    let loaded = get_policy(policy.id, vault_path.clone()).expect("policy should load");
    assert_eq!(
      loaded.rules[0].primary_types,
      Some(vec!["Permit".to_string()])
    );

    let _ = fs::remove_dir_all(vault_path);
  }

  #[test]
  fn policy_allows_matching_verifying_contract() {
    let (_, vault_path) = fixtures::temp_vault("policy-verifying-contract-allow");

    let policy = create_policy(
      PolicyCreateInput {
        name: "USDC only".to_string(),
        rules: vec![allowed_verifying_contracts_rule(&[
          "0xA0b86a33E6Cb19d3C91d8C8c3D0f1E62b68DEf98",
        ])],
      },
      vault_path.clone(),
    )
    .expect("policy creation should succeed");

    let loaded = get_policy(policy.id, vault_path.clone()).expect("policy should load");
    assert_eq!(
      loaded.rules[0].verifying_contracts,
      Some(vec![
        "0xA0b86a33E6Cb19d3C91d8C8c3D0f1E62b68DEf98".to_string()
      ])
    );

    let _ = fs::remove_dir_all(vault_path);
  }
}
