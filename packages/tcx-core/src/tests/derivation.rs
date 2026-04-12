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

#[test]
fn caip2_chain_id_normalizes_namespace_to_lowercase() {
  let chain_id = Caip2ChainId::parse("EIP155:1").expect("chain id should parse");

  assert_eq!(chain_id.to_string(), "eip155:1");
}

#[test]
fn caip2_chain_id_rejects_invalid_reference_shapes() {
  let err = Caip2ChainId::parse("eip155:1:extra").expect_err("multiple separators should fail");
  assert_eq!(
    err.to_string(),
    "chainId must be a valid CAIP-2 chain id, received `eip155:1:extra`"
  );

  let err = Caip2ChainId::parse("eip155:bad/reference")
    .expect_err("invalid reference characters should fail");
  assert_eq!(
    err.to_string(),
    "chainId must be a valid CAIP-2 chain id, received `eip155:bad/reference`"
  );
}

#[test]
fn caip2_chain_id_rejects_non_numeric_eip155_reference() {
  let err = Caip2ChainId::parse("eip155:sepolia")
    .expect("chain id should parse structurally")
    .ethereum_reference()
    .expect_err("non-numeric eip155 reference should fail");

  assert_eq!(
    err.to_string(),
    "chainId must use a numeric eip155 reference, received `eip155:sepolia`"
  );
}

#[test]
fn resolve_network_uses_override_or_wallet_network() {
  let fallback = resolve_network(IdentityNetwork::Mainnet, None)
    .expect("missing override should use wallet network");
  assert_eq!(fallback, IdentityNetwork::Mainnet);

  let testnet = resolve_network(IdentityNetwork::Mainnet, Some("TESTNET".to_string()))
    .expect("override should win");
  assert_eq!(testnet, IdentityNetwork::Testnet);
}

#[test]
fn resolve_derivation_rejects_unknown_network_override() {
  let err = resolve_derivation(
    DerivationInput {
      chain_id: default_eth_mainnet_chain_id().to_string(),
      derivation_path: None,
      network: Some("DEVNET".to_string()),
    },
    IdentityNetwork::Mainnet,
    true,
  )
  .expect_err("unknown network should fail");

  assert_eq!(err.to_string(), "unknown network: DEVNET");
}

#[test]
fn default_derivation_paths_follow_chain_spec() {
  assert_eq!(default_eth_derivation_path(0), "m/44'/60'/0'/0/0");
  assert_eq!(default_eth_derivation_path(1), "m/44'/60'/0'/0/1");
  assert_eq!(default_tron_derivation_path(0), "m/44'/195'/0'/0/0");
  assert_eq!(default_tron_derivation_path(1), "m/44'/195'/0'/0/1");
}
