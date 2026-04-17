use crate::chain::Caip2ChainId;
use crate::error::{require_non_empty, CoreError, CoreResult};
use crate::typed_data::TypedData;
use crate::types::{PolicyInfo, PolicyRule};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[allow(clippy::enum_variant_names)]
pub(crate) enum PolicyOperation {
  SignMessage,
  SignTransaction,
  SignTypedData,
}

#[derive(Clone, Debug)]
pub(crate) struct PolicyEvaluationContext<'a> {
  pub(crate) operation: PolicyOperation,
  pub(crate) chain_id: &'a str,
  pub(crate) wallet_id: &'a str,
  pub(crate) now_timestamp: i64,
  pub(crate) typed_data: Option<&'a TypedData>,
}

pub(crate) fn validate_policy_rules(rules: Vec<PolicyRule>) -> CoreResult<Vec<PolicyRule>> {
  if rules.is_empty() {
    return Err(CoreError::new("rules must not be empty"));
  }

  rules.into_iter().map(normalize_policy_rule).collect()
}

pub(crate) fn evaluate_policy(
  policy: &PolicyInfo,
  context: &PolicyEvaluationContext<'_>,
) -> CoreResult<()> {
  let _ = context.wallet_id;

  for rule in &policy.rules {
    match rule.rule_type.as_str() {
      "allowed_chains" => {
        let chain_ids = rule
          .chain_ids
          .as_ref()
          .ok_or_else(|| deny_policy(policy, "allowed_chains rule is missing chainIds"))?;
        if !chain_ids
          .iter()
          .any(|chain_id| chain_id == context.chain_id)
        {
          return Err(deny_policy(
            policy,
            format!("chainId `{}` is not allowed", context.chain_id),
          ));
        }
      }
      "expires_at" => {
        let expires_at = rule
          .timestamp
          .ok_or_else(|| deny_policy(policy, "expires_at rule is missing timestamp"))?;

        if context.now_timestamp >= expires_at {
          return Err(deny_policy(policy, format!("expired at {expires_at}")));
        }
      }
      "allowed_primary_types" => {
        if context.operation == PolicyOperation::SignTypedData {
          let typed_data = context
            .typed_data
            .ok_or_else(|| deny_policy(policy, "typed data is missing"))?;
          let primary_types = rule.primary_types.as_ref().ok_or_else(|| {
            deny_policy(policy, "allowed_primary_types rule is missing primaryTypes")
          })?;
          if !primary_types
            .iter()
            .any(|pt| pt == &typed_data.primary_type)
          {
            return Err(deny_policy(
              policy,
              format!("primaryType `{}` is not allowed", typed_data.primary_type),
            ));
          }
        }
      }
      "allowed_verifying_contracts" => {
        if context.operation == PolicyOperation::SignTypedData {
          let typed_data = context
            .typed_data
            .ok_or_else(|| deny_policy(policy, "typed data is missing"))?;
          let verifying_contract = typed_data
            .domain
            .get("verifyingContract")
            .and_then(|v| v.as_str())
            .ok_or_else(|| deny_policy(policy, "typed data domain is missing verifyingContract"))?;
          let allowed_contracts = rule.verifying_contracts.as_ref().ok_or_else(|| {
            deny_policy(
              policy,
              "allowed_verifying_contracts rule is missing verifyingContracts",
            )
          })?;
          if !allowed_contracts
            .iter()
            .any(|addr| addr.eq_ignore_ascii_case(verifying_contract))
          {
            return Err(deny_policy(
              policy,
              format!("verifyingContract `{}` is not allowed", verifying_contract),
            ));
          }
        }
      }
      other => {
        return Err(deny_policy(
          policy,
          format!("unknown policy rule type `{other}`"),
        ));
      }
    }
  }

  Ok(())
}

