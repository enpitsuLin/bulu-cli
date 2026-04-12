use napi::{Either, Result};
use napi_derive::napi;
use tcx_constants::CurveType;

use crate::error::CoreResultExt;
use crate::service;
use crate::types::{
  DerivationInput, PrivateKeyImportCurve, PrivateKeyImportOptions, WalletAccount, WalletInfo,
};

#[napi(js_name = "listWallet")]
pub fn list_wallet(vault_path: String) -> Result<Vec<WalletInfo>> {
  service::list_wallets(vault_path).into_napi()
}

#[napi(js_name = "getWallet")]
/// Loads a persisted wallet from the vault by wallet id, exact name, or unique id prefix.
pub fn get_wallet(name_or_id: String, vault_path: String) -> Result<WalletInfo> {
  service::get_wallet(name_or_id, vault_path).into_napi()
}

#[napi(js_name = "deleteWallet")]
/// Deletes a wallet from the vault by wallet id, exact name, or unique id prefix.
pub fn delete_wallet(name_or_id: String, vault_path: String) -> Result<()> {
  service::delete_wallet(name_or_id, vault_path).into_napi()
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
  service::create_wallet(name, passphrase, vault_path, index).into_napi()
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
  service::import_wallet_mnemonic(name, mnemonic, passphrase, vault_path, index).into_napi()
}

#[napi(js_name = "importWalletPrivateKey")]
/// Imports a private key as a non-derivable wallet.
///
/// The returned WalletInfo is also persisted under
/// `<vaultPath>/wallets/<wallet id>.json`. A numeric fifth argument is still
/// accepted for API parity and ignored. Pass `{ curve: 'ED25519' }` to import a
/// raw TON private key.
pub fn import_wallet_private_key(
  name: String,
  private_key: String,
  passphrase: String,
  vault_path: String,
  index_or_options: Option<Either<u32, PrivateKeyImportOptions>>,
) -> Result<WalletInfo> {
  service::import_wallet_private_key(
    name,
    private_key,
    passphrase,
    vault_path,
    parse_private_key_import_curve(index_or_options),
  )
  .into_napi()
}

#[napi(js_name = "loadWallet")]
/// Loads a serialized keystore JSON and derives accounts from it.
///
/// If `derivations` is omitted, default accounts are derived for the wallet
/// based on the stored network and supported curves.
pub fn load_wallet(
  keystore_json: String,
  password: String,
  derivations: Option<Vec<DerivationInput>>,
) -> Result<WalletInfo> {
  service::load_wallet(keystore_json, password, derivations).into_napi()
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
  service::import_wallet_keystore(name, keystore_json, password, vault_path, derivations)
    .into_napi()
}

#[napi(js_name = "deriveAccounts")]
/// Derives accounts from a serialized keystore JSON in a single unlock flow.
///
/// If `derivations` is omitted, default accounts are derived for the wallet
/// based on the stored network and supported curves.
pub fn derive_accounts(
  keystore_json: String,
  password: String,
  derivations: Option<Vec<DerivationInput>>,
) -> Result<Vec<WalletAccount>> {
  service::derive_accounts(keystore_json, password, derivations).into_napi()
}

#[napi(js_name = "exportWallet")]
/// Exports the wallet's mnemonic or private key.
///
/// Returns the mnemonic phrase for HD wallets or the private key for private key wallets.
/// Requires the wallet passphrase to decrypt the keystore.
pub fn export_wallet(name_or_id: String, password: String, vault_path: String) -> Result<String> {
  service::export_wallet(name_or_id, password, vault_path).into_napi()
}

fn parse_private_key_import_curve(
  index_or_options: Option<Either<u32, PrivateKeyImportOptions>>,
) -> Option<CurveType> {
  match index_or_options {
    Some(Either::B(options)) => match options.curve {
      Some(PrivateKeyImportCurve::Secp256k1) => Some(CurveType::SECP256k1),
      Some(PrivateKeyImportCurve::Ed25519) => Some(CurveType::ED25519),
      None => None,
    },
    _ => None,
  }
}
