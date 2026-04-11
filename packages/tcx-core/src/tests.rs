use napi::Either;
use serde_json::Value;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tcx_common::ToHex;
use tcx_eth::transaction::EthTxInput as TcxEthTxInput;
use tcx_eth::transaction_types::Transaction as TcxEthTransaction;

use super::*;
use crate::constants::{
  DEFAULT_ETH_DERIVATION_PATH, DEFAULT_ETH_MAINNET_CHAIN_ID, DEFAULT_TRON_MAINNET_CHAIN_ID,
};

const TEST_PASSWORD: &str = "imToken";
const TEST_MNEMONIC: &str =
  "inject kidney empty canal shadow pact comfort wife crush horse wife sketch";
const TEST_PRIVATE_KEY: &str = "a392604efc2fad9c0b3da43b5f698a2e3f270f170d859912be0d54742275c5f6";
const ETH_ACCOUNT_1_DERIVATION_PATH: &str = "m/44'/60'/0'/0/1";
const TRON_ACCOUNT_1_DERIVATION_PATH: &str = "m/44'/195'/0'/0/1";

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

fn read_vault_json(path: &PathBuf) -> Value {
  let persisted = fs::read_to_string(path).expect("vault JSON should be readable");
  serde_json::from_str(&persisted).expect("vault JSON should parse")
}

fn read_vault_text(path: &PathBuf) -> String {
  fs::read_to_string(path).expect("vault JSON should be readable")
}

fn wallet_vault_path(vault_dir: &Path, wallet_id: &str) -> PathBuf {
  vault_dir.join("wallets").join(format!("{wallet_id}.json"))
}

fn keystore_json_value(wallet: &WalletInfo) -> Value {
  serde_json::to_value(&wallet.keystore).expect("keystore JSON should serialize")
}

fn keystore_json(wallet: &WalletInfo) -> String {
  wallet
    .keystore
    .to_json_string()
    .expect("keystore JSON should serialize")
}

fn encode_unsigned_eth_transaction(input: EthTransactionInput) -> String {
  let tx = TcxEthTransaction::try_from(&TcxEthTxInput::from(input))
    .expect("transaction input should encode");
  tx.encode(None).to_hex()
}

#[test]
fn create_wallet_returns_keystore_json_and_default_accounts() {
  let (vault_dir, vault_path) = temp_vault("create-wallet-defaults");
  let wallet = create_wallet(
    "Created".to_string(),
    TEST_PASSWORD.to_string(),
    vault_path,
    None,
  )
  .expect("create wallet should succeed");

  assert_eq!(wallet.meta.source, "NEW_MNEMONIC");
  assert_eq!(wallet.meta.network, "MAINNET");
  assert_eq!(wallet.accounts.len(), 2);
  assert_eq!(wallet.accounts[0].chain_id, DEFAULT_ETH_MAINNET_CHAIN_ID);
  assert_eq!(wallet.accounts[1].chain_id, DEFAULT_TRON_MAINNET_CHAIN_ID);
  assert_eq!(wallet.meta.version, 12000);
  assert!(wallet.meta.derivable);
  assert_eq!(wallet.keystore.version, 12000);

  let _ = fs::remove_dir_all(vault_dir);
}

#[test]
fn create_wallet_persists_wallet_info_when_vault_path_is_provided() {
  let (vault_dir, vault_path) = temp_vault("create-wallet");
  let wallet = create_wallet(
    "Created".to_string(),
    TEST_PASSWORD.to_string(),
    vault_path,
    None,
  )
  .expect("create wallet should succeed");
  let wallet_path = wallet_vault_path(&vault_dir, &wallet.meta.id);
  let persisted = read_vault_json(&wallet_path);
  let persisted_text = read_vault_text(&wallet_path);

  assert!(wallet_path.exists());
  assert!(
    persisted_text.find("\"meta\"").expect("meta should exist")
      < persisted_text
        .find("\"keystore\"")
        .expect("keystore should exist")
  );
  assert!(
    persisted_text
      .find("\"keystore\"")
      .expect("keystore should exist")
      < persisted_text
        .find("\"accounts\"")
        .expect("accounts should exist")
  );
  assert_eq!(persisted["keystore"], keystore_json_value(&wallet));
  assert_eq!(persisted["meta"]["id"], wallet.meta.id);
  assert_eq!(persisted["meta"]["source"], "NEW_MNEMONIC");
  assert_eq!(
    persisted["accounts"][0]["chainId"],
    DEFAULT_ETH_MAINNET_CHAIN_ID
  );
  assert_eq!(
    persisted["accounts"][1]["chainId"],
    DEFAULT_TRON_MAINNET_CHAIN_ID
  );

  let _ = fs::remove_dir_all(vault_dir);
}

