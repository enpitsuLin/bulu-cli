use crate::derivation::ResolvedDerivation;
use crate::error::CoreResult;
use crate::types::SignedMessage;
use tcx_keystore::Keystore as TcxKeystore;

/// Transaction signing result enum
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum SignedTransaction {
  Ethereum(crate::types::EthSignedTransaction),
  Tron(crate::types::TronSignedTransaction),
}

/// Chain signer trait that abstracts signing functionality for different blockchains
pub(crate) trait ChainSigner {
  /// Parse transaction input from hex string
  fn parse_transaction(&self, tx_hex: &str, chain_id: &str) -> CoreResult<Box<dyn std::any::Any>>;

  /// Sign a message
  fn sign_message(
    &self,
    keystore: &mut TcxKeystore,
    resolved: &ResolvedDerivation,
    derivation_path: &str,
    message: &str,
  ) -> CoreResult<SignedMessage>;

  /// Sign a transaction
  fn sign_transaction(
    &self,
    keystore: &mut TcxKeystore,
    resolved: &ResolvedDerivation,
    derivation_path: &str,
    tx_data: Box<dyn std::any::Any>,
  ) -> CoreResult<SignedTransaction>;
}

/// Get the chain signer implementation for a specific chain
pub(crate) fn get_chain_signer(chain: crate::derivation::Chain) -> Box<dyn ChainSigner> {
  match chain {
    crate::derivation::Chain::Ethereum => Box::new(ethereum::EthereumSigner),
    crate::derivation::Chain::Tron => Box::new(tron::TronSigner),
  }
}

mod ethereum;
mod tron;
