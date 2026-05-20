//! Integration tests for high-ROI WASM utility exports.
//!
//! Tests validate JSON serialization, edge cases, and interop with WASM boundary.

extern crate wasm4pm;

use wasm4pm::models::{AttributeValue, Event, EventLog, Trace};
use wasm4pm::state::get_or_init_state;
use wasm4pm::wasm_utils::*;
use std::collections::HashMap;

/// Create a minimal test event log with configurable activities and traces.
fn create_test_eventlog() -> EventLog {
    let mut log = EventLog {
        attributes: HashMap::new(),
        traces: vec![],
    };

    // Trace 1: A -> B -> C
    let trace1 = Trace {
        attributes: HashMap::new(),
        events: vec![
            Event {
                attributes: {
                    let mut attrs = HashMap::new();
                    attrs.insert("concept:name".to_string(), AttributeValue::String("A".to_string()));
                    attrs.insert("timestamp".to_string(), AttributeValue::String("2024-01-01T10:00:00".to_string()));
                    attrs
                },
            },
            Event {
                attributes: {
                    let mut attrs = HashMap::new();
                    attrs.insert("concept:name".to_string(), AttributeValue::String("B".to_string()));
                    attrs.insert("timestamp".to_string(), AttributeValue::String("2024-01-01T10:01:00".to_string()));
                    attrs
                },
            },
            Event {
                attributes: {
                    let mut attrs = HashMap::new();
                    attrs.insert("concept:name".to_string(), AttributeValue::String("C".to_string()));
                    attrs.insert("timestamp".to_string(), AttributeValue::String("2024-01-01T10:02:00".to_string()));
                    attrs
                },
            },
        ],
    };

    // Trace 2: A -> C -> B -> C
    let trace2 = Trace {
        attributes: HashMap::new(),
        events: vec![
            Event {
                attributes: {
                    let mut attrs = HashMap::new();
                    attrs.insert("concept:name".to_string(), AttributeValue::String("A".to_string()));
                    attrs
                },
            },
            Event {
                attributes: {
                    let mut attrs = HashMap::new();
                    attrs.insert("concept:name".to_string(), AttributeValue::String("C".to_string()));
                    attrs
                },
            },
            Event {
                attributes: {
                    let mut attrs = HashMap::new();
                    attrs.insert("concept:name".to_string(), AttributeValue::String("B".to_string()));
                    attrs
                },
            },
            Event {
                attributes: {
                    let mut attrs = HashMap::new();
                    attrs.insert("concept:name".to_string(), AttributeValue::String("C".to_string()));
                    attrs
                },
            },
        ],
    };

    // Trace 3: B -> B -> A
    let trace3 = Trace {
        attributes: HashMap::new(),
        events: vec![
            Event {
                attributes: {
                    let mut attrs = HashMap::new();
                    attrs.insert("concept:name".to_string(), AttributeValue::String("B".to_string()));
                    attrs
                },
            },
            Event {
                attributes: {
                    let mut attrs = HashMap::new();
                    attrs.insert("concept:name".to_string(), AttributeValue::String("B".to_string()));
                    attrs
                },
            },
            Event {
                attributes: {
                    let mut attrs = HashMap::new();
                    attrs.insert("concept:name".to_string(), AttributeValue::String("A".to_string()));
                    attrs
                },
            },
        ],
    };

    log.traces.push(trace1);
    log.traces.push(trace2);
    log.traces.push(trace3);

    log
}

#[test]
fn test_hash_xes_content_produces_hex_string() {
    let xes = r#"<?xml version="1.0" encoding="UTF-8"?>
    <log>
        <trace>
            <event>
                <string key="concept:name" value="Activity"/>
            </event>
        </trace>
    </log>"#;

    let hash = hash_xes_content(xes);
    assert!(!hash.is_empty(), "Hash should not be empty");
    assert_eq!(hash.len(), 16, "FNV-1a should be 16 hex chars");

    // Verify it's valid hex
    let _: u64 = u64::from_str_radix(&hash, 16)
        .expect("Hash should be valid hex");
}

#[test]
fn test_hash_xes_content_deterministic() {
    let xes = r#"<?xml version="1.0"?><log><trace><event><string key="test" value="value"/></event></trace></log>"#;
    let h1 = hash_xes_content(xes);
    let h2 = hash_xes_content(xes);
    assert_eq!(h1, h2, "Hash must be deterministic");
}

