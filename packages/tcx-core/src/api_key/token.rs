use tcx_common::{FromHex, ToHex};
use tcx_crypto::aes::ctr256;

use crate::error::{require_non_empty, require_trimmed, CoreError, CoreResult};
use crate::types::StoredApiKey;

pub(crate) const API_KEY_TOKEN_PREFIX: &str = "bulu_key_";

pub(crate) fn parse_api_token(credential: &str) -> CoreResult<ParsedApiToken> {
  let payload = credential
    .strip_prefix(API_KEY_TOKEN_PREFIX)
    .ok_or_else(invalid_credential_error)?;
  let (api_key_id, secret_hex) = payload
    .split_once('_')
    .ok_or_else(invalid_credential_error)?;

  let normalized_api_key_id = require_trimmed(api_key_id.to_string(), "credential")?;
  let secret = Vec::from_hex(secret_hex.trim()).map_err(|_| invalid_credential_error())?;
  if secret.len() != 32 {
    return Err(invalid_credential_error());
  }

  Ok(ParsedApiToken {
    api_key_id: normalized_api_key_id,
    secret,
  })
}

pub(crate) fn decrypt_derived_key(
  api_key: &StoredApiKey,
  wallet_id: &str,
  secret: &[u8],
) -> CoreResult<String> {
  let encrypted_wallet_key = api_key
    .encrypted_wallet_keys
    .iter()
    .find(|encrypted_wallet_key| encrypted_wallet_key.wallet_id == wallet_id)
    .ok_or_else(invalid_credential_error)?;
  let encrypted = Vec::from_hex_auto(&encrypted_wallet_key.encrypted_derived_key.enc_str)
    .map_err(|_| invalid_credential_error())?;
  let nonce = Vec::from_hex_auto(&encrypted_wallet_key.encrypted_derived_key.nonce)
    .map_err(|_| invalid_credential_error())?;
  let decrypted = ctr256::decrypt_nopadding(&encrypted, secret, &nonce)
    .map_err(|_| invalid_credential_error())?;
  let derived_key = String::from_utf8(decrypted).map_err(|_| invalid_credential_error())?;
  require_non_empty(&derived_key, "derivedKey")?;
  let _ = Vec::from_hex_auto(&derived_key).map_err(|_| invalid_credential_error())?;
  Ok(derived_key)
}

#[inline]
pub(crate) fn hash_secret(secret: &[u8]) -> String {
  tcx_common::sha256(secret).to_hex()
}

#[inline]
pub(crate) fn invalid_credential_error() -> CoreError {
  CoreError::InvalidCredential
}

pub(crate) struct ParsedApiToken {
  pub(crate) api_key_id: String,
  pub(crate) secret: Vec<u8>,
}
