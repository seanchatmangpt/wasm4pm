use crate::models::{AttributeValue, EventLog};
use std::collections::HashMap;

/// Extract a timestamp in milliseconds from an `AttributeValue`.
///
/// Handles both `AttributeValue::Date` (ISO 8601 string) and
/// `AttributeValue::String` (also treated as an ISO 8601 string).
/// Returns `None` for any other variant or unparseable input.
#[inline]
fn ts_ms(val: &AttributeValue) -> Option<f64> {
    let s = match val {
        AttributeValue::Date(s) => s.as_str(),
        AttributeValue::String(s) => s.as_str(),
        _ => return None,
    };
    crate::models::parse_timestamp_ms(s).map(|ms| ms as f64)
}

/// Extract per-trace case durations (start→end) in milliseconds.
///
/// Returns `Vec<(trace_index, duration_ms)>`, skipping traces that have fewer
/// than two events or that are missing parseable timestamps on the first or
/// last event.
pub fn extract_case_durations(log: &EventLog, timestamp_key: &str) -> Vec<(usize, f64)> {
    let mut result = Vec::new();

    for (idx, trace) in log.traces.iter().enumerate() {
        if trace.events.len() < 2 {
            continue;
        }

        let first = trace
            .events
            .first()
            .and_then(|e| e.attributes.get(timestamp_key));
        let last = trace
            .events
            .last()
            .and_then(|e| e.attributes.get(timestamp_key));

        if let (Some(start_val), Some(end_val)) = (first, last) {
            if let (Some(start_ms), Some(end_ms)) = (ts_ms(start_val), ts_ms(end_val)) {
                let duration = end_ms - start_ms;
                result.push((idx, duration));
            }
        }
    }

    result
}

/// Extract per-consecutive-event-pair durations within traces.
///
/// Returns `Vec<(activity_name, duration_ms)>` — one entry per consecutive
/// pair of events (within the same trace) where both events carry parseable
/// timestamps. `activity_name` is the activity of the *first* event in the pair.
pub fn extract_activity_pair_durations(
    log: &EventLog,
    activity_key: &str,
    timestamp_key: &str,
) -> Vec<(String, f64)> {
    let mut result = Vec::new();

    for trace in &log.traces {
        let events = &trace.events;
        if events.len() < 2 {
            continue;
        }

        for window in events.windows(2) {
            let (a, b) = (&window[0], &window[1]);

            let ts_a = a.attributes.get(timestamp_key).and_then(ts_ms);
            let ts_b = b.attributes.get(timestamp_key).and_then(ts_ms);

            if let (Some(t0), Some(t1)) = (ts_a, ts_b) {
                let activity = a
                    .attributes
                    .get(activity_key)
                    .and_then(|v| v.as_string())
                    .unwrap_or("")
                    .to_string();
                result.push((activity, t1 - t0));
            }
        }
    }

    result
}

/// Group case durations by a string-valued case (trace) attribute.
///
/// Returns `HashMap<attribute_value, Vec<duration_ms>>` for cohort splitting.
/// Traces missing the cohort attribute or without a parseable duration are
/// silently skipped.
pub fn extract_durations_by_case_attribute(
    log: &EventLog,
    cohort_attribute: &str,
    timestamp_key: &str,
) -> HashMap<String, Vec<f64>> {
    let mut result: HashMap<String, Vec<f64>> = HashMap::new();

    let durations = extract_case_durations(log, timestamp_key);

    for (idx, duration) in durations {
        let trace = &log.traces[idx];
        if let Some(cohort_val) = trace
            .attributes
            .get(cohort_attribute)
            .and_then(|v| v.as_string())
        {
            result
                .entry(cohort_val.to_string())
                .or_default()
                .push(duration);
        }
    }

    result
}

