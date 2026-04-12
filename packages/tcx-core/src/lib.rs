#![deny(clippy::all)]

mod chain;
mod derivation;
mod error;
mod service;
mod signing;
mod strings;
mod types;
mod vault;
mod wallet;

pub use signing::{sign_message, sign_transaction};
pub use types::*;
pub use wallet::{
  create_wallet, delete_wallet, derive_accounts, export_wallet, get_wallet, import_wallet_keystore,
  import_wallet_mnemonic, import_wallet_private_key, list_wallet, load_wallet,
};

#[cfg(test)]
mod tests;
