use tcx_common::{random_u8_16, FromHex};
use tcx_eth::transaction::{
  EthMessageInput as TcxEthMessageInput, EthMessageOutput as TcxEthMessageOutput,
  EthTxOutput as TcxEthTxOutput,
};
use tcx_keystore::keystore::IdentityNetwork;
use tcx_keystore::{
  Keystore as TcxKeystore, KeystoreGuard, MessageSigner, Metadata, Source, TransactionSigner,
};
use tcx_primitive::mnemonic_from_entropy;
use tcx_tron::transaction::{
  TronMessageInput as TcxTronMessageInput, TronMessageOutput as TcxTronMessageOutput,
  TronTxInput as TcxTronTxInput, TronTxOutput as TcxTronTxOutput,
};

use crate::derivation::{derive_accounts_for_wallet, resolve_derivation, Chain};
use crate::error::{require_non_empty, require_trimmed, CoreResult, ResultExt};
use crate::ethereum::parse_eth_transaction_hex;
use crate::strings::{sanitize_optional_text, strip_hex_prefix};
use crate::types::{
  DerivationInput, EthMessageInput, EthMessageSignatureType, EthSignedTransaction, SignedMessage,
  TronMessageInput, TronSignedTransaction, WalletAccount, WalletInfo,
};
use crate::vault::VaultRepository;

pub(crate) enum SignedTransaction {
  Ethereum(EthSignedTransaction),
  Tron(TronSignedTransaction),
}

pub(crate) fn list_wallets(vault_path: String) -> CoreResult<Vec<WalletInfo>> {
  VaultRepository::new(vault_path)?.list_wallets()
}

pub(crate) fn get_wallet(name_or_id: String, vault_path: String) -> CoreResult<WalletInfo> {
  VaultRepository::new(vault_path)?.get_wallet(&name_or_id)
}

pub(crate) fn delete_wallet(name_or_id: String, vault_path: String) -> CoreResult<()> {
  VaultRepository::new(vault_path)?.delete_wallet(&name_or_id)
}

pub(crate) fn create_wallet(
  name: String,
  passphrase: String,
  vault_path: String,
  index: Option<u32>,
) -> CoreResult<WalletInfo> {
  require_non_empty(&passphrase, "passphrase")?;

  let mnemonic = create_mnemonic(None)?;
  let metadata = build_metadata(
    Some(name),
    None,
    IdentityNetwork::Mainnet,
    Source::NewMnemonic,
    "New Wallet",
  );
  let keystore = TcxKeystore::from_mnemonic(&mnemonic, &passphrase, metadata).map_core_err()?;
  let wallet_info = build_wallet_info(keystore, &passphrase, None, index)?;
  VaultRepository::new(vault_path)?.save_wallet(&wallet_info)?;
  Ok(wallet_info)
}

pub(crate) fn import_wallet_mnemonic(
  name: String,
  mnemonic: String,
  passphrase: String,
  vault_path: String,
  index: Option<u32>,
) -> CoreResult<WalletInfo> {
  require_non_empty(&passphrase, "passphrase")?;

  let normalized_mnemonic = normalize_mnemonic(&mnemonic);
  require_non_empty(&normalized_mnemonic, "mnemonic")?;

  let metadata = build_metadata(
    Some(name),
    None,
    IdentityNetwork::Mainnet,
    Source::Mnemonic,
    "Imported Mnemonic Wallet",
  );
  let keystore =
    TcxKeystore::from_mnemonic(&normalized_mnemonic, &passphrase, metadata).map_core_err()?;
  let wallet_info = build_wallet_info(keystore, &passphrase, None, index)?;
  VaultRepository::new(vault_path)?.save_wallet(&wallet_info)?;
  Ok(wallet_info)
}

