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

#[cfg(test)]
mod tests {
  use tcx_keystore::keystore::IdentityNetwork;

  use super::resolve_network;

  #[test]
  fn resolve_network_uses_override_or_wallet_network() {
    let fallback = resolve_network(IdentityNetwork::Mainnet, None)
      .expect("missing override should use wallet network");
    assert_eq!(fallback, IdentityNetwork::Mainnet);

    let testnet = resolve_network(IdentityNetwork::Mainnet, Some("TESTNET".to_string()))
      .expect("override should win");
    assert_eq!(testnet, IdentityNetwork::Testnet);
  }
}
