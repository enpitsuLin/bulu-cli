use rlp::Rlp;
use tcx_common::{keccak256, parse_u64, ToHex};
use tcx_constants::CurveType;
use tcx_eth::address::EthAddress;
use tcx_eth::transaction::{AccessList as TcxEthAccessList, EthTxInput as TcxEthTxInput};
use tcx_eth::transaction_types::{Signature, Transaction};
use tcx_keystore::keystore::IdentityNetwork;
use tcx_keystore::{Keystore as TcxKeystore, Signer};

use crate::chain::Caip2ChainId;
use crate::chain::ChainSigner;
use crate::derivation::ResolvedDerivation;
use crate::error::{CoreError, CoreResult, ResultExt};
use crate::types::{SignedMessage, SignedTransactionResult};

#[derive(Debug)]
pub(crate) struct EthereumSigner;
pub(crate) const ETHEREUM_SIGNER: EthereumSigner = EthereumSigner;

impl ChainSigner for EthereumSigner {
  fn coin_name(&self) -> &'static str {
    "ETHEREUM"
  }

  fn namespace(&self) -> &'static str {
    "eip155"
  }

  fn default_chain_id(&self, network: IdentityNetwork) -> &'static str {
    match network {
      IdentityNetwork::Mainnet => "eip155:1",
      IdentityNetwork::Testnet => "eip155:11155111",
    }
  }

  fn default_derivation_path(&self, index: u32) -> String {
    format!("m/44'/60'/0'/0/{index}")
  }

  fn derive_address(
    &self,
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

  fn sign_message(
    &self,
    keystore: &mut TcxKeystore,
    derivation_path: &str,
    message: &[u8],
  ) -> CoreResult<SignedMessage> {
    let prefix = "\x19Ethereum Signed Message:\n";
    let len_str = message.len().to_string();
    let to_hash = [prefix.as_bytes(), len_str.as_bytes(), message].concat();
    let hash = keccak256(&to_hash);

    let mut sign_result = keystore
      .secp256k1_ecdsa_sign_recoverable(&hash, derivation_path)
      .map_core_err()?;
    sign_result[64] += 27;

    Ok(SignedMessage {
      signature: format!("0x{}", sign_result.to_hex()),
    })
  }

  fn sign_transaction(
    &self,
    keystore: &mut TcxKeystore,
    resolved: &ResolvedDerivation,
    derivation_path: &str,
    tx_bytes: &[u8],
  ) -> CoreResult<SignedTransactionResult> {
    let tx_input = prepare_eth_transaction(tx_bytes, &resolved.chain_id)?;
    let tx: Transaction = (&tx_input).try_into().map_core_err()?;
    let sign_result = keystore
      .secp256k1_ecdsa_sign_recoverable(&tx.sighash(), derivation_path)
      .map_core_err()?;
    Ok(SignedTransactionResult {
      signature: format!("0x{}", sign_result.to_hex()),
      raw_transaction: None,
    })
  }

  fn encode_signed_transaction(
    &self,
    resolved: &ResolvedDerivation,
    tx_bytes: &[u8],
    signature: &[u8],
  ) -> CoreResult<Option<String>> {
    let tx_input = prepare_eth_transaction(tx_bytes, &resolved.chain_id)?;
    let tx: Transaction = (&tx_input).try_into().map_core_err()?;
    let sig = Signature::from_slice(signature).map_core_err()?;
    let signed_tx = tx.to_signed_tx(sig);
    Ok(Some(signed_tx.raw().to_hex()))
  }
}

fn prepare_eth_transaction(
  tx_bytes: &[u8],
  request_chain_id: &Caip2ChainId,
) -> CoreResult<TcxEthTxInput> {
  if tx_bytes.is_empty() {
    return Err(CoreError::new("txHex must not be empty"));
  }

  match tx_bytes[0] {
    0x01 => parse_eip2930_transaction(&tx_bytes[1..], request_chain_id),
    0x02 => parse_eip1559_transaction(&tx_bytes[1..], request_chain_id),
    _ => parse_legacy_transaction(tx_bytes, request_chain_id),
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
