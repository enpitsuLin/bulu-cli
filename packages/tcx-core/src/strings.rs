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
