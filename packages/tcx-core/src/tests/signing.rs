use super::*;

#[test]
fn sign_message_signs_ethereum_personal_messages() {
  let vault_dir = temp_vault_dir("sign-eth-message");
  let vault_path = vault_dir.to_string_lossy().into_owned();
  let wallet = import_wallet_mnemonic(
    "Imported mnemonic".to_string(),
    TEST_MNEMONIC.to_string(),
    TEST_PASSWORD.to_string(),
    vault_path.clone(),
    None,
  )
  .expect("mnemonic import should succeed");

  let signed = sign_message(
    wallet.meta.name,
    default_eth_mainnet_chain_id().to_string(),
    "hello world".to_string(),
    TEST_PASSWORD.to_string(),
    vault_path,
  )
  .expect("ethereum message signing should succeed");

  assert_eq!(
    signed.signature,
    "0x521d0e4b5808b7fbeb53bf1b17c7c6d60432f5b13b7aa3aaed963a894c3bd99e23a3755ec06fa7a61b031192fb5fab6256e180e086c2671e0a574779bb8593df1b"
  );

  let _ = fs::remove_dir_all(vault_dir);
}

#[test]
fn sign_message_signs_tron_messages() {
  let vault_dir = temp_vault_dir("sign-tron-message");
  let vault_path = vault_dir.to_string_lossy().into_owned();
  let wallet = import_wallet_mnemonic(
    "Imported mnemonic".to_string(),
    TEST_MNEMONIC.to_string(),
    TEST_PASSWORD.to_string(),
    vault_path.clone(),
    None,
  )
  .expect("mnemonic import should succeed");

  let signed = sign_message(
    wallet.meta.name,
    default_tron_mainnet_chain_id().to_string(),
    "hello world".to_string(),
    TEST_PASSWORD.to_string(),
    vault_path,
  )
  .expect("tron message signing should succeed");

  assert_eq!(
    signed.signature,
    "0x8686cc3cf49e772d96d3a8147a59eb3df2659c172775f3611648bfbe7e3c48c11859b873d9d2185567a4f64a14fa38ce78dc385a7364af55109c5b6426e4c0f61b"
  );

  let _ = fs::remove_dir_all(vault_dir);
}

#[test]
fn sign_transaction_signs_ethereum_transactions() {
  let vault_dir = temp_vault_dir("sign-eth-transaction");
  let vault_path = vault_dir.to_string_lossy().into_owned();
  let wallet = import_wallet_private_key(
    "Imported private key".to_string(),
    TEST_PRIVATE_KEY.to_string(),
    TEST_PASSWORD.to_string(),
    vault_path.clone(),
    None,
  )
  .expect("private key import should succeed");

  let tx_hex = encode_unsigned_eth_transaction(EthTransactionInput {
    nonce: "8".to_string(),
    gas_price: "20000000008".to_string(),
    gas_limit: "189000".to_string(),
    to: "0x3535353535353535353535353535353535353535".to_string(),
    value: "512".to_string(),
    data: String::new(),
    chain_id: "0x38".to_string(),
    tx_type: String::new(),
    max_fee_per_gas: "1076634600920".to_string(),
    max_priority_fee_per_gas: "226".to_string(),
    access_list: vec![],
  });

  let signed = sign_transaction(
    wallet.meta.name,
    "eip155:56".to_string(),
    tx_hex,
    TEST_PASSWORD.to_string(),
    vault_path,
  )
  .expect("ethereum transaction signing should succeed");

  let Either::A(signed) = signed else {
    panic!("expected an Ethereum signed transaction");
  };

  assert_eq!(
    signed.tx_hash,
    "0x1a3c3947ea626e00d6ff1493bcf929b9320d15ff088046990ef88a45f7d37623"
  );
  assert_eq!(
    signed.signature,
    "f868088504a817c8088302e248943535353535353535353535353535353535353535820200808194a003479f1d6be72af58b1d60750e155c435e435726b5b690f4d3e59f34bd55e578a0314d2b03d29dc3f87ff95c3427658952add3cf718d3b6b8604068fc3105e4442"
  );

  let _ = fs::remove_dir_all(vault_dir);
}

