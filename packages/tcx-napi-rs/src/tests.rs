use napi::Either;
use tcx_common::ToHex;
use tcx_eth::transaction::EthTxInput as TcxEthTxInput;
use tcx_eth::transaction_types::Transaction as TcxEthTransaction;

use super::*;
use crate::constants::{
  DEFAULT_ETH_DERIVATION_PATH, DEFAULT_ETH_MAINNET_CHAIN_ID, DEFAULT_TRON_MAINNET_CHAIN_ID,
};

const TEST_PASSWORD: &str = "imToken";
const TEST_MNEMONIC: &str =
  "inject kidney empty canal shadow pact comfort wife crush horse wife sketch";
const TEST_PRIVATE_KEY: &str = "a392604efc2fad9c0b3da43b5f698a2e3f270f170d859912be0d54742275c5f6";

fn encode_unsigned_eth_transaction(input: EthTransactionInput) -> String {
  let tx = TcxEthTransaction::try_from(&TcxEthTxInput::from(input))
    .expect("transaction input should encode");
  tx.encode(None).to_hex()
}

#[test]
fn create_wallet_returns_keystore_json_and_default_accounts() {
  let wallet = create_wallet("Created".to_string(), TEST_PASSWORD.to_string())
    .expect("create wallet should succeed");

  assert_eq!(wallet.meta.source, WalletSource::NewMnemonic);
  assert_eq!(wallet.meta.network, WalletNetwork::Mainnet);
  assert_eq!(wallet.accounts.len(), 2);
  assert_eq!(wallet.accounts[0].chain_id, DEFAULT_ETH_MAINNET_CHAIN_ID);
  assert_eq!(wallet.accounts[1].chain_id, DEFAULT_TRON_MAINNET_CHAIN_ID);
  assert_eq!(wallet.meta.version, 12000);
  assert!(wallet.meta.derivable);
  assert!(wallet.keystore_json.contains("\"version\":12000"));
}

#[test]
fn import_wallet_mnemonic_returns_default_accounts() {
  let wallet = import_wallet_mnemonic(
    "Imported mnemonic".to_string(),
    TEST_MNEMONIC.to_string(),
    TEST_PASSWORD.to_string(),
  )
  .expect("mnemonic import should succeed");

  assert_eq!(wallet.meta.source, WalletSource::Mnemonic);
  assert_eq!(wallet.meta.network, WalletNetwork::Mainnet);
  assert_eq!(wallet.accounts.len(), 2);
  assert_eq!(wallet.accounts[0].chain_id, DEFAULT_ETH_MAINNET_CHAIN_ID);
  assert_eq!(wallet.accounts[1].chain_id, DEFAULT_TRON_MAINNET_CHAIN_ID);
}

#[test]
fn import_wallet_private_key_returns_non_derivable_accounts() {
  let wallet = import_wallet_private_key(
    "Imported private key".to_string(),
    TEST_PRIVATE_KEY.to_string(),
    TEST_PASSWORD.to_string(),
  )
  .expect("private key import should succeed");

  assert_eq!(wallet.meta.source, WalletSource::Private);
  assert_eq!(wallet.meta.network, WalletNetwork::Mainnet);
  assert_eq!(wallet.accounts.len(), 2);
  assert_eq!(wallet.accounts[0].chain_id, DEFAULT_ETH_MAINNET_CHAIN_ID);
  assert_eq!(wallet.accounts[1].chain_id, DEFAULT_TRON_MAINNET_CHAIN_ID);
  assert!(wallet.accounts[0].derivation_path.is_none());
  assert!(wallet.accounts[0].ext_pub_key.is_none());
  assert_eq!(wallet.meta.version, 12001);
  assert_eq!(wallet.meta.curve.as_deref(), Some("secp256k1"));
  assert!(!wallet.meta.derivable);
}

#[test]
fn load_wallet_restores_wallet_from_keystore_json() {
  let source_wallet = import_wallet_mnemonic(
    "Imported mnemonic".to_string(),
    TEST_MNEMONIC.to_string(),
    TEST_PASSWORD.to_string(),
  )
  .expect("mnemonic import should succeed");

  let wallet = load_wallet(
    source_wallet.keystore_json.clone(),
    TEST_PASSWORD.to_string(),
    Some(vec![DerivationInput {
      chain_id: DEFAULT_ETH_MAINNET_CHAIN_ID.to_string(),
      derivation_path: Some("m/44'/60'/0'/0/1".to_string()),
      network: None,
    }]),
  )
  .expect("load wallet should succeed");

  assert_eq!(wallet.meta.source, WalletSource::Mnemonic);
  assert_eq!(wallet.meta.network, WalletNetwork::Mainnet);
  assert_eq!(wallet.accounts.len(), 1);
  assert_eq!(
    wallet.accounts[0].derivation_path.as_deref(),
    Some("m/44'/60'/0'/0/1")
  );
}

