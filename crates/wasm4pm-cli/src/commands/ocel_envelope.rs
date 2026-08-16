//! Tolerant OCEL 2.0 JSON parsing.
//!
//! `wasm4pm::models::OCEL` deserializes the "native" OCEL shape: root-level
//! `eventTypes`/`objectTypes`/`events`/`objects`, with unprefixed event/object
//! fields (`id`, `type`, `time`/`timestamp`, `attributes`).
//!
//! Some real-world OCEL 2.0 exports instead ship as a receipt/envelope wrapper
//! with the actual OCEL payload nested under a key (observed: `"ocel2"`), using
//! the official OCEL 2.0 JSON export spec's colon-prefixed field convention
//! (`ocel:id`, `ocel:type`, `ocel:timestamp`, `ocel:attributes`), and with
//! `eventTypes`/`objectTypes` as objects keyed by type name rather than arrays
//! of strings.
//!
//! `parse_ocel_tolerant` accepts either shape without erroring on the envelope
//! shape and without silently producing zero events.

use anyhow::{bail, Context, Result};
use serde_json::{Map, Value};

/// Keys under which a nested OCEL payload may be wrapped in a receipt/envelope
/// document. Checked in order.
const ENVELOPE_KEYS: &[&str] = &["ocel2", "ocel", "OCEL2", "ocel_log", "log"];

/// Parse an OCEL 2.0 JSON document, tolerating both the native
/// `wasm4pm::models::OCEL` shape and the colon-prefixed envelope/receipt shape
/// (see module docs).
///
/// Returns an error if neither shape can be recognized, or if a shape parses
/// syntactically but yields zero events (which would otherwise look like a
/// successful parse that silently discovered nothing).
pub fn parse_ocel_tolerant(json_str: &str) -> Result<wasm4pm::models::OCEL> {
    // 1. Try the native shape directly, exactly as the existing code path does.
    if let Ok(ocel) = serde_json::from_str::<wasm4pm::models::OCEL>(json_str) {
        if !ocel.events.is_empty() {
            return Ok(ocel);
        }
    }

    // 2. Fall back to treating the document as a receipt/envelope wrapper with
    //    the real OCEL payload nested under a known key.
    let root: Value =
        serde_json::from_str(json_str).context("input is not valid JSON at all")?;

    let Some(root_obj) = root.as_object() else {
        bail!("OCEL input is neither a recognized native OCEL object nor a JSON object envelope");
    };

    for key in ENVELOPE_KEYS {
        if let Some(nested) = root_obj.get(*key) {
            if let Some(ocel) = try_parse_nested(nested)? {
                return Ok(ocel);
            }
        }
    }

    bail!(
        "could not find a usable OCEL payload: direct parse yielded zero events, and no \
         recognized envelope key ({:?}) contained a nested OCEL payload with events",
        ENVELOPE_KEYS
    );
}

/// Try to parse a nested JSON value (e.g. the value under `"ocel2"`) as an
/// OCEL log, first as-is, then after normalizing `ocel:`-prefixed keys and
/// object-keyed `eventTypes`/`objectTypes`. Returns `Ok(None)` (not an error)
/// if the nested value doesn't look like an OCEL payload at all, so the
/// caller can try other envelope keys.
fn try_parse_nested(nested: &Value) -> Result<Option<wasm4pm::models::OCEL>> {
    if !nested.is_object() {
        return Ok(None);
    }

    // Try parsing the nested value directly first (covers a nested payload
    // that already uses the native unprefixed shape).
    if let Ok(ocel) = serde_json::from_value::<wasm4pm::models::OCEL>(nested.clone()) {
        if !ocel.events.is_empty() {
            return Ok(Some(ocel));
        }
    }

    let normalized = normalize_ocel_value(nested);
    let ocel: wasm4pm::models::OCEL = serde_json::from_value(normalized)
        .context("nested OCEL payload did not match the expected OCEL 2.0 shape")?;

    if ocel.events.is_empty() {
        // Syntactically valid but empty: not a usable payload from this key.
        return Ok(None);
    }

    Ok(Some(ocel))
}

/// Normalize a single OCEL-shaped JSON object so it matches what
/// `wasm4pm::models::OCEL` expects to deserialize:
/// - `eventTypes`/`objectTypes`: if given as an object keyed by type name
///   (`{"Mutation": {...}}`) rather than an array of strings, convert to a
///   `Vec<String>` of the keys.
/// - `events`/`objects` array entries: strip `ocel:` prefixes from keys
///   (`ocel:id` -> `id`, `ocel:type` -> `type`, `ocel:timestamp` -> `timestamp`,
///   `ocel:attributes` -> `attributes`, etc.).
fn normalize_ocel_value(value: &Value) -> Value {
    let obj = match value.as_object() {
        Some(o) => o,
        None => return value.clone(),
    };

    let mut out = Map::new();

    for (key, val) in obj {
        match key.as_str() {
            "eventTypes" | "objectTypes" | "event_types" | "object_types" => {
                out.insert(key.clone(), normalize_type_names(val));
            }
            "events" | "objects" => {
                out.insert(key.clone(), normalize_entry_array(val));
            }
            _ => {
                out.insert(key.clone(), val.clone());
            }
        }
    }

    Value::Object(out)
}

/// Convert an object-keyed type-name map (`{"Mutation": {...}, "Order": {...}}`)
/// into an array of its keys (`["Mutation", "Order"]`). Leaves arrays
/// untouched (already-native shape).
fn normalize_type_names(val: &Value) -> Value {
    match val {
        Value::Object(map) => Value::Array(map.keys().map(|k| Value::String(k.clone())).collect()),
        other => other.clone(),
    }
}

