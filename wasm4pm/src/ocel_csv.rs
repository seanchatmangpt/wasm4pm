//! OCEL CSV Parser
//!
//! Parses flat CSV files into Object-Centric Event Logs (OCEL 2.0).
//!
//! ## CSV Format Convention
//!
//! | Column name pattern | Meaning |
//! |---|---|
//! | `ocel:eid` or `event_id` | Event identifier |
//! | `ocel:activity` or `activity` | Activity/event type name |
//! | `ocel:timestamp` or `timestamp` | ISO 8601 timestamp |
//! | `ocel:type:<ObjType>` | Object references of that type (IDs, multi-valued with `/`) |
//! | Any other column | Event attribute |
//!
//! Object references in type columns may include qualifiers: `obj_id#qualifier`
//! or multiple objects separated by `/`: `obj1#q1/obj2#q2`.
//!
//! ## Example
//!
//! ```javascript
//! import { load_ocel_from_csv } from "wasm4pm";
//!
//! const handle = load_ocel_from_csv(csvString);
//! ```

#[cfg(feature = "ocel")]
use crate::models::{AttributeValue, OCELEvent, OCELEventObjectRef, OCELObject, OCEL};
#[cfg(feature = "ocel")]
use crate::state::{get_or_init_state, StoredObject};
#[cfg(feature = "ocel")]
use std::collections::{BTreeMap, HashMap};
#[cfg(feature = "ocel")]
use wasm_bindgen::prelude::*;

/// Column classification for OCEL CSV headers.
#[cfg(feature = "ocel")]
#[derive(Debug, Clone)]
pub enum Column {
    /// The event/row identifier column.
    Id,
    /// The activity name (event type) column.
    Activity,
    /// The timestamp column.
    Timestamp,
    /// An object-type reference column: value is the object type name.
    ObjectType(String),
    /// A generic event attribute column: value is the attribute name.
    EventAttr(String),
}

/// The inferred OCEL attribute type for schema coalescing.
#[cfg(feature = "ocel")]
#[derive(Debug, Clone, PartialEq)]
pub(crate) enum OcelType {
    Bool,
    Int,
    Float,
    Timestamp,
    String,
}

/// Infer the value type and produce an [`AttributeValue`] from a raw CSV cell string.
///
/// Priority order (numbers-first): i64 → f64 → bool → DateTime → String (fallback).
/// Bool is ONLY the literal tokens `true`/`yes`/`false`/`no` (case-insensitive);
/// `"1"`/`"0"` are integers so a numeric column containing a lone `1` cannot
/// flip to Bool.
#[cfg(feature = "ocel")]
pub fn infer_value(s: &str) -> AttributeValue {
    let trimmed = s.trim();

    // Numbers first — "1"/"0" are Int, never Bool.
    if let Ok(i) = trimmed.parse::<i64>() {
        return AttributeValue::Int(i);
    }
    if let Ok(f) = trimmed.parse::<f64>() {
        return AttributeValue::Float(f);
    }

    // Bool: only the literal tokens (case-insensitive)
    match trimmed.to_ascii_lowercase().as_str() {
        "true" | "yes" => return AttributeValue::Boolean(true),
        "false" | "no" => return AttributeValue::Boolean(false),
        _ => {}
    }

    // i64
    if let Ok(i) = trimmed.parse::<i64>() {
        return AttributeValue::Int(i);
    }

    // f64
    if let Ok(f) = trimmed.parse::<f64>() {
        return AttributeValue::Float(f);
    }

    // DateTime — try RFC3339, then naive formats
    if let Some(_ms) = parse_timestamp_ms_local(trimmed) {
        return AttributeValue::Date(normalise_timestamp(trimmed));
    }

    AttributeValue::String(trimmed.to_string())
}

/// Parse a timestamp string to milliseconds (returns None if unparseable).
#[cfg(feature = "ocel")]
fn parse_timestamp_ms_local(s: &str) -> Option<i64> {
    use chrono::{DateTime, NaiveDateTime, TimeZone, Utc};
    if let Ok(dt) = DateTime::parse_from_rfc3339(s) {
        return Some(dt.timestamp_millis());
    }
    if let Ok(dt) = DateTime::parse_from_rfc3339(&s.replacen(' ', "T", 1)) {
        return Some(dt.timestamp_millis());
    }
    for fmt in &[
        "%Y-%m-%dT%H:%M:%S%.f",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d %H:%M:%S%.f",
        "%Y-%m-%d %H:%M:%S",
    ] {
        if let Ok(ndt) = NaiveDateTime::parse_from_str(s, fmt) {
            return Some(Utc.from_utc_datetime(&ndt).timestamp_millis());
        }
    }
    None
}

