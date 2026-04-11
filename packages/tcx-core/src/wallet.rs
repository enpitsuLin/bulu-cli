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
use crate::types::{
  CipherParams, CryptoData, DerivationInput, EncPairData, IdentityData, KdfParams, KeystoreData,
  KeystoreMetadata, WalletAccount, WalletInfo, WalletMeta, WalletNetwork, WalletSource,
};
use crate::vault;

#[napi(js_name = "listWallet")]
pub fn list_wallet(vault_path: String) -> Result<Vec<WalletInfo>> {
  vault::list_wallets(vault_path)
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
  let keystore_obj = value
    .as_object()
    .ok_or_else(|| napi::Error::from_reason("keystore must be an object"))?;

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
  let obj = value
    .as_object()
    .ok_or_else(|| napi::Error::from_reason("crypto must be an object"))?;

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

  let kdfparams = obj
    .get("kdfparams")
    .and_then(|v| parse_kdf_params(v, &kdf))
    .unwrap_or_else(|| KdfParams::pbkdf2(10240, "hmac-sha256".to_string(), 32, String::new()));

  Ok(CryptoData {
    cipher,
    cipher_params,
    ciphertext,
    kdf,
    kdfparams,
    mac,
  })
}

fn parse_cipher_params(value: &Value) -> Result<CipherParams> {
  let obj = value
    .as_object()
    .ok_or_else(|| napi::Error::from_reason("cipherparams must be an object"))?;
  Ok(CipherParams {
    iv: obj
      .get("iv")
      .and_then(|v| v.as_str())
      .ok_or_else(|| napi::Error::from_reason("missing iv field"))?
      .to_string(),
  })
}

fn parse_kdf_params(value: &Value, kdf_type: &str) -> Option<KdfParams> {
  let obj = value.as_object()?;
  let dklen = obj
    .get("dklen")
    .and_then(|v| v.as_u64())
    .map(|v| v as u32)
    .unwrap_or(32);
  let salt = obj
    .get("salt")
    .and_then(|v| v.as_str())
    .unwrap_or("")
    .to_string();

  if kdf_type == "scrypt" {
    Some(KdfParams {
      c: None,
      prf: None,
      n: obj.get("n").and_then(|v| v.as_u64()).map(|v| v as u32),
      p: obj.get("p").and_then(|v| v.as_u64()).map(|v| v as u32),
      r: obj.get("r").and_then(|v| v.as_u64()).map(|v| v as u32),
      dklen,
      salt,
    })
  } else {
    // Default to pbkdf2
    Some(KdfParams {
      c: obj.get("c").and_then(|v| v.as_u64()).map(|v| v as u32),
      prf: obj.get("prf").and_then(|v| v.as_str()).map(String::from),
      n: None,
      p: None,
      r: None,
      dklen,
      salt,
    })
  }
}

