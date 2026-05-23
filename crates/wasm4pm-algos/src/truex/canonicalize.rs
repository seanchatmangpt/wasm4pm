use serde_json::Value;

pub fn canonical_stringify(value: &Value) -> String {
    match value {
        Value::Null => "null".to_string(),
        Value::Bool(b) => if *b { "true".to_string() } else { "false".to_string() },
        Value::Number(n) => n.to_string(),
        Value::String(s) => {
            // Basic JSON string escaping
            let escaped = s
                .replace('\\', "\\\\")
                .replace('"', "\\\"")
                .replace('\n', "\\n")
                .replace('\r', "\\r")
                .replace('\t', "\\t");
            format!("\"{}\"", escaped)
        }
        Value::Array(arr) => {
            if arr.is_empty() {
                return "[]".to_string();
            }

            let mut clone = arr.clone();

            // Detect arrays that need deterministic sorting based on the first element
            if let Some(first) = clone.first().and_then(|v| v.as_object()) {
                if first.contains_key("ocel:id") {
                    clone.sort_by(|a, b| {
                        let id_a = a.get("ocel:id").and_then(|v| v.as_str()).unwrap_or("");
                        let id_b = b.get("ocel:id").and_then(|v| v.as_str()).unwrap_or("");
                        id_a.cmp(id_b)
                    });
                } else if first.contains_key("ocel:event-id") && first.contains_key("ocel:object-id") {
                    clone.sort_by(|a, b| {
                        let key_a = format!(
                            "{}|{}|{}",
                            a.get("ocel:event-id").and_then(|v| v.as_str()).unwrap_or(""),
                            a.get("ocel:object-id").and_then(|v| v.as_str()).unwrap_or(""),
                            a.get("ocel:qualifier").and_then(|v| v.as_str()).unwrap_or("")
                        );
                        let key_b = format!(
                            "{}|{}|{}",
                            b.get("ocel:event-id").and_then(|v| v.as_str()).unwrap_or(""),
                            b.get("ocel:object-id").and_then(|v| v.as_str()).unwrap_or(""),
                            b.get("ocel:qualifier").and_then(|v| v.as_str()).unwrap_or("")
                        );
                        key_a.cmp(&key_b)
                    });
                } else if first.contains_key("ocel:object-id") && first.contains_key("ocel:field") {
                    clone.sort_by(|a, b| {
                        let time_a = a.get("ocel:timestamp").or_else(|| a.get("ocel:time")).and_then(|v| v.as_str()).unwrap_or("");
                        let time_b = b.get("ocel:timestamp").or_else(|| b.get("ocel:time")).and_then(|v| v.as_str()).unwrap_or("");
                        let key_a = format!(
                            "{}|{}|{}",
                            a.get("ocel:object-id").and_then(|v| v.as_str()).unwrap_or(""),
                            time_a,
                            a.get("ocel:field").and_then(|v| v.as_str()).unwrap_or("")
                        );
                        let key_b = format!(
                            "{}|{}|{}",
                            b.get("ocel:object-id").and_then(|v| v.as_str()).unwrap_or(""),
                            time_b,
                            b.get("ocel:field").and_then(|v| v.as_str()).unwrap_or("")
                        );
                        key_a.cmp(&key_b)
                    });
                }
            }

            let elements: Vec<String> = clone.iter().map(canonical_stringify).collect();
            format!("[{}]", elements.join(","))
        }
        Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort(); // Lexicographical key sorting
            let pairs: Vec<String> = keys
                .into_iter()
                .map(|k| format!("\"{}\":{}", k, canonical_stringify(map.get(k).unwrap())))
                .collect();
            format!("{{{}}}", pairs.join(","))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::canonical_stringify;
    use serde_json::Value;

    #[test]
    fn valid_fixture_batch_hash_matches_envelope() {
        let envelope: Value =
            serde_json::from_str(include_str!("../../../../examples/out/truex_ocel2_valid.json"))
                .expect("fixture JSON");
        let ocel2 = envelope.get("ocel2").expect("ocel2");
        let canonical = canonical_stringify(ocel2);
        let computed = blake3::hash(canonical.as_bytes()).to_hex().to_string();
        let expected = envelope
            .get("ocel2_batch_hash")
            .and_then(|v| v.as_str())
            .expect("ocel2_batch_hash");
        assert_eq!(computed, expected, "canonical len={}", canonical.len());
    }
}
