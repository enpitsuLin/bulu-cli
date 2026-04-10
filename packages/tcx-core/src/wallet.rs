use napi::Result;
use napi_derive::napi;
use serde_json::{json, Map, Value};
use tcx_common::{random_u8_16, FromHex};
use tcx_keystore::keystore::IdentityNetwork;
use tcx_keystore::{Keystore as TcxKeystore, KeystoreGuard, Metadata, Source};
use tcx_primitive::mnemonic_from_entropy;

use crate::derivation::derive_accounts_for_wallet;
use crate::error::{require_non_empty, require_trimmed, to_napi_err};
use crate::strings::sanitize_optional_text;
use crate::vault;
use crate::types::{
  CipherParams, CryptoData, DerivationInput, EncPairData, IdentityData, KeystoreData,
  KeystoreMetadata, Pbkdf2Params, SCryptParams, WalletAccount, WalletInfo, WalletMeta,
  WalletNetwork, WalletSource,
};

#[napi(js_name = "listWallet")]
pub fn list_wallet(vault_path_opt: Option<String>) -> Result<Vec<WalletInfo>> {
  vault::list_wallets(vault_path_opt)
}

pub(crate) fn parse_wallet_info(content: &str) -> Result<WalletInfo> {
  let value: Value = serde_json::from_str(content).map_err(to_napi_err)?;

  let keystore = value
    .get("keystore")
    .ok_or_else(|| napi::Error::from_reason("missing keystore field"))
    .and_then(parse_keystore_data)?;

  let meta_obj = value
    .get("meta")
    .ok_or_else(|| napi::Error::from_reason("missing meta field"))?;

  let meta = WalletMeta {
    id: meta_obj
      .get("id")
      .and_then(|v| v.as_str())
      .ok_or_else(|| napi::Error::from_reason("missing meta.id field"))?
      .to_string(),
    version: meta_obj
      .get("version")
      .and_then(|v| v.as_i64())
      .ok_or_else(|| napi::Error::from_reason("missing meta.version field"))?,
    source_fingerprint: meta_obj
      .get("sourceFingerprint")
      .and_then(|v| v.as_str())
      .unwrap_or("")
      .to_string(),
    source: parse_wallet_source(meta_obj.get("source"))?,
    network: parse_wallet_network(meta_obj.get("network"))?,
    name: meta_obj
      .get("name")
      .and_then(|v| v.as_str())
      .unwrap_or("")
      .to_string(),
    password_hint: meta_obj
      .get("passwordHint")
      .and_then(|v| v.as_str())
      .map(String::from),
    timestamp: meta_obj
      .get("timestamp")
      .and_then(|v| v.as_i64())
      .unwrap_or(0),
    derivable: meta_obj
      .get("derivable")
      .and_then(|v| v.as_bool())
      .unwrap_or(false),
    curve: meta_obj
      .get("curve")
      .and_then(|v| v.as_str())
      .map(String::from),
    identified_chain_types: meta_obj
      .get("identifiedChainTypes")
      .and_then(|v| v.as_array())
      .map(|arr| {
        arr
          .iter()
          .filter_map(|v| v.as_str().map(String::from))
          .collect()
      }),
  };

  let accounts: Vec<WalletAccount> = value
    .get("accounts")
    .and_then(|v| v.as_array())
    .map(|arr| {
      arr
        .iter()
        .filter_map(|v| parse_wallet_account(v).ok())
        .collect()
    })
    .unwrap_or_default();

  Ok(WalletInfo {
    keystore,
    meta,
    accounts,
  })
}

