use napi::Error;
use std::error::Error as StdError;
use std::fmt::{self, Display, Formatter};

pub(crate) type CoreResult<T> = std::result::Result<T, CoreError>;

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct CoreError {
  reason: String,
}

impl CoreError {
  pub(crate) fn new(reason: impl Into<String>) -> Self {
    Self {
      reason: reason.into(),
    }
  }

  pub(crate) fn from_err(err: impl Display) -> Self {
    Self::new(err.to_string())
  }

  pub(crate) fn with_context(context: impl Display, err: impl Display) -> Self {
    Self::new(format!("{context}: {err}"))
  }
}

impl Display for CoreError {
  fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
    f.write_str(&self.reason)
  }
}

impl StdError for CoreError {}

pub(crate) fn to_napi_err(err: impl Display) -> Error {
  Error::from_reason(err.to_string())
}

pub(crate) fn napi_result<T>(result: CoreResult<T>) -> napi::Result<T> {
  result.map_err(to_napi_err)
}

pub(crate) fn require_non_empty(value: &str, field_name: &str) -> CoreResult<()> {
  if value.trim().is_empty() {
    return Err(CoreError::new(format!("{field_name} must not be empty")));
  }

  Ok(())
}

pub(crate) fn require_trimmed(value: String, field_name: &str) -> CoreResult<String> {
  let trimmed = value.trim();
  if trimmed.is_empty() {
    return Err(CoreError::new(format!("{field_name} must not be empty")));
  }

  Ok(trimmed.to_string())
}
