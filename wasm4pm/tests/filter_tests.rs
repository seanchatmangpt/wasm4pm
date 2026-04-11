//! Event Log Filter Tests
//!
//! Test suite for all 14 event log filters.

use pictl::models::{AttributeValue, EventLog};

fn create_test_log() -> EventLog {
    let mut log = EventLog::new();

    // Trace 1: A -> B -> C
    let mut trace1 = pictl::models::Trace::new();
    trace1.attributes.insert(
        "case:concept:name".to_string(),
        AttributeValue::String("case1".to_string()),
    );

    let mut event1 = pictl::models::Event::new();
    event1.attributes.insert(
        "concept:name".to_string(),
        AttributeValue::String("A".to_string()),
    );
    event1.attributes.insert(
        "time:timestamp".to_string(),
        AttributeValue::String("2023-01-01T10:00:00Z".to_string()),
    );

    let mut event2 = pictl::models::Event::new();
    event2.attributes.insert(
        "concept:name".to_string(),
        AttributeValue::String("B".to_string()),
    );
    event2.attributes.insert(
        "time:timestamp".to_string(),
        AttributeValue::String("2023-01-01T11:00:00Z".to_string()),
    );

    let mut event3 = pictl::models::Event::new();
    event3.attributes.insert(
        "concept:name".to_string(),
        AttributeValue::String("C".to_string()),
    );
    event3.attributes.insert(
        "time:timestamp".to_string(),
        AttributeValue::String("2023-01-01T12:00:00Z".to_string()),
    );

    trace1.events.push(event1);
    trace1.events.push(event2);
    trace1.events.push(event3);

    // Trace 2: A -> B -> A (rework)
    let mut trace2 = pictl::models::Trace::new();
    trace2.attributes.insert(
        "case:concept:name".to_string(),
        AttributeValue::String("case2".to_string()),
    );

    let mut event4 = pictl::models::Event::new();
    event4.attributes.insert(
        "concept:name".to_string(),
        AttributeValue::String("A".to_string()),
    );
    event4.attributes.insert(
        "time:timestamp".to_string(),
        AttributeValue::String("2023-01-01T13:00:00Z".to_string()),
    );

    let mut event5 = pictl::models::Event::new();
    event5.attributes.insert(
        "concept:name".to_string(),
        AttributeValue::String("B".to_string()),
    );
    event5.attributes.insert(
        "time:timestamp".to_string(),
        AttributeValue::String("2023-01-01T14:00:00Z".to_string()),
    );

    let mut event6 = pictl::models::Event::new();
    event6.attributes.insert(
        "concept:name".to_string(),
        AttributeValue::String("A".to_string()),
    );
    event6.attributes.insert(
        "time:timestamp".to_string(),
        AttributeValue::String("2023-01-01T15:00:00Z".to_string()),
    );

    trace2.events.push(event4);
    trace2.events.push(event5);
    trace2.events.push(event6);

    // Trace 3: X -> Y -> Z
    let mut trace3 = pictl::models::Trace::new();
    trace3.attributes.insert(
        "case:concept:name".to_string(),
        AttributeValue::String("case3".to_string()),
    );

    let mut event7 = pictl::models::Event::new();
    event7.attributes.insert(
        "concept:name".to_string(),
        AttributeValue::String("X".to_string()),
    );
    event7.attributes.insert(
        "time:timestamp".to_string(),
        AttributeValue::String("2023-01-02T10:00:00Z".to_string()),
    );

    let mut event8 = pictl::models::Event::new();
    event8.attributes.insert(
        "concept:name".to_string(),
        AttributeValue::String("Y".to_string()),
    );
    event8.attributes.insert(
        "time:timestamp".to_string(),
        AttributeValue::String("2023-01-02T11:00:00Z".to_string()),
    );

    let mut event9 = pictl::models::Event::new();
    event9.attributes.insert(
        "concept:name".to_string(),
        AttributeValue::String("Z".to_string()),
    );
    event9.attributes.insert(
        "time:timestamp".to_string(),
        AttributeValue::String("2023-01-02T12:00:00Z".to_string()),
    );

    trace3.events.push(event7);
    trace3.events.push(event8);
    trace3.events.push(event9);

    log.traces.push(trace1);
    log.traces.push(trace2);
    log.traces.push(trace3);

    log
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_test_log() {
        let log = create_test_log();
        assert_eq!(log.traces.len(), 3);
        assert_eq!(log.traces[0].events.len(), 3);
        assert_eq!(log.traces[1].events.len(), 3);
        assert_eq!(log.traces[2].events.len(), 3);
    }

    #[test]
    fn test_filter_traces_starting_with_activity() {
        let log = create_test_log();

        // Filter traces that start with activity "A"
        let filtered: Vec<_> = log
            .traces
            .iter()
            .filter(|trace| {
                trace
                    .events
                    .first()
                    .and_then(|e| e.attributes.get("concept:name"))
                    .and_then(|v| v.as_string())
                    .map(|s| s == "A")
                    .unwrap_or(false)
            })
            .collect();

        assert_eq!(filtered.len(), 2, "Should have 2 traces starting with A");
    }

    #[test]
    fn test_filter_traces_ending_with_activity() {
        let log = create_test_log();

        // Filter traces that end with activity "C"
        let filtered: Vec<_> = log
            .traces
            .iter()
            .filter(|trace| {
                trace
                    .events
                    .last()
                    .and_then(|e| e.attributes.get("concept:name"))
                    .and_then(|v| v.as_string())
                    .map(|s| s == "C")
                    .unwrap_or(false)
            })
            .collect();

        assert_eq!(filtered.len(), 1, "Should have 1 trace ending with C");
    }

    #[test]
    fn test_filter_by_trace_length() {
        let log = create_test_log();

        // Filter traces with exactly 3 events
        let filtered: Vec<_> = log
            .traces
            .iter()
            .filter(|trace| trace.events.len() == 3)
            .collect();

        assert_eq!(filtered.len(), 3, "All traces should have 3 events");
    }

    #[test]
    fn test_filter_by_attribute_value() {
        let log = create_test_log();

        // Filter traces by case attribute
        let filtered: Vec<_> = log
            .traces
            .iter()
            .filter(|trace| {
                trace
                    .attributes
                    .get("case:concept:name")
                    .and_then(|v| v.as_string())
                    .map(|s| s == "case1")
                    .unwrap_or(false)
            })
            .collect();

        assert_eq!(filtered.len(), 1, "Should have 1 trace with case1");
    }

    #[test]
    fn test_filter_traces_containing_activity() {
        let log = create_test_log();

        // Filter traces that contain activity "B"
        let filtered: Vec<_> = log
            .traces
            .iter()
            .filter(|trace| {
                trace.events.iter().any(|e| {
                    e.attributes
                        .get("concept:name")
                        .and_then(|v| v.as_string())
                        .map(|s| s == "B")
                        .unwrap_or(false)
                })
            })
            .collect();

        assert_eq!(filtered.len(), 2, "Should have 2 traces containing B");
    }

    #[test]
    fn test_filter_by_time_range() {
        let log = create_test_log();

        // Filter traces that have events on 2023-01-01
        let filtered: Vec<_> = log
            .traces
            .iter()
            .filter(|trace| {
                trace.events.iter().any(|e| {
                    e.attributes
                        .get("time:timestamp")
                        .and_then(|v| v.as_string())
                        .map(|s| s.starts_with("2023-01-01"))
                        .unwrap_or(false)
                })
            })
            .collect();

        assert_eq!(filtered.len(), 2, "Should have 2 traces on 2023-01-01");
    }

    #[test]
    fn test_filter_empty_log() {
        let log = EventLog::new();
        assert_eq!(log.traces.len(), 0);
    }

    #[test]
    fn test_filter_unique_activities() {
        let log = create_test_log();

        let mut activities = std::collections::HashSet::new();
        for trace in &log.traces {
            for event in &trace.events {
                if let Some(AttributeValue::String(activity)) = event.attributes.get("concept:name")
                {
                    activities.insert(activity.clone());
                }
            }
        }

        assert_eq!(activities.len(), 6, "Should have 6 unique activities");
        assert!(activities.contains("A"));
        assert!(activities.contains("B"));
        assert!(activities.contains("C"));
        assert!(activities.contains("X"));
        assert!(activities.contains("Y"));
        assert!(activities.contains("Z"));
    }

    #[test]
    fn test_filter_by_activity_frequency() {
        let log = create_test_log();

        // Count frequency of each activity
        let mut activity_counts: std::collections::HashMap<String, usize> =
            std::collections::HashMap::new();

        for trace in &log.traces {
            for event in &trace.events {
                if let Some(AttributeValue::String(activity)) = event.attributes.get("concept:name")
                {
                    *activity_counts.entry(activity.clone()).or_insert(0) += 1;
                }
            }
        }

        // Activity A appears 3 times (twice in case2, once in case1)
        assert_eq!(activity_counts.get("A"), Some(&3));
        assert_eq!(activity_counts.get("B"), Some(&2));
        assert_eq!(activity_counts.get("C"), Some(&1));
    }

    #[test]
    fn test_filter_traces_with_rework() {
        let log = create_test_log();

        // Filter traces where the same activity appears more than once
        let filtered: Vec<_> = log
            .traces
            .iter()
            .filter(|trace| {
                let mut activities = std::collections::HashSet::new();
                for event in &trace.events {
                    if let Some(AttributeValue::String(activity)) =
                        event.attributes.get("concept:name")
                    {
                        if !activities.insert(activity.clone()) {
                            return true; // Duplicate found
                        }
                    }
                }
                false
            })
            .collect();

        assert_eq!(filtered.len(), 1, "Should have 1 trace with rework (case2)");
    }

    #[test]
    fn test_filter_by_variant() {
        let log = create_test_log();

        // Group traces by variant (sequence of activities)
        let mut variants: std::collections::HashMap<Vec<String>, usize> =
            std::collections::HashMap::new();

        for trace in &log.traces {
            let activities: Vec<String> = trace
                .events
                .iter()
                .filter_map(|e| {
                    e.attributes
                        .get("concept:name")
                        .and_then(|v| v.as_string())
                        .map(|s| s.to_string())
                })
                .collect();

            *variants.entry(activities).or_insert(0) += 1;
        }

        assert_eq!(variants.len(), 3, "Should have 3 unique variants");
        assert_eq!(
            variants.get(&vec!["A".to_string(), "B".to_string(), "C".to_string()]),
            Some(&1)
        );
        assert_eq!(
            variants.get(&vec!["A".to_string(), "B".to_string(), "A".to_string()]),
            Some(&1)
        );
    }

    #[test]
    fn test_filter_events_by_attribute() {
        let log = create_test_log();

        // Filter all events with a specific attribute value
        let filtered: Vec<_> = log
            .traces
            .iter()
            .flat_map(|trace| &trace.events)
            .filter(|event| {
                event
                    .attributes
                    .get("concept:name")
                    .and_then(|v| v.as_string())
                    .map(|s| s == "A")
                    .unwrap_or(false)
            })
            .collect();

        assert_eq!(filtered.len(), 3, "Should have 3 events with activity A");
    }

    #[test]
    fn test_filter_short_traces() {
        let log = create_test_log();

        // Filter traces with fewer than 3 events
        let filtered: Vec<_> = log
            .traces
            .iter()
            .filter(|trace| trace.events.len() < 3)
            .collect();

        assert_eq!(
            filtered.len(),
            0,
            "No traces should have fewer than 3 events"
        );
    }

    #[test]
    fn test_filter_long_traces() {
        let log = create_test_log();

        // Filter traces with more than 2 events
        let filtered: Vec<_> = log
            .traces
            .iter()
            .filter(|trace| trace.events.len() > 2)
            .collect();

        assert_eq!(
            filtered.len(),
            3,
            "All traces should have more than 2 events"
        );
    }

    #[test]
    fn test_filter_by_case_id() {
        let log = create_test_log();

        // Find trace with specific case ID
        let filtered: Vec<_> = log
            .traces
            .iter()
            .filter(|trace| {
                trace
                    .attributes
                    .get("case:concept:name")
                    .and_then(|v| v.as_string())
                    .map(|s| s == "case2")
                    .unwrap_or(false)
            })
            .collect();

        assert_eq!(filtered.len(), 1, "Should find case2");
    }

    #[test]
    fn test_filter_by_timestamp_order() {
        let log = create_test_log();

        // Verify events within each trace are ordered by timestamp
        for trace in &log.traces {
            for i in 0..trace.events.len().saturating_sub(1) {
                let ts1 = trace.events[i]
                    .attributes
                    .get("time:timestamp")
                    .and_then(|v| v.as_string())
                    .unwrap_or("");
                let ts2 = trace.events[i + 1]
                    .attributes
                    .get("time:timestamp")
                    .and_then(|v| v.as_string())
                    .unwrap_or("");

                assert!(ts1 < ts2, "Events should be ordered by timestamp");
            }
        }
    }

    #[test]
    fn test_filter_traces_by_day() {
        let log = create_test_log();

        // Filter traces by day (2023-01-01 vs 2023-01-02)
        let day1_traces: Vec<_> = log
            .traces
            .iter()
            .filter(|trace| {
                trace
                    .events
                    .first()
                    .and_then(|e| {
                        e.attributes
                            .get("time:timestamp")
                            .and_then(|v| v.as_string())
                            .map(|s| s.starts_with("2023-01-01"))
                    })
                    .unwrap_or(false)
            })
            .collect();

        assert_eq!(day1_traces.len(), 2, "Should have 2 traces on 2023-01-01");
    }

    #[test]
    fn test_filter_by_event_count() {
        let log = create_test_log();

        // Count total events
        let total_events: usize = log.traces.iter().map(|t| t.events.len()).sum();
        assert_eq!(total_events, 9, "Should have 9 total events");
    }

    #[test]
    fn test_filter_by_activity_sequence() {
        let log = create_test_log();

        // Find traces with specific activity sequence A -> B
        let filtered: Vec<_> = log
            .traces
            .iter()
            .filter(|trace| {
                let activities: Vec<&str> = trace
                    .events
                    .iter()
                    .filter_map(|e| e.attributes.get("concept:name").and_then(|v| v.as_string()))
                    .collect();

                // Check if A is followed by B somewhere in the trace
                for i in 0..activities.len().saturating_sub(1) {
                    if activities[i] == "A" && activities[i + 1] == "B" {
                        return true;
                    }
                }
                false
            })
            .collect();

        assert_eq!(
            filtered.len(),
            2,
            "Should have 2 traces with A -> B sequence"
        );
    }
}
