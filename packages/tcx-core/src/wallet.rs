use napi::Result;
use napi_derive::napi;

use crate::error::napi_result;
use crate::service;
use crate::types::{DerivationInput, WalletAccount, WalletInfo};

#[napi(js_name = "listWallet")]
pub fn list_wallet(vault_path: String) -> Result<Vec<WalletInfo>> {
  napi_result(service::list_wallets(vault_path))
}

#[napi(js_name = "getWallet")]
/// Loads a persisted wallet from the vault by wallet id, exact name, or unique id prefix.
pub fn get_wallet(name_or_id: String, vault_path: String) -> Result<WalletInfo> {
  napi_result(service::get_wallet(name_or_id, vault_path))
}

#[napi(js_name = "deleteWallet")]
/// Deletes a wallet from the vault by wallet id, exact name, or unique id prefix.
pub fn delete_wallet(name_or_id: String, vault_path: String) -> Result<()> {
  napi_result(service::delete_wallet(name_or_id, vault_path))
}

#[napi(js_name = "createWallet")]
/// Creates a new mnemonic-backed wallet.
///
/// The returned WalletInfo is also persisted under
/// `<vaultPath>/wallets/<wallet id>.json`. `index` selects the default derived
/// account index.
pub fn create_wallet(
  name: String,
  passphrase: String,
  vault_path: String,
  index: Option<u32>,
) -> Result<WalletInfo> {
  napi_result(service::create_wallet(name, passphrase, vault_path, index))
}

#[napi(js_name = "importWalletMnemonic")]
/// Imports an existing mnemonic-backed wallet.
///
/// The returned WalletInfo is also persisted under
/// `<vaultPath>/wallets/<wallet id>.json`. `index` selects the default derived
/// account index.
pub fn import_wallet_mnemonic(
  name: String,
  mnemonic: String,
  passphrase: String,
  vault_path: String,
  index: Option<u32>,
) -> Result<WalletInfo> {
  napi_result(service::import_wallet_mnemonic(
    name, mnemonic, passphrase, vault_path, index,
  ))
}

#[napi(js_name = "importWalletPrivateKey")]
/// Imports a private key as a non-derivable wallet.
///
/// The returned WalletInfo is also persisted under
/// `<vaultPath>/wallets/<wallet id>.json`. `index` is accepted for API parity
/// but ignored because private-key wallets are non-derivable.
pub fn import_wallet_private_key(
  name: String,
  private_key: String,
  passphrase: String,
  vault_path: String,
  index: Option<u32>,
) -> Result<WalletInfo> {
  napi_result(service::import_wallet_private_key(
    name,
    private_key,
    passphrase,
    vault_path,
    index,
  ))
}

#[napi(js_name = "loadWallet")]
/// Loads a serialized keystore JSON and derives accounts from it.
///
/// If `derivations` is omitted, default Ethereum and Tron accounts are derived
/// for the wallet network stored in the keystore.
pub fn load_wallet(
  keystore_json: String,
  password: String,
  derivations: Option<Vec<DerivationInput>>,
) -> Result<WalletInfo> {
  napi_result(service::load_wallet(keystore_json, password, derivations))
}

#[napi(js_name = "importWalletKeystore")]
/// Imports a keystore JSON into the local vault under the provided wallet name.
///
/// The wallet is renamed before persistence, then default or requested accounts
/// are derived in the same unlock flow.
pub fn import_wallet_keystore(
  name: String,
  keystore_json: String,
  password: String,
  vault_path: String,
  derivations: Option<Vec<DerivationInput>>,
) -> Result<WalletInfo> {
  napi_result(service::import_wallet_keystore(
    name,
    keystore_json,
    password,
    vault_path,
    derivations,
  ))
}

#[napi(js_name = "deriveAccounts")]
/// Derives accounts from a serialized keystore JSON in a single unlock flow.
///
/// If `derivations` is omitted, default Ethereum and Tron accounts are derived
/// for the wallet network stored in the keystore.
pub fn derive_accounts(
  keystore_json: String,
  password: String,
  derivations: Option<Vec<DerivationInput>>,
) -> Result<Vec<WalletAccount>> {
  napi_result(service::derive_accounts(
    keystore_json,
    password,
    derivations,
  ))
}
