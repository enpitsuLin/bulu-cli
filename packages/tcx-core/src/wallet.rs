use napi::Result;
use napi_derive::napi;
use tcx_common::{random_u8_16, FromHex};
use tcx_keystore::keystore::IdentityNetwork;
use tcx_keystore::{Keystore as TcxKeystore, KeystoreGuard, Metadata, Source};
use tcx_primitive::mnemonic_from_entropy;

use crate::derivation::derive_accounts_for_wallet;
use crate::error::{require_non_empty, require_trimmed, to_napi_err};
use crate::strings::sanitize_optional_text;
use crate::types::{DerivationInput, WalletAccount, WalletInfo, WalletMeta, WalletNetwork};

#[napi(js_name = "createWallet")]
/// Creates a new mnemonic-backed wallet.
///
/// If `entropy` is omitted, random 16-byte entropy is generated.
/// If `derivations` is omitted, default Ethereum and Tron accounts are derived
/// for the selected wallet network.
pub fn create_wallet(name: String, passphrase: String) -> Result<WalletInfo> {
  require_non_empty(&passphrase, "passphrase")?;

  let mnemonic = create_mnemonic(None)?;
  let metadata = build_metadata(
    Some(name),
    None,
    resolve_network(None),
    Source::NewMnemonic,
    "New Wallet",
  );
  let keystore =
    TcxKeystore::from_mnemonic(&mnemonic, &passphrase, metadata).map_err(to_napi_err)?;

  finalize_wallet(keystore, &passphrase, None)
}

#[napi(js_name = "importWalletMnemonic")]
/// Imports an existing mnemonic-backed wallet.
///
/// If `derivations` is omitted, default Ethereum and Tron accounts are derived
/// for the selected wallet network.
pub fn import_wallet_mnemonic(
  name: String,
  mnemonic: String,
  passphrase: String,
) -> Result<WalletInfo> {
  require_non_empty(&passphrase, "passphrase")?;

  let normalized_mnemonic = normalize_mnemonic(&mnemonic);
  require_non_empty(&normalized_mnemonic, "mnemonic")?;

  let metadata = build_metadata(
    Some(name),
    None,
    resolve_network(None),
    Source::Mnemonic,
    "Imported Mnemonic Wallet",
  );
  let keystore =
    TcxKeystore::from_mnemonic(&normalized_mnemonic, &passphrase, metadata).map_err(to_napi_err)?;

  finalize_wallet(keystore, &passphrase, None)
}

#[napi(js_name = "importWalletPrivateKey")]
/// Imports a private key as a non-derivable wallet.
///
/// If `derivations` is omitted, default Ethereum and Tron accounts are
/// returned. Derivation paths are ignored for non-derivable wallets.
pub fn import_wallet_private_key(
  name: String,
  private_key: String,
  passphrase: String,
) -> Result<WalletInfo> {
  require_non_empty(&passphrase, "passphrase")?;

  let normalized_private_key = require_trimmed(private_key, "privateKey")?;
  let metadata = build_metadata(
    Some(name),
    None,
    resolve_network(None),
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
  .map_err(to_napi_err)?;

  finalize_wallet(keystore, &passphrase, None)
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
  require_non_empty(&password, "password")?;

  let normalized_keystore_json = require_trimmed(keystore_json, "keystoreJson")?;
  let keystore = TcxKeystore::from_json(&normalized_keystore_json).map_err(to_napi_err)?;

  finalize_wallet(keystore, &password, derivations)
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
  require_non_empty(&password, "password")?;

  let normalized_keystore_json = require_trimmed(keystore_json, "keystoreJson")?;
  let mut keystore = TcxKeystore::from_json(&normalized_keystore_json).map_err(to_napi_err)?;
  let network = keystore.store().meta.network;

  with_unlocked_keystore(&mut keystore, &password, move |wallet| {
    derive_accounts_for_wallet(wallet, network, derivations)
  })
}

fn finalize_wallet(
  mut keystore: TcxKeystore,
  password: &str,
  derivations: Option<Vec<DerivationInput>>,
) -> Result<WalletInfo> {
  let network = keystore.store().meta.network;

  with_unlocked_keystore(&mut keystore, password, move |wallet| {
    let accounts = derive_accounts_for_wallet(wallet, network, derivations)?;
    Ok(build_wallet_result(wallet, accounts))
  })
}

pub(crate) fn with_unlocked_keystore<T>(
  keystore: &mut TcxKeystore,
  password: &str,
  f: impl FnOnce(&mut TcxKeystore) -> Result<T>,
) -> Result<T> {
  let mut guard = KeystoreGuard::unlock_by_password(keystore, password).map_err(to_napi_err)?;
  f(guard.keystore_mut())
}

fn normalize_mnemonic(mnemonic: &str) -> String {
  mnemonic.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn create_mnemonic(entropy: Option<String>) -> Result<String> {
  match entropy {
    Some(entropy_hex) => {
      let entropy = Vec::from_hex_auto(entropy_hex.trim()).map_err(to_napi_err)?;
      mnemonic_from_entropy(&entropy).map_err(to_napi_err)
    }
    None => mnemonic_from_entropy(&random_u8_16()).map_err(to_napi_err),
  }
}

fn resolve_network(network: Option<WalletNetwork>) -> IdentityNetwork {
  network.unwrap_or(WalletNetwork::Mainnet).into()
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

fn build_wallet_result(keystore: &TcxKeystore, accounts: Vec<WalletAccount>) -> WalletInfo {
  WalletInfo {
    keystore_json: keystore.to_json(),
    meta: build_wallet_meta(keystore),
    accounts,
  }
}

fn build_wallet_meta(keystore: &TcxKeystore) -> WalletMeta {
  let store = keystore.store();
  let meta = &store.meta;

  WalletMeta {
    id: store.id.clone(),
    version: store.version,
    source_fingerprint: store.source_fingerprint.clone(),
    source: meta.source.into(),
    network: meta.network.into(),
    name: meta.name.clone(),
    password_hint: meta.password_hint.clone(),
    timestamp: meta.timestamp,
    derivable: keystore.derivable(),
    curve: store.curve.map(|curve| curve.as_str().to_string()),
    identified_chain_types: meta.identified_chain_types.clone(),
  }
}
