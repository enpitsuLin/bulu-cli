use crate::chain::Caip2ChainId;
use crate::error::{require_non_empty, CoreError, CoreResult};
use crate::types::{PolicyInfo, PolicyRule};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum PolicyOperation {
  SignMessage,
  SignTransaction,
}

#[derive(Clone, Debug)]
pub(crate) struct PolicyEvaluationContext<'a> {
  pub(crate) operation: PolicyOperation,
  pub(crate) chain_id: &'a str,
  pub(crate) wallet_id: &'a str,
  pub(crate) now_timestamp: i64,
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
  let _ = context.operation;
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
      })
    }
    "expires_at" => {
      if rule.chain_ids.is_some() {
        return Err(CoreError::new("expires_at rule does not support chainIds"));
      }

      let timestamp = rule
        .timestamp
        .ok_or_else(|| CoreError::new("expires_at rule requires timestamp"))?;

      Ok(PolicyRule {
        rule_type,
        chain_ids: None,
        timestamp: Some(timestamp),
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
