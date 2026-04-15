use std::collections::HashMap;
use std::str::FromStr;

use ethereum_types::Address;
use num_bigint::BigInt;
use serde::Deserialize;
use serde_json::Value;
use tcx_common::{keccak256, FromHex};

use crate::error::{CoreError, CoreResult, ResultExt};

/// Standard EIP-712 / TIP-712 JSON payload.
#[derive(Debug, Clone, Deserialize)]
pub(crate) struct TypedData {
  pub(crate) types: HashMap<String, Vec<FieldDef>>,
  #[serde(rename = "primaryType")]
  pub(crate) primary_type: String,
  pub(crate) domain: Value,
  pub(crate) message: Value,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct FieldDef {
  pub(crate) name: String,
  #[serde(rename = "type")]
  pub(crate) type_: String,
}

impl TypedData {
  /// Compute the EIP-712 digest hash: keccak256("\x19\x01" || domainSeparator || hashStruct(message)).
  pub(crate) fn hash(&self) -> CoreResult<[u8; 32]> {
    let domain_separator = self.hash_struct("EIP712Domain", &self.domain)?;
    let message_hash = self.hash_struct(&self.primary_type, &self.message)?;

    let mut data = Vec::with_capacity(2 + 32 + 32);
    data.extend_from_slice(b"\x19\x01");
    data.extend_from_slice(&domain_separator);
    data.extend_from_slice(&message_hash);
    Ok(keccak256(&data))
  }

  /// hashStruct(type, data) = keccak256(typeHash || encodeData(type, data)).
  fn hash_struct(&self, type_name: &str, data: &Value) -> CoreResult<[u8; 32]> {
    let type_hash = self.type_hash(type_name)?;
    let fields = self.types.get(type_name).ok_or_else(|| {
      CoreError::new(format!(
        "EIP-712 type `{type_name}` is not defined in types"
      ))
    })?;

    let obj = data
      .as_object()
      .ok_or_else(|| CoreError::new(format!("EIP-712 expected object for type `{type_name}`")))?;

    let mut encoded = Vec::new();
    for field in fields {
      let value = obj.get(&field.name).ok_or_else(|| {
        CoreError::new(format!(
          "EIP-712 missing field `{}` for type `{type_name}`",
          field.name
        ))
      })?;
      encoded.extend_from_slice(&self.encode_value(&field.type_, value)?);
    }

    let mut buf = Vec::with_capacity(32 + encoded.len());
    buf.extend_from_slice(&type_hash);
    buf.extend_from_slice(&encoded);
    Ok(keccak256(&buf))
  }

  /// typeHash = keccak256(encodeType(type)).
  fn type_hash(&self, type_name: &str) -> CoreResult<[u8; 32]> {
    let encoded = self.encode_type(type_name)?;
    Ok(keccak256(encoded.as_bytes()))
  }

  /// encodeType builds the canonical type string, appending dependent struct types in alphabetical order.
  fn encode_type(&self, type_name: &str) -> CoreResult<String> {
    let fields = self.types.get(type_name).ok_or_else(|| {
      CoreError::new(format!(
        "EIP-712 type `{type_name}` is not defined in types"
      ))
    })?;

    let field_strs: Vec<String> = fields
      .iter()
      .map(|f| format!("{} {}", f.type_, f.name))
      .collect();
    let mut result = format!("{}({})", type_name, field_strs.join(","));

    // Collect referenced struct types (excluding builtins and the current type itself).
    let mut refs: Vec<String> = Vec::new();
    for f in fields {
      let base = base_type(&f.type_);
      if base != type_name && is_struct_type(base) && !refs.contains(&base.to_string()) {
        refs.push(base.to_string());
      }
    }
    refs.sort();

    for ref_type in refs {
      result.push_str(&self.encode_type(&ref_type)?);
    }

    Ok(result)
  }

