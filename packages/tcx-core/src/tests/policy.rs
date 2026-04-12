use std::fs;

use super::*;

fn allowed_chain_rule(chain_id: &str) -> PolicyRule {
  PolicyRule {
    rule_type: "allowed_chains".to_string(),
    chain_ids: Some(vec![chain_id.to_string()]),
    timestamp: None,
  }
}

fn expires_at_rule(timestamp: &str) -> PolicyRule {
  PolicyRule {
    rule_type: "expires_at".to_string(),
    chain_ids: None,
    timestamp: Some(timestamp.to_string()),
  }
}

#[test]
fn policy_crud_round_trips_and_rejects_duplicate_names() {
  let (vault_dir, vault_path) = temp_vault("policy-crud");

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
  assert_eq!(persisted["action"], "DENY");

  let loaded = get_policy(policy.id.clone(), vault_path.clone()).expect("policy should load");
  assert_eq!(loaded, policy);

  let listed = list_policy(vault_path.clone()).expect("policies should list");
  assert_eq!(listed, vec![policy.clone()]);

  let err = create_policy(
    PolicyCreateInput {
      name: "Base only".to_string(),
      rules: vec![allowed_chain_rule(default_eth_mainnet_chain_id())],
    },
    vault_path.clone(),
  )
  .expect_err("duplicate policy name should fail");
  assert_eq!(err.reason, "Policy \"Base only\" already exists");

  delete_policy(policy.id.clone(), vault_path.clone()).expect("policy delete should succeed");
  assert!(
    !policy_vault_path(&vault_dir, &policy.id).exists(),
    "policy file should be removed"
  );

  let _ = fs::remove_dir_all(vault_dir);
}

#[test]
fn create_api_key_persists_without_storing_plaintext_token() {
  let (vault_dir, vault_path) = temp_vault("api-key-create");
  let wallet = import_wallet_mnemonic(
    "API wallet".to_string(),
    TEST_MNEMONIC.to_string(),
    TEST_PASSWORD.to_string(),
    vault_path.clone(),
    None,
  )
  .expect("wallet import should succeed");
  let policy = create_policy(
    PolicyCreateInput {
      name: "ETH only".to_string(),
      rules: vec![allowed_chain_rule(default_eth_mainnet_chain_id())],
    },
    vault_path.clone(),
  )
  .expect("policy creation should succeed");

  let created = create_api_key(
    ApiKeyCreateInput {
      name: "Claude".to_string(),
      wallet: wallet.meta.id.clone(),
      policy_ids: vec![policy.id.clone()],
    },
    TEST_PASSWORD.to_string(),
    vault_path.clone(),
  )
  .expect("API key creation should succeed");

  assert!(created
    .token
    .starts_with(&format!("bulu_key_{}_", created.api_key.id)));

  let listed = list_api_key(vault_path.clone()).expect("API keys should list");
  assert_eq!(listed, vec![created.api_key.clone()]);

  let loaded =
    get_api_key(created.api_key.id.clone(), vault_path.clone()).expect("API key should load");
  assert_eq!(loaded, created.api_key);

  let persisted = read_vault_text(&api_key_vault_path(&vault_dir, &created.api_key.id));
  assert!(persisted.contains("\"tokenHash\""));
  assert!(!persisted.contains(&created.token));

  let _ = fs::remove_dir_all(vault_dir);
}