pub(crate) fn import_wallet_private_key(
  name: String,
  private_key: String,
  passphrase: String,
  vault_path: String,
  _index: Option<u32>,
) -> CoreResult<WalletInfo> {
  require_non_empty(&passphrase, "passphrase")?;

  let normalized_private_key = require_trimmed(private_key, "privateKey")?;
  let metadata = build_metadata(
    Some(name),
    None,
    IdentityNetwork::Mainnet,
    Source::Private,
    "Imported Private Key",
  );
  let keystore = TcxKeystore::from_private_key(
    &normalized_private_key,
    &passphrase,
    tcx_constants::CurveType::SECP256k1,
    metadata,
    None,
  )
  .map_core_err()?;
  let wallet_info = build_wallet_info(keystore, &passphrase, None, None)?;
  VaultRepository::new(vault_path)?.save_wallet(&wallet_info)?;
  Ok(wallet_info)
}

pub(crate) fn load_wallet(
  keystore_json: String,
  password: String,
  derivations: Option<Vec<DerivationInput>>,
) -> CoreResult<WalletInfo> {
  require_non_empty(&password, "password")?;

  let keystore = load_tcx_keystore(keystore_json)?;
  build_wallet_info(keystore, &password, derivations, None)
}

pub(crate) fn import_wallet_keystore(
  name: String,
  keystore_json: String,
  password: String,
  vault_path: String,
  derivations: Option<Vec<DerivationInput>>,
) -> CoreResult<WalletInfo> {
  require_non_empty(&password, "password")?;

  let normalized_name = require_trimmed(name, "name")?;
  let mut keystore = load_tcx_keystore(keystore_json)?;
  keystore.store_mut().meta.name = normalized_name;

  let wallet_info = build_wallet_info(keystore, &password, derivations, None)?;
  VaultRepository::new(vault_path)?.save_wallet(&wallet_info)?;
  Ok(wallet_info)
}

pub(crate) fn derive_accounts(
  keystore_json: String,
  password: String,
  derivations: Option<Vec<DerivationInput>>,
) -> CoreResult<Vec<WalletAccount>> {
  require_non_empty(&password, "password")?;

  let mut keystore = load_tcx_keystore(keystore_json)?;
  let network = keystore.store().meta.network;

  with_unlocked_keystore(&mut keystore, &password, move |wallet| {
    derive_accounts_for_wallet(wallet, network, derivations, None)
  })
}

pub(crate) fn sign_message(
  name: String,
  chain_id: String,
  message: String,
  password: String,
  vault_path: String,
) -> CoreResult<SignedMessage> {
  require_non_empty(&password, "password")?;
  require_non_empty(&message, "message")?;
  require_non_empty(&name, "name")?;

  let wallet = VaultRepository::new(vault_path)?.get_wallet(&name)?;
  let mut keystore = stored_keystore(&wallet)?;
  let network = keystore.store().meta.network;

  with_unlocked_keystore(&mut keystore, &password, move |unlocked_keystore| {
    let request = resolve_derivation(
      DerivationInput {
        chain_id,
        derivation_path: None,
        network: None,
      },
      network,
      unlocked_keystore.derivable(),
    )?;
    let params = request.signature_parameters();

    match request.resolved.chain {
      Chain::Ethereum => {
        let signed: TcxEthMessageOutput = unlocked_keystore
          .sign_message(
            &params,
            &TcxEthMessageInput::from(EthMessageInput {
              message,
              signature_type: Some(EthMessageSignatureType::PersonalSign),
            }),
          )
          .map_core_err()?;
        Ok(SignedMessage {
          signature: signed.signature,
        })
      }
      Chain::Tron => {
        let signed: TcxTronMessageOutput = unlocked_keystore
          .sign_message(
            &params,
            &TcxTronMessageInput::from(TronMessageInput {
              value: message,
              header: Some("TRON".to_string()),
              version: Some(1),
            }),
          )
          .map_core_err()?;
        Ok(SignedMessage {
          signature: signed.signature,
        })
      }
    }
  })
}