/// Normalise a timestamp string to RFC 3339 form (best-effort).
#[cfg(feature = "ocel")]
fn normalise_timestamp(s: &str) -> String {
    use chrono::{DateTime, NaiveDateTime, TimeZone, Utc};
    if let Ok(dt) = DateTime::parse_from_rfc3339(s) {
        return dt.to_rfc3339();
    }
    let s2 = s.replacen(' ', "T", 1);
    if let Ok(dt) = DateTime::parse_from_rfc3339(&s2) {
        return dt.to_rfc3339();
    }
    for fmt in &[
        "%Y-%m-%dT%H:%M:%S%.f",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d %H:%M:%S%.f",
        "%Y-%m-%d %H:%M:%S",
    ] {
        if let Ok(ndt) = NaiveDateTime::parse_from_str(s, fmt) {
            return Utc.from_utc_datetime(&ndt).to_rfc3339();
        }
    }
    s.to_string()
}

/// Infer the [`OcelType`] bucket for a raw string (used for schema coalescing).
///
/// Numbers-first, matching [`infer_value`]: bool is only `true`/`yes`/`false`/`no`.
#[cfg(feature = "ocel")]
fn infer_type(s: &str) -> OcelType {
    let trimmed = s.trim();
    if trimmed.parse::<i64>().is_ok() {
        return OcelType::Int;
    }
    if trimmed.parse::<f64>().is_ok() {
        return OcelType::Float;
    }
    match trimmed.to_ascii_lowercase().as_str() {
        "true" | "yes" | "false" | "no" => return OcelType::Bool,
        _ => {}
    }
    if parse_timestamp_ms_local(trimmed).is_some() {
        return OcelType::Timestamp;
    }
    OcelType::String
}

/// Coalesce two inferred types into the least-surprising common type.
///
/// - Same + Same → Same
/// - Int + Float (or Float + Int) → Float
/// - Any other mismatch → String
#[cfg(feature = "ocel")]
pub(crate) fn coalesce(a: OcelType, b: OcelType) -> OcelType {
    if a == b {
        return a;
    }
    match (&a, &b) {
        (OcelType::Int, OcelType::Float) | (OcelType::Float, OcelType::Int) => OcelType::Float,
        _ => OcelType::String,
    }
}

/// Parse statistics for [`parse_ocel_csv_with_stats`].
#[cfg(feature = "ocel")]
#[derive(Debug, Clone, Default, PartialEq)]
pub struct ParseStats {
    /// Total data rows read (malformed + accepted, excluding headers).
    pub total_rows: usize,
    /// Rows dropped because the CSV reader failed to parse them.
    pub skipped_malformed: usize,
    /// Rows dropped because the activity column was empty.
    pub skipped_empty_activity: usize,
}

/// Parse a CSV string into an [`OCEL`] struct.
///
/// All cell values are trimmed (`csv::Trim::All`); string values are stored
/// trimmed.
///
/// # Errors
/// Returns a descriptive `String` on parse failure.
#[cfg(feature = "ocel")]
pub fn parse_ocel_csv(csv_string: &str) -> Result<OCEL, String> {
    parse_ocel_csv_with_stats(csv_string).map(|(ocel, _stats)| ocel)
}

