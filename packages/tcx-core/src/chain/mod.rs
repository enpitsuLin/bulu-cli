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

impl Chain {
  pub(crate) fn signer(&self) -> &'static dyn ChainSigner {
    match self {
      Chain::Ethereum => &ethereum::ETHEREUM_SIGNER,
      Chain::Tron => &tron::TRON_SIGNER,
    }
  }
}

mod caip2;
mod ethereum;
mod network;
mod spec;
mod tron;