#[test]
fn import_wallet_mnemonic_returns_default_accounts() {
  let (vault_dir, vault_path) = temp_vault("import-mnemonic-defaults");
  let wallet = import_wallet_mnemonic(
    "Imported mnemonic".to_string(),
    TEST_MNEMONIC.to_string(),
    TEST_PASSWORD.to_string(),
    vault_path,
    None,
  )
  .expect("mnemonic import should succeed");

  assert_eq!(wallet.meta.source, "MNEMONIC");
  assert_eq!(wallet.meta.network, "MAINNET");
  assert_eq!(wallet.accounts.len(), 2);
  assert_eq!(wallet.accounts[0].chain_id, DEFAULT_ETH_MAINNET_CHAIN_ID);
  assert_eq!(wallet.accounts[1].chain_id, DEFAULT_TRON_MAINNET_CHAIN_ID);

  let _ = fs::remove_dir_all(vault_dir);
}

#[test]
fn import_wallet_mnemonic_uses_index_for_default_derivations_and_persists_wallet_info() {
  let (default_vault_dir, default_vault_path) = temp_vault("import-mnemonic-default");
  let default_wallet = import_wallet_mnemonic(
    "Default mnemonic".to_string(),
    TEST_MNEMONIC.to_string(),
    TEST_PASSWORD.to_string(),
    default_vault_path,
    None,
  )
  .expect("mnemonic import should succeed");
  let (vault_dir, vault_path) = temp_vault("import-mnemonic");
  let indexed_wallet = import_wallet_mnemonic(
    "Indexed mnemonic".to_string(),
    TEST_MNEMONIC.to_string(),
    TEST_PASSWORD.to_string(),
    vault_path,
    Some(1),
  )
  .expect("indexed mnemonic import should succeed");
  let wallet_path = wallet_vault_path(&vault_dir, &indexed_wallet.meta.id);
  let persisted = read_vault_json(&wallet_path);

  assert_eq!(
    indexed_wallet.accounts[0].derivation_path.as_deref(),
    Some(ETH_ACCOUNT_1_DERIVATION_PATH)
  );
  assert_eq!(
    indexed_wallet.accounts[1].derivation_path.as_deref(),
    Some(TRON_ACCOUNT_1_DERIVATION_PATH)
  );
  assert_ne!(
    indexed_wallet.accounts[0].address,
    default_wallet.accounts[0].address
  );
  assert_eq!(persisted["keystore"], keystore_json_value(&indexed_wallet));
  assert_eq!(
    persisted["accounts"][0]["derivationPath"],
    ETH_ACCOUNT_1_DERIVATION_PATH
  );
  assert_eq!(
    persisted["accounts"][1]["derivationPath"],
    TRON_ACCOUNT_1_DERIVATION_PATH
  );

  let _ = fs::remove_dir_all(default_vault_dir);
  let _ = fs::remove_dir_all(vault_dir);
}

#[test]
fn import_wallet_private_key_returns_non_derivable_accounts() {
  let (vault_dir, vault_path) = temp_vault("import-private-key-defaults");
  let wallet = import_wallet_private_key(
    "Imported private key".to_string(),
    TEST_PRIVATE_KEY.to_string(),
    TEST_PASSWORD.to_string(),
    vault_path,
    None,
  )
  .expect("private key import should succeed");

  assert_eq!(wallet.meta.source, "PRIVATE");
  assert_eq!(wallet.meta.network, "MAINNET");
  assert_eq!(wallet.accounts.len(), 2);
  assert_eq!(wallet.accounts[0].chain_id, DEFAULT_ETH_MAINNET_CHAIN_ID);
  assert_eq!(wallet.accounts[1].chain_id, DEFAULT_TRON_MAINNET_CHAIN_ID);
  assert!(wallet.accounts[0].derivation_path.is_none());
  assert!(wallet.accounts[0].ext_pub_key.is_none());
  assert_eq!(wallet.meta.version, 12001);
  assert_eq!(wallet.meta.curve.as_deref(), Some("secp256k1"));
  assert!(!wallet.meta.derivable);

  let _ = fs::remove_dir_all(vault_dir);
}

