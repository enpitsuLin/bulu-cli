pub(crate) mod auth;

use crate::error::{require_non_empty, require_trimmed, CoreResult};
use crate::policy::engine::PolicyOperation;
use crate::signing::auth::with_signing_request;
use crate::types::{SignedMessage, SignedTransactionResult};

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
      request
        .resolved
        .signer
        .sign_message(unlocked_keystore, &request.derivation_path, &message)
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
      request.resolved.signer.sign_transaction(
        unlocked_keystore,
        &request.resolved,
        &request.derivation_path,
        &normalized_tx_hex,
      )
    },
  )
}

#[cfg(test)]
mod tests {
  use std::fs;
  use std::path::{Path, PathBuf};

  use tcx_common::ToHex;
  use tcx_eth::transaction::EthTxInput as TcxEthTxInput;
  use tcx_eth::transaction_types::Transaction as TcxEthTransaction;
  use tcx_keystore::keystore::IdentityNetwork;

  use super::{sign_message, sign_transaction};
  use crate::api_key;
  use crate::chain::{ethereum::ETHEREUM_SIGNER, tron::TRON_SIGNER, ChainSigner};
  use crate::policy::create_policy;
  use crate::test_utils::fixtures;
  use crate::types::{PolicyCreateInput, PolicyRule};
  use crate::wallet::{import_wallet_mnemonic, import_wallet_private_key};

  fn policy_vault_path(vault_dir: &Path, policy_id: &str) -> PathBuf {
    vault_dir.join("policies").join(format!("{policy_id}.json"))
  }

  fn encode_unsigned_eth_transaction(input: TcxEthTxInput) -> String {
    let tx = TcxEthTransaction::try_from(&input).expect("transaction input should encode");
    tx.encode(None).to_hex()
  }

