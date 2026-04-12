use tcx_common::parse_u64;
use tcx_constants::{CoinInfo, CurveType};
use tcx_eth::address::EthAddress;
use tcx_keystore::keystore::IdentityNetwork;
use tcx_keystore::Keystore as TcxKeystore;
use tcx_tron::TronAddress;

use crate::constants::{
  DEFAULT_ETH_DERIVATION_PATH, DEFAULT_ETH_MAINNET_CHAIN_ID, DEFAULT_ETH_TESTNET_CHAIN_ID,
  DEFAULT_TRON_DERIVATION_PATH, DEFAULT_TRON_MAINNET_CHAIN_ID, DEFAULT_TRON_TESTNET_CHAIN_ID,
};
use crate::error::{require_trimmed, CoreError, CoreResult, ResultExt};
use crate::strings::sanitize_optional_text;
use crate::types::{DerivationInput, WalletAccount};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum Chain {
  Ethereum,
  Tron,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct ResolvedDerivation {
  pub(crate) chain: Chain,
  pub(crate) network: IdentityNetwork,
  pub(crate) chain_id: String,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct DerivationRequest {
  pub(crate) resolved: ResolvedDerivation,
  pub(crate) derivation_path: String,
}

impl Chain {
  fn from_chain_id(chain_id: &str) -> CoreResult<Self> {
    let (namespace, _) = parse_caip2_chain_id(chain_id)?;
    match namespace.as_str() {
      "eip155" => Ok(Self::Ethereum),
      "tron" => Ok(Self::Tron),
      _ => Err(CoreError::new(format!(
        "unsupported chainId namespace `{namespace}`"
      ))),
    }
  }

  fn default_chain_id(self, network: IdentityNetwork) -> &'static str {
    match (self, network) {
      (Self::Ethereum, IdentityNetwork::Mainnet) => DEFAULT_ETH_MAINNET_CHAIN_ID,
      (Self::Ethereum, IdentityNetwork::Testnet) => DEFAULT_ETH_TESTNET_CHAIN_ID,
      (Self::Tron, IdentityNetwork::Mainnet) => DEFAULT_TRON_MAINNET_CHAIN_ID,
      (Self::Tron, IdentityNetwork::Testnet) => DEFAULT_TRON_TESTNET_CHAIN_ID,
    }
  }

  fn default_derivation_path(self) -> &'static str {
    match self {
      Self::Ethereum => DEFAULT_ETH_DERIVATION_PATH,
      Self::Tron => DEFAULT_TRON_DERIVATION_PATH,
    }
  }

  fn default_derivation_path_at_index(self, index: u32) -> String {
    if index == 0 {
      return self.default_derivation_path().to_string();
    }

    match self {
      Self::Ethereum => format!("m/44'/60'/0'/0/{index}"),
      Self::Tron => format!("m/44'/195'/0'/0/{index}"),
    }
  }

  pub(crate) fn coin_name(self) -> &'static str {
    match self {
      Self::Ethereum => "ETHEREUM",
      Self::Tron => "TRON",
    }
  }
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
    None => Ok(default_derivations(network, derivable, index.unwrap_or(0))),
  }
}

pub(crate) fn resolve_derivation(
  derivation: DerivationInput,
  wallet_network: IdentityNetwork,
  derivable: bool,
) -> CoreResult<DerivationRequest> {
  let chain_id = normalize_chain_id(derivation.chain_id)?;
  let chain = Chain::from_chain_id(&chain_id)?;
  let derivation_path = if derivable {
    sanitize_optional_text(derivation.derivation_path)
      .unwrap_or_else(|| chain.default_derivation_path().to_string())
  } else {
    String::new()
  };

  Ok(DerivationRequest {
    resolved: ResolvedDerivation {
      chain,
      network: resolve_derivation_network(wallet_network, derivation.network)?,
      chain_id,
    },
    derivation_path,
  })
}

fn default_derivations(
  network: IdentityNetwork,
  derivable: bool,
  index: u32,
) -> Vec<DerivationRequest> {
  [Chain::Ethereum, Chain::Tron]
    .into_iter()
    .map(|chain| DerivationRequest {
      resolved: ResolvedDerivation {
        chain,
        network,
        chain_id: chain.default_chain_id(network).to_string(),
      },
      derivation_path: if derivable {
        chain.default_derivation_path_at_index(index)
      } else {
        String::new()
      },
    })
    .collect()
}

fn derive_account(
  keystore: &mut TcxKeystore,
  request: &DerivationRequest,
) -> CoreResult<WalletAccount> {
  let coin_info = CoinInfo {
    chain_id: request.resolved.chain_id.clone(),
    coin: request.resolved.chain.coin_name().to_string(),
    derivation_path: request.derivation_path.clone(),
    curve: CurveType::SECP256k1,
    network: request.resolved.network.to_string(),
    seg_wit: String::new(),
    contract_code: String::new(),
  };

  let account = match request.resolved.chain {
    Chain::Ethereum => keystore.derive_coin::<EthAddress>(&coin_info),
    Chain::Tron => keystore.derive_coin::<TronAddress>(&coin_info),
  }
  .map_core_err()?;
  let chain_id = request.resolved.chain_id.clone();
  let address = account.address;

  Ok(WalletAccount {
    account_id: format!("{chain_id}:{address}"),
    chain_id,
    address,
    derivation_path: account.derivation_path,
  })
}

fn resolve_derivation_network(
  fallback_network: IdentityNetwork,
  network: Option<String>,
) -> CoreResult<IdentityNetwork> {
  match network.as_deref() {
    Some("MAINNET") => Ok(IdentityNetwork::Mainnet),
    Some("TESTNET") => Ok(IdentityNetwork::Testnet),
    Some(network) => Err(CoreError::new(format!("unknown network: {network}"))),
    None => Ok(fallback_network),
  }
}

fn normalize_chain_id(chain_id: String) -> CoreResult<String> {
  let chain_id = require_trimmed(chain_id, "chainId")?;
  let (namespace, reference) = parse_caip2_chain_id(&chain_id)?;
  Ok(format!("{namespace}:{reference}"))
}

fn parse_caip2_chain_id(chain_id: &str) -> CoreResult<(String, &str)> {
  let Some((namespace, reference)) = chain_id.split_once(':') else {
    return Err(CoreError::new(format!(
      "chainId must be a CAIP-2 chain id, received `{chain_id}`"
    )));
  };

  let namespace = namespace.to_ascii_lowercase();
  if namespace.is_empty()
    || reference.is_empty()
    || reference.contains(':')
    || !namespace
      .chars()
      .all(|char| char.is_ascii_lowercase() || char.is_ascii_digit() || char == '-')
    || !reference
      .chars()
      .all(|char| char.is_ascii_alphanumeric() || char == '-' || char == '_')
  {
    return Err(CoreError::new(format!(
      "chainId must be a valid CAIP-2 chain id, received `{chain_id}`"
    )));
  }

  Ok((namespace, reference))
}

pub(crate) fn ethereum_chain_reference(chain_id: &str) -> CoreResult<String> {
  let (namespace, reference) = parse_caip2_chain_id(chain_id)?;
  if namespace != "eip155" {
    return Err(CoreError::new(format!(
      "unsupported chainId namespace `{namespace}`"
    )));
  }

  parse_u64(reference).map_err(|_| {
    CoreError::new(format!(
      "chainId must use a numeric eip155 reference, received `{chain_id}`"
    ))
  })?;

  Ok(reference.to_string())
}
