#![deny(clippy::all)]

// Infrastructure
mod error;
mod strings;
mod utils;

// Data types
mod types;

// Persistence
mod vault;

// Chain support
mod chain;
mod derivation;
mod typed_data;

// Business domains
mod api_key;
mod policy;
mod signing;
mod wallet;

// NAPI bindings
mod napi;

// Test utilities
#[cfg(test)]
mod test_utils;

pub use napi::{
  create_api_key, create_policy, create_wallet, delete_policy, delete_wallet, derive_accounts,
  export_eth_keystore_v3, export_wallet, get_api_key, get_policy, get_wallet,
  import_wallet_keystore, import_wallet_mnemonic, import_wallet_private_key, list_api_key,
  list_policy, list_wallet, load_wallet, revoke_api_key, sign_message, sign_raw, sign_transaction,
  sign_typed_data,
};
pub use types::*;
