use napi::{Either, Result};
use napi_derive::napi;
use std::fs;
use std::path::Path;
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
use crate::wallet::with_unlocked_keystore;

/// Find wallet file by name in vault directory and return keystore JSON
fn find_keystore_by_name(name: &str, vault_path: String) -> Result<String> {
  let vault_path = require_trimmed(vault_path, "vaultPath")?;
  let wallets_dir = Path::new(&vault_path).join("wallets");

  if !wallets_dir.exists() {
    return Err(napi::Error::from_reason(format!(
      "wallets directory does not exist: {}",
      wallets_dir.display()
    )));
  }

  let entries = fs::read_dir(&wallets_dir).map_err(|err| {
    napi::Error::from_reason(format!(
      "failed to read vault directory `{}`: {err}",
      wallets_dir.display()
    ))
  })?;

  for entry in entries {
    let entry = entry.map_err(|err| {
      napi::Error::from_reason(format!(
        "failed to read entry in vault directory `{}`: {err}",
        wallets_dir.display()
      ))
    })?;

    let path = entry.path();
    if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
      continue;
    }

    let content = match fs::read_to_string(&path) {
      Ok(content) => content,
      Err(_) => continue,
    };

    // Parse JSON and check if name matches
    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
      if let Some(meta_name) = json
        .get("meta")
        .and_then(|m| m.get("name"))
        .and_then(|n| n.as_str())
      {
        if meta_name == name {
          // Return the keystore JSON from the wallet file
          if let Some(keystore) = json.get("keystore") {
            return serde_json::to_string(keystore).map_err(to_napi_err);
          }
        }
      }
    }
  }

  Err(napi::Error::from_reason(format!(
    "wallet with name '{}' not found in vault: {}",
    name, wallets_dir.display()
  )))
}

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
  let keystore_json = find_keystore_by_name(&normalized_name, vault_path)?;
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
  let keystore_json = find_keystore_by_name(&normalized_name, vault_path)?;
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