/// Group event-pair transition durations by a string-valued event attribute (e.g. resource).
///
/// For each consecutive event pair in all traces, if the *first* event carries
/// `group_attribute` as a string value, the transition duration is recorded
/// under that value.  Pairs with missing timestamps or missing group attribute
/// are silently skipped.
///
/// Returns `HashMap<attribute_value, Vec<duration_ms>>`.
pub fn extract_durations_by_event_attribute(
    log: &EventLog,
    group_attribute: &str,
    activity_key: &str,
    timestamp_key: &str,
) -> HashMap<String, Vec<f64>> {
    let _ = activity_key; // not needed for grouping but kept for API symmetry
    let mut result: HashMap<String, Vec<f64>> = HashMap::new();

    for trace in &log.traces {
        let events = &trace.events;
        if events.len() < 2 {
            continue;
        }

        for window in events.windows(2) {
            let (a, b) = (&window[0], &window[1]);

            let ts_a = a.attributes.get(timestamp_key).and_then(ts_ms);
            let ts_b = b.attributes.get(timestamp_key).and_then(ts_ms);

            if let (Some(t0), Some(t1)) = (ts_a, ts_b) {
                if let Some(group_val) = a
                    .attributes
                    .get(group_attribute)
                    .and_then(|v| v.as_string())
                {
                    result
                        .entry(group_val.to_string())
                        .or_default()
                        .push(t1 - t0);
                }
            }
        }
    }

    result
}