fn parse_keystore_data(value: &Value) -> Result<KeystoreData> {
  let keystore_obj = value.as_object().ok_or_else(|| napi::Error::from_reason("keystore must be an object"))?;

  let crypto = keystore_obj
    .get("crypto")
    .ok_or_else(|| napi::Error::from_reason("missing crypto field"))
    .and_then(parse_crypto_data)?;

  let identity = keystore_obj
    .get("identity")
    .ok_or_else(|| napi::Error::from_reason("missing identity field"))
    .and_then(parse_identity_data)?;

  let enc_original = keystore_obj
    .get("encOriginal")
    .ok_or_else(|| napi::Error::from_reason("missing encOriginal field"))
    .and_then(parse_enc_pair_data)?;

  let meta = keystore_obj
    .get("imTokenMeta")
    .ok_or_else(|| napi::Error::from_reason("missing imTokenMeta field"))
    .and_then(parse_keystore_metadata)?;

  Ok(KeystoreData {
    id: keystore_obj
      .get("id")
      .and_then(|v| v.as_str())
      .ok_or_else(|| napi::Error::from_reason("missing id field"))?
      .to_string(),
    version: keystore_obj
      .get("version")
      .and_then(|v| v.as_i64())
      .ok_or_else(|| napi::Error::from_reason("missing version field"))?,
    source_fingerprint: keystore_obj
      .get("sourceFingerprint")
      .and_then(|v| v.as_str())
      .unwrap_or("")
      .to_string(),
    crypto,
    identity,
    curve: keystore_obj
      .get("curve")
      .and_then(|v| v.as_str())
      .map(String::from),
    enc_original,
    meta,
  })
}

fn parse_crypto_data(value: &Value) -> Result<CryptoData> {
  let obj = value.as_object().ok_or_else(|| napi::Error::from_reason("crypto must be an object"))?;

  let cipher = obj
    .get("cipher")
    .and_then(|v| v.as_str())
    .ok_or_else(|| napi::Error::from_reason("missing cipher field"))?
    .to_string();

  let cipher_params = obj
    .get("cipherparams")
    .ok_or_else(|| napi::Error::from_reason("missing cipherparams field"))
    .and_then(parse_cipher_params)?;

  let ciphertext = obj
    .get("ciphertext")
    .and_then(|v| v.as_str())
    .ok_or_else(|| napi::Error::from_reason("missing ciphertext field"))?
    .to_string();

  let mac = obj
    .get("mac")
    .and_then(|v| v.as_str())
    .ok_or_else(|| napi::Error::from_reason("missing mac field"))?
    .to_string();

  // Parse KDF fields (flat format: kdf + kdfparams)
  let kdf = obj
    .get("kdf")
    .and_then(|v| v.as_str())
    .unwrap_or("pbkdf2")
    .to_string();

  let (kdfparams, scrypt_params) = if let Some(kdfparams_value) = obj.get("kdfparams") {
    if kdf == "scrypt" {
      (None, Some(parse_scrypt_params(kdfparams_value)?))
    } else {
      (Some(parse_pbkdf2_params(kdfparams_value)?), None)
    }
  } else {
    (None, None)
  };

  Ok(CryptoData {
    cipher,
    cipher_params,
    ciphertext,
    kdf,
    kdfparams,
    scrypt_params,
    mac,
  })
}

fn parse_cipher_params(value: &Value) -> Result<CipherParams> {
  let obj = value.as_object().ok_or_else(|| napi::Error::from_reason("cipherparams must be an object"))?;
  Ok(CipherParams {
    iv: obj
      .get("iv")
      .and_then(|v| v.as_str())
      .ok_or_else(|| napi::Error::from_reason("missing iv field"))?
      .to_string(),
  })
}

fn parse_pbkdf2_params(value: &Value) -> Result<Pbkdf2Params> {
  let obj = value.as_object().ok_or_else(|| napi::Error::from_reason("pbkdf2 params must be an object"))?;
  Ok(Pbkdf2Params {
    c: obj
      .get("c")
      .and_then(|v| v.as_u64())
      .map(|v| v as u32)
      .unwrap_or(10240),
    prf: obj
      .get("prf")
      .and_then(|v| v.as_str())
      .unwrap_or("hmac-sha256")
      .to_string(),
    dklen: obj
      .get("dklen")
      .and_then(|v| v.as_u64())
      .map(|v| v as u32)
      .unwrap_or(32),
    salt: obj
      .get("salt")
      .and_then(|v| v.as_str())
      .unwrap_or("")
      .to_string(),
  })
}

