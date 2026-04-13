use crate::chain::{
  prepare_transaction, sign_message as sign_chain_message,
  sign_transaction as sign_chain_transaction, Caip2ChainId, SignedTransaction,
};
use crate::derivation::{derive_accounts_for_wallet, resolve_derivation};
use crate::error::{require_non_empty, require_trimmed, CoreError, CoreResult, ResultExt};
use crate::policy_engine::{
  evaluate_policy, normalize_timestamp, timestamp_is_expired, validate_policy_rules,
  PolicyEvaluationContext, PolicyOperation,
};
use crate::strings::sanitize_optional_text;
use crate::types::{
  ApiKeyInfo, CreatedApiKey, DerivationInput, EncPairData, PolicyCreateInput, PolicyInfo,
  SignedMessage, StoredApiKey, StoredEncryptedWalletKey, WalletInfo,
};
use crate::vault::VaultRepository;
use std::time::{SystemTime, UNIX_EPOCH};
use tcx_common::{FromHex, ToHex};
use tcx_crypto::aes::ctr256;
use tcx_keystore::keystore::IdentityNetwork;
use tcx_keystore::{Keystore as TcxKeystore, KeystoreGuard, Metadata, Source};

const API_KEY_TOKEN_PREFIX: &str = "bulu_key_";

pub(crate) fn list_wallets(vault_path: String) -> CoreResult<Vec<WalletInfo>> {
  VaultRepository::new(vault_path)?.list_wallets()
}

pub(crate) fn get_wallet(name_or_id: String, vault_path: String) -> CoreResult<WalletInfo> {
  VaultRepository::new(vault_path)?.get_wallet(&name_or_id)
}

pub(crate) fn delete_wallet(name_or_id: String, vault_path: String) -> CoreResult<()> {
  let vault = VaultRepository::new(vault_path)?;
  let wallet = vault.get_wallet(&name_or_id)?;

  if vault.list_stored_api_keys()?.iter().any(|api_key| {
    api_key
      .info
      .wallet_ids
      .iter()
      .any(|wallet_id| wallet_id == &wallet.meta.id)
  }) {
    return Err(CoreError::new(format!(
      "Wallet \"{}\" is still referenced by an API key",
      wallet.meta.name
    )));
  }

  vault.delete_wallet(&wallet.meta.id)
}

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

pub(crate) fn list_api_keys(vault_path: String) -> CoreResult<Vec<ApiKeyInfo>> {
  VaultRepository::new(vault_path)?.list_api_keys()
}

pub(crate) fn get_api_key(name_or_id: String, vault_path: String) -> CoreResult<ApiKeyInfo> {
  VaultRepository::new(vault_path)?.get_api_key(&name_or_id)
}

pub(crate) fn revoke_api_key(name_or_id: String, vault_path: String) -> CoreResult<()> {
  VaultRepository::new(vault_path)?.revoke_api_key(&name_or_id)
}