// ---------------------------------------------------------------------------
// Inline tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{AttributeValue, Event, EventLog, Trace};
    use std::collections::HashMap;

    fn make_event(activity: &str, timestamp: &str) -> Event {
        let mut attrs = HashMap::new();
        attrs.insert(
            "concept:name".to_string(),
            AttributeValue::String(activity.to_string()),
        );
        attrs.insert(
            "time:timestamp".to_string(),
            AttributeValue::Date(timestamp.to_string()),
        );
        Event { attributes: attrs }
    }

    fn make_trace(events: Vec<Event>) -> Trace {
        Trace {
            attributes: HashMap::new(),
            events,
        }
    }

    fn empty_log() -> EventLog {
        EventLog {
            attributes: HashMap::new(),
            traces: Vec::new(),
        }
    }

    // ------------------------------------------------------------------
    // extract_case_durations
    // ------------------------------------------------------------------

    #[test]
    fn case_durations_empty_log() {
        let log = empty_log();
        let result = extract_case_durations(&log, "time:timestamp");
        assert!(result.is_empty(), "empty log must yield empty result");
    }

    #[test]
    fn case_durations_single_event_trace_skipped() {
        let mut log = empty_log();
        log.traces
            .push(make_trace(vec![make_event("A", "2024-01-01T10:00:00Z")]));
        let result = extract_case_durations(&log, "time:timestamp");
        assert!(result.is_empty(), "single-event trace must be skipped");
    }

    #[test]
    fn case_durations_two_event_trace() {
        let mut log = empty_log();
        log.traces.push(make_trace(vec![
            make_event("A", "2024-01-01T10:00:00Z"),
            make_event("B", "2024-01-01T11:00:00Z"),
        ]));
        let result = extract_case_durations(&log, "time:timestamp");
        assert_eq!(result.len(), 1);
        let (idx, dur) = result[0];
        assert_eq!(idx, 0);
        // 1 hour = 3_600_000 ms
        assert!(
            (dur - 3_600_000.0).abs() < 1.0,
            "expected ~3600000ms, got {}",
            dur
        );
    }

    #[test]
    fn case_durations_missing_timestamp_skipped() {
        let mut log = empty_log();
        let mut t = make_trace(vec![
            make_event("A", "2024-01-01T10:00:00Z"),
            make_event("B", "2024-01-01T11:00:00Z"),
        ]);
        // Remove timestamp from first event
        t.events[0].attributes.remove("time:timestamp");
        log.traces.push(t);
        let result = extract_case_durations(&log, "time:timestamp");
        assert!(
            result.is_empty(),
            "trace with missing timestamp must be skipped"
        );
    }

    // ------------------------------------------------------------------
    // extract_activity_pair_durations
    // ------------------------------------------------------------------

    #[test]
    fn pair_durations_empty_log() {
        let log = empty_log();
        let result = extract_activity_pair_durations(&log, "concept:name", "time:timestamp");
        assert!(result.is_empty());
    }

    #[test]
    fn pair_durations_single_event_trace_skipped() {
        let mut log = empty_log();
        log.traces
            .push(make_trace(vec![make_event("A", "2024-01-01T10:00:00Z")]));
        let result = extract_activity_pair_durations(&log, "concept:name", "time:timestamp");
        assert!(result.is_empty());
    }

    #[test]
    fn pair_durations_two_pairs() {
        let mut log = empty_log();
        log.traces.push(make_trace(vec![
            make_event("A", "2024-01-01T10:00:00Z"),
            make_event("B", "2024-01-01T10:30:00Z"),
            make_event("C", "2024-01-01T11:00:00Z"),
        ]));
        let result = extract_activity_pair_durations(&log, "concept:name", "time:timestamp");
        assert_eq!(result.len(), 2);
        assert_eq!(result[0].0, "A");
        assert!((result[0].1 - 1_800_000.0).abs() < 1.0);
        assert_eq!(result[1].0, "B");
        assert!((result[1].1 - 1_800_000.0).abs() < 1.0);
    }

    // ------------------------------------------------------------------
    // extract_durations_by_case_attribute
    // ------------------------------------------------------------------

    #[test]
    fn case_attr_durations_empty_log() {
        let log = empty_log();
        let result = extract_durations_by_case_attribute(&log, "region", "time:timestamp");
        assert!(result.is_empty());
    }

    #[test]
    fn case_attr_durations_groups_correctly() {
        let mut log = empty_log();

        let mut t1 = make_trace(vec![
            make_event("A", "2024-01-01T10:00:00Z"),
            make_event("B", "2024-01-01T11:00:00Z"),
        ]);
        t1.attributes.insert(
            "region".to_string(),
            AttributeValue::String("EU".to_string()),
        );

        let mut t2 = make_trace(vec![
            make_event("A", "2024-01-01T10:00:00Z"),
            make_event("B", "2024-01-01T12:00:00Z"),
        ]);
        t2.attributes.insert(
            "region".to_string(),
            AttributeValue::String("EU".to_string()),
        );

        let mut t3 = make_trace(vec![
            make_event("A", "2024-01-01T10:00:00Z"),
            make_event("B", "2024-01-01T10:30:00Z"),
        ]);
        t3.attributes.insert(
            "region".to_string(),
            AttributeValue::String("US".to_string()),
        );

        log.traces.push(t1);
        log.traces.push(t2);
        log.traces.push(t3);

        let result = extract_durations_by_case_attribute(&log, "region", "time:timestamp");

        assert_eq!(result["EU"].len(), 2);
        assert_eq!(result["US"].len(), 1);
    }

    // ------------------------------------------------------------------
    // extract_durations_by_event_attribute
    // ------------------------------------------------------------------

    #[test]
    fn event_attr_durations_empty_log() {
        let log = empty_log();
        let result = extract_durations_by_event_attribute(
            &log,
            "org:resource",
            "concept:name",
            "time:timestamp",
        );
        assert!(result.is_empty());
    }

    #[test]
    fn event_attr_durations_groups_by_resource() {
        let mut log = empty_log();

        let mut e1 = make_event("A", "2024-01-01T10:00:00Z");
        e1.attributes.insert(
            "org:resource".to_string(),
            AttributeValue::String("Alice".to_string()),
        );
        let e2 = make_event("B", "2024-01-01T10:30:00Z");

        let mut e3 = make_event("C", "2024-01-01T10:30:00Z");
        e3.attributes.insert(
            "org:resource".to_string(),
            AttributeValue::String("Bob".to_string()),
        );
        let e4 = make_event("D", "2024-01-01T11:00:00Z");

        log.traces.push(make_trace(vec![e1, e2, e3, e4]));

        let result = extract_durations_by_event_attribute(
            &log,
            "org:resource",
            "concept:name",
            "time:timestamp",
        );

        assert!(result.contains_key("Alice"));
        assert!(result.contains_key("Bob"));
        assert_eq!(result["Alice"].len(), 1);
        assert_eq!(result["Bob"].len(), 1);
    }
}