pub(crate) fn normalize_policy_rule(rule: PolicyRule) -> CoreResult<PolicyRule> {
  let rule_type = rule.rule_type.trim();
  require_non_empty(rule_type, "rule.type")?;
  let rule_type = rule_type.to_string();

  match rule_type.as_str() {
    "allowed_chains" => {
      if rule.timestamp.is_some() {
        return Err(CoreError::new(
          "allowed_chains rule does not support timestamp",
        ));
      }
      if rule.primary_types.is_some() {
        return Err(CoreError::new(
          "allowed_chains rule does not support primaryTypes",
        ));
      }
      if rule.verifying_contracts.is_some() {
        return Err(CoreError::new(
          "allowed_chains rule does not support verifyingContracts",
        ));
      }

      let chain_ids = rule
        .chain_ids
        .ok_or_else(|| CoreError::new("allowed_chains rule requires chainIds"))?;
      if chain_ids.is_empty() {
        return Err(CoreError::new(
          "allowed_chains rule requires at least one chainId",
        ));
      }

      let normalized_chain_ids = chain_ids
        .into_iter()
        .map(|chain_id| {
          let normalized = chain_id.trim();
          require_non_empty(normalized, "chainIds[]")?;
          Ok(Caip2ChainId::parse_input(normalized.to_string())?.to_string())
        })
        .collect::<CoreResult<Vec<_>>>()?;

      Ok(PolicyRule {
        rule_type,
        chain_ids: Some(normalized_chain_ids),
        timestamp: None,
        primary_types: None,
        verifying_contracts: None,
      })
    }
    "expires_at" => {
      if rule.chain_ids.is_some() {
        return Err(CoreError::new("expires_at rule does not support chainIds"));
      }
      if rule.primary_types.is_some() {
        return Err(CoreError::new(
          "expires_at rule does not support primaryTypes",
        ));
      }
      if rule.verifying_contracts.is_some() {
        return Err(CoreError::new(
          "expires_at rule does not support verifyingContracts",
        ));
      }

      let timestamp = rule
        .timestamp
        .ok_or_else(|| CoreError::new("expires_at rule requires timestamp"))?;

      Ok(PolicyRule {
        rule_type,
        chain_ids: None,
        timestamp: Some(timestamp),
        primary_types: None,
        verifying_contracts: None,
      })
    }
    "allowed_primary_types" => {
      if rule.chain_ids.is_some() {
        return Err(CoreError::new(
          "allowed_primary_types rule does not support chainIds",
        ));
      }
      if rule.timestamp.is_some() {
        return Err(CoreError::new(
          "allowed_primary_types rule does not support timestamp",
        ));
      }
      if rule.verifying_contracts.is_some() {
        return Err(CoreError::new(
          "allowed_primary_types rule does not support verifyingContracts",
        ));
      }

      let primary_types = rule
        .primary_types
        .ok_or_else(|| CoreError::new("allowed_primary_types rule requires primaryTypes"))?;
      if primary_types.is_empty() {
        return Err(CoreError::new(
          "allowed_primary_types rule requires at least one primaryType",
        ));
      }

      let normalized = primary_types
        .into_iter()
        .map(|pt| {
          let trimmed = pt.trim();
          require_non_empty(trimmed, "primaryTypes[]")?;
          Ok(trimmed.to_string())
        })
        .collect::<CoreResult<Vec<_>>>()?;

      Ok(PolicyRule {
        rule_type,
        chain_ids: None,
        timestamp: None,
        primary_types: Some(normalized),
        verifying_contracts: None,
      })
    }
    "allowed_verifying_contracts" => {
      if rule.chain_ids.is_some() {
        return Err(CoreError::new(
          "allowed_verifying_contracts rule does not support chainIds",
        ));
      }
      if rule.timestamp.is_some() {
        return Err(CoreError::new(
          "allowed_verifying_contracts rule does not support timestamp",
        ));
      }
      if rule.primary_types.is_some() {
        return Err(CoreError::new(
          "allowed_verifying_contracts rule does not support primaryTypes",
        ));
      }

      let verifying_contracts = rule.verifying_contracts.ok_or_else(|| {
        CoreError::new("allowed_verifying_contracts rule requires verifyingContracts")
      })?;
      if verifying_contracts.is_empty() {
        return Err(CoreError::new(
          "allowed_verifying_contracts rule requires at least one verifyingContract",
        ));
      }

      let normalized = verifying_contracts
        .into_iter()
        .map(|addr| {
          let trimmed = addr.trim();
          require_non_empty(trimmed, "verifyingContracts[]")?;
          Ok(trimmed.to_string())
        })
        .collect::<CoreResult<Vec<_>>>()?;

      Ok(PolicyRule {
        rule_type,
        chain_ids: None,
        timestamp: None,
        primary_types: None,
        verifying_contracts: Some(normalized),
      })
    }
    other => Err(CoreError::new(format!(
      "unsupported policy rule type `{other}`"
    ))),
  }
}

