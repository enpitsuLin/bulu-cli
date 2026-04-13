use tcx_keystore::{Keystore as TcxKeystore, KeystoreGuard};

use crate::api_key::{
  decrypt_derived_key, invalid_credential_error, parse_api_token, API_KEY_TOKEN_PREFIX,
};
use crate::chain::{
  prepare_transaction, sign_message as sign_chain_message,
  sign_transaction as sign_chain_transaction, Caip2ChainId, SignedTransaction,
};
use crate::derivation::{resolve_derivation, DerivationRequest};
use crate::error::{require_non_empty, require_trimmed, CoreError, CoreResult, ResultExt};
use crate::policy_engine::{
  evaluate_policy, timestamp_is_expired, PolicyEvaluationContext, PolicyOperation,
};
use crate::types::{DerivationInput, SignedMessage};
use crate::utils::now_timestamp;
use crate::vault::VaultRepository;
use crate::wallet::{stored_keystore, with_unlocked_keystore};

pub(crate) fn sign_message(
  name: String,
  chain_id: String,
  message: String,
  credential: String,
  vault_path: String,
) -> CoreResult<SignedMessage> {
  require_non_empty(&credential, "credential")?;
  require_non_empty(&message, "message")?;

  with_signing_request(
    name,
    chain_id,
    credential,
    vault_path,
    PolicyOperation::SignMessage,
    move |unlocked_keystore, request| {
      sign_chain_message(
        unlocked_keystore,
        &request.resolved,
        &request.derivation_path,
        &message,
      )
    },
  )
}

pub(crate) fn sign_transaction(
  name: String,
  chain_id: String,
  tx_hex: String,
  credential: String,
  vault_path: String,
) -> CoreResult<SignedTransaction> {
  require_non_empty(&credential, "credential")?;
  let normalized_tx_hex = require_trimmed(tx_hex, "txHex")?;

  with_signing_request(
    name,
    chain_id,
    credential,
    vault_path,
    PolicyOperation::SignTransaction,
    move |unlocked_keystore, request| {
      let tx_data = prepare_transaction(&request.resolved, &normalized_tx_hex)?;
      sign_chain_transaction(
        unlocked_keystore,
        &request.resolved,
        &request.derivation_path,
        tx_data,
      )
    },
  )
}

fn with_signing_request<T>(
  name: String,
  chain_id: String,
  credential: String,
  vault_path: String,
  operation: PolicyOperation,
  f: impl FnOnce(&mut TcxKeystore, DerivationRequest) -> CoreResult<T>,
) -> CoreResult<T> {
  require_non_empty(&name, "name")?;

  let normalized_chain_id = Caip2ChainId::parse_input(chain_id)?.to_string();
  let vault = VaultRepository::new(vault_path)?;
  let wallet = vault.get_wallet(&name)?;
  let mut keystore = stored_keystore(&wallet)?;

  if credential.starts_with(API_KEY_TOKEN_PREFIX) {
    let token = parse_api_token(&credential)?;
    let api_key = vault
      .get_stored_api_key_by_id(&token.api_key_id)
      .map_err(|_| invalid_credential_error())?;

    if !api_key
      .info
      .wallet_ids
      .iter()
      .any(|wallet_id| wallet_id == &wallet.meta.id)
    {
      return Err(CoreError::new(format!(
        "API key \"{}\" is not authorized for wallet \"{}\"",
        api_key.info.name, wallet.meta.name
      )));
    }

    if api_key.token_hash != crate::api_key::hash_secret(&token.secret) {
      return Err(invalid_credential_error());
    }

    let policy_context = PolicyEvaluationContext {
      operation,
      chain_id: &normalized_chain_id,
      wallet_id: &wallet.meta.id,
      now_timestamp: now_timestamp(),
    };

    if let Some(expires_at) = api_key.info.expires_at.as_deref() {
      if timestamp_is_expired(expires_at, policy_context.now_timestamp)? {
        return Err(CoreError::new(format!(
          "API key \"{}\" expired at {}",
          api_key.info.name, expires_at
        )));
      }
    }

    for policy_id in &api_key.info.policy_ids {
      let policy = vault
        .get_policy_by_id(policy_id)
        .map_err(|_| CoreError::new(format!("policy denied: policy `{policy_id}` is missing")))?;
      evaluate_policy(&policy, &policy_context)?;
    }

    let derived_key = decrypt_derived_key(&api_key, &wallet.meta.id, &token.secret)?;
    return with_unlocked_keystore_by_derived_key(
      &mut keystore,
      &derived_key,
      move |unlocked_keystore| {
        let network = unlocked_keystore.store().meta.network;
        let request = resolve_derivation(
          DerivationInput {
            chain_id: normalized_chain_id,
            derivation_path: None,
            network: None,
          },
          network,
          unlocked_keystore.derivable(),
        )?;

        f(unlocked_keystore, request)
      },
    );
  }

  with_unlocked_keystore(&mut keystore, &credential, move |unlocked_keystore| {
    let network = unlocked_keystore.store().meta.network;
    let request = resolve_derivation(
      DerivationInput {
        chain_id: normalized_chain_id,
        derivation_path: None,
        network: None,
      },
      network,
      unlocked_keystore.derivable(),
    )?;

    f(unlocked_keystore, request)
  })
}

fn with_unlocked_keystore_by_derived_key<T>(
  keystore: &mut TcxKeystore,
  derived_key: &str,
  f: impl FnOnce(&mut TcxKeystore) -> CoreResult<T>,
) -> CoreResult<T> {
  let mut guard = KeystoreGuard::unlock_by_derived_key(keystore, derived_key).map_core_err()?;
  f(guard.keystore_mut())
}
