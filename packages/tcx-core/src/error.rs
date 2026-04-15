use std::fmt::Display;

pub(crate) type CoreResult<T> = std::result::Result<T, CoreError>;

#[derive(Debug, thiserror::Error)]
pub(crate) enum CoreError {
  #[error("{0}")]
  Message(String),

  #[error("{resource} `{identifier}` not found")]
  NotFound {
    resource: &'static str,
    identifier: String,
  },

  #[error("{resource} `{name}` already exists")]
  AlreadyExists {
    resource: &'static str,
    name: String,
  },

  #[error("{resource} `{identifier}` is still referenced by an {reference}")]
  StillReferenced {
    resource: &'static str,
    identifier: String,
    reference: &'static str,
  },

  #[error("invalid input for `{field}`: {reason}")]
  InvalidInput { field: &'static str, reason: String },

  #[error("vault I/O error at `{path}`: {source}")]
  VaultIo {
    path: String,
    #[source]
    source: std::io::Error,
  },

  #[error("JSON error: {source}")]
  Json {
    #[from]
    source: serde_json::Error,
  },

  #[error("policy denied by `{policy}`: {reason}")]
  PolicyDenied { policy: String, reason: String },

  #[error("credential is invalid")]
  InvalidCredential,

  #[error("external error: {detail}")]
  External { detail: String },
}

impl CoreError {
  pub(crate) fn new(reason: impl Into<String>) -> Self {
    Self::Message(reason.into())
  }

  pub(crate) fn from_err(err: impl Display) -> Self {
    Self::External {
      detail: err.to_string(),
    }
  }

  pub(crate) fn with_context(context: impl Display, err: impl Display) -> Self {
    Self::Message(format!("{context}: {err}"))
  }
}

pub(crate) trait ResultExt<T> {
  fn map_core_err(self) -> CoreResult<T>;
}

impl<T, E> ResultExt<T> for std::result::Result<T, E>
where
  E: Display,
{
  fn map_core_err(self) -> CoreResult<T> {
    self.map_err(CoreError::from_err)
  }
}

pub(crate) trait CoreResultExt<T> {
  fn into_napi(self) -> napi::Result<T>;
}

impl<T> CoreResultExt<T> for CoreResult<T> {
  fn into_napi(self) -> napi::Result<T> {
    self.map_err(|err| napi::Error::from_reason(err.to_string()))
  }
}

pub(crate) fn require_non_empty(value: &str, field_name: &'static str) -> CoreResult<()> {
  if value.trim().is_empty() {
    return Err(CoreError::InvalidInput {
      field: field_name,
      reason: "must not be empty".into(),
    });
  }

  Ok(())
}

pub(crate) fn require_trimmed(value: &str, field_name: &'static str) -> CoreResult<String> {
  let trimmed = value.trim();
  if trimmed.is_empty() {
    return Err(CoreError::InvalidInput {
      field: field_name,
      reason: "must not be empty".into(),
    });
  }

  Ok(trimmed.to_string())
}
