use std::time::{SystemTime, UNIX_EPOCH};

use tcx_common::{FromHex, ToHex};
use tcx_keystore::keystore::IdentityNetwork;
use tcx_keystore::{Metadata, Source};

use crate::error::{CoreResult, ResultExt};
use crate::strings::sanitize_optional_text;

#[inline]
pub(crate) fn now_timestamp() -> i64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .expect("system clock should be after Unix epoch")
    .as_secs() as i64
}

#[inline]
pub(crate) fn new_record_id() -> String {
  tcx_common::random_u8_16().to_hex()
}

#[inline]
pub(crate) fn normalize_mnemonic(mnemonic: &str) -> String {
  mnemonic.split_whitespace().collect::<Vec<_>>().join(" ")
}

pub(crate) fn create_mnemonic(entropy: Option<String>) -> CoreResult<String> {
  match entropy {
    Some(entropy_hex) => {
      let entropy = Vec::from_hex_auto(entropy_hex.trim()).map_core_err()?;
      tcx_primitive::mnemonic_from_entropy(&entropy).map_core_err()
    }
    None => tcx_primitive::mnemonic_from_entropy(&tcx_common::random_u8_16()).map_core_err(),
  }
}

pub(crate) fn build_metadata(
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