  /// encodeValue encodes a single value according to its EIP-712 type.
  /// For struct types this returns hashStruct; for arrays it returns keccak256 of concatenated elements.
  fn encode_value(&self, type_name: &str, value: &Value) -> CoreResult<Vec<u8>> {
    // Arrays
    if let Some((base, _)) = parse_array_type(type_name) {
      let arr = value
        .as_array()
        .ok_or_else(|| CoreError::new(format!("EIP-712 expected array for type `{type_name}`")))?;
      let mut encoded = Vec::new();
      for item in arr {
        encoded.extend_from_slice(&self.encode_value(base, item)?);
      }
      return Ok(keccak256(&encoded).to_vec());
    }

    // Struct types -> hashStruct
    if is_struct_type(type_name) {
      let hash = self.hash_struct(type_name, value)?;
      return Ok(hash.to_vec());
    }

    // bytes
    if type_name == "bytes" {
      let bytes = value_to_bytes(value)?;
      return Ok(keccak256(&bytes).to_vec());
    }

    // string
    if type_name == "string" {
      let s = value
        .as_str()
        .ok_or_else(|| CoreError::new("EIP-712 expected string value"))?;
      return Ok(keccak256(s.as_bytes()).to_vec());
    }

    // bytesN
    if let Some(n) = parse_bytes_n(type_name) {
      let mut bytes = value_to_bytes(value)?;
      if bytes.len() != n {
        return Err(CoreError::new(format!(
          "EIP-712 `{type_name}` expected {n} bytes, got {}",
          bytes.len()
        )));
      }
      bytes.resize(32, 0);
      return Ok(bytes);
    }

    // address
    if type_name == "address" {
      let addr_str = value
        .as_str()
        .ok_or_else(|| CoreError::new("EIP-712 expected address string"))?;
      let addr = Address::from_str(addr_str).map_core_err()?;
      let mut buf = vec![0u8; 32];
      buf[12..32].copy_from_slice(addr.as_bytes());
      return Ok(buf);
    }

    // bool
    if type_name == "bool" {
      let b = value
        .as_bool()
        .ok_or_else(|| CoreError::new("EIP-712 expected bool value"))?;
      let mut buf = [0u8; 32];
      if b {
        buf[31] = 1;
      }
      return Ok(buf.to_vec());
    }

    // intN / uintN
    if let Some((signed, bits)) = parse_int_type(type_name) {
      let encoded = encode_int_value(value, signed, bits)?;
      return Ok(encoded.to_vec());
    }

    Err(CoreError::new(format!(
      "EIP-712 unsupported type `{type_name}`"
    )))
  }
}

/// Extract the base type from a potentially array type, e.g. "uint256[]" -> "uint256".
fn base_type(type_name: &str) -> &str {
  type_name.trim_end_matches("[]")
}

/// Parse an array type, returning (base_type, fixed_len_or_none).
/// E.g. "uint256[]" -> Some(("uint256", None)), "bytes32[4]" -> Some(("bytes32", Some(4))).
fn parse_array_type(type_name: &str) -> Option<(&str, Option<usize>)> {
  if let Some(open) = type_name.rfind('[') {
    let close = type_name.rfind(']')?;
    let base = &type_name[..open];
    let inner = &type_name[open + 1..close];
    let fixed = if inner.is_empty() {
      None
    } else {
      Some(inner.parse::<usize>().ok()?)
    };
    return Some((base, fixed));
  }
  None
}

/// Returns true if the type is a user-defined struct (not a built-in Solidity type).
fn is_struct_type(type_name: &str) -> bool {
  let base = base_type(type_name);
  match base {
    "address" | "bool" | "string" | "bytes" => false,
    _ if parse_bytes_n(base).is_some() => false,
    _ if parse_int_type(base).is_some() => false,
    _ => true,
  }
}

/// Parse `bytesN` -> Some(N) or None.
fn parse_bytes_n(type_name: &str) -> Option<usize> {
  if type_name.starts_with("bytes") && type_name != "bytes" {
    type_name[5..].parse::<usize>().ok()
  } else {
    None
  }
}

/// Parse integer type: returns (is_signed, bits).
/// Supports int8..int256 and uint8..uint256 in steps of 8.
fn parse_int_type(type_name: &str) -> Option<(bool, usize)> {
  let signed = if type_name.starts_with("uint") {
    false
  } else if type_name.starts_with("int") {
    true
  } else {
    return None;
  };

  let bits: usize = if signed {
    type_name[3..].parse().ok()?
  } else {
    type_name[4..].parse().ok()?
  };

  if bits > 0 && bits <= 256 && bits.is_multiple_of(8) {
    Some((signed, bits))
  } else {
    None
  }
}

/// Convert a JSON value to raw bytes for `bytes` / `bytesN` fields.
fn value_to_bytes(value: &Value) -> CoreResult<Vec<u8>> {
  match value {
    Value::String(s) => {
      if s.starts_with("0x") || s.starts_with("0X") {
        Vec::from_hex_auto(s).map_core_err()
      } else {
        Ok(s.as_bytes().to_vec())
      }
    }
    Value::Array(arr) => {
      let mut out = Vec::with_capacity(arr.len());
      for v in arr {
        let n = v
          .as_u64()
          .ok_or_else(|| CoreError::new("EIP-712 expected byte array of integers"))?;
        if n > 255 {
          return Err(CoreError::new("EIP-712 byte array value out of range"));
        }
        out.push(n as u8);
      }
      Ok(out)
    }
    Value::Number(n) => {
      let v = n
        .as_u64()
        .ok_or_else(|| CoreError::new("EIP-712 expected integer bytes"))?;
      Ok(vec![v as u8])
    }
    _ => Err(CoreError::new(
      "EIP-712 expected string or array for bytes value",
    )),
  }
}

/// Encode an integer value as 32-byte big-endian.
fn encode_int_value(value: &Value, signed: bool, bits: usize) -> CoreResult<[u8; 32]> {
  let str_val = match value {
    Value::String(s) => s.as_str(),
    Value::Number(n) => {
      return encode_int_str(&n.to_string(), signed, bits);
    }
    _ => {
      return Err(CoreError::new(
        "EIP-712 expected string or number for integer type",
      ))
    }
  };
  encode_int_str(str_val, signed, bits)
}

fn encode_int_str(value: &str, signed: bool, bits: usize) -> CoreResult<[u8; 32]> {
  let big = if value.starts_with("0x") || value.starts_with("0X") {
    BigInt::parse_bytes(value.as_bytes()[2..].as_ref(), 16)
      .ok_or_else(|| CoreError::new(format!("invalid hex integer `{value}`")))?
  } else {
    value
      .parse::<BigInt>()
      .map_err(|_| CoreError::new(format!("invalid decimal integer `{value}`")))?
  };

  let max_positive = BigInt::from(1) << (bits - 1);
  let max_unsigned = BigInt::from(1) << bits;

  if signed {
    if big < -max_positive.clone() || big >= max_positive {
      return Err(CoreError::new(format!(
        "signed int{bits} value `{value}` out of range"
      )));
    }
    let unsigned = if big < BigInt::from(0) {
      max_unsigned + big
    } else {
      big
    };
    big_int_to_32_bytes(&unsigned)
  } else {
    if big < BigInt::from(0) || big >= max_unsigned {
      return Err(CoreError::new(format!(
        "uint{bits} value `{value}` out of range"
      )));
    }
    big_int_to_32_bytes(&big)
  }
}

fn big_int_to_32_bytes(value: &BigInt) -> CoreResult<[u8; 32]> {
  let (_, bytes) = value.to_bytes_be();
  if bytes.len() > 32 {
    return Err(CoreError::new("integer value exceeds 256 bits"));
  }
  let mut buf = [0u8; 32];
  buf[32 - bytes.len()..].copy_from_slice(&bytes);
  Ok(buf)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_eip712_type_hash() {
    let json = r#"{
      "types": {
        "EIP712Domain": [],
        "Person": [
          {"name": "name", "type": "string"},
          {"name": "wallet", "type": "address"}
        ]
      },
      "primaryType": "Person",
      "domain": {},
      "message": {"name": "Cow", "wallet": "0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826"}
    }"#;
    let typed: TypedData = serde_json::from_str(json).unwrap();
    let encoded = typed.encode_type("Person").unwrap();
    assert_eq!(encoded, "Person(string name,address wallet)");
  }