/// Strip `ocel:` prefixes from the keys of every object in an array (events or
/// objects). Non-array / non-object entries are passed through unchanged.
fn normalize_entry_array(val: &Value) -> Value {
    match val {
        Value::Array(items) => Value::Array(items.iter().map(normalize_entry_keys).collect()),
        other => other.clone(),
    }
}

/// Strip the `ocel:` prefix from every key of a single event/object entry.
/// The `attributes` map itself is additionally converted from a plain
/// `{name: value}` object into an array of `{"name": ..., "value": ...}`
/// pairs: `wasm4pm::models::OCEL`'s custom attribute deserializer accepts
/// plain JSON scalars in that array form, whereas its map form expects each
/// value to already be the internally-tagged `AttributeValue` representation
/// (`{"tag": "String", "value": "..."}`), which raw OCEL 2.0 exports don't use.
fn normalize_entry_keys(entry: &Value) -> Value {
    let Some(obj) = entry.as_object() else {
        return entry.clone();
    };

    let mut out = Map::new();
    for (key, val) in obj {
        let stripped = key.strip_prefix("ocel:").unwrap_or(key);
        let normalized_val = if stripped == "attributes" {
            normalize_attributes_value(val)
        } else {
            val.clone()
        };
        out.insert(stripped.to_string(), normalized_val);
    }
    Value::Object(out)
}

/// Convert a plain `{name: value, ...}` attributes object into the
/// `[{"name": name, "value": value}, ...]` array form that
/// `deserialize_ocel_attributes` can accept with un-tagged scalar values.
/// Leaves non-object values (e.g. already an array) unchanged.
fn normalize_attributes_value(val: &Value) -> Value {
    match val {
        Value::Object(map) => Value::Array(
            map.iter()
                .map(|(name, value)| {
                    let mut pair = Map::new();
                    pair.insert("name".to_string(), Value::String(name.clone()));
                    pair.insert("value".to_string(), value.clone());
                    Value::Object(pair)
                })
                .collect(),
        ),
        other => other.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The exact content of `examples/out/truex_ocel2_valid.json` (repo root),
    /// a real-world OCEL 2.0 export using the receipt/envelope wrapper shape
    /// with `ocel2` nesting and `ocel:`-prefixed keys.
    const TRUEX_OCEL2_VALID: &str = include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../examples/out/truex_ocel2_valid.json"
    ));

    #[test]
    fn parses_native_shape_directly() {
        let native = r#"{
            "eventTypes": ["A"],
            "objectTypes": ["X"],
            "events": [
                {"id": "e1", "type": "A", "time": "2026-01-01T00:00:00Z", "attributes": {}}
            ],
            "objects": []
        }"#;
        let ocel = parse_ocel_tolerant(native).expect("native shape should parse");
        assert_eq!(ocel.events.len(), 1);
        assert_eq!(ocel.event_types, vec!["A".to_string()]);
    }

    #[test]
    fn parses_truex_receipt_envelope_with_ocel_prefixed_keys() {
        let ocel = parse_ocel_tolerant(TRUEX_OCEL2_VALID)
            .expect("should recognize the ocel2 envelope shape and extract events");

        // The real fixture file contains exactly 4 events under ocel2.events.
        assert_eq!(
            ocel.events.len(),
            4,
            "expected the real event count from examples/out/truex_ocel2_valid.json"
        );

        // eventTypes was an object keyed by name ({"Mutation": ..., "ReceiptDecision": ...});
        // it must be normalized to a Vec<String> of the two keys.
        let mut event_types = ocel.event_types.clone();
        event_types.sort();
        assert_eq!(
            event_types,
            vec!["Mutation".to_string(), "ReceiptDecision".to_string()]
        );

        // objectTypes similarly: User, Order, Session, Receipt.
        let mut object_types = ocel.object_types.clone();
        object_types.sort();
        assert_eq!(
            object_types,
            vec![
                "Order".to_string(),
                "Receipt".to_string(),
                "Session".to_string(),
                "User".to_string(),
            ]
        );

        // objects array is present in this fixture (3 objects) and must be
        // recovered too, with ocel:-prefixed keys stripped.
        assert_eq!(ocel.objects.len(), 3);
        assert!(ocel.objects.iter().any(|o| o.id == "USER_442" && o.object_type == "User"));

        // Every event must have carried its ocel:id / ocel:type / ocel:timestamp
        // through correctly.
        assert!(ocel.events.iter().all(|e| !e.id.is_empty() && e.event_type == "Mutation"));
        assert!(ocel
            .events
            .iter()
            .any(|e| e.id == "evt_1779425362745_k0jdn"));

        // Known limitation: this fixture carries event-object linkage in a
        // top-level "event-object" array (ocel:event-id / ocel:object-id /
        // ocel:qualifier), not nested per-event "relationships". That linkage
        // is not reconstructed by this normalizer, so object_refs is empty here.
        assert!(ocel.events.iter().all(|e| e.object_refs.is_empty()));
    }

    #[test]
    fn errors_on_unrecognizable_input() {
        let garbage = r#"{"totally": "unrelated", "shape": true}"#;
        let result = parse_ocel_tolerant(garbage);
        assert!(result.is_err(), "unrecognizable input must error, not silently succeed empty");
    }
}
