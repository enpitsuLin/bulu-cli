use tcx_keystore::keystore::IdentityNetwork;
use tcx_keystore::Keystore as TcxKeystore;

use crate::chain::{resolve_network, Caip2ChainId, Chain};
use crate::error::CoreResult;
use crate::strings::sanitize_optional_text;
use crate::types::{DerivationInput, WalletAccount};

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct ResolvedDerivation {
  pub(crate) chain: Chain,
  pub(crate) network: IdentityNetwork,
  pub(crate) chain_id: Caip2ChainId,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct DerivationRequest {
  pub(crate) resolved: ResolvedDerivation,
  pub(crate) derivation_path: String,
}

pub(crate) fn derive_accounts_for_wallet(
  keystore: &mut TcxKeystore,
  network: IdentityNetwork,
  derivations: Option<Vec<DerivationInput>>,
  index: Option<u32>,
) -> CoreResult<Vec<WalletAccount>> {
  let requests = resolve_derivations(derivations, network, keystore.derivable(), index)?;

  requests
    .iter()
    .map(|request| derive_account(keystore, request))
    .collect()
}

fn resolve_derivations(
  derivations: Option<Vec<DerivationInput>>,
  network: IdentityNetwork,
  derivable: bool,
  index: Option<u32>,
) -> CoreResult<Vec<DerivationRequest>> {
  match derivations.filter(|items| !items.is_empty()) {
    Some(items) => items
      .into_iter()
      .map(|item| resolve_derivation(item, network, derivable))
      .collect(),
    None => default_derivations(network, derivable, index.unwrap_or(0)),
  }
}

pub(crate) fn resolve_derivation(
  derivation: DerivationInput,
  wallet_network: IdentityNetwork,
  derivable: bool,
) -> CoreResult<DerivationRequest> {
  let chain_id = Caip2ChainId::parse_input(derivation.chain_id)?;
  let chain = Chain::from_caip2(&chain_id)?;
  let derivation_path = if derivable {
    sanitize_optional_text(derivation.derivation_path)
      .unwrap_or_else(|| chain.signer().default_derivation_path(0))
  } else {
    String::new()
  };

  Ok(DerivationRequest {
    resolved: ResolvedDerivation {
      chain,
      network: resolve_network(wallet_network, derivation.network)?,
      chain_id,
    },
    derivation_path,
  })
}

fn default_derivations(
  network: IdentityNetwork,
  derivable: bool,
  index: u32,
) -> CoreResult<Vec<DerivationRequest>> {
  Chain::ALL
    .into_iter()
    .map(|chain| {
      Ok(DerivationRequest {
        resolved: ResolvedDerivation {
          chain,
          network,
          chain_id: Caip2ChainId::parse(chain.signer().default_chain_id(network))?,
        },
        derivation_path: if derivable {
          chain.signer().default_derivation_path(index)
        } else {
          String::new()
        },
      })
    })
    .collect()
}

fn derive_account(
  keystore: &mut TcxKeystore,
  request: &DerivationRequest,
) -> CoreResult<WalletAccount> {
  let chain_id = request.resolved.chain_id.to_string();
  let address = request.resolved.chain.signer().derive_address(
    keystore,
    &request.derivation_path,
    &request.resolved.network.to_string(),
  )?;

  Ok(WalletAccount {
    account_id: format!("{chain_id}:{address}"),
    chain_id,
    address,
    derivation_path: request.derivation_path.clone(),
  })
}

#[cfg(test)]
mod tests {
  use std::env;
  use std::fs;
  use std::path::PathBuf;
  use std::time::{SystemTime, UNIX_EPOCH};

  use tcx_keystore::keystore::IdentityNetwork;

  use super::resolve_derivation;
  use crate::chain::Chain;
  use crate::types::DerivationInput;
  use crate::wallet::{derive_accounts, import_wallet_mnemonic};

  const TEST_PASSWORD: &str = "imToken";
  const TEST_MNEMONIC: &str =
    "inject kidney empty canal shadow pact comfort wife crush horse wife sketch";

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

  fn keystore_json(wallet: &crate::types::WalletInfo) -> String {
    wallet
      .keystore
      .to_json_string()
      .expect("keystore JSON should serialize")
  }

  fn default_eth_mainnet_chain_id() -> &'static str {
    Chain::Ethereum.default_chain_id(IdentityNetwork::Mainnet)
  }

  fn default_eth_derivation_path(index: u32) -> String {
    Chain::Ethereum.default_derivation_path(index)
  }

  fn default_tron_derivation_path(index: u32) -> String {
    Chain::Tron.default_derivation_path(index)
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

    assert_eq!(err.to_string(), "unsupported chainId namespace `bip122`");

    let _ = fs::remove_dir_all(vault_dir);
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
}
