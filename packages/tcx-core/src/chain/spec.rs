use crate::error::{CoreError, CoreResult};

use super::Caip2ChainId;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum Chain {
  Ethereum,
  Tron,
}

impl Chain {
  pub(crate) const ALL: [Self; 2] = [Self::Ethereum, Self::Tron];

  pub(crate) fn from_caip2(chain_id: &Caip2ChainId) -> CoreResult<Self> {
    match chain_id.namespace() {
      "eip155" => Ok(Self::Ethereum),
      "tron" => Ok(Self::Tron),
      namespace => Err(CoreError::new(format!(
        "unsupported chainId namespace `{namespace}`"
      ))),
    }
  }
}