#[test]
fn import_wallet_private_key_persists_wallet_info_and_ignores_index() {
  let (vault_dir, vault_path) = temp_vault("import-private-key");
  let wallet = import_wallet_private_key(
    "Imported private key".to_string(),
    TEST_PRIVATE_KEY.to_string(),
    TEST_PASSWORD.to_string(),
    vault_path,
    Some(9),
  )
  .expect("private key import should succeed");
  let wallet_path = wallet_vault_path(&vault_dir, &wallet.meta.id);
  let persisted = read_vault_json(&wallet_path);

  assert!(!wallet.meta.derivable);
  assert!(wallet.accounts[0].derivation_path.is_none());
  assert!(wallet.accounts[0].ext_pub_key.is_none());
  assert_eq!(persisted["keystore"], keystore_json_value(&wallet));
  assert!(persisted["accounts"][0].get("derivationPath").is_none());
  assert!(persisted["accounts"][0].get("extPubKey").is_none());

  let _ = fs::remove_dir_all(vault_dir);
}

#[test]
fn load_wallet_restores_wallet_from_keystore_json() {
  let (vault_dir, vault_path) = temp_vault("load-wallet-source");
  let source_wallet = import_wallet_mnemonic(
    "Imported mnemonic".to_string(),
    TEST_MNEMONIC.to_string(),
    TEST_PASSWORD.to_string(),
    vault_path,
    None,
  )
  .expect("mnemonic import should succeed");

  let wallet = load_wallet(
    keystore_json(&source_wallet),
    TEST_PASSWORD.to_string(),
    Some(vec![DerivationInput {
      chain_id: DEFAULT_ETH_MAINNET_CHAIN_ID.to_string(),
      derivation_path: Some("m/44'/60'/0'/0/1".to_string()),
      network: None,
    }]),
  )
  .expect("load wallet should succeed");

  assert_eq!(wallet.meta.source, "MNEMONIC");
  assert_eq!(wallet.meta.network, "MAINNET");
  assert_eq!(wallet.accounts.len(), 1);
  assert_eq!(
    wallet.accounts[0].derivation_path.as_deref(),
    Some("m/44'/60'/0'/0/1")
  );

  let _ = fs::remove_dir_all(vault_dir);
}

#[test]
fn derive_accounts_returns_requested_accounts() {
  let (vault_dir, vault_path) = temp_vault("derive-accounts");
  let source_wallet = import_wallet_mnemonic(
    "Imported mnemonic".to_string(),
    TEST_MNEMONIC.to_string(),
    TEST_PASSWORD.to_string(),
    vault_path,
    None,
  )
  .expect("mnemonic import should succeed");

  let accounts = derive_accounts(
    keystore_json(&source_wallet),
    TEST_PASSWORD.to_string(),
    Some(vec![
      DerivationInput {
        chain_id: DEFAULT_ETH_MAINNET_CHAIN_ID.to_string(),
        derivation_path: Some(DEFAULT_ETH_DERIVATION_PATH.to_string()),
        network: None,
      },
      DerivationInput {
        chain_id: DEFAULT_ETH_MAINNET_CHAIN_ID.to_string(),
        derivation_path: Some("m/44'/60'/0'/0/1".to_string()),
        network: None,
      },
    ]),
  )
  .expect("derive accounts should succeed");

  assert_eq!(accounts.len(), 2);
  assert_eq!(accounts[0].chain_id, DEFAULT_ETH_MAINNET_CHAIN_ID);
  assert_eq!(accounts[1].chain_id, DEFAULT_ETH_MAINNET_CHAIN_ID);
  assert_eq!(
    accounts[0].derivation_path.as_deref(),
    Some(DEFAULT_ETH_DERIVATION_PATH)
  );
  assert_eq!(
    accounts[1].derivation_path.as_deref(),
    Some("m/44'/60'/0'/0/1")
  );
  assert_ne!(accounts[0].address, accounts[1].address);

  let _ = fs::remove_dir_all(vault_dir);
}

