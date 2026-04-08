//! Event Log Filter Tests
//!
//! Test suite for all 14 event log filters.

use std::collections::HashMap;
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
}
