use tcx_constants::CurveType;
use tcx_keystore::keystore::IdentityNetwork;
use tonlib_core::wallet::WALLET_V5R1_CODE;

use crate::error::{CoreError, CoreResult};

use super::Caip2ChainId;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum Chain {
  Ethereum,
  Tron,
  Ton,
}

#[derive(Clone, Copy, Debug, PartialEq)]
struct ChainSpec {
  coin_name: &'static str,
  namespace: &'static str,
  default_mainnet_chain_id: &'static str,
  default_testnet_chain_id: &'static str,
  curve: CurveType,
  slip44_coin_type: u32,
  derivation_style: DerivationStyle,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum DerivationStyle {
  AddressIndex,
  AccountIndex,
}

const ETHEREUM_SPEC: ChainSpec = ChainSpec {
  coin_name: "ETHEREUM",
  namespace: "eip155",
  default_mainnet_chain_id: "eip155:1",
  default_testnet_chain_id: "eip155:11155111",
  curve: CurveType::SECP256k1,
  slip44_coin_type: 60,
  derivation_style: DerivationStyle::AddressIndex,
};

const TRON_SPEC: ChainSpec = ChainSpec {
  coin_name: "TRON",
  namespace: "tron",
  default_mainnet_chain_id: "tron:0x2b6653dc",
  default_testnet_chain_id: "tron:0xcd8690dc",
  curve: CurveType::SECP256k1,
  slip44_coin_type: 195,
  derivation_style: DerivationStyle::AddressIndex,
};

const TON_SPEC: ChainSpec = ChainSpec {
  coin_name: "TON",
  namespace: "ton",
  default_mainnet_chain_id: "ton:-239",
  default_testnet_chain_id: "ton:-3",
  curve: CurveType::ED25519,
  slip44_coin_type: 607,
  derivation_style: DerivationStyle::AccountIndex,
};

impl Chain {
  pub(crate) const ALL: [Self; 3] = [Self::Ethereum, Self::Tron, Self::Ton];

  pub(crate) fn from_caip2(chain_id: &Caip2ChainId) -> CoreResult<Self> {
    match chain_id.namespace() {
      namespace if namespace == ETHEREUM_SPEC.namespace => Ok(Self::Ethereum),
      namespace if namespace == TRON_SPEC.namespace => Ok(Self::Tron),
      namespace if namespace == TON_SPEC.namespace => Ok(Self::Ton),
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

  pub(crate) fn curve(self) -> CurveType {
    self.spec().curve()
  }

  pub(crate) fn default_derivation_path(self, index: u32) -> String {
    self.spec().default_derivation_path(index)
  }

  pub(crate) fn contract_code(self) -> String {
    match self {
      Self::Ton => WALLET_V5R1_CODE.to_string(),
      _ => String::new(),
    }
  }

  fn spec(self) -> &'static ChainSpec {
    match self {
      Self::Ethereum => &ETHEREUM_SPEC,
      Self::Tron => &TRON_SPEC,
      Self::Ton => &TON_SPEC,
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

  pub(crate) fn curve(&self) -> CurveType {
    self.curve
  }

  pub(crate) fn default_derivation_path(&self, index: u32) -> String {
    match self.derivation_style {
      DerivationStyle::AddressIndex => format!("m/44'/{}'/0'/0/{index}", self.slip44_coin_type),
      DerivationStyle::AccountIndex => format!("m/44'/{}'/{index}'", self.slip44_coin_type),
    }
  }
}
