use tcx_keystore::keystore::IdentityNetwork;

use crate::error::{CoreError, CoreResult};

use super::Caip2ChainId;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum Chain {
  Ethereum,
  Tron,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct ChainSpec {
  coin_name: &'static str,
  namespace: &'static str,
  default_mainnet_chain_id: &'static str,
  default_testnet_chain_id: &'static str,
  slip44_coin_type: u32,
}

const ETHEREUM_SPEC: ChainSpec = ChainSpec {
  coin_name: "ETHEREUM",
  namespace: "eip155",
  default_mainnet_chain_id: "eip155:1",
  default_testnet_chain_id: "eip155:11155111",
  slip44_coin_type: 60,
};

const TRON_SPEC: ChainSpec = ChainSpec {
  coin_name: "TRON",
  namespace: "tron",
  default_mainnet_chain_id: "tron:0x2b6653dc",
  default_testnet_chain_id: "tron:0xcd8690dc",
  slip44_coin_type: 195,
};

impl Chain {
  pub(crate) const ALL: [Self; 2] = [Self::Ethereum, Self::Tron];

  pub(crate) fn from_caip2(chain_id: &Caip2ChainId) -> CoreResult<Self> {
    match chain_id.namespace() {
      namespace if namespace == ETHEREUM_SPEC.namespace => Ok(Self::Ethereum),
      namespace if namespace == TRON_SPEC.namespace => Ok(Self::Tron),
      namespace => Err(CoreError::new(format!(
        "unsupported chainId namespace `{namespace}`"
      ))),
    }
  }

  pub(crate) fn coin_name(self) -> &'static str {
    self.spec().coin_name()
  }

  pub(crate) fn default_chain_id(self, network: IdentityNetwork) -> &'static str {
    self.spec().default_chain_id(network)
  }

  pub(crate) fn default_derivation_path(self, index: u32) -> String {
    self.spec().default_derivation_path(index)
  }

  fn spec(self) -> &'static ChainSpec {
    match self {
      Self::Ethereum => &ETHEREUM_SPEC,
      Self::Tron => &TRON_SPEC,
    }
  }
}

impl ChainSpec {
  pub(crate) fn coin_name(&self) -> &'static str {
    self.coin_name
  }

  pub(crate) fn default_chain_id(&self, network: IdentityNetwork) -> &'static str {
    match network {
      IdentityNetwork::Mainnet => self.default_mainnet_chain_id,
      IdentityNetwork::Testnet => self.default_testnet_chain_id,
    }
  }

  pub(crate) fn default_derivation_path(&self, index: u32) -> String {
    format!("m/44'/{}'/0'/0/{index}", self.slip44_coin_type)
  }
}