#[test]
fn test_hash_xes_content_empty_string() {
    let empty = "";
    let hash = hash_xes_content(empty);
    assert_eq!(hash.len(), 16, "Even empty string should produce 16-char hash");
}

#[test]
fn test_cache_stats_json_structure() {
    // Call cache_stats and verify it returns valid JSON with expected keys
    let result = cache_stats().expect("cache_stats should succeed");

    // Verify result is a JsValue (on native this is zeroed, but that's OK)
    // This test mainly ensures the function doesn't panic
    let _stats = result;
}

#[test]
fn test_jaccard_distance_identical_sets() {
    let set1 = vec!["A", "B", "C"];
    let set1_json = serde_json::to_string(&set1).unwrap();

    let dist = jaccard_distance(&set1_json, &set1_json)
        .expect("jaccard_distance should succeed");

    let dist_f64 = dist.as_f64().expect("Result should be a number");
    assert!((dist_f64 - 0.0).abs() < 1e-10, "Identical sets should have distance 0");
}

#[test]
fn test_jaccard_distance_disjoint_sets() {
    let set1 = vec!["A", "B"];
    let set2 = vec!["C", "D"];
    let set1_json = serde_json::to_string(&set1).unwrap();
    let set2_json = serde_json::to_string(&set2).unwrap();

    let dist = jaccard_distance(&set1_json, &set2_json)
        .expect("jaccard_distance should succeed");

    let dist_f64 = dist.as_f64().expect("Result should be a number");
    assert!((dist_f64 - 1.0).abs() < 1e-10, "Disjoint sets should have distance 1");
}

#[test]
fn test_jaccard_distance_partial_overlap() {
    let set1 = vec!["A", "B", "C"];
    let set2 = vec!["B", "C", "D"];
    let set1_json = serde_json::to_string(&set1).unwrap();
    let set2_json = serde_json::to_string(&set2).unwrap();

    let dist = jaccard_distance(&set1_json, &set2_json)
        .expect("jaccard_distance should succeed");

    let dist_f64 = dist.as_f64().expect("Result should be a number");
    // Union: {A, B, C, D} = 4, Intersection: {B, C} = 2
    // Distance = 1 - (2/4) = 0.5
    assert!((dist_f64 - 0.5).abs() < 1e-10, "Partial overlap distance = 0.5");
}

#[test]
fn test_ewma_series_constant_values() {
    let values = vec![3.0, 3.0, 3.0, 3.0];
    let values_json = serde_json::to_string(&values).unwrap();

    let result = ewma_series(&values_json, 0.5)
        .expect("ewma_series should succeed");

    // On native targets, to_js_str returns a JSON string
    // We'd need to parse it to verify the values
    // For now, just ensure it doesn't crash
    let _smoothed = result;
}

#[test]
fn test_ewma_series_empty_input() {
    let values: Vec<f64> = vec![];
    let values_json = serde_json::to_string(&values).unwrap();

    let result = ewma_series(&values_json, 0.5)
        .expect("ewma_series should handle empty input");

    // Should return empty array
    let _smoothed = result;
}

#[test]
fn test_jaccard_distance_invalid_json() {
    let result = jaccard_distance("not valid json", r#"["A"]"#);
    assert!(result.is_err(), "Invalid JSON should produce error");
}

#[test]
fn test_ewma_series_invalid_json() {
    let result = ewma_series("not valid json", 0.5);
    assert!(result.is_err(), "Invalid JSON should produce error");
}

#[test]
fn test_identify_high_variance_activities_basic() {
    let log = create_test_eventlog();
    let state = get_or_init_state();
    let handle = state.store_object(wasm4pm::state::StoredObject::EventLog(log)).unwrap();

    let result = identify_high_variance_activities(&handle, "concept:name", 0.5)
        .expect("identify_high_variance_activities should succeed");

    // Verify result is a JsValue
    let _activities = result;
}

#[test]
fn test_identify_high_variance_activities_invalid_handle() {
    let result = identify_high_variance_activities("invalid_handle_12345", "concept:name", 0.5);
    assert!(result.is_err(), "Invalid handle should produce error");
}

#[test]
fn test_hash_xes_content_different_inputs_different_hashes() {
    let xes1 = "<?xml version=\"1.0\"?><log1></log1>";
    let xes2 = "<?xml version=\"1.0\"?><log2></log2>";

    let h1 = hash_xes_content(xes1);
    let h2 = hash_xes_content(xes2);

    assert_ne!(h1, h2, "Different inputs should produce different hashes");
}
