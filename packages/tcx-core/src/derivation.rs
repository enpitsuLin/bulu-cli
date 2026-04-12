use tcx_constants::{CoinInfo, CurveType};
use tcx_eth::address::EthAddress;
use tcx_keystore::keystore::IdentityNetwork;
use tcx_keystore::Keystore as TcxKeystore;
use tcx_ton::address::TonAddress as TcxTonAddress;
use tcx_tron::TronAddress;

use crate::chain::{resolve_network, Caip2ChainId, Chain};
use crate::error::{CoreResult, ResultExt};
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
  let requests = resolve_derivations(
    derivations,
    network,
    keystore.derivable(),
    keystore.get_curve(),
    index,
  )?;

  requests
    .iter()
    .map(|request| derive_account(keystore, request))
    .collect()
}

fn resolve_derivations(
  derivations: Option<Vec<DerivationInput>>,
  network: IdentityNetwork,
  derivable: bool,
  wallet_curve: Option<CurveType>,
  index: Option<u32>,
) -> CoreResult<Vec<DerivationRequest>> {
  match derivations.filter(|items| !items.is_empty()) {
    Some(items) => items
      .into_iter()
      .map(|item| resolve_derivation(item, network, derivable))
      .collect(),
    None => default_derivations(network, derivable, wallet_curve, index.unwrap_or(0)),
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
      .unwrap_or_else(|| chain.default_derivation_path(0))
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
  wallet_curve: Option<CurveType>,
  index: u32,
) -> CoreResult<Vec<DerivationRequest>> {
  default_chains(derivable, wallet_curve)
    .into_iter()
    .map(|chain| {
      Ok(DerivationRequest {
        resolved: ResolvedDerivation {
          chain,
          network,
          chain_id: Caip2ChainId::parse(chain.default_chain_id(network))?,
        },
        derivation_path: if derivable {
          chain.default_derivation_path(index)
        } else {
          String::new()
        },
      })
    })
    .collect()
}

fn default_chains(derivable: bool, wallet_curve: Option<CurveType>) -> Vec<Chain> {
  if derivable {
    return Chain::ALL.into_iter().collect();
  }

  match wallet_curve {
    Some(CurveType::SECP256k1) => vec![Chain::Ethereum, Chain::Tron],
    Some(CurveType::ED25519) => vec![Chain::Ton],
    _ => Vec::new(),
  }
}

fn derive_account(
  keystore: &mut TcxKeystore,
  request: &DerivationRequest,
) -> CoreResult<WalletAccount> {
  let chain_id = request.resolved.chain_id.to_string();
  let coin_info = CoinInfo {
    chain_id: chain_id.clone(),
    coin: request.resolved.chain.coin_name().to_string(),
    derivation_path: request.derivation_path.clone(),
    curve: request.resolved.chain.curve(),
    network: request.resolved.network.to_string(),
    seg_wit: String::new(),
    contract_code: request.resolved.chain.contract_code(),
  };

  let account = match request.resolved.chain {
    Chain::Ethereum => keystore.derive_coin::<EthAddress>(&coin_info),
    Chain::Tron => keystore.derive_coin::<TronAddress>(&coin_info),
    Chain::Ton => keystore.derive_coin::<TcxTonAddress>(&coin_info),
  }
  .map_core_err()?;
  let address = account.address;

  Ok(WalletAccount {
    account_id: format!("{chain_id}:{address}"),
    chain_id,
    address,
    derivation_path: account.derivation_path,
  })
}