/// Like [`parse_ocel_csv`], but also reports per-row skip accounting.
///
/// All cell values are trimmed (`csv::Trim::All`); string values are stored
/// trimmed.
#[cfg(feature = "ocel")]
pub fn parse_ocel_csv_with_stats(csv_string: &str) -> Result<(OCEL, ParseStats), String> {
    let mut stats = ParseStats::default();
    let mut rdr = csv::ReaderBuilder::new()
        .has_headers(true)
        .flexible(true)
        // NOTE: csv::Trim::All is unconditional — every cell is trimmed before
        // inference/storage. Making it configurable is an API change with no
        // current consumer need.
        .trim(csv::Trim::All)
        .from_reader(csv_string.as_bytes());

    // --- 1. Classify header columns ---
    let raw_headers: Vec<String> = rdr
        .headers()
        .map_err(|e| format!("Failed to read CSV headers: {}", e))?
        .iter()
        .map(|h| h.to_string())
        .collect();

    let columns: Vec<Column> = raw_headers.iter().map(|h| classify_header(h)).collect();

    // Locate required column indices
    let id_col = columns.iter().position(|c| matches!(c, Column::Id));
    let activity_col = columns
        .iter()
        .position(|c| matches!(c, Column::Activity))
        .ok_or("CSV missing activity column (ocel:activity or activity)")?;
    let timestamp_col = columns
        .iter()
        .position(|c| matches!(c, Column::Timestamp))
        .ok_or("CSV missing timestamp column (ocel:timestamp or timestamp)")?;

    // --- 2. Schema inference pass: determine dominant type per event-attr column ---
    // (We will do a single pass — store records for reuse.)
    let mut records: Vec<csv::StringRecord> = Vec::new();
    for result in rdr.records() {
        stats.total_rows += 1;
        match result {
            Ok(rec) => records.push(rec),
            Err(_) => {
                stats.skipped_malformed += 1;
            } // skip malformed rows (counted)
        }
    }

    // Per event-attr column: accumulated OcelType
    let mut attr_types: HashMap<usize, OcelType> = HashMap::new();
    for rec in &records {
        for (idx, col) in columns.iter().enumerate() {
            if let Column::EventAttr(_) = col {
                let cell = rec.get(idx).unwrap_or("").trim();
                if cell.is_empty() {
                    continue;
                }
                let t = infer_type(cell);
                let entry = attr_types.entry(idx).or_insert_with(|| t.clone());
                let merged = coalesce(entry.clone(), t);
                *entry = merged;
            }
        }
    }

    // --- 3. Build OCEL structures ---
    let mut events: Vec<OCELEvent> = Vec::new();
    let mut objects_map: HashMap<String, OCELObject> = HashMap::new();
    let mut event_types_set: std::collections::BTreeSet<String> = std::collections::BTreeSet::new();
    let mut object_types_set: std::collections::BTreeSet<String> =
        std::collections::BTreeSet::new();

    for (row_idx, rec) in records.iter().enumerate() {
        // Event ID: from column or auto-generated
        let event_id = if let Some(idx) = id_col {
            let v = rec.get(idx).unwrap_or("").trim().to_string();
            if v.is_empty() {
                format!("e{}", row_idx)
            } else {
                v
            }
        } else {
            format!("e{}", row_idx)
        };

        // Activity
        let activity = rec.get(activity_col).unwrap_or("").trim().to_string();
        if activity.is_empty() {
            stats.skipped_empty_activity += 1;
            continue; // skip rows without activity (counted)
        }
        event_types_set.insert(activity.clone());

        // Timestamp
        let ts_raw = rec.get(timestamp_col).unwrap_or("").trim().to_string();
        let timestamp = if ts_raw.is_empty() {
            "1970-01-01T00:00:00Z".to_string()
        } else {
            normalise_timestamp(&ts_raw)
        };

        // Event attributes
        let mut attributes = BTreeMap::new();
        for (idx, col) in columns.iter().enumerate() {
            if let Column::EventAttr(attr_name) = col {
                let cell = rec.get(idx).unwrap_or("").trim();
                if cell.is_empty() {
                    continue;
                }
                // Use the coalesced type to cast value
                let dominant = attr_types.get(&idx).cloned().unwrap_or(OcelType::String);
                let val = cast_value(cell, &dominant);
                attributes.insert(attr_name.clone(), val);
            }
        }

        // Object references
        let mut object_ids: Vec<String> = Vec::new();
        let mut object_refs: Vec<OCELEventObjectRef> = Vec::new();

        for (idx, col) in columns.iter().enumerate() {
            if let Column::ObjectType(obj_type) = col {
                let cell = rec.get(idx).unwrap_or("").trim();
                if cell.is_empty() {
                    continue;
                }
                object_types_set.insert(obj_type.clone());

                // Multiple objects separated by "/"
                for entry in cell.split('/') {
                    let entry = entry.trim();
                    if entry.is_empty() {
                        continue;
                    }
                    // obj_id#qualifier
                    let (obj_id, qualifier) = if let Some(pos) = entry.find('#') {
                        (
                            entry[..pos].trim().to_string(),
                            entry[pos + 1..].trim().to_string(),
                        )
                    } else {
                        (entry.to_string(), obj_type.clone())
                    };

                    if obj_id.is_empty() {
                        continue;
                    }

                    object_ids.push(obj_id.clone());
                    object_refs.push(OCELEventObjectRef {
                        object_id: obj_id.clone(),
                        qualifier,
                    });

                    // Upsert object into map
                    objects_map
                        .entry(obj_id.clone())
                        .or_insert_with(|| OCELObject {
                            id: obj_id.clone(),
                            object_type: obj_type.clone(),
                            attributes: BTreeMap::new(),
                            changes: vec![],
                            embedded_relations: vec![],
                        });
                }
            }
        }

        events.push(OCELEvent {
            id: event_id,
            event_type: activity,
            timestamp,
            attributes,
            object_ids,
            object_refs,
        });
    }

    let event_types: Vec<String> = event_types_set.into_iter().collect();
    let object_types: Vec<String> = object_types_set.into_iter().collect();
    let objects: Vec<OCELObject> = objects_map.into_values().collect();

    // Refuse logs where the majority of rows were dropped — that is data
    // corruption, not a usable event log.
    let skipped = stats.skipped_malformed + stats.skipped_empty_activity;
    if stats.total_rows > 0 && skipped > stats.total_rows / 2 {
        return Err(format!(
            "OCEL CSV mostly malformed: {} of {} rows skipped ({} malformed, {} empty activity)",
            skipped, stats.total_rows, stats.skipped_malformed, stats.skipped_empty_activity
        ));
    }

    Ok((
        OCEL {
            event_types,
            object_types,
            object_type_defs: Vec::new(),
            events,
            objects,
            object_relations: vec![],
        },
        stats,
    ))
}