fn parse_scrypt_params(value: &Value) -> Result<SCryptParams> {
  let obj = value.as_object().ok_or_else(|| napi::Error::from_reason("scrypt params must be an object"))?;
  Ok(SCryptParams {
    n: obj
      .get("n")
      .and_then(|v| v.as_u64())
      .map(|v| v as u32)
      .unwrap_or(262144),
    p: obj
      .get("p")
      .and_then(|v| v.as_u64())
      .map(|v| v as u32)
      .unwrap_or(1),
    r: obj
      .get("r")
      .and_then(|v| v.as_u64())
      .map(|v| v as u32)
      .unwrap_or(8),
    dklen: obj
      .get("dklen")
      .and_then(|v| v.as_u64())
      .map(|v| v as u32)
      .unwrap_or(32),
    salt: obj
      .get("salt")
      .and_then(|v| v.as_str())
      .unwrap_or("")
      .to_string(),
  })
}

fn parse_identity_data(value: &Value) -> Result<IdentityData> {
  let obj = value.as_object().ok_or_else(|| napi::Error::from_reason("identity must be an object"))?;
  Ok(IdentityData {
    enc_auth_key: obj
      .get("encAuthKey")
      .ok_or_else(|| napi::Error::from_reason("missing encAuthKey field"))
      .and_then(parse_enc_pair_data)?,
    enc_key: obj
      .get("encKey")
      .and_then(|v| v.as_str())
      .ok_or_else(|| napi::Error::from_reason("missing encKey field"))?
      .to_string(),
    identifier: obj
      .get("identifier")
      .and_then(|v| v.as_str())
      .ok_or_else(|| napi::Error::from_reason("missing identifier field"))?
      .to_string(),
    ipfs_id: obj
      .get("ipfsId")
      .and_then(|v| v.as_str())
      .ok_or_else(|| napi::Error::from_reason("missing ipfsId field"))?
      .to_string(),
  })
}

fn parse_enc_pair_data(value: &Value) -> Result<EncPairData> {
  let obj = value.as_object().ok_or_else(|| napi::Error::from_reason("enc pair must be an object"))?;
  Ok(EncPairData {
    enc_str: obj
      .get("encStr")
      .and_then(|v| v.as_str())
      .ok_or_else(|| napi::Error::from_reason("missing encStr field"))?
      .to_string(),
    nonce: obj
      .get("nonce")
      .and_then(|v| v.as_str())
      .ok_or_else(|| napi::Error::from_reason("missing nonce field"))?
      .to_string(),
  })
}

fn parse_keystore_metadata(value: &Value) -> Result<KeystoreMetadata> {
  let obj = value.as_object().ok_or_else(|| napi::Error::from_reason("imTokenMeta must be an object"))?;
  Ok(KeystoreMetadata {
    name: obj
      .get("name")
      .and_then(|v| v.as_str())
      .unwrap_or("Unknown")
      .to_string(),
    password_hint: obj.get("passwordHint").and_then(|v| v.as_str()).map(String::from),
    timestamp: obj
      .get("timestamp")
      .and_then(|v| v.as_i64())
      .unwrap_or(0),
    source: obj
      .get("source")
      .and_then(|v| v.as_str())
      .unwrap_or("MNEMONIC")
      .to_string(),
    network: obj
      .get("network")
      .and_then(|v| v.as_str())
      .unwrap_or("MAINNET")
      .to_string(),
    identified_chain_types: obj.get("identifiedChainTypes").and_then(|v| v.as_array()).map(|arr| {
      arr
        .iter()
        .filter_map(|v| v.as_str().map(String::from))
        .collect()
    }),
  })
}

fn parse_wallet_source(value: Option<&Value>) -> Result<WalletSource> {
  let source_str = value
    .and_then(|v| v.as_str())
    .ok_or_else(|| napi::Error::from_reason("missing or invalid source field"))?;

  match source_str {
    "WIF" => Ok(WalletSource::Wif),
    "PRIVATE" => Ok(WalletSource::Private),
    "KEYSTORE_V3" => Ok(WalletSource::KeystoreV3),
    "SUBSTRATE_KEYSTORE" => Ok(WalletSource::SubstrateKeystore),
    "MNEMONIC" => Ok(WalletSource::Mnemonic),
    "NEW_MNEMONIC" => Ok(WalletSource::NewMnemonic),
    _ => Err(napi::Error::from_reason(format!(
      "unknown source: {source_str}"
    ))),
  }
}

