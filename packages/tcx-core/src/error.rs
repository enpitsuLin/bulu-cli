use napi::{Error, Result};

pub(crate) fn to_napi_err(err: impl std::fmt::Display) -> Error {
  Error::from_reason(err.to_string())
}

pub(crate) fn require_non_empty(value: &str, field_name: &str) -> Result<()> {
  if value.trim().is_empty() {
    return Err(Error::from_reason(format!(
      "{field_name} must not be empty"
    )));
  }

  Ok(())
}

pub(crate) fn require_trimmed(value: String, field_name: &str) -> Result<String> {
  let trimmed = value.trim();
  if trimmed.is_empty() {
    return Err(Error::from_reason(format!(
      "{field_name} must not be empty"
    )));
  }

  Ok(trimmed.to_string())
}
