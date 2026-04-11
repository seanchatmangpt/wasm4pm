//! Footprints-based conformance checking.
//!
//! Compares the log's directly-follows graph against a model's footprints
//! to compute fitness, precision, recall, and f1-score.
//!
//! Ported from pm4wasm/src/conformance/footprints_conf.rs

use crate::powl::footprints::Footprints;
use crate::powl_event_log::EventLog;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Footprints conformance result.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FootprintsConformanceResult {
    pub fitness: f64,
    pub precision: f64,
    pub recall: f64,
    pub f1: f64,
}

/// Build the log footprints from the directly-follows graph.
fn log_footprints(log: &EventLog) -> HashMap<(String, String), usize> {
    let mut sequence: HashMap<(String, String), usize> = HashMap::new();

    for trace in &log.traces {
        for window in trace.events.windows(2) {
            let key = (window[0].name.clone(), window[1].name.clone());
            *sequence.entry(key).or_insert(0) += 1;
        }
    }

    sequence
}

/// Compute footprints-based conformance metrics.
pub fn check(log: &EventLog, model_fp: &Footprints) -> FootprintsConformanceResult {
    let log_fp_map = log_footprints(log);

    let model_sequence: std::collections::HashSet<(String, String)> = model_fp.sequence.clone();
    let log_sequence: std::collections::HashSet<(String, String)> =
        log_fp_map.keys().cloned().collect();

    // --- Fitness ---
    let log_total = log_sequence.len();
    let matching = log_sequence.intersection(&model_sequence).count();
    let fitness = if log_total == 0 {
        1.0
    } else {
        matching as f64 / log_total as f64
    };

    // --- Precision ---
    let model_total = model_sequence.len();
    let recall_matching = model_sequence.intersection(&log_sequence).count();
    let precision = if model_total == 0 {
        1.0
    } else {
        recall_matching as f64 / model_total as f64
    };

    // --- Recall (same as fitness for footprint comparison) ---
    let recall = fitness;

    // --- F1 ---
    let f1 = if precision + recall == 0.0 {
        0.0
    } else {
        2.0 * precision * recall / (precision + recall)
    };

    FootprintsConformanceResult {
        fitness,
        precision,
        recall,
        f1,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::powl_event_log::{Event, Trace};
    use std::collections::HashMap;

    fn make_log(traces: Vec<(&str, &[&str])>) -> EventLog {
        EventLog {
            traces: traces
                .into_iter()
                .map(|(case_id, acts)| Trace {
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
                })
                .collect(),
        }
    }

    fn make_model_fp(activities: &[&str], sequence: &[(&str, &str)]) -> Footprints {
        let act_set: std::collections::HashSet<String> =
            activities.iter().map(|s| s.to_string()).collect();
        let seq_set: std::collections::HashSet<(String, String)> = sequence
            .iter()
            .map(|(a, b)| (a.to_string(), b.to_string()))
            .collect();
        let start = if !activities.is_empty() {
            [activities[0].to_string()].into_iter().collect()
        } else {
            std::collections::HashSet::new()
        };
        let end = if !activities.is_empty() {
            [activities[activities.len() - 1].to_string()]
                .into_iter()
                .collect()
        } else {
            std::collections::HashSet::new()
        };
        Footprints {
            start_activities: start,
            end_activities: end,
            activities: act_set,
            skippable: false,
            sequence: seq_set,
            parallel: std::collections::HashSet::new(),
            activities_always_happening: std::collections::HashSet::new(),
            min_trace_length: activities.len(),
        }
    }

    #[test]
    fn test_footprints_perfect_conformance() {
        // Happy path: log matches model perfectly
        let log = make_log(vec![("1", &["A", "B", "C"]), ("2", &["A", "B", "C"])]);
        let model_fp = make_model_fp(&["A", "B", "C"], &[("A", "B"), ("B", "C")]);
        let result = check(&log, &model_fp);
        assert!((result.fitness - 1.0).abs() < 1e-9);
        assert!((result.precision - 1.0).abs() < 1e-9);
    }

    #[test]
    fn test_footprints_imperfect_metrics() {
        // Imperfect fitness: extra pair in log
        let log = make_log(vec![("1", &["A", "B", "C", "A"])]);
        let model_fp = make_model_fp(&["A", "B", "C"], &[("A", "B"), ("B", "C")]);
        let result = check(&log, &model_fp);
        assert!(result.fitness < 1.0);

        // Imperfect precision: missing pair in model
        let log = make_log(vec![("1", &["A", "B"])]);
        let model_fp = make_model_fp(&["A", "B", "C"], &[("A", "B"), ("B", "C")]);
        let result = check(&log, &model_fp);
        assert!(result.precision < 1.0);
    }

    #[test]
    fn test_footprints_empty_log() {
        // Edge case: empty log has perfect fitness
        let log = make_log(vec![]);
        let model_fp = make_model_fp(&["A"], &[]);
        let result = check(&log, &model_fp);
        assert!((result.fitness - 1.0).abs() < 1e-9);
    }
}
