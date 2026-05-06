/// Tests for dirty/malformed XES event log fixtures.
///
/// Each test loads one of the four fixtures from tests/fixtures/dirty_data/,
/// verifies that parsing does not panic, and asserts that the detected issue
/// is observable from the parsed EventLog structure.
use std::collections::HashMap;
use wasm4pm::models::{AttributeValue, Event, EventLog, Trace};

// ---------------------------------------------------------------------------
// Inline XES parser — mirrors the pattern used in benchmarks.rs and
// quality_benchmarks.rs so that we can parse XES without going through the
// wasm_bindgen wrapper (which returns JsValue, unavailable in integration tests).
// ---------------------------------------------------------------------------

fn parse_xes(content: &str) -> EventLog {
    let mut log = EventLog::new();
    let mut current_trace: Option<Trace> = None;
    let mut current_event: Option<Event> = None;

    for line in content.lines() {
        let trimmed = line.trim();

        if trimmed.starts_with("<trace>") || trimmed.starts_with("<trace ") {
            current_trace = Some(Trace {
                attributes: HashMap::new(),
                events: Vec::new(),
            });
        }

        if trimmed.starts_with("</trace>") {
            if let Some(trace) = current_trace.take() {
                log.traces.push(trace);
            }
        }

        if trimmed.starts_with("<event>") || trimmed.starts_with("<event ") {
            current_event = Some(Event {
                attributes: HashMap::new(),
            });
        }

        if trimmed.starts_with("</event>") {
            if let Some(event) = current_event.take() {
                if let Some(ref mut trace) = current_trace {
                    trace.events.push(event);
                }
            }
        }

        // Parse <string key="..." value="..."/>
        if trimmed.starts_with("<string") {
            if let Some(key_start) = trimmed.find("key=\"") {
                let key_start = key_start + 5;
                if let Some(key_end) = trimmed[key_start..].find('"') {
                    let key = trimmed[key_start..key_start + key_end].to_string();
                    if let Some(val_start) = trimmed.find("value=\"") {
                        let val_start = val_start + 7;
                        if let Some(val_end) = trimmed[val_start..].find('"') {
                            let value = trimmed[val_start..val_start + val_end].to_string();
                            if let Some(ref mut event) = current_event {
                                event.attributes.insert(key, AttributeValue::String(value));
                            } else if let Some(ref mut trace) = current_trace {
                                trace.attributes.insert(key, AttributeValue::String(value));
                            }
                        }
                    }
                }
            }
        }

        // Parse <date key="..." value="..."/>
        if trimmed.starts_with("<date") {
            if let Some(key_start) = trimmed.find("key=\"") {
                let key_start = key_start + 5;
                if let Some(key_end) = trimmed[key_start..].find('"') {
                    let key = trimmed[key_start..key_start + key_end].to_string();
                    if let Some(val_start) = trimmed.find("value=\"") {
                        let val_start = val_start + 7;
                        if let Some(val_end) = trimmed[val_start..].find('"') {
                            let value = trimmed[val_start..val_start + val_end].to_string();
                            if let Some(ref mut event) = current_event {
                                event
                                    .attributes
                                    .insert(key, AttributeValue::String(value));
                            } else if let Some(ref mut trace) = current_trace {
                                trace
                                    .attributes
                                    .insert(key, AttributeValue::String(value));
                            }
                        }
                    }
                }
            }
        }
    }

    log
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn activity_name(event: &Event) -> Option<&str> {
    match event.attributes.get("concept:name") {
        Some(AttributeValue::String(s)) => Some(s.as_str()),
        _ => None,
    }
}

fn timestamp_value(event: &Event) -> Option<&str> {
    match event.attributes.get("time:timestamp") {
        Some(AttributeValue::String(s)) => Some(s.as_str()),
        _ => None,
    }
}

// ---------------------------------------------------------------------------
// 1. missing_timestamps.xes
//    Trace has 2 events; the first has no timestamp attribute.
// ---------------------------------------------------------------------------

#[test]
fn test_missing_timestamps_parses_without_panic() {
    let content =
        include_str!("fixtures/dirty_data/missing_timestamps.xes");
    let log = parse_xes(content);

    // Parse must succeed and produce 1 trace with 2 events
    assert_eq!(log.traces.len(), 1, "expected 1 trace");
    assert_eq!(log.traces[0].events.len(), 2, "expected 2 events");
}

#[test]
fn test_missing_timestamps_first_event_lacks_timestamp() {
    let content =
        include_str!("fixtures/dirty_data/missing_timestamps.xes");
    let log = parse_xes(content);

    let first_event = &log.traces[0].events[0];
    // The first event has no time:timestamp — the field is absent
    assert!(
        timestamp_value(first_event).is_none(),
        "first event should have no timestamp"
    );
}

#[test]
fn test_missing_timestamps_second_event_has_timestamp() {
    let content =
        include_str!("fixtures/dirty_data/missing_timestamps.xes");
    let log = parse_xes(content);

    let second_event = &log.traces[0].events[1];
    assert_eq!(
        timestamp_value(second_event),
        Some("2024-01-01T10:00:00Z"),
        "second event should have a timestamp"
    );
}

// ---------------------------------------------------------------------------
// 2. duplicate_events.xes
//    Trace has 2 events with identical activity name AND identical timestamp.
// ---------------------------------------------------------------------------

#[test]
fn test_duplicate_events_parses_without_panic() {
    let content =
        include_str!("fixtures/dirty_data/duplicate_events.xes");
    let log = parse_xes(content);

    assert_eq!(log.traces.len(), 1, "expected 1 trace");
    assert_eq!(log.traces[0].events.len(), 2, "expected 2 events");
}

#[test]
fn test_duplicate_events_detectable_by_same_activity_and_timestamp() {
    let content =
        include_str!("fixtures/dirty_data/duplicate_events.xes");
    let log = parse_xes(content);

    let events = &log.traces[0].events;

    // Both events share the same activity name
    let activity_a = activity_name(&events[0]).unwrap_or("");
    let activity_b = activity_name(&events[1]).unwrap_or("");
    assert_eq!(activity_a, activity_b, "duplicate activity names");

    // Both events share the same timestamp
    let ts_a = timestamp_value(&events[0]).unwrap_or("");
    let ts_b = timestamp_value(&events[1]).unwrap_or("");
    assert_eq!(ts_a, ts_b, "duplicate timestamps");
}

// ---------------------------------------------------------------------------
// 3. out_of_order.xes
//    Events are listed in reverse timestamp order within the trace.
//    (ActivityB at 11:00 comes before ActivityA at 09:00 in the XML.)
// ---------------------------------------------------------------------------

#[test]
fn test_out_of_order_parses_without_panic() {
    let content =
        include_str!("fixtures/dirty_data/out_of_order.xes");
    let log = parse_xes(content);

    assert_eq!(log.traces.len(), 1, "expected 1 trace");
    assert_eq!(log.traces[0].events.len(), 2, "expected 2 events");
}

#[test]
fn test_out_of_order_detectable_by_descending_timestamps() {
    let content =
        include_str!("fixtures/dirty_data/out_of_order.xes");
    let log = parse_xes(content);

    let events = &log.traces[0].events;

    // As parsed (arrival order), event[0] has the later timestamp
    let ts0 = timestamp_value(&events[0]).unwrap_or("");
    let ts1 = timestamp_value(&events[1]).unwrap_or("");

    // Lexicographic comparison is valid for ISO 8601 UTC strings
    assert!(
        ts0 > ts1,
        "events are out of order: first ts={:?}, second ts={:?}",
        ts0,
        ts1
    );
}

#[test]
fn test_out_of_order_activity_order_in_xml() {
    let content =
        include_str!("fixtures/dirty_data/out_of_order.xes");
    let log = parse_xes(content);

    // As declared in the XML, B appears before A
    assert_eq!(activity_name(&log.traces[0].events[0]), Some("ActivityB"));
    assert_eq!(activity_name(&log.traces[0].events[1]), Some("ActivityA"));
}

// ---------------------------------------------------------------------------
// 4. missing_case_id.xes
//    Trace has no concept:name attribute (no case identifier).
// ---------------------------------------------------------------------------

#[test]
fn test_missing_case_id_parses_without_panic() {
    let content =
        include_str!("fixtures/dirty_data/missing_case_id.xes");
    let log = parse_xes(content);

    // The log still has one trace with one event
    assert_eq!(log.traces.len(), 1, "expected 1 trace");
    assert_eq!(log.traces[0].events.len(), 1, "expected 1 event");
}

#[test]
fn test_missing_case_id_trace_lacks_concept_name() {
    let content =
        include_str!("fixtures/dirty_data/missing_case_id.xes");
    let log = parse_xes(content);

    let trace = &log.traces[0];
    // There should be no concept:name attribute on the trace
    let has_case_id = matches!(
        trace.attributes.get("concept:name"),
        Some(AttributeValue::String(_))
    );
    assert!(
        !has_case_id,
        "trace should not have a concept:name (case ID)"
    );
}
