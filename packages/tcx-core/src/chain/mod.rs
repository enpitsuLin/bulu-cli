use crate::derivation::ResolvedDerivation;
use crate::error::CoreResult;
use crate::types::{SignedMessage, SignedTransactionResult};

pub(crate) use caip2::Caip2ChainId;
pub(crate) use network::resolve_network;

pub(crate) trait ChainSigner: std::fmt::Debug + Send + Sync {
  /// Coin identifier used by the underlying tcx library (e.g. "ETHEREUM", "TRON").
  fn coin_name(&self) -> &'static str;

  /// CAIP-2 namespace (e.g. "eip155", "tron").
  fn namespace(&self) -> &'static str;

  /// Default CAIP-2 chainId for the given network.
  fn default_chain_id(&self, network: tcx_keystore::keystore::IdentityNetwork) -> &'static str;

  /// BIP-44 derivation path for the account at `index`.
  fn default_derivation_path(&self, index: u32) -> String;

  /// Derive a chain-specific address from the keystore.
  fn derive_address(
    &self,
    keystore: &mut tcx_keystore::Keystore,
    derivation_path: &str,
    network: &str,
  ) -> CoreResult<String>;

  /// Sign raw message bytes according to the chain's message-signing standard.
  /// The implementation is responsible for any required prefixing/hashing.
  fn sign_message(
    &self,
    keystore: &mut tcx_keystore::Keystore,
    derivation_path: &str,
    message: &[u8],
  ) -> CoreResult<SignedMessage>;

  /// Sign raw transaction bytes and return the recoverable signature.
  fn sign_transaction(
    &self,
    keystore: &mut tcx_keystore::Keystore,
    resolved: &ResolvedDerivation,
    derivation_path: &str,
    tx_bytes: &[u8],
  ) -> CoreResult<SignedTransactionResult>;

  /// Assemble the fully-encoded signed transaction ready for broadcast.
  /// Chains that do not support this must explicitly override and return `Ok(None)`.
  fn encode_signed_transaction(
    &self,
    resolved: &ResolvedDerivation,
    tx_bytes: &[u8],
    signature: &[u8],
  ) -> CoreResult<Option<String>> {
    let _ = (resolved, tx_bytes, signature);
    Err(crate::error::CoreError::new(
      "encode_signed_transaction is not implemented for this chain",
    ))
  }
}

pub(crate) const ALL_SIGNERS: &[&'static (dyn ChainSigner + Send + Sync)] =
  &[&ethereum::ETHEREUM_SIGNER, &tron::TRON_SIGNER];

pub(crate) fn resolve_signer(
  chain_id: &Caip2ChainId,
) -> CoreResult<&'static (dyn ChainSigner + Send + Sync)> {
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
pub(crate) mod ethereum;
mod network;
pub(crate) mod tron;
