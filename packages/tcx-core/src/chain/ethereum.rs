use rlp::Rlp;
use tcx_common::{parse_u64, FromHex, ToHex};
use tcx_constants::CurveType;
use tcx_eth::address::EthAddress;
use tcx_eth::transaction::{
  AccessList as TcxEthAccessList, EthMessageInput as TcxEthMessageInput,
  EthMessageOutput as TcxEthMessageOutput, EthTxInput as TcxEthTxInput,
  EthTxOutput as TcxEthTxOutput, SignatureType as TcxEthSignatureType,
};
use tcx_keystore::{
  Keystore as TcxKeystore, MessageSigner, SignatureParameters, TransactionSigner,
};

use crate::chain::Caip2ChainId;
use crate::error::{CoreError, CoreResult, ResultExt};
use crate::types::{SignedMessage, SignedTransactionResult};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum EthMessageSignatureType {
  PersonalSign,
  EcSign,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct EthMessageInput {
  pub(crate) message: String,
  pub(crate) signature_type: Option<EthMessageSignatureType>,
}

impl From<EthMessageSignatureType> for i32 {
  fn from(value: EthMessageSignatureType) -> Self {
    match value {
      EthMessageSignatureType::PersonalSign => TcxEthSignatureType::PersonalSign as i32,
      EthMessageSignatureType::EcSign => TcxEthSignatureType::EcSign as i32,
    }
  }
}

impl From<EthMessageInput> for TcxEthMessageInput {
  fn from(value: EthMessageInput) -> Self {
    Self {
      message: value.message,
      signature_type: value
        .signature_type
        .unwrap_or(EthMessageSignatureType::PersonalSign)
        .into(),
    }
  }
}

pub(crate) fn derive_eth_address(
  keystore: &mut TcxKeystore,
  derivation_path: &str,
  network: &str,
) -> CoreResult<String> {
  let coin_info = tcx_constants::CoinInfo {
    chain_id: String::new(),
    coin: "ETHEREUM".to_string(),
    derivation_path: derivation_path.to_string(),
    curve: CurveType::SECP256k1,
    network: network.to_string(),
    seg_wit: String::new(),
    contract_code: String::new(),
  };
  let account = keystore
    .derive_coin::<EthAddress>(&coin_info)
    .map_core_err()?;
  Ok(account.address)
}

pub(crate) fn sign_eth_message(
  keystore: &mut TcxKeystore,
  derivation_path: &str,
  network: &str,
  message: &str,
) -> CoreResult<SignedMessage> {
  let params = SignatureParameters {
    curve: CurveType::SECP256k1,
    derivation_path: derivation_path.to_string(),
    chain_type: "ETHEREUM".to_string(),
    network: network.to_string(),
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

pub(crate) fn sign_eth_transaction(
  keystore: &mut TcxKeystore,
  derivation_path: &str,
  network: &str,
  chain_id: &Caip2ChainId,
  tx_hex: &str,
) -> CoreResult<SignedTransactionResult> {
  let tx = prepare_eth_transaction(tx_hex, chain_id)?;
  let params = SignatureParameters {
    curve: CurveType::SECP256k1,
    derivation_path: derivation_path.to_string(),
    chain_type: "ETHEREUM".to_string(),
    network: network.to_string(),
    seg_wit: String::new(),
  };
  let signed: TcxEthTxOutput = keystore.sign_transaction(&params, &tx).map_core_err()?;
  Ok(SignedTransactionResult {
    signature: signed.signature,
  })
}

fn prepare_eth_transaction(
  tx_hex: &str,
  request_chain_id: &Caip2ChainId,
) -> CoreResult<TcxEthTxInput> {
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

fn parse_legacy_transaction(
  tx_bytes: &[u8],
  request_chain_id: &Caip2ChainId,
) -> CoreResult<TcxEthTxInput> {
  let tx = Rlp::new(tx_bytes);
  if !tx.is_list() {
    return Err(CoreError::new("txHex must encode an RLP list"));
  }
  let item_count = tx.item_count().map_core_err()?;

  let chain_id = match item_count {
    6 => request_chain_id.ethereum_reference()?,
    9 => {
      let r = tx
        .at(7)
        .map_core_err()?
        .data()
        .map(|bytes| bytes.to_vec())
        .map_core_err()?;
      let s = tx
        .at(8)
        .map_core_err()?
        .data()
        .map(|bytes| bytes.to_vec())
        .map_core_err()?;
      if !r.iter().all(|value| *value == 0) || !s.iter().all(|value| *value == 0) {
        return Err(CoreError::new(
          "txHex must be an unsigned Ethereum legacy transaction",
        ));
      }
      let parsed = rlp_bytes_to_hex(&tx, 6, true)?;
      validate_eth_chain_id(request_chain_id, &parsed)?;
      parsed
    }
    _ => {
      return Err(CoreError::new(
        "txHex must be an unsigned Ethereum legacy transaction",
      ))
    }
  };

  Ok(TcxEthTxInput {
    nonce: rlp_bytes_to_hex(&tx, 0, true)?,
    gas_price: rlp_bytes_to_hex(&tx, 1, true)?,
    gas_limit: rlp_bytes_to_hex(&tx, 2, true)?,
    to: rlp_bytes_to_hex(&tx, 3, false)?,
    value: rlp_bytes_to_hex(&tx, 4, true)?,
    data: rlp_bytes_to_hex(&tx, 5, false)?,
    chain_id,
    tx_type: String::new(),
    max_fee_per_gas: String::new(),
    max_priority_fee_per_gas: String::new(),
    access_list: vec![],
  })
}

fn parse_eip2930_transaction(
  tx_bytes: &[u8],
  request_chain_id: &Caip2ChainId,
) -> CoreResult<TcxEthTxInput> {
  let tx = Rlp::new(tx_bytes);
  if !tx.is_list() {
    return Err(CoreError::new("txHex must encode an RLP list"));
  }
  if tx.item_count().map_core_err()? != 8 {
    return Err(CoreError::new(
      "txHex must be an unsigned Ethereum EIP-2930 transaction",
    ));
  }

  let chain_id = rlp_bytes_to_hex(&tx, 0, true)?;
  validate_eth_chain_id(request_chain_id, &chain_id)?;

  Ok(TcxEthTxInput {
    chain_id,
    nonce: rlp_bytes_to_hex(&tx, 1, true)?,
    gas_price: rlp_bytes_to_hex(&tx, 2, true)?,
    gas_limit: rlp_bytes_to_hex(&tx, 3, true)?,
    to: rlp_bytes_to_hex(&tx, 4, false)?,
    value: rlp_bytes_to_hex(&tx, 5, true)?,
    data: rlp_bytes_to_hex(&tx, 6, false)?,
    tx_type: "0x01".to_string(),
    max_fee_per_gas: String::new(),
    max_priority_fee_per_gas: String::new(),
    access_list: parse_eth_access_list(&tx.at(7).map_core_err()?)?,
  })
}

fn parse_eip1559_transaction(
  tx_bytes: &[u8],
  request_chain_id: &Caip2ChainId,
) -> CoreResult<TcxEthTxInput> {
  let tx = Rlp::new(tx_bytes);
  if !tx.is_list() {
    return Err(CoreError::new("txHex must encode an RLP list"));
  }
  if tx.item_count().map_core_err()? != 9 {
    return Err(CoreError::new(
      "txHex must be an unsigned Ethereum EIP-1559 transaction",
    ));
  }

  let chain_id = rlp_bytes_to_hex(&tx, 0, true)?;
  validate_eth_chain_id(request_chain_id, &chain_id)?;

  Ok(TcxEthTxInput {
    chain_id,
    nonce: rlp_bytes_to_hex(&tx, 1, true)?,
    gas_price: String::new(),
    gas_limit: rlp_bytes_to_hex(&tx, 4, true)?,
    to: rlp_bytes_to_hex(&tx, 5, false)?,
    value: rlp_bytes_to_hex(&tx, 6, true)?,
    data: rlp_bytes_to_hex(&tx, 7, false)?,
    tx_type: "0x02".to_string(),
    max_fee_per_gas: rlp_bytes_to_hex(&tx, 3, true)?,
    max_priority_fee_per_gas: rlp_bytes_to_hex(&tx, 2, true)?,
    access_list: parse_eth_access_list(&tx.at(8).map_core_err()?)?,
  })
}

fn rlp_bytes_to_hex(rlp: &Rlp, index: usize, is_uint: bool) -> CoreResult<String> {
  let bytes = rlp
    .at(index)
    .map_core_err()?
    .data()
    .map(|value| value.to_vec())
    .map_core_err()?;
  Ok(if bytes.is_empty() {
    if is_uint {
      "0x0".to_string()
    } else {
      String::new()
    }
  } else {
    format!("0x{}", bytes.to_hex())
  })
}

fn parse_eth_access_list(access_list: &Rlp) -> CoreResult<Vec<TcxEthAccessList>> {
  if !access_list.is_list() {
    return Err(CoreError::new("txHex access list must be an RLP list"));
  }
  let item_count = access_list.item_count().map_core_err()?;
  let mut parsed = Vec::with_capacity(item_count);

  for index in 0..item_count {
    let item = access_list.at(index).map_core_err()?;
    if !item.is_list() || item.item_count().map_core_err()? != 2 {
      return Err(CoreError::new(
        "txHex contains an invalid Ethereum access list entry",
      ));
    }

    let storage_keys_rlp = item.at(1).map_core_err()?;
    if !storage_keys_rlp.is_list() {
      return Err(CoreError::new(
        "txHex contains an invalid Ethereum access list entry",
      ));
    }
    let storage_key_count = storage_keys_rlp.item_count().map_core_err()?;
    let mut storage_keys = Vec::with_capacity(storage_key_count);
    for storage_index in 0..storage_key_count {
      let key_bytes = storage_keys_rlp
        .at(storage_index)
        .map_core_err()?
        .data()
        .map(|bytes| bytes.to_vec())
        .map_core_err()?;
      storage_keys.push(format!("0x{}", key_bytes.to_hex()));
    }

    parsed.push(TcxEthAccessList {
      address: rlp_bytes_to_hex(&item, 0, false)?,
      storage_keys,
    });
  }

  Ok(parsed)
}

fn validate_eth_chain_id(request_chain_id: &Caip2ChainId, tx_chain_id: &str) -> CoreResult<()> {
  let expected = parse_u64(&request_chain_id.ethereum_reference()?).map_core_err()?;
  let actual = parse_u64(tx_chain_id).map_core_err()?;

  if expected != actual {
    return Err(CoreError::new(format!(
      "txHex chain id `{tx_chain_id}` does not match chainId `{request_chain_id}`"
    )));
  }

  Ok(())
}