#[test]
fn derive_accounts_rejects_unsupported_chain_id_namespace() {
  let (vault_dir, vault_path) = temp_vault("derive-unsupported-chain");
  let source_wallet = import_wallet_mnemonic(
    "Imported mnemonic".to_string(),
    TEST_MNEMONIC.to_string(),
    TEST_PASSWORD.to_string(),
    vault_path,
    None,
  )
  .expect("mnemonic import should succeed");

  let err = derive_accounts(
    keystore_json(&source_wallet),
    TEST_PASSWORD.to_string(),
    Some(vec![DerivationInput {
      chain_id: "bip122:000000000019d6689c085ae165831e93".to_string(),
      derivation_path: None,
      network: None,
    }]),
  )
  .expect_err("unsupported namespaces should fail");

  assert_eq!(err.reason, "unsupported chainId namespace `bip122`");

  let _ = fs::remove_dir_all(vault_dir);
}

#[test]
fn wallet_info_and_keystore_data_round_trip_with_serde() {
  let (vault_dir, vault_path) = temp_vault("wallet-serde-round-trip");
  let wallet = import_wallet_mnemonic(
    "Round trip".to_string(),
    TEST_MNEMONIC.to_string(),
    TEST_PASSWORD.to_string(),
    vault_path,
    Some(1),
  )
  .expect("mnemonic import should succeed");

  let wallet_json = serde_json::to_value(&wallet).expect("wallet should serialize");
  let reparsed_wallet: WalletInfo =
    serde_json::from_value(wallet_json.clone()).expect("wallet should deserialize");
  assert_eq!(
    serde_json::to_value(&reparsed_wallet).expect("wallet should reserialize"),
    wallet_json
  );

  let keystore_json = keystore_json_value(&wallet);
  let reparsed_keystore: KeystoreData =
    serde_json::from_value(keystore_json.clone()).expect("keystore should deserialize");
  assert_eq!(
    serde_json::to_value(&reparsed_keystore).expect("keystore should reserialize"),
    keystore_json
  );

  let _ = fs::remove_dir_all(vault_dir);
}

#[test]
fn import_wallet_keystore_renames_and_persists_wallet() {
  let (source_vault_dir, source_vault_path) = temp_vault("import-keystore-source");
  let source_wallet = import_wallet_mnemonic(
    "Source".to_string(),
    TEST_MNEMONIC.to_string(),
    TEST_PASSWORD.to_string(),
    source_vault_path,
    None,
  )
  .expect("source wallet import should succeed");

  let (vault_dir, vault_path) = temp_vault("import-keystore");
  let wallet = import_wallet_keystore(
    "Imported keystore".to_string(),
    keystore_json(&source_wallet),
    TEST_PASSWORD.to_string(),
    vault_path,
    None,
  )
  .expect("keystore import should succeed");
  let persisted = read_vault_json(&wallet_vault_path(&vault_dir, &wallet.meta.id));

  assert_eq!(wallet.meta.name, "Imported keystore");
  assert_eq!(wallet.keystore.meta.name, "Imported keystore");
  assert_eq!(wallet.accounts.len(), 2);
  assert_eq!(persisted["meta"]["name"], "Imported keystore");
  assert_eq!(
    persisted["keystore"]["imTokenMeta"]["name"],
    "Imported keystore"
  );

  let _ = fs::remove_dir_all(source_vault_dir);
  let _ = fs::remove_dir_all(vault_dir);
}