#[test]
fn sign_transaction_accepts_api_key_and_revoke_immediately_invalidates_it() {
  let (vault_dir, vault_path) = temp_vault("api-key-sign-transaction");
  let wallet = import_wallet_private_key(
    "Signer".to_string(),
    TEST_PRIVATE_KEY.to_string(),
    TEST_PASSWORD.to_string(),
    vault_path.clone(),
    None,
  )
  .expect("private key import should succeed");
  let policy = create_policy(
    PolicyCreateInput {
      name: "BSC only".to_string(),
      rules: vec![allowed_chain_rule("eip155:56")],
    },
    vault_path.clone(),
  )
  .expect("policy creation should succeed");
  let created = create_api_key(
    ApiKeyCreateInput {
      name: "bsc-agent".to_string(),
      wallet: wallet.meta.name.clone(),
      policy_ids: vec![policy.id],
    },
    TEST_PASSWORD.to_string(),
    vault_path.clone(),
  )
  .expect("API key creation should succeed");

  let tx_hex = encode_unsigned_eth_transaction(EthTransactionInput {
    nonce: "8".to_string(),
    gas_price: "20000000008".to_string(),
    gas_limit: "189000".to_string(),
    to: "0x3535353535353535353535353535353535353535".to_string(),
    value: "512".to_string(),
    data: String::new(),
    chain_id: "0x38".to_string(),
    tx_type: String::new(),
    max_fee_per_gas: "1076634600920".to_string(),
    max_priority_fee_per_gas: "226".to_string(),
    access_list: vec![],
  });

  let signed = sign_transaction(
    wallet.meta.name.clone(),
    "eip155:56".to_string(),
    tx_hex.clone(),
    created.token.clone(),
    vault_path.clone(),
  )
  .expect("transaction signing should succeed");
  let Either::A(_) = signed else {
    panic!("expected Ethereum signed transaction");
  };

  revoke_api_key(created.api_key.id.clone(), vault_path.clone())
    .expect("API key revoke should succeed");

  let err = sign_transaction(
    wallet.meta.name,
    "eip155:56".to_string(),
    tx_hex,
    created.token,
    vault_path.clone(),
  )
  .expect_err("revoked API key should fail");
  assert_eq!(err.reason, "credential is invalid");

  let _ = fs::remove_dir_all(vault_dir);
}

#[test]
fn sign_message_rejects_wallet_mismatch_and_disallowed_chain_for_api_key() {
  let (vault_dir, vault_path) = temp_vault("api-key-wallet-mismatch");
  let bound_wallet = import_wallet_mnemonic(
    "Bound".to_string(),
    TEST_MNEMONIC.to_string(),
    TEST_PASSWORD.to_string(),
    vault_path.clone(),
    None,
  )
  .expect("bound wallet import should succeed");
  let other_wallet = import_wallet_private_key(
    "Other".to_string(),
    TEST_PRIVATE_KEY.to_string(),
    TEST_PASSWORD.to_string(),
    vault_path.clone(),
    None,
  )
  .expect("other wallet import should succeed");
  let policy = create_policy(
    PolicyCreateInput {
      name: "ETH only".to_string(),
      rules: vec![allowed_chain_rule(default_eth_mainnet_chain_id())],
    },
    vault_path.clone(),
  )
  .expect("policy creation should succeed");
  let created = create_api_key(
    ApiKeyCreateInput {
      name: "eth-agent".to_string(),
      wallet: bound_wallet.meta.id.clone(),
      policy_ids: vec![policy.id],
    },
    TEST_PASSWORD.to_string(),
    vault_path.clone(),
  )
  .expect("API key creation should succeed");

  let mismatch_err = sign_message(
    other_wallet.meta.id,
    default_eth_mainnet_chain_id().to_string(),
    "hello".to_string(),
    created.token.clone(),
    vault_path.clone(),
  )
  .expect_err("wallet mismatch should fail");
  assert_eq!(
    mismatch_err.reason,
    "API key \"eth-agent\" is not authorized for wallet \"Other\""
  );

  let chain_err = sign_message(
    bound_wallet.meta.name,
    default_tron_mainnet_chain_id().to_string(),
    "hello".to_string(),
    created.token,
    vault_path.clone(),
  )
  .expect_err("disallowed chain should fail");
  assert_eq!(
    chain_err.reason,
    format!(
      "policy denied by \"ETH only\": chainId `{}` is not allowed",
      default_tron_mainnet_chain_id()
    )
  );

  let _ = fs::remove_dir_all(vault_dir);
}