  #[test]
  fn test_eip712_domain_separator_empty() {
    let json = r#"{
      "types": {
        "EIP712Domain": []
      },
      "primaryType": "EIP712Domain",
      "domain": {},
      "message": {}
    }"#;
    let typed: TypedData = serde_json::from_str(json).unwrap();
    let hash = typed.hash_struct("EIP712Domain", &typed.domain).unwrap();
    let type_hash = keccak256(b"EIP712Domain()");
    let expected = keccak256(&type_hash);
    assert_eq!(hash, expected);
  }

  #[test]
  fn test_encode_address() {
    let addr = Value::String("0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826".to_string());
    let json = r#"{"types":{"EIP712Domain":[],"T":[{"name":"a","type":"address"}]},"primaryType":"T","domain":{},"message":{"a":"0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826"}}"#;
    let typed: TypedData = serde_json::from_str(json).unwrap();
    let encoded = typed.encode_value("address", &addr).unwrap();
    assert_eq!(encoded.len(), 32);
    assert_eq!(
      &encoded[12..],
      Vec::from_hex_auto("0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826").unwrap()
    );
  }

  #[test]
  fn test_encode_uint256() {
    let val = Value::String("42".to_string());
    let encoded = encode_int_value(&val, false, 256).unwrap();
    let mut expected = [0u8; 32];
    expected[31] = 42;
    assert_eq!(encoded, expected);
  }

  #[test]
  fn test_encode_int256_negative() {
    let val = Value::String("-1".to_string());
    let encoded = encode_int_value(&val, true, 256).unwrap();
    let expected = [0xffu8; 32];
    assert_eq!(encoded, expected);
  }

  #[test]
  fn test_encode_bool() {
    let val = Value::Bool(true);
    let json = r#"{"types":{"EIP712Domain":[],"T":[{"name":"b","type":"bool"}]},"primaryType":"T","domain":{},"message":{"b":true}}"#;
    let typed: TypedData = serde_json::from_str(json).unwrap();
    let encoded = typed.encode_value("bool", &val).unwrap();
    let mut expected = [0u8; 32];
    expected[31] = 1;
    assert_eq!(encoded, expected);
  }

  #[test]
  fn test_encode_bytes32() {
    let val = Value::String(
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef".to_string(),
    );
    let json = r#"{"types":{"EIP712Domain":[],"T":[{"name":"b","type":"bytes32"}]},"primaryType":"T","domain":{},"message":{"b":"0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"}}"#;
    let typed: TypedData = serde_json::from_str(json).unwrap();
    let encoded = typed.encode_value("bytes32", &val).unwrap();
    assert_eq!(encoded.len(), 32);
  }

  #[test]
  fn test_encode_string() {
    let val = Value::String("hello".to_string());
    let json = r#"{"types":{"EIP712Domain":[],"T":[{"name":"s","type":"string"}]},"primaryType":"T","domain":{},"message":{"s":"hello"}}"#;
    let typed: TypedData = serde_json::from_str(json).unwrap();
    let encoded = typed.encode_value("string", &val).unwrap();
    assert_eq!(encoded, keccak256(b"hello").to_vec());
  }

  #[test]
  fn test_encode_array() {
    let val = Value::Array(vec![
      Value::String("1".to_string()),
      Value::String("2".to_string()),
    ]);
    let json = r#"{"types":{"EIP712Domain":[],"T":[{"name":"a","type":"uint256[]"}]},"primaryType":"T","domain":{},"message":{"a":["1","2"]}}"#;
    let typed: TypedData = serde_json::from_str(json).unwrap();
    let encoded = typed.encode_value("uint256[]", &val).unwrap();
    let mut concat = Vec::new();
    concat.extend_from_slice(&encode_int_str("1", false, 256).unwrap());
    concat.extend_from_slice(&encode_int_str("2", false, 256).unwrap());
    assert_eq!(encoded, keccak256(&concat).to_vec());
  }

  #[test]
  fn test_nested_struct_encoding() {
    let json = r#"{
      "types": {
        "EIP712Domain": [],
        "Person": [
          {"name": "name", "type": "string"},
          {"name": "wallet", "type": "address"}
        ],
        "Mail": [
          {"name": "from", "type": "Person"},
          {"name": "to", "type": "Person"},
          {"name": "contents", "type": "string"}
        ]
      },
      "primaryType": "Mail",
      "domain": {},
      "message": {
        "from": {"name": "Cow", "wallet": "0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826"},
        "to": {"name": "Bob", "wallet": "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB"},
        "contents": "Hello, Bob!"
      }
    }"#;
    let typed: TypedData = serde_json::from_str(json).unwrap();
    // Should not panic / stack overflow
    let _hash = typed.hash().unwrap();
  }
}