pub(crate) fn create_api_key(
  name: String,
  wallet_ids: Vec<String>,
  policy_ids: Vec<String>,
  passphrase: String,
  expires_at: Option<String>,
  vault_path_opt: Option<String>,
) -> CoreResult<CreatedApiKey> {
  require_non_empty(&passphrase, "passphrase")?;

  let normalized_name = require_trimmed(name, "name")?;
  let vault_path = resolve_optional_vault_path(vault_path_opt);
  let vault = VaultRepository::new(vault_path)?;
  if vault.api_key_name_exists(&normalized_name)? {
    return Err(CoreError::new(format!(
      r#"API key "{}" already exists"#,
      normalized_name
    )));
  }

  let resolved_wallets = resolve_wallets(&vault, wallet_ids)?;
  let wallet_ids = resolved_wallets
    .iter()
    .map(|wallet| wallet.meta.id.clone())
    .collect::<Vec<_>>();
  let policy_ids = resolve_policy_ids(&vault, policy_ids)?;
  let normalized_expires_at = match expires_at {
    Some(timestamp) => Some(normalize_timestamp(&timestamp)?),
    None => None,
  };

  let secret = tcx_common::random_u8_32();
  let nonce = tcx_common::random_u8_16();
  let encrypted_wallet_keys = resolved_wallets
    .iter()
    .map(|wallet| {
      let mut keystore = stored_keystore(wallet)?;
      let derived_key = keystore.get_derived_key(&passphrase).map_core_err()?;
      let encrypted_derived_key =
        ctr256::encrypt_nopadding(derived_key.as_bytes(), &secret, &nonce).map_core_err()?;

      Ok(StoredEncryptedWalletKey {
        wallet_id: wallet.meta.id.clone(),
        encrypted_derived_key: EncPairData {
          enc_str: encrypted_derived_key.to_hex(),
          nonce: nonce.to_hex(),
        },
      })
    })
    .collect::<CoreResult<Vec<_>>>()?;

  let api_key = StoredApiKey {
    info: ApiKeyInfo {
      id: new_record_id(),
      name: normalized_name,
      version: 1,
      created_at: now_timestamp(),
      wallet_ids,
      policy_ids,
      expires_at: normalized_expires_at,
    },
    token_hash: hash_secret(&secret),
    encrypted_wallet_keys,
  };
  vault.save_api_key(&api_key)?;

  let secret_hex = secret.to_hex();
  Ok(CreatedApiKey {
    id: api_key.info.id.clone(),
    api_key: api_key.info.clone(),
    token: format!("{API_KEY_TOKEN_PREFIX}{}_{}", api_key.info.id, secret_hex),
  })
}

pub(crate) fn create_wallet(
  name: String,
  passphrase: String,
  vault_path: String,
  index: Option<u32>,
) -> CoreResult<WalletInfo> {
  require_non_empty(&passphrase, "passphrase")?;

  let vault = VaultRepository::new(vault_path)?;
  if vault.wallet_name_exists(&name)? {
    return Err(CoreError::new(format!(
      r#"Wallet "{}" already exists"#,
      name
    )));
  }

  let mnemonic = create_mnemonic(None)?;
  let metadata = build_metadata(
    Some(name),
    None,
    IdentityNetwork::Mainnet,
    Source::NewMnemonic,
    "New Wallet",
  );
  let keystore = TcxKeystore::from_mnemonic(&mnemonic, &passphrase, metadata).map_core_err()?;
  let wallet_info = build_wallet_info(keystore, &passphrase, None, index)?;
  vault.save_wallet(&wallet_info)?;
  Ok(wallet_info)
}

pub(crate) fn import_wallet_mnemonic(
  name: String,
  mnemonic: String,
  passphrase: String,
  vault_path: String,
  index: Option<u32>,
) -> CoreResult<WalletInfo> {
  require_non_empty(&passphrase, "passphrase")?;

  let normalized_mnemonic = normalize_mnemonic(&mnemonic);
  require_non_empty(&normalized_mnemonic, "mnemonic")?;

  let vault = VaultRepository::new(vault_path)?;
  if vault.wallet_name_exists(&name)? {
    return Err(CoreError::new(format!(
      r#"Wallet "{}" already exists"#,
      name
    )));
  }

  let metadata = build_metadata(
    Some(name),
    None,
    IdentityNetwork::Mainnet,
    Source::Mnemonic,
    "Imported Mnemonic Wallet",
  );
  let keystore =
    TcxKeystore::from_mnemonic(&normalized_mnemonic, &passphrase, metadata).map_core_err()?;
  let wallet_info = build_wallet_info(keystore, &passphrase, None, index)?;
  vault.save_wallet(&wallet_info)?;
  Ok(wallet_info)
}

