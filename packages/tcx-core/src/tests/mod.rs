use napi::Either;
use serde_json::Value;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tcx_common::ToHex;
use tcx_eth::transaction::EthTxInput as TcxEthTxInput;
use tcx_eth::transaction_types::Transaction as TcxEthTransaction;
use tcx_keystore::keystore::IdentityNetwork;

use super::*;
use crate::chain::Chain;

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

fn default_eth_mainnet_chain_id() -> &'static str {
  Chain::Ethereum.default_chain_id(IdentityNetwork::Mainnet)
}

fn default_tron_mainnet_chain_id() -> &'static str {
  Chain::Tron.default_chain_id(IdentityNetwork::Mainnet)
}

fn default_ton_mainnet_chain_id() -> &'static str {
  Chain::Ton.default_chain_id(IdentityNetwork::Mainnet)
}

fn default_ton_testnet_chain_id() -> &'static str {
  Chain::Ton.default_chain_id(IdentityNetwork::Testnet)
}

fn default_eth_derivation_path(index: u32) -> String {
  Chain::Ethereum.default_derivation_path(index)
}

fn default_tron_derivation_path(index: u32) -> String {
  Chain::Tron.default_derivation_path(index)
}

fn default_ton_derivation_path(index: u32) -> String {
  Chain::Ton.default_derivation_path(index)
}

mod derivation;
mod signing;
mod wallet;
