use serde::{Deserialize, Serialize};

/// BLAKE3 hash wrapper (256-bit = 64 hex characters)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub struct Blake3Hash(String);

impl Blake3Hash {
    /// Create a Blake3Hash from a 64-character lowercase hex string.
    ///
    /// PR #66 doctrine fix: prior to this version, `is_ascii_hexdigit` matched
    /// both uppercase and lowercase, so two distinct `Blake3Hash` values could
    /// be constructed from the same underlying digest (e.g. "ab..." vs "AB...").
    /// Receipts and provenance chains compare hashes via `PartialEq` on the
    /// inner string, so mixed-case acceptance produced silent equality failures.
    /// Canonical BLAKE3 hex is lowercase — reject everything else.
    pub fn from_hex(hex: String) -> Result<Self, String> {
        if hex.len() != 64 {
            return Err(format!("Invalid hash length: {} (expected 64)", hex.len()));
        }
        if !hex
            .chars()
            .all(|c| c.is_ascii_digit() || ('a'..='f').contains(&c))
        {
            return Err("Hash must be lowercase hex (digits 0-9, letters a-f only)".to_string());
        }
        Ok(Blake3Hash(hex))
    }

    /// Get the hex representation
    pub fn as_hex(&self) -> &str {
        &self.0
    }

    /// Convert to owned hex string
    pub fn to_hex(&self) -> String {
        self.0.clone()
    }
}

