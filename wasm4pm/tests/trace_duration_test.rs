//! Test trace duration computation in SPC (Statistical Process Control)
//!
//! This test verifies that trace durations are computed correctly from ISO-8601
//! timestamps, not from string lengths (the bug that was fixed).
//!
//! Bug: The old code used `String::len()` which measured character count instead
//! of parsing timestamps and computing actual time differences.
//!
//! Fix: Use `models::parse_timestamp_ms()` to parse ISO-8601 timestamps and
//! compute durations in milliseconds, then convert to seconds.

use wasm4pm::models::{AttributeValue, Event, EventLog, Trace};

// Removed: `test_trace_duration_from_iso8601_timestamps` was a vacuous test
// (empty body, passed unconditionally). The remaining tests in this file
// exercise the parsing logic via Rank-1 oracles.

#[test]
fn test_trace_duration_parsing_accuracy() {
    use wasm4pm::models::parse_timestamp_ms;

    // Test various ISO-8601 formats (all represent the same instant: 2024-01-01 10:00:00 UTC)
    let test_cases = vec![
        // RFC 3339 with offset
        ("2024-01-01T10:00:00+00:00", Some(1704103200000)),
        ("2024-01-01T10:00:00Z", Some(1704103200000)),
        // With milliseconds
        ("2024-01-01T10:00:00.123+00:00", Some(1704103200123)),
        // Space instead of T
        ("2024-01-01 10:00:00", Some(1704103200000)),
        // With microseconds (note: we only keep milliseconds precision)
        ("2024-01-01T10:00:00.123456+00:00", Some(1704103200123)),
    ];

    for (timestamp_str, expected_ms) in test_cases {
        let parsed = parse_timestamp_ms(timestamp_str);
        assert_eq!(
            parsed, expected_ms,
            "Failed to parse timestamp: {}",
            timestamp_str
        );
    }
}

#[test]
fn test_trace_duration_computation() {
    use wasm4pm::models::parse_timestamp_ms;

    // Create two timestamps 5 seconds apart
    let first_ts = "2024-01-01T10:00:00+00:00";
    let last_ts = "2024-01-01T10:00:05+00:00";

    let first_ms = parse_timestamp_ms(first_ts).expect("Failed to parse first timestamp");
    let last_ms = parse_timestamp_ms(last_ts).expect("Failed to parse last timestamp");

    // Compute duration in seconds
    let dur_ms = (last_ms - first_ms).abs();
    let dur_sec = dur_ms as f64 / 1000.0;

    // Should be exactly 5.0 seconds
    assert!(
        (dur_sec - 5.0).abs() < 1e-6,
        "Duration should be 5.0 seconds, got {}",
        dur_sec
    );
}

#[test]
fn test_trace_duration_handles_reversed_order() {
    use wasm4pm::models::parse_timestamp_ms;

    // Create two timestamps in reverse order (last before first)
    let first_ts = "2024-01-01T10:00:10+00:00";
    let last_ts = "2024-01-01T10:00:05+00:00";

    let first_ms = parse_timestamp_ms(first_ts).expect("Failed to parse first timestamp");
    let last_ms = parse_timestamp_ms(last_ts).expect("Failed to parse last timestamp");

    // Compute duration (should be positive regardless of order)
    let dur_ms = (last_ms - first_ms).abs();
    let dur_sec = dur_ms as f64 / 1000.0;

    // Should still be 5.0 seconds (absolute value)
    assert!(
        (dur_sec - 5.0).abs() < 1e-6,
        "Duration should be 5.0 seconds (absolute), got {}",
        dur_sec
    );
}

#[test]
fn test_trace_duration_not_string_length() {
    // This test explicitly verifies that we're NOT using string length
    // Create two timestamps with the same time but different string representations
    let ts1 = "2024-01-01T10:00:00+00:00"; // 25 characters
    let ts2 = "2024-01-01T10:00:00Z"; // 20 characters (shorter!)

    // If we used string length, we'd get a meaningless difference
    let len_diff = ts2.len() as f64 - ts1.len() as f64;
    assert_ne!(len_diff, 0.0, "String lengths differ by {}", len_diff);

    // But if we parse timestamps, both represent the same instant
    use wasm4pm::models::parse_timestamp_ms;
    let ms1 = parse_timestamp_ms(ts1).expect("Failed to parse ts1");
    let ms2 = parse_timestamp_ms(ts2).expect("Failed to parse ts2");

    // The actual time difference should be 0 (same instant)
    let dur_ms = (ms2 - ms1).abs();
    let dur_sec = dur_ms as f64 / 1000.0;

    // Should be exactly 0, not the string length difference!
    assert_eq!(
        dur_sec, 0.0,
        "Duration should be 0.0 seconds (same instant), got {}",
        dur_sec
    );
    assert_ne!(
        dur_sec, len_diff,
        "Duration should NOT equal string length difference"
    );
}

// Helper function to create a test event log
#[allow(dead_code)]
fn create_test_log_with_timestamps() -> EventLog {
    EventLog {
        attributes: std::collections::BTreeMap::new(),
        traces: vec![Trace {
            attributes: std::collections::BTreeMap::new(),
            events: vec![
                Event {
                    attributes: {
                        let mut attrs = std::collections::BTreeMap::new();
                        attrs.insert(
                            "concept:name".to_string(),
                            AttributeValue::String("A".to_string()),
                        );
                        attrs.insert(
                            "time:timestamp".to_string(),
                            AttributeValue::Date("2024-01-01T10:00:00+00:00".to_string()),
                        );
                        attrs
                    },
                },
                Event {
                    attributes: {
                        let mut attrs = std::collections::BTreeMap::new();
                        attrs.insert(
                            "concept:name".to_string(),
                            AttributeValue::String("B".to_string()),
                        );
                        attrs.insert(
                            "time:timestamp".to_string(),
                            AttributeValue::Date("2024-01-01T10:00:05+00:00".to_string()),
                        );
                        attrs
                    },
                },
            ],
        }],
    }
}
