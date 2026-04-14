use napi::{Either, Result};
use napi_derive::napi;

use crate::chain::SignedTransaction;
use crate::error::CoreResultExt;
use crate::types::{
  ApiKeyInfo, CreatedApiKey, DerivationInput, EthSignedTransaction, PolicyCreateInput, PolicyInfo,
  SignedMessage, TronSignedTransaction, WalletAccount, WalletInfo,
};

// ------------------------------------------------------------------
// Wallet
// ------------------------------------------------------------------

#[napi(js_name = "listWallet")]
pub fn list_wallet(vault_path: String) -> Result<Vec<WalletInfo>> {
  crate::wallet::list_wallets(vault_path).into_napi()
}

#[napi(js_name = "getWallet")]
/// Loads a persisted wallet from the vault by wallet id, exact name, or unique id prefix.
pub fn get_wallet(name_or_id: String, vault_path: String) -> Result<WalletInfo> {
  crate::wallet::get_wallet(name_or_id, vault_path).into_napi()
}

#[napi(js_name = "deleteWallet")]
/// Deletes a wallet from the vault by wallet id, exact name, or unique id prefix.
pub fn delete_wallet(name_or_id: String, vault_path: String) -> Result<()> {
  crate::wallet::delete_wallet(name_or_id, vault_path).into_napi()
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
  crate::wallet::create_wallet(name, passphrase, vault_path, index).into_napi()
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
  crate::wallet::import_wallet_mnemonic(name, mnemonic, passphrase, vault_path, index).into_napi()
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
  crate::wallet::import_wallet_private_key(name, private_key, passphrase, vault_path, index)
    .into_napi()
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
  crate::wallet::load_wallet(keystore_json, password, derivations).into_napi()
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
  crate::wallet::import_wallet_keystore(name, keystore_json, password, vault_path, derivations)
    .into_napi()
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
  crate::wallet::derive_accounts(keystore_json, password, derivations).into_napi()
}

#[napi(js_name = "exportWallet")]
/// Exports the wallet's mnemonic or private key.
///
/// Returns the mnemonic phrase for HD wallets or the private key for private key wallets.
/// Requires the wallet passphrase to decrypt the keystore.
pub fn export_wallet(name_or_id: String, password: String, vault_path: String) -> Result<String> {
  crate::wallet::export_wallet(name_or_id, password, vault_path).into_napi()
}

// ------------------------------------------------------------------
// API Key
// ------------------------------------------------------------------

#[napi(js_name = "listApiKey")]
/// Lists all persisted API keys in the vault.
pub fn list_api_key(vault_path: String) -> Result<Vec<ApiKeyInfo>> {
  crate::api_key::list_api_keys(vault_path).into_napi()
}

#[napi(js_name = "getApiKey")]
/// Loads a persisted API key by key id, exact name, or unique id prefix.
pub fn get_api_key(name_or_id: String, vault_path: String) -> Result<ApiKeyInfo> {
  crate::api_key::get_api_key(name_or_id, vault_path).into_napi()
}

#[napi(
  js_name = "createApiKey",
  ts_args_type = "name: string, walletIds: Array<string>, policyIds: Array<string>, passphrase: string, expiresAt?: number, vaultPathOpt?: string"
)]
/// Creates an API key bound to one or more wallets and optional declarative policies.
pub fn create_api_key(
  name: String,
  wallet_ids: Vec<String>,
  policy_ids: Vec<String>,
  passphrase: String,
  expires_at: Option<i64>,
  vault_path_opt: Option<String>,
) -> Result<CreatedApiKey> {
  crate::api_key::create_api_key(
    name,
    wallet_ids,
    policy_ids,
    passphrase,
    expires_at,
    vault_path_opt,
  )
  .into_napi()
}

#[napi(js_name = "revokeApiKey")]
/// Revokes an API key by removing its persisted record from the vault.
pub fn revoke_api_key(name_or_id: String, vault_path: String) -> Result<()> {
  crate::api_key::revoke_api_key(name_or_id, vault_path).into_napi()
}

// ------------------------------------------------------------------
// Policy
// ------------------------------------------------------------------

#[napi(js_name = "listPolicy")]
/// Lists all persisted policies in the vault.
pub fn list_policy(vault_path: String) -> Result<Vec<PolicyInfo>> {
  crate::policy::list_policies(vault_path).into_napi()
}

#[napi(js_name = "getPolicy")]
/// Loads a persisted policy by policy id, exact name, or unique id prefix.
pub fn get_policy(name_or_id: String, vault_path: String) -> Result<PolicyInfo> {
  crate::policy::get_policy(name_or_id, vault_path).into_napi()
}

#[napi(js_name = "createPolicy")]
/// Creates and persists a declarative policy definition.
pub fn create_policy(input: PolicyCreateInput, vault_path: String) -> Result<PolicyInfo> {
  crate::policy::create_policy(input, vault_path).into_napi()
}

#[napi(js_name = "deletePolicy")]
/// Deletes a policy if no API key still references it.
pub fn delete_policy(name_or_id: String, vault_path: String) -> Result<()> {
  crate::policy::delete_policy(name_or_id, vault_path).into_napi()
}

// ------------------------------------------------------------------
// Signing
// ------------------------------------------------------------------

#[napi(js_name = "signMessage")]
/// Signs a plain chain-specific message using the default chain conventions.
///
/// `chain_id` selects the signer implementation. Ethereum uses personal-sign
/// semantics, while Tron uses the default TRON message header and version.
/// `credential` accepts either the wallet passphrase (owner mode) or a
/// `bulu_key_...` API token (agent mode).
pub fn sign_message(
  name: String,
  chain_id: String,
  message: String,
  credential: String,
  vault_path: String,
) -> Result<SignedMessage> {
  crate::signing::sign_message(name, chain_id, message, credential, vault_path).into_napi()
}

#[napi(js_name = "signTransaction")]
/// Signs an unsigned chain-specific transaction hex using the default chain
/// conventions.
///
/// `chain_id` selects the signer implementation. Ethereum expects an unsigned
/// RLP-encoded transaction hex, while Tron expects raw transaction bytes hex.
/// `credential` accepts either the wallet passphrase (owner mode) or a
/// `bulu_key_...` API token (agent mode).
pub fn sign_transaction(
  name: String,
  chain_id: String,
  tx_hex: String,
  credential: String,
  vault_path: String,
) -> Result<Either<EthSignedTransaction, TronSignedTransaction>> {
  let signed =
    crate::signing::sign_transaction(name, chain_id, tx_hex, credential, vault_path).into_napi()?;

  Ok(match signed {
    SignedTransaction::Ethereum(result) => Either::A(result),
    SignedTransaction::Tron(result) => Either::B(result),
  })
}
