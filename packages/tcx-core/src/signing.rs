use tcx_keystore::{Keystore as TcxKeystore, KeystoreGuard};

use crate::api_key::{
  decrypt_derived_key, invalid_credential_error, parse_api_token, API_KEY_TOKEN_PREFIX,
};
use crate::chain::{
  prepare_transaction, sign_message as sign_chain_message,
  sign_transaction as sign_chain_transaction, Caip2ChainId,
};
use crate::derivation::{resolve_derivation, DerivationRequest};
use crate::error::{require_non_empty, require_trimmed, CoreError, CoreResult, ResultExt};
use crate::policy_engine::{
  evaluate_policy, timestamp_is_expired, PolicyEvaluationContext, PolicyOperation,
};
use crate::types::SignedTransactionResult;
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
) -> CoreResult<SignedTransactionResult> {
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

    if let Some(expires_at) = api_key.info.expires_at {
      if timestamp_is_expired(expires_at, policy_context.now_timestamp) {
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

#[cfg(test)]
mod tests {
  use std::env;
  use std::fs;
  use std::path::{Path, PathBuf};
  use std::time::{SystemTime, UNIX_EPOCH};

  use tcx_common::ToHex;
  use tcx_eth::transaction::EthTxInput as TcxEthTxInput;
  use tcx_eth::transaction_types::Transaction as TcxEthTransaction;
  use tcx_keystore::keystore::IdentityNetwork;

  use super::{sign_message, sign_transaction};
  use crate::api_key;
  use crate::chain::Chain;
  use crate::policy::create_policy;
  use crate::types::{PolicyCreateInput, PolicyRule};
  use crate::wallet::{import_wallet_mnemonic, import_wallet_private_key};

  const TEST_PASSWORD: &str = "imToken";
  const TEST_MNEMONIC: &str =
    "inject kidney empty canal shadow pact comfort wife crush horse wife sketch";
  const TEST_PRIVATE_KEY: &str = "a392604efc2fad9c0b3da43b5f698a2e3f270f170d859912be0d54742275c5f6";

  fn temp_vault_dir(test_name: &str) -> PathBuf {
    let timestamp = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .expect("system clock should be after Unix epoch")
      .as_nanos();

    env::temp_dir().join(format!(
      "tcx-core-{test_name}-{}-{timestamp}",
      std::process::id()
    ))
  }

  fn temp_vault(test_name: &str) -> (PathBuf, String) {
    let vault_dir = temp_vault_dir(test_name);
    let vault_path = vault_dir.to_string_lossy().into_owned();
    (vault_dir, vault_path)
  }

  fn policy_vault_path(vault_dir: &Path, policy_id: &str) -> PathBuf {
    vault_dir.join("policies").join(format!("{policy_id}.json"))
  }

  fn encode_unsigned_eth_transaction(input: TcxEthTxInput) -> String {
    let tx = TcxEthTransaction::try_from(&input).expect("transaction input should encode");
    tx.encode(None).to_hex()
  }

  fn default_eth_mainnet_chain_id() -> &'static str {
    Chain::Ethereum.default_chain_id(IdentityNetwork::Mainnet)
  }

  fn default_tron_mainnet_chain_id() -> &'static str {
    Chain::Tron.default_chain_id(IdentityNetwork::Mainnet)
  }

  fn allowed_chain_rule(chain_id: &str) -> PolicyRule {
    PolicyRule {
      rule_type: "allowed_chains".to_string(),
      chain_ids: Some(vec![chain_id.to_string()]),
      timestamp: None,
    }
  }

  fn expires_at_rule(timestamp: i64) -> PolicyRule {
    PolicyRule {
      rule_type: "expires_at".to_string(),
      chain_ids: None,
      timestamp: Some(timestamp),
    }
  }

  #[test]
  fn sign_message_signs_ethereum_personal_messages() {
    let vault_dir = temp_vault_dir("sign-eth-message");
    let vault_path = vault_dir.to_string_lossy().into_owned();
    let wallet = import_wallet_mnemonic(
      "Imported mnemonic".to_string(),
      TEST_MNEMONIC.to_string(),
      TEST_PASSWORD.to_string(),
      vault_path.clone(),
      None,
    )
    .expect("mnemonic import should succeed");

    let signed = sign_message(
      wallet.meta.name,
      default_eth_mainnet_chain_id().to_string(),
      "hello world".to_string(),
      TEST_PASSWORD.to_string(),
      vault_path,
    )
    .expect("ethereum message signing should succeed");

    assert_eq!(
      signed.signature,
      "0x521d0e4b5808b7fbeb53bf1b17c7c6d60432f5b13b7aa3aaed963a894c3bd99e23a3755ec06fa7a61b031192fb5fab6256e180e086c2671e0a574779bb8593df1b"
    );

    let _ = fs::remove_dir_all(vault_dir);
  }

  #[test]
  fn sign_message_signs_tron_messages() {
    let vault_dir = temp_vault_dir("sign-tron-message");
    let vault_path = vault_dir.to_string_lossy().into_owned();
    let wallet = import_wallet_mnemonic(
      "Imported mnemonic".to_string(),
      TEST_MNEMONIC.to_string(),
      TEST_PASSWORD.to_string(),
      vault_path.clone(),
      None,
    )
    .expect("mnemonic import should succeed");

    let signed = sign_message(
      wallet.meta.name,
      default_tron_mainnet_chain_id().to_string(),
      "hello world".to_string(),
      TEST_PASSWORD.to_string(),
      vault_path,
    )
    .expect("tron message signing should succeed");

    assert_eq!(
      signed.signature,
      "0x8686cc3cf49e772d96d3a8147a59eb3df2659c172775f3611648bfbe7e3c48c11859b873d9d2185567a4f64a14fa38ce78dc385a7364af55109c5b6426e4c0f61b"
    );

    let _ = fs::remove_dir_all(vault_dir);
  }

  #[test]
  fn sign_transaction_signs_ethereum_transactions() {
    let vault_dir = temp_vault_dir("sign-eth-transaction");
    let vault_path = vault_dir.to_string_lossy().into_owned();
    let wallet = import_wallet_private_key(
      "Imported private key".to_string(),
      TEST_PRIVATE_KEY.to_string(),
      TEST_PASSWORD.to_string(),
      vault_path.clone(),
      None,
    )
    .expect("private key import should succeed");

    let tx_hex = encode_unsigned_eth_transaction(TcxEthTxInput {
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
      wallet.meta.name,
      "eip155:56".to_string(),
      tx_hex,
      TEST_PASSWORD.to_string(),
      vault_path,
    )
    .expect("ethereum transaction signing should succeed");

    assert_eq!(
      signed.signature,
      "f868088504a817c8088302e248943535353535353535353535353535353535353535820200808194a003479f1d6be72af58b1d60750e155c435e435726b5b690f4d3e59f34bd55e578a0314d2b03d29dc3f87ff95c3427658952add3cf718d3b6b8604068fc3105e4442"
    );

    let _ = fs::remove_dir_all(vault_dir);
  }

  #[test]
  fn sign_transaction_rejects_mismatched_ethereum_chain_id() {
    let vault_dir = temp_vault_dir("sign-eth-chain-mismatch");
    let vault_path = vault_dir.to_string_lossy().into_owned();
    let wallet = import_wallet_private_key(
      "Imported private key".to_string(),
      TEST_PRIVATE_KEY.to_string(),
      TEST_PASSWORD.to_string(),
      vault_path.clone(),
      None,
    )
    .expect("private key import should succeed");

    let tx_hex = encode_unsigned_eth_transaction(TcxEthTxInput {
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

    let err = sign_transaction(
      wallet.meta.name,
      default_eth_mainnet_chain_id().to_string(),
      tx_hex,
      TEST_PASSWORD.to_string(),
      vault_path,
    )
    .expect_err("mismatched chain id should fail");

    assert_eq!(
      err.to_string(),
      "txHex chain id `0x38` does not match chainId `eip155:1`"
    );

    let _ = fs::remove_dir_all(vault_dir);
  }

  #[test]
  fn sign_transaction_signs_ethereum_eip1559_transaction_hex() {
    let vault_dir = temp_vault_dir("sign-eth-eip1559-transaction");
    let vault_path = vault_dir.to_string_lossy().into_owned();
    let wallet = import_wallet_mnemonic(
      "Imported mnemonic".to_string(),
      TEST_MNEMONIC.to_string(),
      TEST_PASSWORD.to_string(),
      vault_path.clone(),
      None,
    )
    .expect("mnemonic import should succeed");

    let tx_hex = encode_unsigned_eth_transaction(TcxEthTxInput {
      nonce: "8".to_string(),
      gas_price: String::new(),
      gas_limit: "4286".to_string(),
      to: "0x3535353535353535353535353535353535353535".to_string(),
      value: "3490361".to_string(),
      data: "0x200184c0486d5f082a27".to_string(),
      chain_id: "1".to_string(),
      tx_type: "02".to_string(),
      max_fee_per_gas: "1076634600920".to_string(),
      max_priority_fee_per_gas: "226".to_string(),
      access_list: vec![],
    });

    let signed = sign_transaction(
      wallet.meta.name,
      default_eth_mainnet_chain_id().to_string(),
      tx_hex,
      TEST_PASSWORD.to_string(),
      vault_path,
    )
    .expect("eip1559 transaction signing should succeed");

    assert_eq!(
      signed.signature,
      "02f875010881e285faac6c45d88210be943535353535353535353535353535353535353535833542398a200184c0486d5f082a27c001a0602501c9cfedf145810f9b54558de6cf866a89b7a65890ccde19dd6cec1fe32ca02769f3382ee526a372241238922da39f6283a9613215fd98c8ce37a0d03fa3bb"
    );

    let _ = fs::remove_dir_all(vault_dir);
  }

  #[test]
  fn sign_transaction_signs_tron_transactions() {
    let vault_dir = temp_vault_dir("sign-tron-transaction");
    let vault_path = vault_dir.to_string_lossy().into_owned();
    let wallet = import_wallet_mnemonic(
      "Imported mnemonic".to_string(),
      TEST_MNEMONIC.to_string(),
      TEST_PASSWORD.to_string(),
      vault_path.clone(),
      None,
    )
    .expect("mnemonic import should succeed");

    let signed = sign_transaction(
      wallet.meta.name,
      default_tron_mainnet_chain_id().to_string(),
      "0a0208312208b02efdc02638b61e40f083c3a7c92d5a65080112610a2d747970652e676f6f676c65617069732e636f6d2f70726f746f636f6c2e5472616e73666572436f6e747261637412300a1541a1e81654258bf14f63feb2e8d1380075d45b0dac1215410b3e84ec677b3e63c99affcadb91a6b4e086798f186470a0bfbfa7c92d".to_string(),
      TEST_PASSWORD.to_string(),
      vault_path,
    )
    .expect("tron transaction signing should succeed");

    assert_eq!(
      signed.signature,
      "c65b4bde808f7fcfab7b0ef9c1e3946c83311f8ac0a5e95be2d8b6d2400cfe8b5e24dc8f0883132513e422f2aaad8a4ecc14438eae84b2683eefa626e3adffc601"
    );

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
    let created = api_key::create_api_key(
      "bsc-agent".to_string(),
      vec![wallet.meta.name.clone()],
      vec![policy.id],
      TEST_PASSWORD.to_string(),
      None,
      Some(vault_path.clone()),
    )
    .expect("API key creation should succeed");

    let tx_hex = encode_unsigned_eth_transaction(TcxEthTxInput {
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
    assert!(!signed.signature.is_empty());

    api_key::revoke_api_key(created.api_key.id.clone(), vault_path.clone())
      .expect("API key revoke should succeed");

    let err = sign_transaction(
      wallet.meta.name,
      "eip155:56".to_string(),
      tx_hex,
      created.token,
      vault_path.clone(),
    )
    .expect_err("revoked API key should fail");
    assert_eq!(err.to_string(), "credential is invalid");

    let _ = fs::remove_dir_all(vault_dir);
  }

  #[test]
  fn sign_message_accepts_api_key_for_any_bound_wallet_id() {
    let (vault_dir, vault_path) = temp_vault("api-key-multi-wallets");
    let first_wallet = import_wallet_mnemonic(
      "First".to_string(),
      TEST_MNEMONIC.to_string(),
      TEST_PASSWORD.to_string(),
      vault_path.clone(),
      None,
    )
    .expect("first wallet import should succeed");
    let second_wallet = import_wallet_private_key(
      "Second".to_string(),
      TEST_PRIVATE_KEY.to_string(),
      TEST_PASSWORD.to_string(),
      vault_path.clone(),
      None,
    )
    .expect("second wallet import should succeed");
    let policy = create_policy(
      PolicyCreateInput {
        name: "ETH only".to_string(),
        rules: vec![allowed_chain_rule(default_eth_mainnet_chain_id())],
      },
      vault_path.clone(),
    )
    .expect("policy creation should succeed");
    let created = api_key::create_api_key(
      "multi-wallet-agent".to_string(),
      vec![first_wallet.meta.id, second_wallet.meta.id.clone()],
      vec![policy.id],
      TEST_PASSWORD.to_string(),
      None,
      Some(vault_path.clone()),
    )
    .expect("API key creation should succeed");

    let signed = sign_message(
      second_wallet.meta.name,
      default_eth_mainnet_chain_id().to_string(),
      "hello".to_string(),
      created.token,
      vault_path.clone(),
    )
    .expect("message signing should succeed");
    assert_eq!(
      signed.signature,
      "0xbfdd222665dc2e4ff14cb38201fe7da601928a9fd73db3c58781efdd04aec9552cf45eab05e8c1d307511763289d851c8684fc00fbfa045bf8b37b7543bf56881b"
    );

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
    let created = api_key::create_api_key(
      "eth-agent".to_string(),
      vec![bound_wallet.meta.id.clone()],
      vec![policy.id],
      TEST_PASSWORD.to_string(),
      None,
      Some(vault_path.clone()),
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
      mismatch_err.to_string(),
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
      chain_err.to_string(),
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
        rules: vec![expires_at_rule(946_684_800)],
      },
      vault_path.clone(),
    )
    .expect("expired policy creation should succeed");
    let created = api_key::create_api_key(
      "expired-agent".to_string(),
      vec![wallet.meta.name.clone()],
      vec![expired_policy.id.clone()],
      TEST_PASSWORD.to_string(),
      None,
      Some(vault_path.clone()),
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
      .to_string()
      .contains("policy denied by \"Expired\": expired at 946684800"));

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
      missing_err.to_string(),
      format!("policy denied: policy `{}` is missing", expired_policy.id)
    );

    let _ = fs::remove_dir_all(vault_dir);
  }

  #[test]
  fn sign_message_rejects_expired_api_key() {
    let (vault_dir, vault_path) = temp_vault("api-key-expired");
    let wallet = import_wallet_mnemonic(
      "Signer".to_string(),
      TEST_MNEMONIC.to_string(),
      TEST_PASSWORD.to_string(),
      vault_path.clone(),
      None,
    )
    .expect("wallet import should succeed");
    let created = api_key::create_api_key(
      "expired-key".to_string(),
      vec![wallet.meta.id.clone()],
      vec![],
      TEST_PASSWORD.to_string(),
      Some(946_684_800),
      Some(vault_path.clone()),
    )
    .expect("API key creation should succeed");

    let err = sign_message(
      wallet.meta.name,
      default_eth_mainnet_chain_id().to_string(),
      "hello".to_string(),
      created.token,
      vault_path.clone(),
    )
    .expect_err("expired API key should fail");
    assert_eq!(
      err.to_string(),
      "API key \"expired-key\" expired at 946684800"
    );

    let _ = fs::remove_dir_all(vault_dir);
  }
}