fn parse_wallet_network(value: Option<&Value>) -> Result<WalletNetwork> {
  let network_str = value
    .and_then(|v| v.as_str())
    .ok_or_else(|| napi::Error::from_reason("missing or invalid network field"))?;

  match network_str {
    "MAINNET" => Ok(WalletNetwork::Mainnet),
    "TESTNET" => Ok(WalletNetwork::Testnet),
    _ => Err(napi::Error::from_reason(format!(
      "unknown network: {network_str}"
    ))),
  }
}

fn parse_wallet_account(value: &Value) -> Result<WalletAccount> {
  Ok(WalletAccount {
    chain_id: value
      .get("chainId")
      .and_then(|v| v.as_str())
      .ok_or_else(|| napi::Error::from_reason("missing chainId field"))?
      .to_string(),
    address: value
      .get("address")
      .and_then(|v| v.as_str())
      .ok_or_else(|| napi::Error::from_reason("missing address field"))?
      .to_string(),
    public_key: value
      .get("publicKey")
      .and_then(|v| v.as_str())
      .ok_or_else(|| napi::Error::from_reason("missing publicKey field"))?
      .to_string(),
    derivation_path: value
      .get("derivationPath")
      .and_then(|v| v.as_str())
      .map(String::from),
    ext_pub_key: value
      .get("extPubKey")
      .and_then(|v| v.as_str())
      .map(String::from),
  })
}

#[napi(js_name = "createWallet")]
/// Creates a new mnemonic-backed wallet.
///
/// If `vaultPath` is provided, the returned WalletInfo is also persisted under
/// that directory as `<wallet id>.json`. `index` selects the default derived
/// account index.
pub fn create_wallet(
  name: String,
  passphrase: String,
  vault_path: Option<String>,
  index: Option<u32>,
) -> Result<WalletInfo> {
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

  finalize_wallet(keystore, &passphrase, None, vault_path, index)
}

#[napi(js_name = "importWalletMnemonic")]
/// Imports an existing mnemonic-backed wallet.
///
/// If `vaultPath` is provided, the returned WalletInfo is also persisted under
/// that directory as `<wallet id>.json`. `index` selects the default derived
/// account index.
pub fn import_wallet_mnemonic(
  name: String,
  mnemonic: String,
  passphrase: String,
  vault_path: Option<String>,
  index: Option<u32>,
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

  finalize_wallet(keystore, &passphrase, None, vault_path, index)
}

#[napi(js_name = "importWalletPrivateKey")]
/// Imports a private key as a non-derivable wallet.
///
/// If `vaultPath` is provided, the returned WalletInfo is also persisted under
/// that directory as `<wallet id>.json`. `index` is accepted for API parity but
/// ignored because private-key wallets are non-derivable.
pub fn import_wallet_private_key(
  name: String,
  private_key: String,
  passphrase: String,
  vault_path: Option<String>,
  index: Option<u32>,
) -> Result<WalletInfo> {
  require_non_empty(&passphrase, "passphrase")?;
  let _ = index;

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

  finalize_wallet(keystore, &passphrase, None, vault_path, None)
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

  finalize_wallet(keystore, &password, derivations, None, None)
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
    derive_accounts_for_wallet(wallet, network, derivations, None)
  })
}

fn finalize_wallet(
  mut keystore: TcxKeystore,
  password: &str,
  derivations: Option<Vec<DerivationInput>>,
  vault_path: Option<String>,
  index: Option<u32>,
) -> Result<WalletInfo> {
  let network = keystore.store().meta.network;

  let wallet_info = with_unlocked_keystore(&mut keystore, password, move |wallet| {
    let accounts = derive_accounts_for_wallet(wallet, network, derivations, index)?;
    Ok(build_wallet_result(wallet, accounts))
  })?;

  persist_wallet_info(&wallet_info, vault_path)?;

  Ok(wallet_info)
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
    keystore: build_keystore_data(keystore),
    meta: build_wallet_meta(keystore),
    accounts,
  }
}

fn persist_wallet_info(wallet_info: &WalletInfo, vault_path: Option<String>) -> Result<()> {
  let Some(vault_path) = vault_path else {
    return Ok(());
  };
  vault::save_wallet(wallet_info, vault_path)
}

