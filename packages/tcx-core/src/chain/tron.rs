use std::any::Any;

use tcx_constants::CurveType;
use tcx_keystore::{Keystore as TcxKeystore, MessageSigner, SignatureParameters, TransactionSigner};
use tcx_tron::transaction::{
  TronMessageInput as TcxTronMessageInput, TronMessageOutput as TcxTronMessageOutput, TronTxInput,
  TronTxOutput as TcxTronTxOutput,
};

use crate::derivation::{Chain, ResolvedDerivation};
use crate::error::{CoreError, CoreResult, ResultExt};
use crate::strings::strip_hex_prefix;
use crate::types::{SignedMessage, TronMessageInput, TronSignedTransaction};

use super::{ChainSigner, SignedTransaction};

pub(crate) struct TronSigner;

impl ChainSigner for TronSigner {
  fn parse_transaction(&self, tx_hex: &str, _chain_id: &str) -> CoreResult<Box<dyn Any>> {
    // Tron transactions are passed as raw hex bytes without additional parsing
    let raw_data = strip_hex_prefix(tx_hex).to_string();
    Ok(Box::new(TronTxInput { raw_data }))
  }

  fn sign_message(
    &self,
    keystore: &mut TcxKeystore,
    resolved: &ResolvedDerivation,
    derivation_path: &str,
    message: &str,
  ) -> CoreResult<SignedMessage> {
    let params = SignatureParameters {
      curve: CurveType::SECP256k1,
      derivation_path: derivation_path.to_string(),
      chain_type: Chain::Tron.coin_name().to_string(),
      network: resolved.network.to_string(),
      seg_wit: String::new(),
    };
    let signed: TcxTronMessageOutput = keystore
      .sign_message(
        &params,
        &TcxTronMessageInput::from(TronMessageInput {
          value: message.to_string(),
          header: Some("TRON".to_string()),
          version: Some(1),
        }),
      )
      .map_core_err()?;
    Ok(SignedMessage {
      signature: signed.signature,
    })
  }

  fn sign_transaction(
    &self,
    keystore: &mut TcxKeystore,
    resolved: &ResolvedDerivation,
    derivation_path: &str,
    tx_data: Box<dyn Any>,
  ) -> CoreResult<SignedTransaction> {
    let tx = tx_data
      .downcast::<TronTxInput>()
      .map_err(|_| CoreError::new("invalid Tron transaction data"))?;
    let params = SignatureParameters {
      curve: CurveType::SECP256k1,
      derivation_path: derivation_path.to_string(),
      chain_type: Chain::Tron.coin_name().to_string(),
      network: resolved.network.to_string(),
      seg_wit: String::new(),
    };
    let signed: TcxTronTxOutput = keystore.sign_transaction(&params, &*tx).map_core_err()?;
    Ok(SignedTransaction::Tron(TronSignedTransaction {
      signatures: signed.signatures,
    }))
  }
}
