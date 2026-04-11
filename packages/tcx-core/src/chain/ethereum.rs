use std::any::Any;

use rlp::Rlp;
use tcx_common::{parse_u64, FromHex, ToHex};
use tcx_constants::CurveType;
use tcx_eth::transaction::{
  AccessList as TcxEthAccessList, EthMessageInput as TcxEthMessageInput,
  EthMessageOutput as TcxEthMessageOutput, EthTxInput as TcxEthTxInput,
  EthTxOutput as TcxEthTxOutput,
};
use tcx_keystore::{Keystore as TcxKeystore, MessageSigner, SignatureParameters, TransactionSigner};

use crate::derivation::{ethereum_chain_reference, Chain, ResolvedDerivation};
use crate::error::{CoreError, CoreResult, ResultExt};
use crate::types::{EthMessageInput, EthMessageSignatureType, EthSignedTransaction, SignedMessage};

use super::{ChainSigner, SignedTransaction};

pub(crate) struct EthereumSigner;

impl ChainSigner for EthereumSigner {
  fn parse_transaction(&self, tx_hex: &str, chain_id: &str) -> CoreResult<Box<dyn Any>> {
    let tx = parse_eth_transaction_hex(tx_hex, chain_id)?;
    Ok(Box::new(tx))
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
      chain_type: Chain::Ethereum.coin_name().to_string(),
      network: resolved.network.to_string(),
      seg_wit: String::new(),
    };
    let signed: TcxEthMessageOutput = keystore
      .sign_message(
        &params,
        &TcxEthMessageInput::from(EthMessageInput {
          message: message.to_string(),
          signature_type: Some(EthMessageSignatureType::PersonalSign),
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
      .downcast::<TcxEthTxInput>()
      .map_err(|_| CoreError::new("invalid Ethereum transaction data"))?;
    let params = SignatureParameters {
      curve: CurveType::SECP256k1,
      derivation_path: derivation_path.to_string(),
      chain_type: Chain::Ethereum.coin_name().to_string(),
      network: resolved.network.to_string(),
      seg_wit: String::new(),
    };
    let signed: TcxEthTxOutput = keystore.sign_transaction(&params, &*tx).map_core_err()?;
    Ok(SignedTransaction::Ethereum(EthSignedTransaction {
      signature: signed.signature,
      tx_hash: signed.tx_hash,
    }))
  }
}

fn parse_eth_transaction_hex(tx_hex: &str, request_chain_id: &str) -> CoreResult<TcxEthTxInput> {
  let tx_bytes = Vec::from_hex_auto(tx_hex).map_core_err()?;
  if tx_bytes.is_empty() {
    return Err(CoreError::new("txHex must not be empty"));
  }

  match tx_bytes[0] {
    0x01 => parse_eip2930_transaction(&tx_bytes[1..], request_chain_id),
    0x02 => parse_eip1559_transaction(&tx_bytes[1..], request_chain_id),
    _ => parse_legacy_transaction(&tx_bytes, request_chain_id),
  }
}

fn parse_legacy_transaction(tx_bytes: &[u8], request_chain_id: &str) -> CoreResult<TcxEthTxInput> {
  let tx = Rlp::new(tx_bytes);
  let item_count = expect_list_item_count(&tx, "txHex")?;

  let chain_id = match item_count {
    6 => ethereum_chain_reference(request_chain_id)?,
    9 => {
      ensure_zero_signature_placeholders(&tx, "legacy")?;
      let parsed_chain_id = rlp_uint_hex_at(&tx, 6)?;
      validate_eth_chain_id(request_chain_id, &parsed_chain_id)?;
      parsed_chain_id
    }
    _ => {
      return Err(CoreError::new(
        "txHex must be an unsigned Ethereum legacy transaction",
      ));
    }
  };

  Ok(TcxEthTxInput {
    nonce: rlp_uint_hex_at(&tx, 0)?,
    gas_price: rlp_uint_hex_at(&tx, 1)?,
    gas_limit: rlp_uint_hex_at(&tx, 2)?,
    to: rlp_address_hex_at(&tx, 3)?,
    value: rlp_uint_hex_at(&tx, 4)?,
    data: rlp_bytes_hex_at(&tx, 5)?,
    chain_id,
    tx_type: String::new(),
    max_fee_per_gas: String::new(),
    max_priority_fee_per_gas: String::new(),
    access_list: vec![],
  })
}

fn parse_eip2930_transaction(tx_bytes: &[u8], request_chain_id: &str) -> CoreResult<TcxEthTxInput> {
  let tx = Rlp::new(tx_bytes);
  let item_count = expect_list_item_count(&tx, "txHex")?;
  if item_count != 8 {
    return Err(CoreError::new(
      "txHex must be an unsigned Ethereum EIP-2930 transaction",
    ));
  }

  let chain_id = rlp_uint_hex_at(&tx, 0)?;
  validate_eth_chain_id(request_chain_id, &chain_id)?;

  Ok(TcxEthTxInput {
    chain_id,
    nonce: rlp_uint_hex_at(&tx, 1)?,
    gas_price: rlp_uint_hex_at(&tx, 2)?,
    gas_limit: rlp_uint_hex_at(&tx, 3)?,
    to: rlp_address_hex_at(&tx, 4)?,
    value: rlp_uint_hex_at(&tx, 5)?,
    data: rlp_bytes_hex_at(&tx, 6)?,
    tx_type: "0x01".to_string(),
    max_fee_per_gas: String::new(),
    max_priority_fee_per_gas: String::new(),
    access_list: parse_eth_access_list(&tx.at(7).map_core_err()?)?,
  })
}

fn parse_eip1559_transaction(tx_bytes: &[u8], request_chain_id: &str) -> CoreResult<TcxEthTxInput> {
  let tx = Rlp::new(tx_bytes);
  let item_count = expect_list_item_count(&tx, "txHex")?;
  if item_count != 9 {
    return Err(CoreError::new(
      "txHex must be an unsigned Ethereum EIP-1559 transaction",
    ));
  }

  let chain_id = rlp_uint_hex_at(&tx, 0)?;
  validate_eth_chain_id(request_chain_id, &chain_id)?;

  Ok(TcxEthTxInput {
    chain_id,
    nonce: rlp_uint_hex_at(&tx, 1)?,
    gas_price: String::new(),
    gas_limit: rlp_uint_hex_at(&tx, 4)?,
    to: rlp_address_hex_at(&tx, 5)?,
    value: rlp_uint_hex_at(&tx, 6)?,
    data: rlp_bytes_hex_at(&tx, 7)?,
    tx_type: "0x02".to_string(),
    max_fee_per_gas: rlp_uint_hex_at(&tx, 3)?,
    max_priority_fee_per_gas: rlp_uint_hex_at(&tx, 2)?,
    access_list: parse_eth_access_list(&tx.at(8).map_core_err()?)?,
  })
}

fn expect_list_item_count(rlp: &Rlp, field_name: &str) -> CoreResult<usize> {
  if !rlp.is_list() {
    return Err(CoreError::new(format!(
      "{field_name} must encode an RLP list"
    )));
  }

  rlp.item_count().map_core_err()
}

fn ensure_zero_signature_placeholders(rlp: &Rlp, tx_kind: &str) -> CoreResult<()> {
  if !rlp_item_is_zero(rlp, 7)? || !rlp_item_is_zero(rlp, 8)? {
    return Err(CoreError::new(format!(
      "txHex must be an unsigned Ethereum {tx_kind} transaction"
    )));
  }

  Ok(())
}

fn rlp_item_is_zero(rlp: &Rlp, index: usize) -> CoreResult<bool> {
  Ok(rlp_item_bytes(rlp, index)?.iter().all(|value| *value == 0))
}

fn rlp_item_bytes(rlp: &Rlp, index: usize) -> CoreResult<Vec<u8>> {
  rlp
    .at(index)
    .map_core_err()?
    .data()
    .map(|bytes| bytes.to_vec())
    .map_core_err()
}

fn rlp_uint_hex_at(rlp: &Rlp, index: usize) -> CoreResult<String> {
  let bytes = rlp_item_bytes(rlp, index)?;
  Ok(if bytes.is_empty() {
    "0x0".to_string()
  } else {
    format!("0x{}", bytes.to_hex())
  })
}

fn rlp_bytes_hex_at(rlp: &Rlp, index: usize) -> CoreResult<String> {
  let bytes = rlp_item_bytes(rlp, index)?;
  Ok(if bytes.is_empty() {
    String::new()
  } else {
    format!("0x{}", bytes.to_hex())
  })
}

fn rlp_address_hex_at(rlp: &Rlp, index: usize) -> CoreResult<String> {
  let bytes = rlp_item_bytes(rlp, index)?;
  Ok(if bytes.is_empty() {
    String::new()
  } else {
    format!("0x{}", bytes.to_hex())
  })
}

fn parse_eth_access_list(access_list: &Rlp) -> CoreResult<Vec<TcxEthAccessList>> {
  let item_count = expect_list_item_count(access_list, "txHex")?;
  let mut parsed = Vec::with_capacity(item_count);

  for index in 0..item_count {
    let item = access_list.at(index).map_core_err()?;
    if expect_list_item_count(&item, "txHex")? != 2 {
      return Err(CoreError::new(
        "txHex contains an invalid Ethereum access list entry",
      ));
    }

    let storage_keys_rlp = item.at(1).map_core_err()?;
    let storage_key_count = expect_list_item_count(&storage_keys_rlp, "txHex")?;
    let mut storage_keys = Vec::with_capacity(storage_key_count);
    for storage_index in 0..storage_key_count {
      let storage_key = rlp_item_bytes(&storage_keys_rlp, storage_index)?;
      storage_keys.push(format!("0x{}", storage_key.to_hex()));
    }

    parsed.push(TcxEthAccessList {
      address: rlp_address_hex_at(&item, 0)?,
      storage_keys,
    });
  }

  Ok(parsed)
}

fn validate_eth_chain_id(request_chain_id: &str, tx_chain_id: &str) -> CoreResult<()> {
  let expected_chain_id = parse_u64(&ethereum_chain_reference(request_chain_id)?).map_core_err()?;
  let actual_chain_id = parse_u64(tx_chain_id).map_core_err()?;

  if expected_chain_id != actual_chain_id {
    return Err(CoreError::new(format!(
      "txHex chain id `{tx_chain_id}` does not match chainId `{request_chain_id}`"
    )));
  }

  Ok(())
}