/// Converts WalletInfo to JSON Value for serialization
pub(crate) fn wallet_info_to_json(wallet_info: &WalletInfo) -> Value {
  json!({
    "keystore": keystore_data_to_json(&wallet_info.keystore),
    "meta": wallet_meta_to_json(&wallet_info.meta),
    "accounts": wallet_info.accounts.iter().map(wallet_account_to_json).collect::<Vec<_>>(),
  })
}

pub(crate) fn keystore_to_json(data: &KeystoreData) -> String {
  serde_json::to_string(&keystore_data_to_json(data)).unwrap_or_default()
}

pub(crate) fn keystore_data_to_json(data: &KeystoreData) -> Value {
  let mut value = Map::new();
  value.insert("id".to_string(), json!(data.id));
  value.insert("version".to_string(), json!(data.version));
  value.insert("sourceFingerprint".to_string(), json!(data.source_fingerprint));
  value.insert("crypto".to_string(), crypto_data_to_json(&data.crypto));
  value.insert("identity".to_string(), identity_data_to_json(&data.identity));
  if let Some(curve) = &data.curve {
    value.insert("curve".to_string(), json!(curve));
  }
  value.insert("encOriginal".to_string(), enc_pair_data_to_json(&data.enc_original));
  value.insert("imTokenMeta".to_string(), keystore_metadata_to_json(&data.meta));
  Value::Object(value)
}

pub(crate) fn crypto_data_to_json(data: &CryptoData) -> Value {
  let mut value = Map::new();
  value.insert("cipher".to_string(), json!(data.cipher));
  value.insert("cipherparams".to_string(), cipher_params_to_json(&data.cipher_params));
  value.insert("ciphertext".to_string(), json!(data.ciphertext));
  value.insert("mac".to_string(), json!(data.mac));
  // Add KDF fields (flat format: kdf + kdfparams)
  value.insert("kdf".to_string(), json!(data.kdf.clone()));
  if let Some(pbkdf2) = &data.kdfparams {
    value.insert("kdfparams".to_string(), json!({
      "c": pbkdf2.c,
      "prf": pbkdf2.prf,
      "dklen": pbkdf2.dklen,
      "salt": pbkdf2.salt,
    }));
  } else if let Some(scrypt) = &data.scrypt_params {
    value.insert("kdfparams".to_string(), json!({
      "n": scrypt.n,
      "p": scrypt.p,
      "r": scrypt.r,
      "dklen": scrypt.dklen,
      "salt": scrypt.salt,
    }));
  }
  Value::Object(value)
}

pub(crate) fn cipher_params_to_json(params: &CipherParams) -> Value {
  json!({ "iv": params.iv })
}

pub(crate) fn identity_data_to_json(data: &IdentityData) -> Value {
  json!({
    "encAuthKey": enc_pair_data_to_json(&data.enc_auth_key),
    "encKey": data.enc_key,
    "identifier": data.identifier,
    "ipfsId": data.ipfs_id,
  })
}

pub(crate) fn enc_pair_data_to_json(data: &EncPairData) -> Value {
  json!({
    "encStr": data.enc_str,
    "nonce": data.nonce,
  })
}

pub(crate) fn keystore_metadata_to_json(meta: &KeystoreMetadata) -> Value {
  let mut value = Map::new();
  value.insert("name".to_string(), json!(meta.name));
  if let Some(password_hint) = &meta.password_hint {
    value.insert("passwordHint".to_string(), json!(password_hint));
  }
  value.insert("timestamp".to_string(), json!(meta.timestamp));
  value.insert("source".to_string(), json!(meta.source));
  value.insert("network".to_string(), json!(meta.network));
  if let Some(identified_chain_types) = &meta.identified_chain_types {
    value.insert("identifiedChainTypes".to_string(), json!(identified_chain_types));
  }
  Value::Object(value)
}

pub(crate) fn wallet_account_to_json(account: &WalletAccount) -> Value {
  let mut value = Map::new();
  value.insert("chainId".to_string(), json!(account.chain_id));
  value.insert("address".to_string(), json!(account.address));
  value.insert("publicKey".to_string(), json!(account.public_key));

  if let Some(derivation_path) = &account.derivation_path {
    value.insert("derivationPath".to_string(), json!(derivation_path));
  }
  if let Some(ext_pub_key) = &account.ext_pub_key {
    value.insert("extPubKey".to_string(), json!(ext_pub_key));
  }

  Value::Object(value)
}

