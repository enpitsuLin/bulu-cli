#![deny(clippy::all)]

mod constants;
mod derivation;
mod error;
mod ethereum;
mod signing;
mod strings;
mod types;
mod wallet;

pub use signing::{sign_message, sign_transaction};
pub use types::*;
pub use wallet::{
  create_wallet, derive_accounts, import_wallet_mnemonic, import_wallet_private_key, list_wallet,
  load_wallet,
};

#[cfg(test)]
mod tests;