#[test]
fn derive_accounts_returns_requested_accounts() {
  let source_wallet = import_wallet_mnemonic(
    "Imported mnemonic".to_string(),
    TEST_MNEMONIC.to_string(),
    TEST_PASSWORD.to_string(),
  )
  .expect("mnemonic import should succeed");

  let accounts = derive_accounts(
    source_wallet.keystore_json,
    TEST_PASSWORD.to_string(),
    Some(vec![
      DerivationInput {
        chain_id: DEFAULT_ETH_MAINNET_CHAIN_ID.to_string(),
        derivation_path: Some(DEFAULT_ETH_DERIVATION_PATH.to_string()),
        network: None,
      },
      DerivationInput {
        chain_id: DEFAULT_ETH_MAINNET_CHAIN_ID.to_string(),
        derivation_path: Some("m/44'/60'/0'/0/1".to_string()),
        network: None,
      },
    ]),
  )
  .expect("derive accounts should succeed");

  assert_eq!(accounts.len(), 2);
  assert_eq!(accounts[0].chain_id, DEFAULT_ETH_MAINNET_CHAIN_ID);
  assert_eq!(accounts[1].chain_id, DEFAULT_ETH_MAINNET_CHAIN_ID);
  assert_eq!(
    accounts[0].derivation_path.as_deref(),
    Some(DEFAULT_ETH_DERIVATION_PATH)
  );
  assert_eq!(
    accounts[1].derivation_path.as_deref(),
    Some("m/44'/60'/0'/0/1")
  );
  assert_ne!(accounts[0].address, accounts[1].address);
}

#[test]
fn derive_accounts_rejects_unsupported_chain_id_namespace() {
  let source_wallet = import_wallet_mnemonic(
    "Imported mnemonic".to_string(),
    TEST_MNEMONIC.to_string(),
    TEST_PASSWORD.to_string(),
  )
  .expect("mnemonic import should succeed");

  let err = derive_accounts(
    source_wallet.keystore_json,
    TEST_PASSWORD.to_string(),
    Some(vec![DerivationInput {
      chain_id: "bip122:000000000019d6689c085ae165831e93".to_string(),
      derivation_path: None,
      network: None,
    }]),
  )
  .err()
  .expect("unsupported namespaces should fail");

  assert_eq!(err.reason, "unsupported chainId namespace `bip122`");
}

#[test]
fn sign_message_signs_ethereum_personal_messages() {
  let wallet = import_wallet_mnemonic(
    "Imported mnemonic".to_string(),
    TEST_MNEMONIC.to_string(),
    TEST_PASSWORD.to_string(),
  )
  .expect("mnemonic import should succeed");

  let signed = sign_message(
    wallet.keystore_json,
    DEFAULT_ETH_MAINNET_CHAIN_ID.to_string(),
    "hello world".to_string(),
    TEST_PASSWORD.to_string(),
  )
  .expect("ethereum message signing should succeed");

  assert_eq!(
    signed.signature,
    "0x521d0e4b5808b7fbeb53bf1b17c7c6d60432f5b13b7aa3aaed963a894c3bd99e23a3755ec06fa7a61b031192fb5fab6256e180e086c2671e0a574779bb8593df1b"
  );
}

#[test]
fn sign_message_signs_tron_messages() {
  let wallet = import_wallet_mnemonic(
    "Imported mnemonic".to_string(),
    TEST_MNEMONIC.to_string(),
    TEST_PASSWORD.to_string(),
  )
  .expect("mnemonic import should succeed");

  let signed = sign_message(
    wallet.keystore_json,
    DEFAULT_TRON_MAINNET_CHAIN_ID.to_string(),
    "hello world".to_string(),
    TEST_PASSWORD.to_string(),
  )
  .expect("tron message signing should succeed");

  assert_eq!(
    signed.signature,
    "0x8686cc3cf49e772d96d3a8147a59eb3df2659c172775f3611648bfbe7e3c48c11859b873d9d2185567a4f64a14fa38ce78dc385a7364af55109c5b6426e4c0f61b"
  );
}

#[test]
fn sign_transaction_signs_ethereum_transactions() {
  let wallet = import_wallet_private_key(
    "Imported private key".to_string(),
    TEST_PRIVATE_KEY.to_string(),
    TEST_PASSWORD.to_string(),
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
    wallet.keystore_json,
    "eip155:56".to_string(),
    tx_hex,
    TEST_PASSWORD.to_string(),
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
}

#[test]
fn sign_transaction_signs_ethereum_eip1559_transaction_hex() {
  let wallet = import_wallet_mnemonic(
    "Imported mnemonic".to_string(),
    TEST_MNEMONIC.to_string(),
    TEST_PASSWORD.to_string(),
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
    wallet.keystore_json,
    DEFAULT_ETH_MAINNET_CHAIN_ID.to_string(),
    tx_hex,
    TEST_PASSWORD.to_string(),
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
}

#[test]
fn sign_transaction_signs_tron_transactions() {
  let wallet = import_wallet_mnemonic(
    "Imported mnemonic".to_string(),
    TEST_MNEMONIC.to_string(),
    TEST_PASSWORD.to_string(),
  )
  .expect("mnemonic import should succeed");

  let signed = sign_transaction(
    wallet.keystore_json,
    DEFAULT_TRON_MAINNET_CHAIN_ID.to_string(),
    "0a0208312208b02efdc02638b61e40f083c3a7c92d5a65080112610a2d747970652e676f6f676c65617069732e636f6d2f70726f746f636f6c2e5472616e73666572436f6e747261637412300a1541a1e81654258bf14f63feb2e8d1380075d45b0dac1215410b3e84ec677b3e63c99affcadb91a6b4e086798f186470a0bfbfa7c92d".to_string(),
    TEST_PASSWORD.to_string(),
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
}
