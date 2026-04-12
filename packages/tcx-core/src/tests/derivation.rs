use tcx_keystore::keystore::IdentityNetwork;

use super::*;
use crate::chain::{resolve_network, Caip2ChainId};
use crate::derivation::resolve_derivation;

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
        chain_id: default_eth_mainnet_chain_id().to_string(),
        derivation_path: Some(default_eth_derivation_path(0)),
        network: None,
      },
      DerivationInput {
        chain_id: default_eth_mainnet_chain_id().to_string(),
        derivation_path: Some(default_eth_derivation_path(1)),
        network: None,
      },
    ]),
  )
  .expect("derive accounts should succeed");

  assert_eq!(accounts.len(), 2);
  assert_eq!(accounts[0].chain_id, default_eth_mainnet_chain_id());
  assert_eq!(accounts[1].chain_id, default_eth_mainnet_chain_id());
  assert_eq!(accounts[0].derivation_path, default_eth_derivation_path(0));
  assert_eq!(accounts[1].derivation_path, default_eth_derivation_path(1));
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
