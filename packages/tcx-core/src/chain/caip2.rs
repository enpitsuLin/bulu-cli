use std::fmt::{self, Display, Formatter};

use tcx_common::parse_u64;

use crate::error::{require_trimmed, CoreError, CoreResult};

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct Caip2ChainId {
  normalized: String,
  namespace: String,
  reference: String,
}

impl Caip2ChainId {
  pub(crate) fn parse_input(chain_id: String) -> CoreResult<Self> {
    let trimmed = require_trimmed(chain_id, "chainId")?;
    Self::parse(&trimmed)
  }

  pub(crate) fn parse(chain_id: &str) -> CoreResult<Self> {
    let Some((namespace, reference)) = chain_id.split_once(':') else {
      return Err(CoreError::new(format!(
        "chainId must be a CAIP-2 chain id, received `{chain_id}`"
      )));
    };

    let namespace = namespace.to_ascii_lowercase();
    if namespace.is_empty()
      || reference.is_empty()
      || reference.contains(':')
      || !namespace
        .chars()
        .all(|char| char.is_ascii_lowercase() || char.is_ascii_digit() || char == '-')
      || !reference
        .chars()
        .all(|char| char.is_ascii_alphanumeric() || char == '-' || char == '_')
    {
      return Err(CoreError::new(format!(
        "chainId must be a valid CAIP-2 chain id, received `{chain_id}`"
      )));
    }

    Ok(Self {
      normalized: format!("{namespace}:{reference}"),
      namespace,
      reference: reference.to_string(),
    })
  }

  pub(crate) fn as_str(&self) -> &str {
    &self.normalized
  }

  pub(crate) fn namespace(&self) -> &str {
    &self.namespace
  }

  pub(crate) fn ethereum_reference(&self) -> CoreResult<String> {
    if self.namespace != "eip155" {
      return Err(CoreError::new(format!(
        "unsupported chainId namespace `{}`",
        self.namespace
      )));
    }

    parse_u64(&self.reference).map_err(|_| {
      CoreError::new(format!(
        "chainId must use a numeric eip155 reference, received `{}`",
        self.normalized
      ))
    })?;

    Ok(self.reference.clone())
  }
}

impl Display for Caip2ChainId {
  fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
    f.write_str(self.as_str())
  }
}
