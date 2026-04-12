use serde::{Deserialize, Serialize};

use napi_derive::napi;

use super::EncPairData;

#[napi(object)]
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
/// Input used to create an API key bound to a wallet and policies.
pub struct ApiKeyCreateInput {
  /// Human-friendly key name.
  pub name: String,
  /// Wallet name, id, or unique id prefix to bind.
  pub wallet: String,
  /// Attached policy identifiers resolved during creation.
  #[napi(js_name = "policyIds")]
  pub policy_ids: Vec<String>,
}

#[napi(object)]
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
/// Public API key metadata exposed to JavaScript.
pub struct ApiKeyInfo {
  /// Stable API key identifier.
  pub id: String,
  /// Human-friendly key name.
  pub name: String,
  /// API key schema version.
  pub version: u32,
  /// Creation time in Unix seconds.
  #[napi(js_name = "createdAt")]
  pub created_at: i64,
  /// Bound wallet id.
  #[napi(js_name = "walletId")]
  pub wallet_id: String,
  /// Attached policy ids evaluated during agent-mode signing.
  #[napi(js_name = "policyIds")]
  pub policy_ids: Vec<String>,
}

#[napi(object)]
#[derive(Clone, Debug, PartialEq, Eq)]
/// Result returned when an API key is created.
pub struct CreatedApiKey {
  /// Public API key metadata.
  #[napi(js_name = "apiKey")]
  pub api_key: ApiKeyInfo,
  /// Token returned once at creation time.
  pub token: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StoredApiKey {
  #[serde(flatten)]
  pub info: ApiKeyInfo,
  pub token_hash: String,
  pub encrypted_derived_key: EncPairData,
}
