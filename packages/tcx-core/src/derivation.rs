use napi::{Error, Result};
use tcx_common::{parse_u64, ToHex};
use tcx_constants::{CoinInfo, CurveType};
use tcx_eth::address::EthAddress;
use tcx_keystore::keystore::IdentityNetwork;
use tcx_keystore::{Keystore as TcxKeystore, SignatureParameters};
use tcx_primitive::TypedPublicKey;
use tcx_tron::TronAddress;

use crate::constants::{
  DEFAULT_ETH_DERIVATION_PATH, DEFAULT_ETH_MAINNET_CHAIN_ID, DEFAULT_ETH_TESTNET_CHAIN_ID,
  DEFAULT_TRON_DERIVATION_PATH, DEFAULT_TRON_MAINNET_CHAIN_ID, DEFAULT_TRON_TESTNET_CHAIN_ID,
};
use crate::error::{require_trimmed, to_napi_err};
use crate::strings::{empty_to_none, sanitize_optional_text};
use crate::types::{DerivationInput, WalletAccount, WalletNetwork};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum ChainKind {
  Ethereum,
  Tron,
}

#[derive(Clone)]
pub(crate) struct ResolvedDerivation {
  pub(crate) chain_kind: ChainKind,
  pub(crate) network: IdentityNetwork,
  pub(crate) chain_id: String,
}

pub(crate) struct DerivationRequest {
  pub(crate) resolved: ResolvedDerivation,
  pub(crate) derivation_path: String,
}

pub(crate) fn build_signature_parameters(request: &DerivationRequest) -> SignatureParameters {
  SignatureParameters {
    curve: CurveType::SECP256k1,
    derivation_path: request.derivation_path.clone(),
    chain_type: chain_name(request.resolved.chain_kind).to_string(),
    network: request.resolved.network.to_string(),
    seg_wit: String::new(),
  }
}

pub(crate) fn derive_accounts_for_wallet(
  keystore: &mut TcxKeystore,
  network: IdentityNetwork,
  derivations: Option<Vec<DerivationInput>>,
  index: Option<u32>,
) -> Result<Vec<WalletAccount>> {
  let requests = resolve_derivations(derivations, network, keystore.derivable(), index)?;
  let mut accounts = Vec::with_capacity(requests.len());

  for request in requests {
    accounts.push(derive_account(keystore, &request)?);
  }

  Ok(accounts)
}

fn resolve_derivations(
  derivations: Option<Vec<DerivationInput>>,
  network: IdentityNetwork,
  derivable: bool,
  index: Option<u32>,
) -> Result<Vec<DerivationRequest>> {
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
) -> Result<DerivationRequest> {
  let chain_id = normalize_chain_id(derivation.chain_id)?;
  let resolved = ResolvedDerivation {
    chain_kind: chain_kind_from_chain_id(&chain_id)?,
    network: resolve_derivation_network(wallet_network, derivation.network)?,
    chain_id,
  };
  let derivation_path = if derivable {
    sanitize_optional_text(derivation.derivation_path)
      .unwrap_or_else(|| default_derivation_path(resolved.chain_kind).to_string())
  } else {
    String::new()
  };

  Ok(DerivationRequest {
    resolved,
    derivation_path,
  })
}

fn default_derivations(
  network: IdentityNetwork,
  derivable: bool,
  index: u32,
) -> Vec<DerivationRequest> {
  [ChainKind::Ethereum, ChainKind::Tron]
    .into_iter()
    .map(|chain_kind| {
      let resolved = ResolvedDerivation {
        chain_kind,
        network,
        chain_id: default_chain_id(chain_kind, network).to_string(),
      };
      let derivation_path = if derivable {
        default_derivation_path_at_index(chain_kind, index)
      } else {
        String::new()
      };

      DerivationRequest {
        resolved,
        derivation_path,
      }
    })
    .collect()
}

fn default_chain_id(chain_kind: ChainKind, network: IdentityNetwork) -> &'static str {
  match (chain_kind, network) {
    (ChainKind::Ethereum, IdentityNetwork::Mainnet) => DEFAULT_ETH_MAINNET_CHAIN_ID,
    (ChainKind::Ethereum, IdentityNetwork::Testnet) => DEFAULT_ETH_TESTNET_CHAIN_ID,
    (ChainKind::Tron, IdentityNetwork::Mainnet) => DEFAULT_TRON_MAINNET_CHAIN_ID,
    (ChainKind::Tron, IdentityNetwork::Testnet) => DEFAULT_TRON_TESTNET_CHAIN_ID,
  }
}