/// Classify a CSV header string into a [`Column`] variant.
#[cfg(feature = "ocel")]
fn classify_header(h: &str) -> Column {
    let lower = h.trim().to_ascii_lowercase();
    if lower == "ocel:eid" || lower == "event_id" || lower == "eid" || lower == "id" {
        return Column::Id;
    }
    if lower == "ocel:activity" || lower == "activity" || lower == "concept:name" {
        return Column::Activity;
    }
    if lower == "ocel:timestamp" || lower == "timestamp" || lower == "time:timestamp" {
        return Column::Timestamp;
    }
    if let Some(rest) = h.trim().strip_prefix("ocel:type:") {
        return Column::ObjectType(rest.to_string());
    }
    if let Some(rest) = lower.strip_prefix("ocel:type:") {
        return Column::ObjectType(rest.to_string());
    }
    Column::EventAttr(h.trim().to_string())
}

/// Cast a raw string value to an [`AttributeValue`] using the coalesced dominant type.
#[cfg(feature = "ocel")]
fn cast_value(s: &str, dominant: &OcelType) -> AttributeValue {
    match dominant {
        OcelType::Bool => match s.to_ascii_lowercase().as_str() {
            // Same vocabulary as infer_value/infer_type: no "1"/"0".
            "true" | "yes" => AttributeValue::Boolean(true),
            "false" | "no" => AttributeValue::Boolean(false),
            _ => AttributeValue::String(s.to_string()),
        },
        OcelType::Int => s
            .parse::<i64>()
            .map(AttributeValue::Int)
            .unwrap_or_else(|_| AttributeValue::String(s.to_string())),
        OcelType::Float => s
            .parse::<f64>()
            .map(AttributeValue::Float)
            .unwrap_or_else(|_| AttributeValue::String(s.to_string())),
        OcelType::Timestamp => AttributeValue::Date(normalise_timestamp(s)),
        OcelType::String => AttributeValue::String(s.to_string()),
    }
}