#[test]
fn get_wallet_loads_wallets_by_name_and_unique_prefix() {
  let (vault_dir, vault_path) = temp_vault("get-wallet");
  let wallet_by_name = create_wallet(
    "Wallet by name".to_string(),
    TEST_PASSWORD.to_string(),
    vault_path.clone(),
    None,
  )
  .expect("wallet creation should succeed");
  let wallet_by_prefix = import_wallet_mnemonic(
    "Wallet by prefix".to_string(),
    TEST_MNEMONIC.to_string(),
    TEST_PASSWORD.to_string(),
    vault_path.clone(),
    None,
  )
  .expect("wallet import should succeed");

  let loaded_by_name = get_wallet("Wallet by name".to_string(), vault_path.clone())
    .expect("wallet should load by name");
  let loaded_by_prefix = get_wallet(
    wallet_by_prefix.meta.id[..8].to_string(),
    vault_path.clone(),
  )
  .expect("wallet should load by unique prefix");

  assert_eq!(loaded_by_name.meta.id, wallet_by_name.meta.id);
  assert_eq!(loaded_by_prefix.meta.id, wallet_by_prefix.meta.id);

  let _ = fs::remove_dir_all(vault_dir);
}

#[test]
fn get_wallet_rejects_ambiguous_wallet_names() {
  let (vault_dir, vault_path) = temp_vault("get-wallet-ambiguous-name");
  let wallet1 = import_wallet_mnemonic(
    "Duplicate".to_string(),
    TEST_MNEMONIC.to_string(),
    TEST_PASSWORD.to_string(),
    vault_path.clone(),
    None,
  )
  .expect("first wallet import should succeed");

  // Create a second wallet with the same name by copying the wallet file
  let wallet2_id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  let wallet1_path = wallet_vault_path(&vault_dir, &wallet1.meta.id);
  let wallet2_path = wallet_vault_path(&vault_dir, wallet2_id);
  let wallet1_content = fs::read_to_string(&wallet1_path).expect("wallet should be readable");
  let mut wallet2: Value = serde_json::from_str(&wallet1_content).expect("wallet should parse");
  wallet2["meta"]["id"] = Value::String(wallet2_id.to_string());
  wallet2["keystore"]["id"] = Value::String(wallet2_id.to_string());
  fs::create_dir_all(wallet2_path.parent().unwrap()).expect("should create wallets dir");
  fs::write(
    &wallet2_path,
    serde_json::to_string_pretty(&wallet2).unwrap(),
  )
  .expect("should write second wallet");

  let err = get_wallet("Duplicate".to_string(), vault_path.clone())
    .expect_err("ambiguous wallet name should fail");
  assert!(err
    .reason
    .starts_with("Multiple wallets share the name \"Duplicate\"."));

  let remaining_wallets = list_wallet(vault_path).expect("listing wallets should succeed");
  assert_eq!(remaining_wallets.len(), 2);

  let _ = fs::remove_dir_all(vault_dir);
}

#[test]
fn delete_wallet_deletes_wallets_by_name_and_unique_id_prefix() {
  let (vault_dir, vault_path) = temp_vault("delete-wallet");
  let wallet_by_name = create_wallet(
    "Wallet by name".to_string(),
    TEST_PASSWORD.to_string(),
    vault_path.clone(),
    None,
  )
  .expect("wallet creation should succeed");
  let wallet_by_prefix = import_wallet_mnemonic(
    "Wallet by prefix".to_string(),
    TEST_MNEMONIC.to_string(),
    TEST_PASSWORD.to_string(),
    vault_path.clone(),
    None,
  )
  .expect("wallet import should succeed");

  delete_wallet("Wallet by name".to_string(), vault_path.clone())
    .expect("wallet deletion by name should succeed");
  assert!(!wallet_vault_path(&vault_dir, &wallet_by_name.meta.id).exists());

  let unique_prefix = &wallet_by_prefix.meta.id[..8];
  delete_wallet(unique_prefix.to_string(), vault_path.clone())
    .expect("wallet deletion by id prefix should succeed");
  assert!(!wallet_vault_path(&vault_dir, &wallet_by_prefix.meta.id).exists());

  let remaining_wallets = list_wallet(vault_path).expect("listing wallets should succeed");
  assert!(remaining_wallets.is_empty());

  let _ = fs::remove_dir_all(vault_dir);
}

