//! Event log types for POWL conformance checking.
//!
//! Minimal event log model used by token_replay and streaming conformance.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// A single event in a trace.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Event {
    /// Activity name (concept:name).
    pub name: String,
    /// ISO-8601 timestamp string, if present.
    pub timestamp: Option<String>,
    /// Lifecycle transition, if present.
    pub lifecycle: Option<String>,
    /// All other attributes.
    pub attributes: HashMap<String, String>,
}

/// An ordered sequence of events for one case.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Trace {
    /// Case identifier.
    pub case_id: String,
    pub events: Vec<Event>,
}

/// A collection of traces.
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct EventLog {
    pub traces: Vec<Trace>,
}

impl EventLog {
    /// All distinct activity names across all traces, sorted.
    pub fn activities(&self) -> Vec<String> {
        let mut set: std::collections::BTreeSet<String> = Default::default();
        for trace in &self.traces {
            for event in &trace.events {
                set.insert(event.name.clone());
            }
        }
        set.into_iter().collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_trace(case_id: &str, acts: &[&str]) -> Trace {
        Trace {
            case_id: case_id.to_string(),
            events: acts
                .iter()
                .map(|&a| Event {
                    name: a.to_string(),
                    timestamp: None,
                    lifecycle: None,
                    attributes: HashMap::new(),
                })
                .collect(),
        }
    }

    #[test]
    fn activities_extraction() {
        let log = EventLog {
            traces: vec![make_trace("c1", &["A", "B"]), make_trace("c2", &["A", "C"])],
        };
        assert_eq!(log.activities(), vec!["A", "B", "C"]);
    }
}