  fn default_eth_mainnet_chain_id() -> &'static str {
    ETHEREUM_SIGNER.default_chain_id(IdentityNetwork::Mainnet)
  }

  fn default_tron_mainnet_chain_id() -> &'static str {
    TRON_SIGNER.default_chain_id(IdentityNetwork::Mainnet)
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
    let vault_dir = fixtures::temp_vault_dir("sign-eth-message");
    let vault_path = vault_dir.to_string_lossy().into_owned();
    let wallet = import_wallet_mnemonic(
      "Imported mnemonic".to_string(),
      fixtures::TEST_MNEMONIC.to_string(),
      fixtures::TEST_PASSWORD.to_string(),
      vault_path.clone(),
      None,
    )
    .expect("mnemonic import should succeed");

    let signed = sign_message(
      wallet.meta.name,
      default_eth_mainnet_chain_id().to_string(),
      "hello world".to_string(),
      fixtures::TEST_PASSWORD.to_string(),
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
    let vault_dir = fixtures::temp_vault_dir("sign-tron-message");
    let vault_path = vault_dir.to_string_lossy().into_owned();
    let wallet = import_wallet_mnemonic(
      "Imported mnemonic".to_string(),
      fixtures::TEST_MNEMONIC.to_string(),
      fixtures::TEST_PASSWORD.to_string(),
      vault_path.clone(),
      None,
    )
    .expect("mnemonic import should succeed");

    let signed = sign_message(
      wallet.meta.name,
      default_tron_mainnet_chain_id().to_string(),
      "hello world".to_string(),
      fixtures::TEST_PASSWORD.to_string(),
      vault_path,
    )
    .expect("tron message signing should succeed");

    assert_eq!(
      signed.signature,
      "0x99d6dc90e3ab98b42d02f72b0f8d548641e213f4c064882fd5e475637978e16e4702753c47588eef4fa8b5a8882b07c76142e55c2a6d531cd49b19005e950ce41b"
    );

    let _ = fs::remove_dir_all(vault_dir);
  }

  #[test]
  fn sign_transaction_signs_ethereum_transactions() {
    let vault_dir = fixtures::temp_vault_dir("sign-eth-transaction");
    let vault_path = vault_dir.to_string_lossy().into_owned();
    let wallet = import_wallet_private_key(
      "Imported private key".to_string(),
      fixtures::TEST_PRIVATE_KEY.to_string(),
      fixtures::TEST_PASSWORD.to_string(),
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
      fixtures::TEST_PASSWORD.to_string(),
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
    let vault_dir = fixtures::temp_vault_dir("sign-eth-chain-mismatch");
    let vault_path = vault_dir.to_string_lossy().into_owned();
    let wallet = import_wallet_private_key(
      "Imported private key".to_string(),
      fixtures::TEST_PRIVATE_KEY.to_string(),
      fixtures::TEST_PASSWORD.to_string(),
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
      fixtures::TEST_PASSWORD.to_string(),
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
    let vault_dir = fixtures::temp_vault_dir("sign-eth-eip1559-transaction");
    let vault_path = vault_dir.to_string_lossy().into_owned();
    let wallet = import_wallet_mnemonic(
      "Imported mnemonic".to_string(),
      fixtures::TEST_MNEMONIC.to_string(),
      fixtures::TEST_PASSWORD.to_string(),
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
      fixtures::TEST_PASSWORD.to_string(),
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
    let vault_dir = fixtures::temp_vault_dir("sign-tron-transaction");
    let vault_path = vault_dir.to_string_lossy().into_owned();
    let wallet = import_wallet_mnemonic(
      "Imported mnemonic".to_string(),
      fixtures::TEST_MNEMONIC.to_string(),
      fixtures::TEST_PASSWORD.to_string(),
      vault_path.clone(),
      None,
    )
    .expect("mnemonic import should succeed");

    let signed = sign_transaction(
      wallet.meta.name,
      default_tron_mainnet_chain_id().to_string(),
      "0a0208312208b02efdc02638b61e40f083c3a7c92d5a65080112610a2d747970652e676f6f676c65617069732e636f6d2f70726f746f636f6c2e5472616e73666572436f6e747261637412300a1541a1e81654258bf14f63feb2e8d1380075d45b0dac1215410b3e84ec677b3e63c99affcadb91a6b4e086798f186470a0bfbfa7c92d".to_string(),
      fixtures::TEST_PASSWORD.to_string(),
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
    let (vault_dir, vault_path) = fixtures::temp_vault("api-key-sign-transaction");
    let wallet = import_wallet_private_key(
      "Signer".to_string(),
      fixtures::TEST_PRIVATE_KEY.to_string(),
      fixtures::TEST_PASSWORD.to_string(),
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
      fixtures::TEST_PASSWORD.to_string(),
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
    let (vault_dir, vault_path) = fixtures::temp_vault("api-key-multi-wallets");
    let first_wallet = import_wallet_mnemonic(
      "First".to_string(),
      fixtures::TEST_MNEMONIC.to_string(),
      fixtures::TEST_PASSWORD.to_string(),
      vault_path.clone(),
      None,
    )
    .expect("first wallet import should succeed");
    let second_wallet = import_wallet_private_key(
      "Second".to_string(),
      fixtures::TEST_PRIVATE_KEY.to_string(),
      fixtures::TEST_PASSWORD.to_string(),
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
      fixtures::TEST_PASSWORD.to_string(),
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
    let (vault_dir, vault_path) = fixtures::temp_vault("api-key-wallet-mismatch");
    let bound_wallet = import_wallet_mnemonic(
      "Bound".to_string(),
      fixtures::TEST_MNEMONIC.to_string(),
      fixtures::TEST_PASSWORD.to_string(),
      vault_path.clone(),
      None,
    )
    .expect("bound wallet import should succeed");
    let other_wallet = import_wallet_private_key(
      "Other".to_string(),
      fixtures::TEST_PRIVATE_KEY.to_string(),
      fixtures::TEST_PASSWORD.to_string(),
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
      fixtures::TEST_PASSWORD.to_string(),
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
        "policy denied by `ETH only`: chainId `{}` is not allowed",
        default_tron_mainnet_chain_id()
      )
    );

    let _ = fs::remove_dir_all(vault_dir);
  }

  #[test]
  fn sign_message_rejects_expired_or_missing_policies() {
    let (vault_dir, vault_path) = fixtures::temp_vault("api-key-policy-denials");
    let wallet = import_wallet_mnemonic(
      "Signer".to_string(),
      fixtures::TEST_MNEMONIC.to_string(),
      fixtures::TEST_PASSWORD.to_string(),
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
      fixtures::TEST_PASSWORD.to_string(),
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
      .contains("policy denied by `Expired`: expired at 946684800"));

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
    let (vault_dir, vault_path) = fixtures::temp_vault("api-key-expired");
    let wallet = import_wallet_mnemonic(
      "Signer".to_string(),
      fixtures::TEST_MNEMONIC.to_string(),
      fixtures::TEST_PASSWORD.to_string(),
      vault_path.clone(),
      None,
    )
    .expect("wallet import should succeed");
    let created = api_key::create_api_key(
      "expired-key".to_string(),
      vec![wallet.meta.id.clone()],
      vec![],
      fixtures::TEST_PASSWORD.to_string(),
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