#[test]
fn delete_wallet_rejects_ambiguous_wallet_names() {
  let (vault_dir, vault_path) = temp_vault("delete-wallet-ambiguous-name");
  let wallet1 = import_wallet_mnemonic(
    "Duplicate".to_string(),
    TEST_MNEMONIC.to_string(),
    TEST_PASSWORD.to_string(),
    vault_path.clone(),
    None,
  )
  .expect("first wallet import should succeed");

  // Create a second wallet with the same name by copying the wallet file
  let wallet2_id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  let wallet1_path = wallet_vault_path(&vault_dir, &wallet1.meta.id);
  let wallet2_path = wallet_vault_path(&vault_dir, wallet2_id);
  let wallet1_content = fs::read_to_string(&wallet1_path).expect("wallet should be readable");
  let mut wallet2: Value = serde_json::from_str(&wallet1_content).expect("wallet should parse");
  wallet2["meta"]["id"] = Value::String(wallet2_id.to_string());
  wallet2["keystore"]["id"] = Value::String(wallet2_id.to_string());
  fs::create_dir_all(wallet2_path.parent().unwrap()).expect("should create wallets dir");
  fs::write(
    &wallet2_path,
    serde_json::to_string_pretty(&wallet2).unwrap(),
  )
  .expect("should write second wallet");

  let err = delete_wallet("Duplicate".to_string(), vault_path.clone())
    .expect_err("ambiguous wallet name should fail");
  assert!(err
    .reason
    .starts_with("Multiple wallets share the name \"Duplicate\"."));

  let remaining_wallets = list_wallet(vault_path).expect("listing wallets should succeed");
  assert_eq!(remaining_wallets.len(), 2);

  let _ = fs::remove_dir_all(vault_dir);
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
    DEFAULT_ETH_MAINNET_CHAIN_ID.to_string(),
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
    DEFAULT_TRON_MAINNET_CHAIN_ID.to_string(),
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
    wallet.meta.name,
    "eip155:56".to_string(),
    tx_hex,
    TEST_PASSWORD.to_string(),
    vault_path,
  )
  .expect("ethereum transaction signing should succeed");

  let Either::A(signed) = signed else {
    panic!("expected an Ethereum signed transaction");
  };

  assert_eq!(
    signed.tx_hash,
    "0x1a3c3947ea626e00d6ff1493bcf929b9320d15ff088046990ef88a45f7d37623"
  );
  assert_eq!(
    signed.signature,
    "f868088504a817c8088302e248943535353535353535353535353535353535353535820200808194a003479f1d6be72af58b1d60750e155c435e435726b5b690f4d3e59f34bd55e578a0314d2b03d29dc3f87ff95c3427658952add3cf718d3b6b8604068fc3105e4442"
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

  let tx_hex = encode_unsigned_eth_transaction(EthTransactionInput {
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
    DEFAULT_ETH_MAINNET_CHAIN_ID.to_string(),
    tx_hex,
    TEST_PASSWORD.to_string(),
    vault_path,
  )
  .expect("eip1559 transaction signing should succeed");

  let Either::A(signed) = signed else {
    panic!("expected an Ethereum signed transaction");
  };

  assert_eq!(
    signed.tx_hash,
    "0x9a427f295369171f686d83a05b92d8849b822f1fa1c9ccb853e81de545f4625b"
  );
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
    DEFAULT_TRON_MAINNET_CHAIN_ID.to_string(),
    "0a0208312208b02efdc02638b61e40f083c3a7c92d5a65080112610a2d747970652e676f6f676c65617069732e636f6d2f70726f746f636f6c2e5472616e73666572436f6e747261637412300a1541a1e81654258bf14f63feb2e8d1380075d45b0dac1215410b3e84ec677b3e63c99affcadb91a6b4e086798f186470a0bfbfa7c92d".to_string(),
    TEST_PASSWORD.to_string(),
    vault_path,
  )
  .expect("tron transaction signing should succeed");

  let Either::B(signed) = signed else {
    panic!("expected a Tron signed transaction");
  };

  assert_eq!(
    signed.signatures,
    vec![
      "c65b4bde808f7fcfab7b0ef9c1e3946c83311f8ac0a5e95be2d8b6d2400cfe8b5e24dc8f0883132513e422f2aaad8a4ecc14438eae84b2683eefa626e3adffc601"
        .to_string()
    ]
  );

  let _ = fs::remove_dir_all(vault_dir);
}

