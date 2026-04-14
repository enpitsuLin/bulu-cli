use tcx_keystore::keystore::IdentityNetwork;
use tcx_keystore::Keystore as TcxKeystore;

use crate::derivation::ResolvedDerivation;
use crate::error::CoreResult;
use crate::types::{SignedMessage, SignedTransactionResult};

pub(crate) use caip2::Caip2ChainId;
pub(crate) use network::resolve_network;
pub(crate) use spec::Chain;

pub(crate) trait ChainSigner {
  fn coin_name(&self) -> &'static str;
  fn namespace(&self) -> &'static str;
  fn default_chain_id(&self, network: IdentityNetwork) -> &'static str;
  fn default_derivation_path(&self, index: u32) -> String;

  fn derive_address(
    &self,
    keystore: &mut TcxKeystore,
    derivation_path: &str,
    network: &str,
  ) -> CoreResult<String>;

  fn sign_message(
    &self,
    keystore: &mut TcxKeystore,
    resolved: &ResolvedDerivation,
    derivation_path: &str,
    message: &str,
  ) -> CoreResult<SignedMessage>;

  fn sign_transaction(
    &self,
    keystore: &mut TcxKeystore,
    resolved: &ResolvedDerivation,
    derivation_path: &str,
    tx_hex: &str,
  ) -> CoreResult<SignedTransactionResult>;
}

impl ChainSigner for Chain {
  fn coin_name(&self) -> &'static str {
    match self {
      Chain::Ethereum => "ETHEREUM",
      Chain::Tron => "TRON",
    }
  }

  fn namespace(&self) -> &'static str {
    match self {
      Chain::Ethereum => "eip155",
      Chain::Tron => "tron",
    }
  }

  fn default_chain_id(&self, network: IdentityNetwork) -> &'static str {
    match (self, network) {
      (Chain::Ethereum, IdentityNetwork::Mainnet) => "eip155:1",
      (Chain::Ethereum, IdentityNetwork::Testnet) => "eip155:11155111",
      (Chain::Tron, IdentityNetwork::Mainnet) => "tron:0x2b6653dc",
      (Chain::Tron, IdentityNetwork::Testnet) => "tron:0xcd8690dc",
    }
  }

  fn default_derivation_path(&self, index: u32) -> String {
    let slip44 = match self {
      Chain::Ethereum => 60,
      Chain::Tron => 195,
    };
    format!("m/44'/{}'/0'/0/{index}", slip44)
  }

  fn derive_address(
    &self,
    keystore: &mut TcxKeystore,
    derivation_path: &str,
    network: &str,
  ) -> CoreResult<String> {
    match self {
      Chain::Ethereum => ethereum::derive_eth_address(keystore, derivation_path, network),
      Chain::Tron => tron::derive_tron_address(keystore, derivation_path, network),
    }
  }

  fn sign_message(
    &self,
    keystore: &mut TcxKeystore,
    resolved: &ResolvedDerivation,
    derivation_path: &str,
    message: &str,
  ) -> CoreResult<SignedMessage> {
    match self {
      Chain::Ethereum => ethereum::sign_eth_message(
        keystore,
        derivation_path,
        &resolved.network.to_string(),
        message,
      ),
      Chain::Tron => tron::sign_tron_message(
        keystore,
        derivation_path,
        &resolved.network.to_string(),
        message,
      ),
    }
  }

  fn sign_transaction(
    &self,
    keystore: &mut TcxKeystore,
    resolved: &ResolvedDerivation,
    derivation_path: &str,
    tx_hex: &str,
  ) -> CoreResult<SignedTransactionResult> {
    match self {
      Chain::Ethereum => ethereum::sign_eth_transaction(
        keystore,
        derivation_path,
        &resolved.network.to_string(),
        &resolved.chain_id,
        tx_hex,
      ),
      Chain::Tron => tron::sign_tron_transaction(
        keystore,
        derivation_path,
        &resolved.network.to_string(),
        tx_hex,
      ),
    }
  }
}

mod caip2;
mod ethereum;
mod network;
mod spec;
mod tron;
