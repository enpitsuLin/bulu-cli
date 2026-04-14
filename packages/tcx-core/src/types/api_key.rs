use serde::{Deserialize, Serialize};

use napi_derive::napi;

use super::EncPairData;

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
  /// Bound wallet ids.
  #[napi(js_name = "walletIds")]
  pub wallet_ids: Vec<String>,
  /// Attached policy ids evaluated during agent-mode signing.
  #[napi(js_name = "policyIds")]
  pub policy_ids: Vec<String>,
  /// Optional expiry time in Unix seconds for the key itself.
  #[napi(js_name = "expiresAt")]
  #[serde(skip_serializing_if = "Option::is_none")]
  pub expires_at: Option<i64>,
}

#[napi(object)]
#[derive(Clone, Debug, PartialEq, Eq)]
/// Result returned when an API key is created.
pub struct CreatedApiKey {
  /// Key file id for marking the API key file.
  pub id: String,
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
  pub encrypted_wallet_keys: Vec<StoredEncryptedWalletKey>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StoredEncryptedWalletKey {
  pub wallet_id: String,
  pub encrypted_derived_key: EncPairData,
}
