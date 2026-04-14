#[cfg(test)]
pub(crate) mod fixtures {
  use std::env;
  use std::path::PathBuf;
  use std::time::{SystemTime, UNIX_EPOCH};

  pub(crate) const TEST_PASSWORD: &str = "imToken";
  pub(crate) const TEST_MNEMONIC: &str =
    "inject kidney empty canal shadow pact comfort wife crush horse wife sketch";
  pub(crate) const TEST_PRIVATE_KEY: &str =
    "a392604efc2fad9c0b3da43b5f698a2e3f270f170d859912be0d54742275c5f6";

  pub(crate) fn temp_vault_dir(test_name: &str) -> PathBuf {
    let timestamp = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .expect("system clock should be after Unix epoch")
      .as_nanos();

    env::temp_dir().join(format!(
      "tcx-core-{test_name}-{}-{timestamp}",
      std::process::id()
    ))
  }

  pub(crate) fn temp_vault(test_name: &str) -> (PathBuf, String) {
    let vault_dir = temp_vault_dir(test_name);
    let vault_path = vault_dir.to_string_lossy().into_owned();
    (vault_dir, vault_path)
  }
}