/// Load an OCEL 2.0 from a flat CSV string.
///
/// Parses the CSV, builds an OCEL in-memory, stores it in AppState, and returns
/// an opaque handle string for use with other `wasm4pm` OCEL functions.
///
/// # Errors
/// Returns a JS error value with a JSON `{code, message}` payload on failure.
#[cfg(feature = "ocel")]
#[wasm_bindgen]
pub fn load_ocel_from_csv(csv_string: &str) -> Result<String, JsValue> {
    // SECURITY: same 512 MB guard as io.rs entry points.
    crate::io::check_input_size(csv_string, "OCEL CSV input")
        .map_err(|e| crate::error::js_val(&e))?;

    let (ocel, _stats) = parse_ocel_csv_with_stats(csv_string)
        .map_err(|e| crate::error::js_val(&format!("Failed to parse OCEL CSV: {}", e)))?;
    let handle = get_or_init_state()
        .store_object(StoredObject::OCEL(ocel))
        .map_err(|_e| crate::error::js_val("Failed to store OCEL from CSV"))?;

    Ok(handle)
}

#[cfg(test)]
#[cfg(feature = "ocel")]
mod tests {
    use super::*;

    const SAMPLE_CSV: &str = r#"ocel:eid,ocel:activity,ocel:timestamp,ocel:type:Order,ocel:type:Item,price,confirmed
e1,Place Order,2024-01-01T10:00:00Z,o1,i1#contains,99.99,true
e2,Ship Order,2024-01-02T12:00:00Z,o1,i1#ships/i2#ships,0.0,false
e3,Place Order,2024-01-03T09:00:00Z,o2,,10,yes
"#;

    #[test]
    fn test_parse_basic_csv() {
        let ocel = parse_ocel_csv(SAMPLE_CSV).expect("parse failed");
        assert_eq!(ocel.events.len(), 3);
        assert!(ocel.event_types.contains(&"Place Order".to_string()));
        assert!(ocel.event_types.contains(&"Ship Order".to_string()));
        assert!(ocel.object_types.contains(&"Order".to_string()));
        assert!(ocel.object_types.contains(&"Item".to_string()));
    }

    #[test]
    fn test_object_reference_parsing() {
        let ocel = parse_ocel_csv(SAMPLE_CSV).expect("parse failed");
        // e2 references o1 (Order) and i1#ships, i2#ships (Item)
        let e2 = ocel
            .events
            .iter()
            .find(|e| e.id == "e2")
            .expect("e2 missing");
        assert!(e2.object_ids.contains(&"i1".to_string()));
        assert!(e2.object_ids.contains(&"i2".to_string()));
        let ships_refs: Vec<_> = e2
            .object_refs
            .iter()
            .filter(|r| r.qualifier == "ships")
            .collect();
        assert_eq!(ships_refs.len(), 2);
    }

    #[test]
    fn test_infer_value_types() {
        assert_eq!(infer_value("true"), AttributeValue::Boolean(true));
        assert_eq!(infer_value("42"), AttributeValue::Int(42));
        assert_eq!(infer_value("3.14"), AttributeValue::Float(3.14));
        assert!(matches!(
            infer_value("2024-01-01T10:00:00Z"),
            AttributeValue::Date(_)
        ));
        assert_eq!(
            infer_value("hello"),
            AttributeValue::String("hello".to_string())
        );
    }

    #[test]
    fn test_coalesce_types() {
        assert_eq!(coalesce(OcelType::Int, OcelType::Float), OcelType::Float);
        assert_eq!(coalesce(OcelType::Float, OcelType::Int), OcelType::Float);
        assert_eq!(coalesce(OcelType::Int, OcelType::Int), OcelType::Int);
        assert_eq!(coalesce(OcelType::Int, OcelType::String), OcelType::String);
        assert_eq!(coalesce(OcelType::Bool, OcelType::Int), OcelType::String);
    }

    #[test]
    fn test_classify_header() {
        assert!(matches!(classify_header("ocel:eid"), Column::Id));
        assert!(matches!(classify_header("event_id"), Column::Id));
        assert!(matches!(classify_header("ocel:activity"), Column::Activity));
        assert!(matches!(classify_header("activity"), Column::Activity));
        assert!(matches!(
            classify_header("ocel:timestamp"),
            Column::Timestamp
        ));
        assert!(matches!(
            classify_header("ocel:type:Order"),
            Column::ObjectType(_)
        ));
        assert!(matches!(classify_header("price"), Column::EventAttr(_)));
    }