pub(crate) fn import_wallet_private_key(
  name: String,
  private_key: String,
  passphrase: String,
  vault_path: String,
  _index: Option<u32>,
) -> CoreResult<WalletInfo> {
  require_non_empty(&passphrase, "passphrase")?;

  let normalized_private_key = require_trimmed(private_key, "privateKey")?;
  let vault = VaultRepository::new(vault_path)?;
  if vault.wallet_name_exists(&name)? {
    return Err(CoreError::new(format!(
      r#"Wallet "{}" already exists"#,
      name
    )));
  }

  let metadata = build_metadata(
    Some(name),
    None,
    IdentityNetwork::Mainnet,
    Source::Private,
    "Imported Private Key",
  );
  let keystore = TcxKeystore::from_private_key(
    &normalized_private_key,
    &passphrase,
    tcx_constants::CurveType::SECP256k1,
    metadata,
    None,
  )
  .map_core_err()?;
  let wallet_info = build_wallet_info(keystore, &passphrase, None, None)?;
  vault.save_wallet(&wallet_info)?;
  Ok(wallet_info)
}

pub(crate) fn load_wallet(
  keystore_json: String,
  password: String,
  derivations: Option<Vec<DerivationInput>>,
) -> CoreResult<WalletInfo> {
  require_non_empty(&password, "password")?;
  let keystore = load_tcx_keystore(keystore_json)?;
  build_wallet_info(keystore, &password, derivations, None)
}

pub(crate) fn import_wallet_keystore(
  name: String,
  keystore_json: String,
  password: String,
  vault_path: String,
  derivations: Option<Vec<DerivationInput>>,
) -> CoreResult<WalletInfo> {
  require_non_empty(&password, "password")?;

  let normalized_name = require_trimmed(name, "name")?;
  let vault = VaultRepository::new(vault_path)?;
  if vault.wallet_name_exists(&normalized_name)? {
    return Err(CoreError::new(format!(
      r#"Wallet "{}" already exists"#,
      normalized_name
    )));
  }

  let mut keystore = load_tcx_keystore(keystore_json)?;
  keystore.store_mut().meta.name = normalized_name;

  let wallet_info = build_wallet_info(keystore, &password, derivations, None)?;
  vault.save_wallet(&wallet_info)?;
  Ok(wallet_info)
}

pub(crate) fn derive_accounts(
  keystore_json: String,
  password: String,
  derivations: Option<Vec<DerivationInput>>,
) -> CoreResult<Vec<crate::types::WalletAccount>> {
  require_non_empty(&password, "password")?;

  let mut keystore = load_tcx_keystore(keystore_json)?;
  let network = keystore.store().meta.network;

  with_unlocked_keystore(&mut keystore, &password, move |wallet| {
    derive_accounts_for_wallet(wallet, network, derivations, None)
  })
}

pub(crate) fn export_wallet(
  name_or_id: String,
  password: String,
  vault_path: String,
) -> CoreResult<String> {
  require_non_empty(&password, "password")?;

  let wallet = VaultRepository::new(vault_path)?.get_wallet(&name_or_id)?;
  let mut keystore = stored_keystore(&wallet)?;

  with_unlocked_keystore(&mut keystore, &password, move |unlocked_keystore| {
    unlocked_keystore.export().map_core_err()
  })
}

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

fn build_wallet_info(
  mut keystore: TcxKeystore,
  password: &str,
  derivations: Option<Vec<DerivationInput>>,
  index: Option<u32>,
) -> CoreResult<WalletInfo> {
  let network = keystore.store().meta.network;

  with_unlocked_keystore(&mut keystore, password, move |unlocked_keystore| {
    let accounts = derive_accounts_for_wallet(unlocked_keystore, network, derivations, index)?;
    WalletInfo::try_from_keystore(unlocked_keystore, accounts)
  })
}

fn with_unlocked_keystore<T>(
  keystore: &mut TcxKeystore,
  password: &str,
  f: impl FnOnce(&mut TcxKeystore) -> CoreResult<T>,
) -> CoreResult<T> {
  let mut guard = KeystoreGuard::unlock_by_password(keystore, password).map_core_err()?;
  f(guard.keystore_mut())
}

