#![deny(clippy::all)]

mod api_key;
mod chain;
mod derivation;
mod error;
mod napi;
mod policy;
mod policy_engine;
mod signing;
mod strings;
mod types;
mod utils;
mod vault;
mod wallet;

pub use napi::{
  create_api_key, create_policy, create_wallet, delete_policy, delete_wallet, derive_accounts,
  export_wallet, get_api_key, get_policy, get_wallet, import_wallet_keystore,
  import_wallet_mnemonic, import_wallet_private_key, list_api_key, list_policy, list_wallet,
  load_wallet, revoke_api_key, sign_message, sign_transaction,
};
pub use types::*;

#[cfg(test)]
mod tests;
