pub(crate) fn empty_to_none(value: String) -> Option<String> {
  if value.is_empty() {
    None
  } else {
    Some(value)
  }
}

pub(crate) fn sanitize_optional_text(value: Option<String>) -> Option<String> {
  value.and_then(|text| {
    let trimmed = text.trim();
    if trimmed.is_empty() {
      None
    } else {
      Some(trimmed.to_string())
    }
  })
}

pub(crate) fn strip_hex_prefix(value: &str) -> &str {
  value
    .strip_prefix("0x")
    .or_else(|| value.strip_prefix("0X"))
    .unwrap_or(value)
}