pub(crate) fn timestamp_is_expired(timestamp: i64, now_timestamp: i64) -> bool {
  now_timestamp >= timestamp
}

fn deny_policy(policy: &PolicyInfo, reason: impl Into<String>) -> CoreError {
  CoreError::PolicyDenied {
    policy: policy.name.clone(),
    reason: reason.into(),
  }
}

#[cfg(test)]
mod tests {
  use serde_json::json;

  use super::*;

  fn test_policy(name: &str, rules: Vec<PolicyRule>) -> PolicyInfo {
    PolicyInfo {
      id: "test-id".to_string(),
      name: name.to_string(),
      version: 1,
      created_at: 0,
      rules,
      action: "deny".to_string(),
    }
  }

  fn eth_chain_id() -> &'static str {
    "eip155:1"
  }

  fn make_typed_data(primary_type: &str, verifying_contract: Option<&str>) -> TypedData {
    let domain = if let Some(addr) = verifying_contract {
      json!({"name": "Test", "version": "1", "chainId": 1, "verifyingContract": addr})
    } else {
      json!({})
    };
    serde_json::from_value(json!({
      "types": {
        "EIP712Domain": [
          {"name": "name", "type": "string"},
          {"name": "version", "type": "string"},
          {"name": "chainId", "type": "uint256"},
          {"name": "verifyingContract", "type": "address"}
        ],
        "Permit": [{"name": "holder", "type": "address"}],
        "Message": [{"name": "content", "type": "string"}]
      },
      "primaryType": primary_type,
      "domain": domain,
      "message": {"holder": "0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826"}
    }))
    .unwrap()
  }

  fn ctx(
    operation: PolicyOperation,
    typed_data: Option<&TypedData>,
  ) -> PolicyEvaluationContext<'_> {
    PolicyEvaluationContext {
      operation,
      chain_id: eth_chain_id(),
      wallet_id: "wallet-1",
      now_timestamp: 1000,
      typed_data,
    }
  }

  #[test]
  fn evaluate_allows_matching_primary_type() {
    let typed_data = make_typed_data("Permit", None);
    let policy = test_policy(
      "Permit only",
      vec![normalize_policy_rule(PolicyRule {
        rule_type: "allowed_primary_types".to_string(),
        chain_ids: None,
        timestamp: None,
        primary_types: Some(vec!["Permit".to_string(), "Mail".to_string()]),
        verifying_contracts: None,
      })
      .unwrap()],
    );
    assert!(evaluate_policy(
      &policy,
      &ctx(PolicyOperation::SignTypedData, Some(&typed_data))
    )
    .is_ok());
  }

  #[test]
  fn evaluate_denies_non_matching_primary_type() {
    let typed_data = make_typed_data("Transfer", None);
    let policy = test_policy(
      "Permit only",
      vec![normalize_policy_rule(PolicyRule {
        rule_type: "allowed_primary_types".to_string(),
        chain_ids: None,
        timestamp: None,
        primary_types: Some(vec!["Permit".to_string()]),
        verifying_contracts: None,
      })
      .unwrap()],
    );
    let err = evaluate_policy(
      &policy,
      &ctx(PolicyOperation::SignTypedData, Some(&typed_data)),
    )
    .expect_err("should deny non-matching primaryType");
    assert!(err
      .to_string()
      .contains("primaryType `Transfer` is not allowed"));
  }

  #[test]
  fn evaluate_ignores_primary_type_rule_for_sign_message() {
    let policy = test_policy(
      "Permit only",
      vec![normalize_policy_rule(PolicyRule {
        rule_type: "allowed_primary_types".to_string(),
        chain_ids: None,
        timestamp: None,
        primary_types: Some(vec!["Permit".to_string()]),
        verifying_contracts: None,
      })
      .unwrap()],
    );
    assert!(evaluate_policy(&policy, &ctx(PolicyOperation::SignMessage, None)).is_ok());
  }

  #[test]
  fn evaluate_allows_matching_verifying_contract() {
    let typed_data = make_typed_data("Permit", Some("0xA0b86a33E6Cb19d3C91d8C8c3D0f1E62b68DEf98"));
    let policy = test_policy(
      "USDC only",
      vec![normalize_policy_rule(PolicyRule {
        rule_type: "allowed_verifying_contracts".to_string(),
        chain_ids: None,
        timestamp: None,
        primary_types: None,
        verifying_contracts: Some(vec![
          "0xA0b86a33E6Cb19d3C91d8C8c3D0f1E62b68DEf98".to_string()
        ]),
      })
      .unwrap()],
    );
    assert!(evaluate_policy(
      &policy,
      &ctx(PolicyOperation::SignTypedData, Some(&typed_data))
    )
    .is_ok());
  }

  #[test]
  fn evaluate_denies_non_matching_verifying_contract() {
    let typed_data = make_typed_data("Permit", Some("0xBad0000000000000000000000000000000000000"));
    let policy = test_policy(
      "USDC only",
      vec![normalize_policy_rule(PolicyRule {
        rule_type: "allowed_verifying_contracts".to_string(),
        chain_ids: None,
        timestamp: None,
        primary_types: None,
        verifying_contracts: Some(vec![
          "0xA0b86a33E6Cb19d3C91d8C8c3D0f1E62b68DEf98".to_string()
        ]),
      })
      .unwrap()],
    );
    let err = evaluate_policy(
      &policy,
      &ctx(PolicyOperation::SignTypedData, Some(&typed_data)),
    )
    .expect_err("should deny non-matching verifyingContract");
    assert!(err
      .to_string()
      .contains("verifyingContract `0xBad0000000000000000000000000000000000000` is not allowed"));
  }

  #[test]
  fn evaluate_ignores_verifying_contract_rule_for_sign_message() {
    let policy = test_policy(
      "USDC only",
      vec![normalize_policy_rule(PolicyRule {
        rule_type: "allowed_verifying_contracts".to_string(),
        chain_ids: None,
        timestamp: None,
        primary_types: None,
        verifying_contracts: Some(vec![
          "0xA0b86a33E6Cb19d3C91d8C8c3D0f1E62b68DEf98".to_string()
        ]),
      })
      .unwrap()],
    );
    assert!(evaluate_policy(&policy, &ctx(PolicyOperation::SignMessage, None)).is_ok());
  }

  #[test]
  fn evaluate_combined_rules_require_both_to_match() {
    let typed_data = make_typed_data("Permit", Some("0xA0b86a33E6Cb19d3C91d8C8c3D0f1E62b68DEf98"));
    let policy = test_policy(
      "USDC Permit only",
      vec![
        normalize_policy_rule(PolicyRule {
          rule_type: "allowed_primary_types".to_string(),
          chain_ids: None,
          timestamp: None,
          primary_types: Some(vec!["Permit".to_string()]),
          verifying_contracts: None,
        })
        .unwrap(),
        normalize_policy_rule(PolicyRule {
          rule_type: "allowed_verifying_contracts".to_string(),
          chain_ids: None,
          timestamp: None,
          primary_types: None,
          verifying_contracts: Some(vec![
            "0xA0b86a33E6Cb19d3C91d8C8c3D0f1E62b68DEf98".to_string()
          ]),
        })
        .unwrap(),
      ],
    );
    assert!(evaluate_policy(
      &policy,
      &ctx(PolicyOperation::SignTypedData, Some(&typed_data))
    )
    .is_ok());

    let wrong_type = make_typed_data("Mail", Some("0xA0b86a33E6Cb19d3C91d8C8c3D0f1E62b68DEf98"));
    let err = evaluate_policy(
      &policy,
      &ctx(PolicyOperation::SignTypedData, Some(&wrong_type)),
    )
    .expect_err("should deny non-matching primaryType");
    assert!(err
      .to_string()
      .contains("primaryType `Mail` is not allowed"));

    let wrong_contract =
      make_typed_data("Permit", Some("0xBad0000000000000000000000000000000000000"));
    let err = evaluate_policy(
      &policy,
      &ctx(PolicyOperation::SignTypedData, Some(&wrong_contract)),
    )
    .expect_err("should deny non-matching verifyingContract");
    assert!(err
      .to_string()
      .contains("verifyingContract `0xBad0000000000000000000000000000000000000` is not allowed"));
  }
}