pub(crate) fn wallet_meta_to_json(meta: &WalletMeta) -> Value {
  let mut value = Map::new();
  value.insert("id".to_string(), json!(meta.id));
  value.insert("version".to_string(), json!(meta.version));
  value.insert(
    "sourceFingerprint".to_string(),
    json!(meta.source_fingerprint),
  );
  value.insert(
    "source".to_string(),
    json!(wallet_source_to_json(meta.source)),
  );
  value.insert(
    "network".to_string(),
    json!(wallet_network_to_json(meta.network)),
  );
  value.insert("name".to_string(), json!(meta.name));
  value.insert("timestamp".to_string(), json!(meta.timestamp));
  value.insert("derivable".to_string(), json!(meta.derivable));

  if let Some(password_hint) = &meta.password_hint {
    value.insert("passwordHint".to_string(), json!(password_hint));
  }
  if let Some(curve) = &meta.curve {
    value.insert("curve".to_string(), json!(curve));
  }
  if let Some(identified_chain_types) = &meta.identified_chain_types {
    value.insert(
      "identifiedChainTypes".to_string(),
      json!(identified_chain_types),
    );
  }

  Value::Object(value)
}

pub(crate) fn wallet_network_to_json(network: WalletNetwork) -> &'static str {
  match network {
    WalletNetwork::Mainnet => "MAINNET",
    WalletNetwork::Testnet => "TESTNET",
  }
}

