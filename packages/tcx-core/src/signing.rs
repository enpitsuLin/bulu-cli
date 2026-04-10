use napi::{Either, Result};
use napi_derive::napi;
use tcx_eth::transaction::{
  EthMessageInput as TcxEthMessageInput, EthMessageOutput as TcxEthMessageOutput,
  EthTxOutput as TcxEthTxOutput,
};
use tcx_keystore::{Keystore as TcxKeystore, MessageSigner, TransactionSigner};
use tcx_tron::transaction::{
  TronMessageInput as TcxTronMessageInput, TronMessageOutput as TcxTronMessageOutput,
  TronTxInput as TcxTronTxInput, TronTxOutput as TcxTronTxOutput,
};

use crate::derivation::{build_signature_parameters, resolve_derivation, ChainKind};
use crate::error::{require_non_empty, require_trimmed, to_napi_err};
use crate::ethereum::parse_eth_transaction_hex;
use crate::strings::strip_hex_prefix;
use crate::types::{
  DerivationInput, EthMessageInput, EthMessageSignatureType, EthSignedTransaction, SignedMessage,
  TronMessageInput, TronSignedTransaction,
};
use crate::vault;
use crate::wallet::with_unlocked_keystore;



#[napi(js_name = "signMessage")]
/// Signs a plain chain-specific message using the default chain conventions.
///
/// `chain_id` selects the signer implementation. Ethereum uses personal-sign
/// semantics, while Tron uses the default TRON message header and version.
///
/// `name` is used to find the wallet file in the vault directory.
pub fn sign_message(
  name: String,
  chain_id: String,
  message: String,
  password: String,
  vault_path: String,
) -> Result<SignedMessage> {
  require_non_empty(&password, "password")?;
  require_non_empty(&message, "message")?;
  require_non_empty(&name, "name")?;

  let normalized_name = require_trimmed(name, "name")?;
  let keystore_json = vault::find_wallet_keystore_by_name(&normalized_name, vault_path)?;
  let normalized_keystore_json = require_trimmed(keystore_json, "keystoreJson")?;
  let mut keystore = TcxKeystore::from_json(&normalized_keystore_json).map_err(to_napi_err)?;
  let network = keystore.store().meta.network;

  with_unlocked_keystore(&mut keystore, &password, move |wallet| {
    let request = resolve_derivation(
      DerivationInput {
        chain_id,
        derivation_path: None,
        network: None,
      },
      network,
      wallet.derivable(),
    )?;
    let params = build_signature_parameters(&request);

    match request.resolved.chain_kind {
      ChainKind::Ethereum => {
        let signed: TcxEthMessageOutput = wallet
          .sign_message(
            &params,
            &TcxEthMessageInput::from(EthMessageInput {
              message,
              signature_type: Some(EthMessageSignatureType::PersonalSign),
            }),
          )
          .map_err(to_napi_err)?;
        Ok(SignedMessage {
          signature: signed.signature,
        })
      }
      ChainKind::Tron => {
        let signed: TcxTronMessageOutput = wallet
          .sign_message(
            &params,
            &TcxTronMessageInput::from(TronMessageInput {
              value: message,
              header: Some("TRON".to_string()),
              version: Some(1),
            }),
          )
          .map_err(to_napi_err)?;
        Ok(SignedMessage {
          signature: signed.signature,
        })
      }
    }
  })
}

#[napi(js_name = "signTransaction")]
/// Signs an unsigned chain-specific transaction hex using the default chain
/// conventions.
///
/// `chain_id` selects the signer implementation. Ethereum expects an unsigned
/// RLP-encoded transaction hex, while Tron expects raw transaction bytes hex.
///
/// `name` is used to find the wallet file in the vault directory.
pub fn sign_transaction(
  name: String,
  chain_id: String,
  tx_hex: String,
  password: String,
  vault_path: String,
) -> Result<Either<EthSignedTransaction, TronSignedTransaction>> {
  require_non_empty(&password, "password")?;
  let normalized_tx_hex = require_trimmed(tx_hex, "txHex")?;
  require_non_empty(&name, "name")?;

  let normalized_name = require_trimmed(name, "name")?;
  let keystore_json = vault::find_wallet_keystore_by_name(&normalized_name, vault_path)?;
  let normalized_keystore_json = require_trimmed(keystore_json, "keystoreJson")?;
  let mut keystore = TcxKeystore::from_json(&normalized_keystore_json).map_err(to_napi_err)?;
  let network = keystore.store().meta.network;

  with_unlocked_keystore(&mut keystore, &password, move |wallet| {
    let request = resolve_derivation(
      DerivationInput {
        chain_id,
        derivation_path: None,
        network: None,
      },
      network,
      wallet.derivable(),
    )?;
    let params = build_signature_parameters(&request);

    match request.resolved.chain_kind {
      ChainKind::Ethereum => {
        let tx = parse_eth_transaction_hex(&normalized_tx_hex, &request.resolved.chain_id)?;
        let signed: TcxEthTxOutput = wallet.sign_transaction(&params, &tx).map_err(to_napi_err)?;
        Ok(Either::A(EthSignedTransaction {
          signature: signed.signature,
          tx_hash: signed.tx_hash,
        }))
      }
      ChainKind::Tron => {
        let signed: TcxTronTxOutput = wallet
          .sign_transaction(
            &params,
            &TcxTronTxInput {
              raw_data: strip_hex_prefix(&normalized_tx_hex).to_string(),
            },
          )
          .map_err(to_napi_err)?;
        Ok(Either::B(TronSignedTransaction {
          signatures: signed.signatures,
        }))
      }
    }
  })
}
