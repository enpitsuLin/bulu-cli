use napi_derive::napi;
use serde::{Deserialize, Serialize};

#[napi(object)]
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
/// Declarative policy rule used during agent-mode signing.
pub struct PolicyRule {
  /// Rule type. Supported values are `allowed_chains` and `expires_at`.
  #[napi(js_name = "type")]
  #[serde(rename = "type")]
  pub rule_type: String,
  /// Allowed CAIP-2 chain ids for `allowed_chains`.
  #[napi(js_name = "chainIds")]
  #[serde(skip_serializing_if = "Option::is_none")]
  pub chain_ids: Option<Vec<String>>,
  /// RFC 3339 UTC timestamp for `expires_at`.
  #[serde(skip_serializing_if = "Option::is_none")]
  pub timestamp: Option<String>,
}

#[napi(object)]
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
/// Input used to create a policy definition.
pub struct PolicyCreateInput {
  /// Human-friendly policy name.
  pub name: String,
  /// Declarative rules that must all pass during agent-mode signing.
  pub rules: Vec<PolicyRule>,
}

#[napi(object)]
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
/// Persisted declarative policy definition.
pub struct PolicyInfo {
  /// Stable policy identifier.
  pub id: String,
  /// Human-friendly policy name.
  pub name: String,
  /// Policy record schema version.
  pub version: u32,
  /// Creation time in Unix seconds.
  #[napi(js_name = "createdAt")]
  pub created_at: i64,
  /// Policy action. v1 always uses `DENY`.
  pub action: String,
  /// Declarative rules evaluated for this policy.
  pub rules: Vec<PolicyRule>,
}
