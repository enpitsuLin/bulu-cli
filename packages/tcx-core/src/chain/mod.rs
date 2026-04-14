use crate::derivation::ResolvedDerivation;
use crate::error::CoreResult;
use crate::types::{SignedMessage, SignedTransactionResult};

pub(crate) use caip2::Caip2ChainId;
pub(crate) use network::resolve_network;

pub(crate) trait ChainSigner: std::fmt::Debug {
  fn coin_name(&self) -> &'static str;
  fn namespace(&self) -> &'static str;
  fn default_chain_id(&self, network: tcx_keystore::keystore::IdentityNetwork) -> &'static str;
  fn default_derivation_path(&self, index: u32) -> String;

  fn derive_address(
    &self,
    keystore: &mut tcx_keystore::Keystore,
    derivation_path: &str,
    network: &str,
  ) -> CoreResult<String>;

  fn sign_message(
    &self,
    keystore: &mut tcx_keystore::Keystore,
    resolved: &ResolvedDerivation,
    derivation_path: &str,
    message: &str,
  ) -> CoreResult<SignedMessage>;

  fn sign_transaction(
    &self,
    keystore: &mut tcx_keystore::Keystore,
    resolved: &ResolvedDerivation,
    derivation_path: &str,
    tx_hex: &str,
  ) -> CoreResult<SignedTransactionResult>;
}

pub(crate) const ALL_SIGNERS: &[&'static dyn ChainSigner] =
  &[&ethereum::ETHEREUM_SIGNER, &tron::TRON_SIGNER];

pub(crate) fn resolve_signer(chain_id: &Caip2ChainId) -> CoreResult<&'static dyn ChainSigner> {
  match chain_id.namespace() {
    namespace if namespace == ethereum::ETHEREUM_SIGNER.namespace() => {
      Ok(&ethereum::ETHEREUM_SIGNER)
    }
    namespace if namespace == tron::TRON_SIGNER.namespace() => Ok(&tron::TRON_SIGNER),
    namespace => Err(crate::error::CoreError::new(format!(
      "unsupported chainId namespace `{namespace}`"
    ))),
  }
}

mod caip2;
mod ethereum;
mod network;
mod spec;
mod tron;