#[test]
fn sign_transaction_rejects_mismatched_ethereum_chain_id() {
  let vault_dir = temp_vault_dir("sign-eth-chain-mismatch");
  let vault_path = vault_dir.to_string_lossy().into_owned();
  let wallet = import_wallet_private_key(
    "Imported private key".to_string(),
    TEST_PRIVATE_KEY.to_string(),
    TEST_PASSWORD.to_string(),
    vault_path.clone(),
    None,
  )
  .expect("private key import should succeed");

  let tx_hex = encode_unsigned_eth_transaction(EthTransactionInput {
    nonce: "8".to_string(),
    gas_price: "20000000008".to_string(),
    gas_limit: "189000".to_string(),
    to: "0x3535353535353535353535353535353535353535".to_string(),
    value: "512".to_string(),
    data: String::new(),
    chain_id: "0x38".to_string(),
    tx_type: String::new(),
    max_fee_per_gas: "1076634600920".to_string(),
    max_priority_fee_per_gas: "226".to_string(),
    access_list: vec![],
  });

  let err = sign_transaction(
    wallet.meta.name,
    default_eth_mainnet_chain_id().to_string(),
    tx_hex,
    TEST_PASSWORD.to_string(),
    vault_path,
  )
  .expect_err("mismatched chain id should fail");

  assert_eq!(
    err.reason,
    "txHex chain id `0x38` does not match chainId `eip155:1`"
  );

  let _ = fs::remove_dir_all(vault_dir);
}

#[test]
fn sign_transaction_signs_ethereum_eip1559_transaction_hex() {
  let vault_dir = temp_vault_dir("sign-eth-eip1559-transaction");
  let vault_path = vault_dir.to_string_lossy().into_owned();
  let wallet = import_wallet_mnemonic(
    "Imported mnemonic".to_string(),
    TEST_MNEMONIC.to_string(),
    TEST_PASSWORD.to_string(),
    vault_path.clone(),
    None,
  )
  .expect("mnemonic import should succeed");

  let tx_hex = encode_unsigned_eth_transaction(EthTransactionInput {
    nonce: "8".to_string(),
    gas_price: String::new(),
    gas_limit: "4286".to_string(),
    to: "0x3535353535353535353535353535353535353535".to_string(),
    value: "3490361".to_string(),
    data: "0x200184c0486d5f082a27".to_string(),
    chain_id: "1".to_string(),
    tx_type: "02".to_string(),
    max_fee_per_gas: "1076634600920".to_string(),
    max_priority_fee_per_gas: "226".to_string(),
    access_list: vec![],
  });

  let signed = sign_transaction(
    wallet.meta.name,
    default_eth_mainnet_chain_id().to_string(),
    tx_hex,
    TEST_PASSWORD.to_string(),
    vault_path,
  )
  .expect("eip1559 transaction signing should succeed");

  let Either::A(signed) = signed else {
    panic!("expected an Ethereum signed transaction");
  };

  assert_eq!(
    signed.tx_hash,
    "0x9a427f295369171f686d83a05b92d8849b822f1fa1c9ccb853e81de545f4625b"
  );
  assert_eq!(
    signed.signature,
    "02f875010881e285faac6c45d88210be943535353535353535353535353535353535353535833542398a200184c0486d5f082a27c001a0602501c9cfedf145810f9b54558de6cf866a89b7a65890ccde19dd6cec1fe32ca02769f3382ee526a372241238922da39f6283a9613215fd98c8ce37a0d03fa3bb"
  );

  let _ = fs::remove_dir_all(vault_dir);
}

#[test]
fn sign_transaction_signs_tron_transactions() {
  let vault_dir = temp_vault_dir("sign-tron-transaction");
  let vault_path = vault_dir.to_string_lossy().into_owned();
  let wallet = import_wallet_mnemonic(
    "Imported mnemonic".to_string(),
    TEST_MNEMONIC.to_string(),
    TEST_PASSWORD.to_string(),
    vault_path.clone(),
    None,
  )
  .expect("mnemonic import should succeed");

  let signed = sign_transaction(
    wallet.meta.name,
    default_tron_mainnet_chain_id().to_string(),
    "0a0208312208b02efdc02638b61e40f083c3a7c92d5a65080112610a2d747970652e676f6f676c65617069732e636f6d2f70726f746f636f6c2e5472616e73666572436f6e747261637412300a1541a1e81654258bf14f63feb2e8d1380075d45b0dac1215410b3e84ec677b3e63c99affcadb91a6b4e086798f186470a0bfbfa7c92d".to_string(),
    TEST_PASSWORD.to_string(),
    vault_path,
  )
  .expect("tron transaction signing should succeed");

  let Either::B(signed) = signed else {
    panic!("expected a Tron signed transaction");
  };

  assert_eq!(
    signed.signatures,
    vec![
      "c65b4bde808f7fcfab7b0ef9c1e3946c83311f8ac0a5e95be2d8b6d2400cfe8b5e24dc8f0883132513e422f2aaad8a4ecc14438eae84b2683eefa626e3adffc601"
        .to_string()
    ]
  );

  let _ = fs::remove_dir_all(vault_dir);
}
