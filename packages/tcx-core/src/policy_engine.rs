use chrono::{DateTime, SecondsFormat, Utc};

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
        let timestamp = rule
          .timestamp
          .as_deref()
          .ok_or_else(|| deny_policy(policy, "expires_at rule is missing timestamp"))?;
        let expires_at = parse_rfc3339_utc(timestamp)
          .map_err(|err| deny_policy(policy, format!("invalid expires_at timestamp: {err}")))?;

        if context.now_timestamp >= expires_at.timestamp() {
          return Err(deny_policy(
            policy,
            format!("expired at {}", normalize_timestamp(timestamp)?),
          ));
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
        timestamp: Some(normalize_timestamp(&timestamp)?),
      })
    }
    other => Err(CoreError::new(format!(
      "unsupported policy rule type `{other}`"
    ))),
  }
}

pub(crate) fn normalize_timestamp(timestamp: &str) -> CoreResult<String> {
  let parsed = parse_rfc3339_utc(timestamp)?;
  Ok(parsed.to_rfc3339_opts(SecondsFormat::Secs, true))
}

pub(crate) fn timestamp_is_expired(timestamp: &str, now_timestamp: i64) -> CoreResult<bool> {
  Ok(now_timestamp >= parse_rfc3339_utc(timestamp)?.timestamp())
}

fn parse_rfc3339_utc(timestamp: &str) -> CoreResult<DateTime<Utc>> {
  let normalized = timestamp.trim();
  require_non_empty(normalized, "timestamp")?;
  DateTime::parse_from_rfc3339(normalized)
    .map(|parsed| parsed.with_timezone(&Utc))
    .map_err(|err| CoreError::new(format!("invalid RFC3339 timestamp: {err}")))
}

fn deny_policy(policy: &PolicyInfo, reason: impl Into<String>) -> CoreError {
  CoreError::new(format!(
    "policy denied by \"{}\": {}",
    policy.name,
    reason.into()
  ))
}