#[test]
fn export_wallet_returns_mnemonic_for_hd_wallet() {
  let (vault_dir, vault_path) = temp_vault("export-wallet-mnemonic");
  let wallet = import_wallet_mnemonic(
    "Test mnemonic wallet".to_string(),
    TEST_MNEMONIC.to_string(),
    TEST_PASSWORD.to_string(),
    vault_path.clone(),
    None,
  )
  .expect("mnemonic import should succeed");

  let exported = export_wallet(
    wallet.meta.name.clone(),
    TEST_PASSWORD.to_string(),
    vault_path.clone(),
  )
  .expect("export wallet should succeed");

  assert_eq!(exported, TEST_MNEMONIC);

  let _ = fs::remove_dir_all(vault_dir);
}

#[test]
fn export_wallet_returns_private_key_for_private_key_wallet() {
  let (vault_dir, vault_path) = temp_vault("export-wallet-private-key");
  let wallet = import_wallet_private_key(
    "Test private key wallet".to_string(),
    TEST_PRIVATE_KEY.to_string(),
    TEST_PASSWORD.to_string(),
    vault_path.clone(),
    None,
  )
  .expect("private key import should succeed");

  let exported = export_wallet(
    wallet.meta.name.clone(),
    TEST_PASSWORD.to_string(),
    vault_path.clone(),
  )
  .expect("export wallet should succeed");

  assert_eq!(exported, TEST_PRIVATE_KEY);

  let _ = fs::remove_dir_all(vault_dir);
}

#[test]
fn export_wallet_rejects_wrong_password() {
  let (vault_dir, vault_path) = temp_vault("export-wallet-wrong-password");
  let wallet = import_wallet_mnemonic(
    "Test wallet".to_string(),
    TEST_MNEMONIC.to_string(),
    TEST_PASSWORD.to_string(),
    vault_path.clone(),
    None,
  )
  .expect("mnemonic import should succeed");

  let err = export_wallet(
    wallet.meta.name.clone(),
    "wrong_password".to_string(),
    vault_path.clone(),
  )
  .expect_err("export wallet with wrong password should fail");

  assert_eq!(err.reason, "password_incorrect");

  let _ = fs::remove_dir_all(vault_dir);
}

#[test]
fn export_wallet_rejects_empty_password() {
  let (vault_dir, vault_path) = temp_vault("export-wallet-empty-password");
  let wallet = import_wallet_mnemonic(
    "Test wallet".to_string(),
    TEST_MNEMONIC.to_string(),
    TEST_PASSWORD.to_string(),
    vault_path.clone(),
    None,
  )
  .expect("mnemonic import should succeed");

  let err = export_wallet(wallet.meta.name.clone(), "".to_string(), vault_path.clone())
    .expect_err("export wallet with empty password should fail");

  assert_eq!(err.reason, "password must not be empty");

  let _ = fs::remove_dir_all(vault_dir);
}

#[test]
fn export_wallet_rejects_nonexistent_wallet() {
  let (vault_dir, vault_path) = temp_vault("export-wallet-nonexistent");

  let err = export_wallet(
    "NonExistentWallet".to_string(),
    TEST_PASSWORD.to_string(),
    vault_path.clone(),
  )
  .expect_err("export nonexistent wallet should fail");

  // Check that error message indicates wallet not found
  // The exact message may vary, but should contain "not found" or indicate the wallet doesn't exist
  assert!(
    err.reason.to_lowercase().contains("not found")
      || err.reason.to_lowercase().contains("no wallets"),
    "expected 'not found' error, got: {}",
    err.reason
  );

  let _ = fs::remove_dir_all(vault_dir);
}

#[test]
fn export_wallet_works_with_wallet_id_prefix() {
  let (vault_dir, vault_path) = temp_vault("export-wallet-by-prefix");
  let wallet = import_wallet_mnemonic(
    "Test wallet".to_string(),
    TEST_MNEMONIC.to_string(),
    TEST_PASSWORD.to_string(),
    vault_path.clone(),
    None,
  )
  .expect("mnemonic import should succeed");

  // Use the first 8 characters of the wallet ID
  let id_prefix = &wallet.meta.id[..8];

  let exported = export_wallet(
    id_prefix.to_string(),
    TEST_PASSWORD.to_string(),
    vault_path.clone(),
  )
  .expect("export wallet by id prefix should succeed");

  assert_eq!(exported, TEST_MNEMONIC);

  let _ = fs::remove_dir_all(vault_dir);
}
