use tcx_keystore::keystore::IdentityNetwork;

use crate::error::{CoreError, CoreResult};

pub(crate) fn parse_network(network: &str) -> CoreResult<IdentityNetwork> {
  match network {
    "MAINNET" => Ok(IdentityNetwork::Mainnet),
    "TESTNET" => Ok(IdentityNetwork::Testnet),
    _ => Err(CoreError::new(format!("unknown network: {network}"))),
  }
}

pub(crate) fn resolve_network(
  fallback_network: IdentityNetwork,
  network: Option<String>,
) -> CoreResult<IdentityNetwork> {
  match network {
    Some(network) => parse_network(&network),
    None => Ok(fallback_network),
  }
}