    #[test]
    fn test_missing_activity_skipped() {
        let csv = "ocel:eid,ocel:activity,ocel:timestamp\ne1,,2024-01-01T10:00:00Z\ne2,Act,2024-01-01T11:00:00Z\n";
        let ocel = parse_ocel_csv(csv).expect("parse failed");
        // e1 has empty activity → skipped; only e2 (activity "Act") survives
        assert_eq!(ocel.events.len(), 1);
        assert_eq!(ocel.events[0].id, "e2");
    }

    // ---- Type inference unification (numbers-first) ----

    #[test]
    fn test_one_and_zero_are_int_not_bool() {
        assert_eq!(infer_value("1"), AttributeValue::Int(1));
        assert_eq!(infer_value("0"), AttributeValue::Int(0));
        assert_eq!(infer_type("1"), OcelType::Int);
        assert_eq!(infer_type("0"), OcelType::Int);
        assert_eq!(infer_type("true"), OcelType::Bool);
        assert_eq!(infer_type("yes"), OcelType::Bool);
        // cast_value agrees
        assert_eq!(
            cast_value("1", &OcelType::Bool),
            AttributeValue::String("1".to_string())
        );
        assert_eq!(
            cast_value("true", &OcelType::Bool),
            AttributeValue::Boolean(true)
        );
    }

    #[test]
    fn test_numeric_column_with_single_one_stays_int() {
        // 99.99, 0.0, 1 → column coalesces to Float; "1" casts to Float(1.0),
        // never Bool (pre-fix it flipped the column to Bool).
        let csv = "ocel:eid,ocel:activity,ocel:timestamp,price\ne1,A,2024-01-01T10:00:00Z,99.99\ne2,B,2024-01-02T10:00:00Z,1\n";
        let ocel = parse_ocel_csv(csv).expect("parse failed");
        let e2 = ocel.events.iter().find(|e| e.id == "e2").unwrap();
        assert!(matches!(
            e2.attributes.get("price"),
            Some(AttributeValue::Float(_)) | Some(AttributeValue::Int(_))
        ));
        assert_ne!(
            e2.attributes.get("price"),
            Some(&AttributeValue::Boolean(true))
        );
    }

    // ---- ParseStats / skip accounting ----

    #[test]
    fn test_parse_stats_counts_skips() {
        // 1 empty-activity row of 3 → counted, not skipped silently
        let csv = "ocel:eid,ocel:activity,ocel:timestamp\ne1,,2024-01-01T10:00:00Z\ne2,Act,2024-01-01T11:00:00Z\ne3,Act,2024-01-01T12:00:00Z\n";
        let (ocel, stats) =
            parse_ocel_csv_with_stats(csv).expect("parse should succeed with skips");
        assert_eq!(ocel.events.len(), 2);
        assert_eq!(stats.total_rows, 3);
        assert_eq!(stats.skipped_malformed, 0);
        assert_eq!(stats.skipped_empty_activity, 1);
    }

    #[test]
    fn test_majority_malformed_csv_rejected() {
        // 2 of 3 rows with empty activity → >50% skipped → parse must Err
        let csv = "ocel:eid,ocel:activity,ocel:timestamp\ne1,,t\ne2,,t\ne3,Act,2024-01-01T10:00:00Z\n";
        let err =
            parse_ocel_csv_with_stats(csv).expect_err("majority-skipped CSV must be rejected");
        assert!(
            err.contains("mostly malformed"),
            "error should report skip counts: {}",
            err
        );
    }

    #[test]
    fn test_exactly_half_skipped_accepted() {
        // 1 of 2 skipped = 50%, not >50% → accepted (boundary)
        let csv = "ocel:eid,ocel:activity,ocel:timestamp\ne1,,t\ne2,Act,t\n";
        let (ocel, stats) =
            parse_ocel_csv_with_stats(csv).expect("50% skipped must still be accepted");
        assert_eq!(ocel.events.len(), 1);
        assert_eq!(stats.total_rows, 2);
    }

    #[test]
    fn test_size_guard_rejects_oversized_csv() {
        // Can't allocate 512MB; the guard is the shared cap-parameterized
        // check_input_size core — same policy, small cap.
        let big = "x".repeat(600);
        let err = crate::io::check_input_size_cap(&big, "test input", 512)
            .expect_err("oversized input must be refused");
        assert!(err.contains("too large"));
        // Exactly at cap is accepted.
        assert!(crate::io::check_input_size_cap(&big, "test input", 600).is_ok());
    }
}