fn with_unlocked_keystore_by_derived_key<T>(
  keystore: &mut TcxKeystore,
  derived_key: &str,
  f: impl FnOnce(&mut TcxKeystore) -> CoreResult<T>,
) -> CoreResult<T> {
  let mut guard = KeystoreGuard::unlock_by_derived_key(keystore, derived_key).map_core_err()?;
  f(guard.keystore_mut())
}

fn with_signing_request<T>(
  name: String,
  chain_id: String,
  credential: String,
  vault_path: String,
  operation: PolicyOperation,
  f: impl FnOnce(&mut TcxKeystore, crate::derivation::DerivationRequest) -> CoreResult<T>,
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

    if api_key.token_hash != hash_secret(&token.secret) {
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

fn load_tcx_keystore(keystore_json: String) -> CoreResult<TcxKeystore> {
  let normalized_keystore_json = require_trimmed(keystore_json, "keystoreJson")?;
  TcxKeystore::from_json(&normalized_keystore_json).map_core_err()
}

fn stored_keystore(wallet: &WalletInfo) -> CoreResult<TcxKeystore> {
  TcxKeystore::from_json(&wallet.keystore.to_json_string()?).map_core_err()
}

fn resolve_policy_ids(vault: &VaultRepository, policy_ids: Vec<String>) -> CoreResult<Vec<String>> {
  let mut resolved = Vec::new();

  for policy_id in policy_ids {
    let policy = vault.get_policy(&policy_id)?;
    if !resolved.iter().any(|existing| existing == &policy.id) {
      resolved.push(policy.id);
    }
  }

  Ok(resolved)
}

fn resolve_wallets(
  vault: &VaultRepository,
  wallet_ids: Vec<String>,
) -> CoreResult<Vec<WalletInfo>> {
  if wallet_ids.is_empty() {
    return Err(CoreError::new("walletIds must not be empty"));
  }

  let mut resolved = Vec::new();
  for wallet_id in wallet_ids {
    let wallet = vault.get_wallet(&wallet_id)?;
    if !resolved
      .iter()
      .any(|existing: &WalletInfo| existing.meta.id == wallet.meta.id)
    {
      resolved.push(wallet);
    }
  }

  Ok(resolved)
}

fn resolve_optional_vault_path(vault_path_opt: Option<String>) -> String {
  sanitize_optional_text(vault_path_opt).unwrap_or_else(|| ".bulu".to_string())
}

fn parse_api_token(credential: &str) -> CoreResult<ParsedApiToken> {
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

fn decrypt_derived_key(
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

fn hash_secret(secret: &[u8]) -> String {
  tcx_common::sha256(secret).to_hex()
}

fn invalid_credential_error() -> CoreError {
  CoreError::new("credential is invalid")
}

fn now_timestamp() -> i64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .expect("system clock should be after Unix epoch")
    .as_secs() as i64
}

fn new_record_id() -> String {
  tcx_common::random_u8_16().to_hex()
}

fn normalize_mnemonic(mnemonic: &str) -> String {
  mnemonic.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn create_mnemonic(entropy: Option<String>) -> CoreResult<String> {
  match entropy {
    Some(entropy_hex) => {
      let entropy = Vec::from_hex_auto(entropy_hex.trim()).map_core_err()?;
      tcx_primitive::mnemonic_from_entropy(&entropy).map_core_err()
    }
    None => tcx_primitive::mnemonic_from_entropy(&tcx_common::random_u8_16()).map_core_err(),
  }
}

fn build_metadata(
  name: Option<String>,
  password_hint: Option<String>,
  network: IdentityNetwork,
  source: Source,
  default_name: &str,
) -> Metadata {
  Metadata {
    name: sanitize_optional_text(name).unwrap_or_else(|| default_name.to_string()),
    password_hint: sanitize_optional_text(password_hint),
    source,
    network,
    ..Metadata::default()
  }
}

struct ParsedApiToken {
  api_key_id: String,
  secret: Vec<u8>,
}
