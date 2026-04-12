use tcx_eth::transaction::EthTxInput as TcxEthTxInput;
use tcx_keystore::Keystore as TcxKeystore;
use tcx_ton::transaction::TonRawTxIn;
use tcx_tron::transaction::TronTxInput;

use crate::derivation::ResolvedDerivation;
use crate::error::{CoreError, CoreResult};
use crate::types::{SignedMessage, SignedTransaction};

pub(crate) use caip2::Caip2ChainId;
pub(crate) use network::resolve_network;
pub(crate) use spec::Chain;

pub(crate) enum PreparedTransaction {
  Ethereum(Box<TcxEthTxInput>),
  Tron(TronTxInput),
  Ton(TonRawTxIn),
}

pub(crate) fn prepare_transaction(
  resolved: &ResolvedDerivation,
  tx_hex: &str,
) -> CoreResult<PreparedTransaction> {
  match resolved.chain {
    Chain::Ethereum => ethereum::prepare_transaction(tx_hex, &resolved.chain_id)
      .map(Box::new)
      .map(PreparedTransaction::Ethereum),
    Chain::Tron => tron::prepare_transaction(tx_hex).map(PreparedTransaction::Tron),
    Chain::Ton => ton::prepare_transaction(tx_hex).map(PreparedTransaction::Ton),
  }
}

pub(crate) fn sign_message(
  keystore: &mut TcxKeystore,
  resolved: &ResolvedDerivation,
  derivation_path: &str,
  message: &str,
) -> CoreResult<SignedMessage> {
  match resolved.chain {
    Chain::Ethereum => ethereum::sign_message(keystore, resolved, derivation_path, message),
    Chain::Tron => tron::sign_message(keystore, resolved, derivation_path, message),
    Chain::Ton => ton::sign_message(keystore, resolved, derivation_path, message),
  }
}

pub(crate) fn sign_transaction(
  keystore: &mut TcxKeystore,
  resolved: &ResolvedDerivation,
  derivation_path: &str,
  tx_data: PreparedTransaction,
) -> CoreResult<SignedTransaction> {
  match (resolved.chain, tx_data) {
    (Chain::Ethereum, PreparedTransaction::Ethereum(tx)) => {
      ethereum::sign_transaction(keystore, resolved, derivation_path, *tx)
    }
    (Chain::Tron, PreparedTransaction::Tron(tx)) => {
      tron::sign_transaction(keystore, resolved, derivation_path, tx)
    }
    (Chain::Ton, PreparedTransaction::Ton(tx)) => {
      ton::sign_transaction(keystore, resolved, derivation_path, tx)
    }
    _ => Err(CoreError::new("prepared transaction does not match chain")),
  }
}

mod caip2;
mod ethereum;
mod network;
mod spec;
mod ton;
mod tron;
