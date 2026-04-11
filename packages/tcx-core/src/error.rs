use napi::Error;
use std::error::Error as StdError;
use std::fmt::{self, Display, Formatter};

pub(crate) type CoreResult<T> = std::result::Result<T, CoreError>;

pub(crate) trait ResultExt<T> {
  fn map_core_err(self) -> CoreResult<T>;
  fn core_context(self, context: impl Display) -> CoreResult<T>;
}

impl<T, E> ResultExt<T> for std::result::Result<T, E>
where
  E: Display,
{
  fn map_core_err(self) -> CoreResult<T> {
    self.map_err(CoreError::from_err)
  }

  fn core_context(self, context: impl Display) -> CoreResult<T> {
    self.map_err(|err| CoreError::with_context(context, err))
  }
}

pub(crate) trait CoreResultExt<T> {
  fn into_napi(self) -> napi::Result<T>;
}

impl<T> CoreResultExt<T> for CoreResult<T> {
  fn into_napi(self) -> napi::Result<T> {
    self.map_err(to_napi_err)
  }
}

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

fn to_napi_err(err: impl Display) -> Error {
  Error::from_reason(err.to_string())
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