fn normalize_chain_id(chain_id: String) -> Result<String> {
  let chain_id = require_trimmed(chain_id, "chainId")?;
  let (namespace, reference) = parse_caip2_chain_id(&chain_id)?;
  Ok(format!("{namespace}:{reference}"))
}

fn parse_caip2_chain_id(chain_id: &str) -> Result<(String, &str)> {
  let Some((namespace, reference)) = chain_id.split_once(':') else {
    return Err(Error::from_reason(format!(
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
    return Err(Error::from_reason(format!(
      "chainId must be a valid CAIP-2 chain id, received `{chain_id}`"
    )));
  }

  Ok((namespace, reference))
}

fn chain_kind_from_chain_id(chain_id: &str) -> Result<ChainKind> {
  let (namespace, _) = parse_caip2_chain_id(chain_id)?;
  match namespace.as_str() {
    "eip155" => Ok(ChainKind::Ethereum),
    "tron" => Ok(ChainKind::Tron),
    _ => Err(Error::from_reason(format!(
      "unsupported chainId namespace `{namespace}`"
    ))),
  }
}

fn default_derivation_path(chain_kind: ChainKind) -> &'static str {
  match chain_kind {
    ChainKind::Ethereum => DEFAULT_ETH_DERIVATION_PATH,
    ChainKind::Tron => DEFAULT_TRON_DERIVATION_PATH,
  }
}

fn default_derivation_path_at_index(chain_kind: ChainKind, index: u32) -> String {
  if index == 0 {
    return default_derivation_path(chain_kind).to_string();
  }

  match chain_kind {
    ChainKind::Ethereum => format!("m/44'/60'/0'/0/{index}"),
    ChainKind::Tron => format!("m/44'/195'/0'/0/{index}"),
  }
}

fn derive_account(
  keystore: &mut TcxKeystore,
  request: &DerivationRequest,
) -> Result<WalletAccount> {
  let coin_info = CoinInfo {
    chain_id: request.resolved.chain_id.clone(),
    coin: chain_name(request.resolved.chain_kind).to_string(),
    derivation_path: request.derivation_path.clone(),
    curve: CurveType::SECP256k1,
    network: request.resolved.network.to_string(),
    seg_wit: String::new(),
    contract_code: String::new(),
  };

  let account = match request.resolved.chain_kind {
    ChainKind::Ethereum => keystore.derive_coin::<EthAddress>(&coin_info),
    ChainKind::Tron => keystore.derive_coin::<TronAddress>(&coin_info),
  }
  .map_err(to_napi_err)?;

  Ok(WalletAccount {
    chain_id: request.resolved.chain_id.clone(),
    address: account.address,
    public_key: encode_public_key(&account.public_key),
    derivation_path: empty_to_none(account.derivation_path),
    ext_pub_key: empty_to_none(account.ext_pub_key),
  })
}

fn chain_name(chain_kind: ChainKind) -> &'static str {
  match chain_kind {
    ChainKind::Ethereum => "ETHEREUM",
    ChainKind::Tron => "TRON",
  }
}

fn encode_public_key(public_key: &TypedPublicKey) -> String {
  public_key.to_bytes().to_hex()
}

fn resolve_derivation_network(
  fallback_network: IdentityNetwork,
  network: Option<String>,
) -> Result<IdentityNetwork> {
  match network {
    Some(network) => WalletNetwork::from_str(&network)
      .map(Into::into)
      .ok_or_else(|| Error::from_reason(format!("unknown network: {network}"))),
    None => Ok(fallback_network),
  }
}

pub(crate) fn ethereum_chain_reference(chain_id: &str) -> Result<String> {
  let (namespace, reference) = parse_caip2_chain_id(chain_id)?;
  if namespace != "eip155" {
    return Err(Error::from_reason(format!(
      "unsupported chainId namespace `{namespace}`"
    )));
  }

  parse_u64(reference).map_err(|_| {
    Error::from_reason(format!(
      "chainId must use a numeric eip155 reference, received `{chain_id}`"
    ))
  })?;

  Ok(reference.to_string())
}