#[test]
fn sign_message_rejects_expired_or_missing_policies() {
  let (vault_dir, vault_path) = temp_vault("api-key-policy-denials");
  let wallet = import_wallet_mnemonic(
    "Signer".to_string(),
    TEST_MNEMONIC.to_string(),
    TEST_PASSWORD.to_string(),
    vault_path.clone(),
    None,
  )
  .expect("wallet import should succeed");
  let expired_policy = create_policy(
    PolicyCreateInput {
      name: "Expired".to_string(),
      rules: vec![expires_at_rule("2000-01-01T00:00:00Z")],
    },
    vault_path.clone(),
  )
  .expect("expired policy creation should succeed");
  let created = create_api_key(
    ApiKeyCreateInput {
      name: "expired-agent".to_string(),
      wallet: wallet.meta.name.clone(),
      policy_ids: vec![expired_policy.id.clone()],
    },
    TEST_PASSWORD.to_string(),
    vault_path.clone(),
  )
  .expect("API key creation should succeed");

  let expired_err = sign_message(
    wallet.meta.name.clone(),
    default_eth_mainnet_chain_id().to_string(),
    "hello".to_string(),
    created.token.clone(),
    vault_path.clone(),
  )
  .expect_err("expired policy should fail");
  assert!(expired_err
    .reason
    .contains("policy denied by \"Expired\": expired at 2000-01-01T00:00:00Z"));

  fs::remove_file(policy_vault_path(&vault_dir, &expired_policy.id))
    .expect("policy file should be removable");
  let missing_err = sign_message(
    wallet.meta.name,
    default_eth_mainnet_chain_id().to_string(),
    "hello".to_string(),
    created.token,
    vault_path.clone(),
  )
  .expect_err("missing policy should fail closed");
  assert_eq!(
    missing_err.reason,
    format!("policy denied: policy `{}` is missing", expired_policy.id)
  );

  let _ = fs::remove_dir_all(vault_dir);
}

#[test]
fn delete_policy_and_wallet_reject_when_api_key_still_references_them() {
  let (vault_dir, vault_path) = temp_vault("api-key-reference-guards");
  let wallet = import_wallet_mnemonic(
    "Treasury".to_string(),
    TEST_MNEMONIC.to_string(),
    TEST_PASSWORD.to_string(),
    vault_path.clone(),
    None,
  )
  .expect("wallet import should succeed");
  let policy = create_policy(
    PolicyCreateInput {
      name: "Guarded".to_string(),
      rules: vec![allowed_chain_rule(default_eth_mainnet_chain_id())],
    },
    vault_path.clone(),
  )
  .expect("policy creation should succeed");
  let api_key = create_api_key(
    ApiKeyCreateInput {
      name: "guard".to_string(),
      wallet: wallet.meta.id.clone(),
      policy_ids: vec![policy.id.clone()],
    },
    TEST_PASSWORD.to_string(),
    vault_path.clone(),
  )
  .expect("API key creation should succeed");

  let delete_policy_err = delete_policy(policy.id.clone(), vault_path.clone())
    .expect_err("referenced policy should fail");
  assert_eq!(
    delete_policy_err.reason,
    "Policy \"Guarded\" is still referenced by an API key"
  );

  let delete_wallet_err = delete_wallet(wallet.meta.id.clone(), vault_path.clone())
    .expect_err("referenced wallet should fail");
  assert_eq!(
    delete_wallet_err.reason,
    "Wallet \"Treasury\" is still referenced by an API key"
  );

  revoke_api_key(api_key.api_key.id, vault_path.clone()).expect("API key revoke should succeed");
  delete_policy(policy.id, vault_path.clone()).expect("policy delete should succeed");
  delete_wallet(wallet.meta.id, vault_path.clone()).expect("wallet delete should succeed");

  let _ = fs::remove_dir_all(vault_dir);
}