pub(crate) fn sign_transaction(
  name: String,
  chain_id: String,
  tx_hex: String,
  password: String,
  vault_path: String,
) -> CoreResult<SignedTransaction> {
  require_non_empty(&password, "password")?;
  require_non_empty(&name, "name")?;
  let normalized_tx_hex = require_trimmed(tx_hex, "txHex")?;

  let wallet = VaultRepository::new(vault_path)?.get_wallet(&name)?;
  let mut keystore = stored_keystore(&wallet)?;
  let network = keystore.store().meta.network;

  with_unlocked_keystore(&mut keystore, &password, move |unlocked_keystore| {
    let request = resolve_derivation(
      DerivationInput {
        chain_id,
        derivation_path: None,
        network: None,
      },
      network,
      unlocked_keystore.derivable(),
    )?;
    let params = request.signature_parameters();

    match request.resolved.chain {
      Chain::Ethereum => {
        let tx = parse_eth_transaction_hex(&normalized_tx_hex, &request.resolved.chain_id)?;
        let signed: TcxEthTxOutput = unlocked_keystore
          .sign_transaction(&params, &tx)
          .map_core_err()?;
        Ok(SignedTransaction::Ethereum(EthSignedTransaction {
          signature: signed.signature,
          tx_hash: signed.tx_hash,
        }))
      }
      Chain::Tron => {
        let signed: TcxTronTxOutput = unlocked_keystore
          .sign_transaction(
            &params,
            &TcxTronTxInput {
              raw_data: strip_hex_prefix(&normalized_tx_hex).to_string(),
            },
          )
          .map_core_err()?;
        Ok(SignedTransaction::Tron(TronSignedTransaction {
          signatures: signed.signatures,
        }))
      }
    }
  })
}

fn build_wallet_info(
  mut keystore: TcxKeystore,
  password: &str,
  derivations: Option<Vec<DerivationInput>>,
  index: Option<u32>,
) -> CoreResult<WalletInfo> {
  let network = keystore.store().meta.network;

  with_unlocked_keystore(&mut keystore, password, move |unlocked_keystore| {
    let accounts = derive_accounts_for_wallet(unlocked_keystore, network, derivations, index)?;
    WalletInfo::try_from_keystore(unlocked_keystore, accounts)
  })
}

fn with_unlocked_keystore<T>(
  keystore: &mut TcxKeystore,
  password: &str,
  f: impl FnOnce(&mut TcxKeystore) -> CoreResult<T>,
) -> CoreResult<T> {
  let mut guard = KeystoreGuard::unlock_by_password(keystore, password).map_core_err()?;
  f(guard.keystore_mut())
}

fn load_tcx_keystore(keystore_json: String) -> CoreResult<TcxKeystore> {
  let normalized_keystore_json = require_trimmed(keystore_json, "keystoreJson")?;
  TcxKeystore::from_json(&normalized_keystore_json).map_core_err()
}

fn stored_keystore(wallet: &WalletInfo) -> CoreResult<TcxKeystore> {
  TcxKeystore::from_json(&wallet.keystore.to_json_string()?).map_core_err()
}

fn normalize_mnemonic(mnemonic: &str) -> String {
  mnemonic.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn create_mnemonic(entropy: Option<String>) -> CoreResult<String> {
  match entropy {
    Some(entropy_hex) => {
      let entropy = Vec::from_hex_auto(entropy_hex.trim()).map_core_err()?;
      mnemonic_from_entropy(&entropy).map_core_err()
    }
    None => mnemonic_from_entropy(&random_u8_16()).map_core_err(),
  }
}

fn build_metadata(
  name: Option<String>,
  password_hint: Option<String>,
  network: IdentityNetwork,
  source: Source,
  default_name: &str,
) -> Metadata {
  Metadata {
    name: sanitize_optional_text(name).unwrap_or_else(|| default_name.to_string()),
    password_hint: sanitize_optional_text(password_hint),
    source,
    network,
    ..Metadata::default()
  }
}
