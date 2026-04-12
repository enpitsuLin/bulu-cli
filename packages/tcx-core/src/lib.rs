#![deny(clippy::all)]

mod api_key;
mod chain;
mod derivation;
mod error;
mod policy;
mod policy_engine;
mod service;
mod signing;
mod strings;
mod types;
mod vault;
mod wallet;

pub use api_key::{create_api_key, get_api_key, list_api_key, revoke_api_key};
pub use policy::{create_policy, delete_policy, get_policy, list_policy};
pub use signing::{sign_message, sign_transaction};
pub use types::*;
pub use wallet::{
  create_wallet, delete_wallet, derive_accounts, export_wallet, get_wallet, import_wallet_keystore,
  import_wallet_mnemonic, import_wallet_private_key, list_wallet, load_wallet,
};

#[cfg(test)]
mod tests;