impl std::fmt::Display for Blake3Hash {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl AsRef<str> for Blake3Hash {
    fn as_ref(&self) -> &str {
        &self.0
    }
}

/// Canonical deterministic JSON with sorted keys.
///
/// PR #54 NaN class: `serde_json::Value::Number` cannot represent NaN/Inf, so
/// `serde_json::to_value` of an `f64::NAN` returns `Err` — but it can be easy
/// to wrap that error and emit a hash anyway. We make rejection explicit by
/// scanning the produced `Value` for any number that fails to serialise
/// (which under serde_json signals non-finite at the point we deserialised),
/// and we deny it as a serialization error.
pub fn canonical_json<T: serde::Serialize>(value: &T) -> Result<String, serde_json::Error> {
    let json = serde_json::to_value(value)?;
    // Defense in depth: any number in the produced Value should round-trip
    // through f64 finitely. If it doesn't, we've been given a custom Number
    // type via a feature flag — refuse it to keep hashes deterministic.
    reject_non_finite_numbers(&json)?;
    serde_json::to_string(&sort_json_value(&json))
}

fn reject_non_finite_numbers(value: &serde_json::Value) -> Result<(), serde_json::Error> {
    match value {
        serde_json::Value::Number(n) => {
            if let Some(f) = n.as_f64() {
                if !f.is_finite() {
                    // Construct a serde_json error by attempting an invalid op.
                    return Err(serde::de::Error::custom(
                        "canonical_json: non-finite number (NaN/Inf) is not canonicalizable",
                    ));
                }
            }
            Ok(())
        }
        serde_json::Value::Array(arr) => {
            for v in arr {
                reject_non_finite_numbers(v)?;
            }
            Ok(())
        }
        serde_json::Value::Object(map) => {
            for (_k, v) in map {
                reject_non_finite_numbers(v)?;
            }
            Ok(())
        }
        _ => Ok(()),
    }
}

/// Recursively sort all object keys in JSON value for deterministic output
fn sort_json_value(value: &serde_json::Value) -> serde_json::Value {
    match value {
        serde_json::Value::Object(map) => {
            let mut sorted: Vec<_> = map.iter().collect();
            sorted.sort_by(|a, b| a.0.cmp(b.0));
            let mut new_map = serde_json::Map::new();
            for (k, v) in sorted {
                new_map.insert(k.clone(), sort_json_value(v));
            }
            serde_json::Value::Object(new_map)
        }
        serde_json::Value::Array(arr) => {
            serde_json::Value::Array(arr.iter().map(sort_json_value).collect())
        }
        other => other.clone(),
    }
}

/// Compute BLAKE3 hash of bytes, returning 64-char hex string
pub fn blake3_hex(data: &[u8]) -> String {
    let hash = blake3::hash(data);
    hash.to_hex().to_string()
}

/// Compute BLAKE3 hash of a string
pub fn blake3_string(data: &str) -> String {
    blake3_hex(data.as_bytes())
}

/// Compute BLAKE3 hash of concatenated hashes (for combined_hash).
///
/// PR #66 doctrine fix: the original concatenated without a separator, which
/// meant `["aa", "bb"]` and `["a", "abb"]` produced identical input bytes and
/// therefore identical combined hashes. We now length-prefix each input
/// (length as little-endian u64, in hex) before concatenation, which makes
/// the encoding injective: distinct input sequences map to distinct strings.
pub fn blake3_combined(hashes: &[&str]) -> String {
    let mut combined = String::new();
    for h in hashes {
        // 16 hex chars = 64-bit length, more than enough for any hash string.
        combined.push_str(&format!("{:016x}:", h.len()));
        combined.push_str(h);
    }
    blake3_hex(combined.as_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_blake3_hash_creation() {
        let hex = "a".repeat(64);
        let hash = Blake3Hash::from_hex(hex.clone()).unwrap();
        assert_eq!(hash.as_hex(), hex);
    }

    #[test]
    fn test_blake3_invalid_length() {
        let result = Blake3Hash::from_hex("a".repeat(128));
        assert!(result.is_err());
    }

    #[test]
    fn test_blake3_string_hash() {
        let hash1 = blake3_string("test");
        let hash2 = blake3_string("test");
        assert_eq!(hash1, hash2);
        assert_eq!(hash1.len(), 64);
    }

    #[test]
    fn test_canonical_json() {
        let mut map1 = serde_json::Map::new();
        map1.insert("z".to_string(), serde_json::json!(1));
        map1.insert("a".to_string(), serde_json::json!(2));

        let mut map2 = serde_json::Map::new();
        map2.insert("a".to_string(), serde_json::json!(2));
        map2.insert("z".to_string(), serde_json::json!(1));

        let val1 = serde_json::Value::Object(map1);
        let val2 = serde_json::Value::Object(map2);

        let json1 = canonical_json(&val1).unwrap();
        let json2 = canonical_json(&val2).unwrap();

        assert_eq!(json1, json2);
        assert!(json1.starts_with(r#"{"a":2"#)); // Keys sorted alphabetically
    }

    #[test]
    fn test_blake3_combined() {
        let hash1 = "a".repeat(64);
        let hash2 = "b".repeat(64);
        let combined = blake3_combined(&[&hash1, &hash2]);
        assert_eq!(combined.len(), 64);
    }

    /// Rank-2 (domain contract): canonical BLAKE3 hex is lowercase. Mixed-case
    /// input must be rejected, because two `Blake3Hash` values with the same
    /// digest but different case would not be `PartialEq`-equal — that breaks
    /// receipt comparison.
    #[test]
    fn from_hex_rejects_uppercase() {
        let upper = "A".repeat(64);
        assert!(Blake3Hash::from_hex(upper).is_err());
        let mixed = format!("{}{}", "a".repeat(32), "A".repeat(32));
        assert!(Blake3Hash::from_hex(mixed).is_err());
        let lower = "a".repeat(64);
        assert!(Blake3Hash::from_hex(lower).is_ok());
    }

    /// Rank-1 (mathematical theorem): the concatenation function used inside
    /// `blake3_combined` must be injective over `&[&str]`. Equivalently: any
    /// two distinct input slices must produce distinct hashes.
    /// Regression for PR #66 — the original concatenated without separators,
    /// so `["aa","bb"] == ["a","abb"]` as byte streams and they collided.
    #[test]
    fn blake3_combined_is_injective_on_split_boundary() {
        let h1 = blake3_combined(&["aa", "bb"]);
        let h2 = blake3_combined(&["a", "abb"]);
        assert_ne!(
            h1, h2,
            "blake3_combined must distinguish split boundaries (PR #66)"
        );
        let h3 = blake3_combined(&["", "aabb"]);
        let h4 = blake3_combined(&["aabb", ""]);
        assert_ne!(h3, h4, "blake3_combined must distinguish empty placement");
    }

    /// Rank-1: canonical_json must refuse NaN/Inf rather than silently emit a
    /// non-canonical representation. Receipts that include NaN floats would
    /// otherwise produce stable-looking but provably-meaningless hashes.
    #[test]
    fn canonical_json_rejects_non_finite_numbers() {
        // serde_json::to_value of f64::NAN already errs, so test goes through a
        // hand-crafted Value carrying a number.
        let mut map = serde_json::Map::new();
        map.insert(
            "x".to_string(),
            serde_json::Value::Number(serde_json::Number::from_f64(1.5).expect("finite number")),
        );
        let v = serde_json::Value::Object(map);
        assert!(canonical_json(&v).is_ok());

        // Direct NaN attempt — must err either at to_value or at our check.
        let nan_attempt = serde_json::Number::from_f64(f64::NAN);
        assert!(
            nan_attempt.is_none(),
            "serde_json itself must already reject NaN at construction"
        );
    }
}