pub(crate) fn wallet_source_to_json(source: WalletSource) -> &'static str {
  match source {
    WalletSource::Wif => "WIF",
    WalletSource::Private => "PRIVATE",
    WalletSource::KeystoreV3 => "KEYSTORE_V3",
    WalletSource::SubstrateKeystore => "SUBSTRATE_KEYSTORE",
    WalletSource::Mnemonic => "MNEMONIC",
    WalletSource::NewMnemonic => "NEW_MNEMONIC",
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

fn build_keystore_data(keystore: &TcxKeystore) -> KeystoreData {
  let store = keystore.store();
  let crypto = &store.crypto;
  let identity = &store.identity;
  let meta = &store.meta;
  let enc_original = &store.enc_original;

  // Parse the crypto JSON to extract KDF parameters
  // We need to serialize and deserialize since tcx-keystore doesn't expose internal fields directly
  let crypto_json = serde_json::to_value(crypto).unwrap_or_default();
  
  // Extract KDF type and params from serialized crypto
  let (kdf_type_str, kdf_params, scrypt_params) = extract_kdf_params(&crypto_json);

  KeystoreData {
    id: store.id.clone(),
    version: store.version,
    source_fingerprint: store.source_fingerprint.clone(),
    crypto: CryptoData {
      cipher: crypto_json
        .get("cipher")
        .and_then(|v| v.as_str())
        .unwrap_or("aes-128-ctr")
        .to_string(),
      cipher_params: CipherParams {
        iv: crypto_json
          .get("cipherparams")
          .and_then(|v| v.get("iv"))
          .and_then(|v| v.as_str())
          .unwrap_or("")
          .to_string(),
      },
      ciphertext: crypto_json
        .get("ciphertext")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string(),
      kdf: kdf_type_str,
      kdfparams: kdf_params,
      scrypt_params,
      mac: crypto_json
        .get("mac")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string(),
    },
    identity: IdentityData {
      enc_auth_key: EncPairData {
        enc_str: identity.enc_auth_key.enc_str.clone(),
        nonce: identity.enc_auth_key.nonce.clone(),
      },
      enc_key: identity.enc_key.clone(),
      identifier: identity.identifier.clone(),
      ipfs_id: identity.ipfs_id.clone(),
    },
    curve: store.curve.map(|curve| curve.as_str().to_string()),
    enc_original: EncPairData {
      enc_str: enc_original.enc_str.clone(),
      nonce: enc_original.nonce.clone(),
    },
    meta: KeystoreMetadata {
      name: meta.name.clone(),
      password_hint: meta.password_hint.clone(),
      timestamp: meta.timestamp,
      source: format!("{:?}", meta.source).to_uppercase(),
      network: format!("{:?}", meta.network).to_uppercase(),
      identified_chain_types: meta.identified_chain_types.clone(),
    },
  }
}

fn extract_kdf_params(crypto_json: &Value) -> (String, Option<Pbkdf2Params>, Option<SCryptParams>) {
  // tcx-keystore uses "kdf" and "kdfparams" fields due to #[serde(tag = "kdf", content = "kdfparams")]
  let kdf_type = crypto_json
    .get("kdf")
    .and_then(|v| v.as_str())
    .unwrap_or("pbkdf2");
  
  if let Some(kdfparams) = crypto_json.get("kdfparams") {
    if kdf_type == "pbkdf2" {
      let params = Pbkdf2Params {
        c: kdfparams
          .get("c")
          .and_then(|v| v.as_u64())
          .map(|v| v as u32)
          .unwrap_or(10240),
        prf: kdfparams
          .get("prf")
          .and_then(|v| v.as_str())
          .unwrap_or("hmac-sha256")
          .to_string(),
        dklen: kdfparams
          .get("dklen")
          .and_then(|v| v.as_u64())
          .map(|v| v as u32)
          .unwrap_or(32),
        salt: kdfparams
          .get("salt")
          .and_then(|v| v.as_str())
          .unwrap_or("")
          .to_string(),
      };
      return ("pbkdf2".to_string(), Some(params), None);
    } else if kdf_type == "scrypt" {
      let params = SCryptParams {
        n: kdfparams
          .get("n")
          .and_then(|v| v.as_u64())
          .map(|v| v as u32)
          .unwrap_or(262144),
        p: kdfparams
          .get("p")
          .and_then(|v| v.as_u64())
          .map(|v| v as u32)
          .unwrap_or(1),
        r: kdfparams
          .get("r")
          .and_then(|v| v.as_u64())
          .map(|v| v as u32)
          .unwrap_or(8),
        dklen: kdfparams
          .get("dklen")
          .and_then(|v| v.as_u64())
          .map(|v| v as u32)
          .unwrap_or(32),
        salt: kdfparams
          .get("salt")
          .and_then(|v| v.as_str())
          .unwrap_or("")
          .to_string(),
      };
      return ("scrypt".to_string(), None, Some(params));
    }
  }
  
  // Fallback: Check for legacy format with pbkdf2/scrypt as direct fields (if any)
  if let Some(pbkdf2) = crypto_json.get("pbkdf2") {
    let params = Pbkdf2Params {
      c: pbkdf2
        .get("c")
        .and_then(|v| v.as_u64())
        .map(|v| v as u32)
        .unwrap_or(10240),
      prf: pbkdf2
        .get("prf")
        .and_then(|v| v.as_str())
        .unwrap_or("hmac-sha256")
        .to_string(),
      dklen: pbkdf2
        .get("dklen")
        .and_then(|v| v.as_u64())
        .map(|v| v as u32)
        .unwrap_or(32),
      salt: pbkdf2
        .get("salt")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string(),
    };
    return ("pbkdf2".to_string(), Some(params), None);
  }

  // Check for scrypt
  if let Some(scrypt) = crypto_json.get("scrypt") {
    let params = SCryptParams {
      n: scrypt
        .get("n")
        .and_then(|v| v.as_u64())
        .map(|v| v as u32)
        .unwrap_or(262144),
      p: scrypt
        .get("p")
        .and_then(|v| v.as_u64())
        .map(|v| v as u32)
        .unwrap_or(1),
      r: scrypt
        .get("r")
        .and_then(|v| v.as_u64())
        .map(|v| v as u32)
        .unwrap_or(8),
      dklen: scrypt
        .get("dklen")
        .and_then(|v| v.as_u64())
        .map(|v| v as u32)
        .unwrap_or(32),
      salt: scrypt
        .get("salt")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string(),
    };
    return ("scrypt".to_string(), None, Some(params));
  }

  // Default to pbkdf2
  ("pbkdf2".to_string(), None, None)
}