fn parse_identity_data(value: &Value) -> Result<IdentityData> {
  let obj = value
    .as_object()
    .ok_or_else(|| napi::Error::from_reason("identity must be an object"))?;
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
  let obj = value
    .as_object()
    .ok_or_else(|| napi::Error::from_reason("enc pair must be an object"))?;
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
  let obj = value
    .as_object()
    .ok_or_else(|| napi::Error::from_reason("imTokenMeta must be an object"))?;
  Ok(KeystoreMetadata {
    name: obj
      .get("name")
      .and_then(|v| v.as_str())
      .unwrap_or("Unknown")
      .to_string(),
    password_hint: obj
      .get("passwordHint")
      .and_then(|v| v.as_str())
      .map(String::from),
    timestamp: obj.get("timestamp").and_then(|v| v.as_i64()).unwrap_or(0),
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
    identified_chain_types: obj
      .get("identifiedChainTypes")
      .and_then(|v| v.as_array())
      .map(|arr| {
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
/// The returned WalletInfo is also persisted under
/// `<vaultPath>/wallets/<wallet id>.json`. `index` selects the default derived
/// account index.
pub fn create_wallet(
  name: String,
  passphrase: String,
  vault_path: String,
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
  let wallet_info = build_wallet_info(keystore, &passphrase, None, index)?;
  persist_wallet_info(&wallet_info, vault_path)?;
  Ok(wallet_info)
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
  let wallet_info = build_wallet_info(keystore, &passphrase, None, index)?;
  persist_wallet_info(&wallet_info, vault_path)?;
  Ok(wallet_info)
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
  let wallet_info = build_wallet_info(keystore, &passphrase, None, None)?;
  persist_wallet_info(&wallet_info, vault_path)?;
  Ok(wallet_info)
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

  build_wallet_info(keystore, &password, derivations, None)
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

fn build_wallet_info(
  mut keystore: TcxKeystore,
  password: &str,
  derivations: Option<Vec<DerivationInput>>,
  index: Option<u32>,
) -> Result<WalletInfo> {
  let network = keystore.store().meta.network;

  with_unlocked_keystore(&mut keystore, password, move |wallet| {
    let accounts = derive_accounts_for_wallet(wallet, network, derivations, index)?;
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
    keystore: build_keystore_data(keystore),
    meta: build_wallet_meta(keystore),
    accounts,
  }
}

fn persist_wallet_info(wallet_info: &WalletInfo, vault_path: String) -> Result<()> {
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

#[cfg(test)]
pub(crate) fn keystore_to_json(data: &KeystoreData) -> String {
  serde_json::to_string(&keystore_data_to_json(data)).unwrap_or_default()
}

pub(crate) fn keystore_data_to_json(data: &KeystoreData) -> Value {
  let mut value = Map::new();
  value.insert("id".to_string(), json!(data.id));
  value.insert("version".to_string(), json!(data.version));
  value.insert(
    "sourceFingerprint".to_string(),
    json!(data.source_fingerprint),
  );
  value.insert("crypto".to_string(), crypto_data_to_json(&data.crypto));
  value.insert(
    "identity".to_string(),
    identity_data_to_json(&data.identity),
  );
  if let Some(curve) = &data.curve {
    value.insert("curve".to_string(), json!(curve));
  }
  value.insert(
    "encOriginal".to_string(),
    enc_pair_data_to_json(&data.enc_original),
  );
  value.insert(
    "imTokenMeta".to_string(),
    keystore_metadata_to_json(&data.meta),
  );
  Value::Object(value)
}

pub(crate) fn crypto_data_to_json(data: &CryptoData) -> Value {
  let mut value = Map::new();
  value.insert("cipher".to_string(), json!(data.cipher));
  value.insert(
    "cipherparams".to_string(),
    cipher_params_to_json(&data.cipher_params),
  );
  value.insert("ciphertext".to_string(), json!(data.ciphertext));
  value.insert("mac".to_string(), json!(data.mac));
  // Add KDF fields (flat format: kdf + kdfparams) - matches tcx-keystore format
  value.insert("kdf".to_string(), json!(data.kdf.clone()));
  if data.kdf == "scrypt" {
    value.insert(
      "kdfparams".to_string(),
      json!({
        "n": data.kdfparams.n,
        "p": data.kdfparams.p,
        "r": data.kdfparams.r,
        "dklen": data.kdfparams.dklen,
        "salt": data.kdfparams.salt,
      }),
    );
  } else {
    value.insert(
      "kdfparams".to_string(),
      json!({
        "c": data.kdfparams.c,
        "prf": data.kdfparams.prf,
        "dklen": data.kdfparams.dklen,
        "salt": data.kdfparams.salt,
      }),
    );
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
    value.insert(
      "identifiedChainTypes".to_string(),
      json!(identified_chain_types),
    );
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
  let kdf_type_str = crypto_json
    .get("kdf")
    .and_then(|v| v.as_str())
    .unwrap_or("pbkdf2");
  let kdf_params = crypto_json
    .get("kdfparams")
    .and_then(|v| parse_kdf_params(v, kdf_type_str))
    .unwrap_or_else(|| KdfParams::pbkdf2(10240, "hmac-sha256".to_string(), 32, String::new()));

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
      kdf: kdf_type_str.to_string(),
      kdfparams: kdf_params,
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
