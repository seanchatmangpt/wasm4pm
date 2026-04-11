//! Performance spectrum discovery.
//!
//! For a given target activity, measures the time duration between each
//! occurrence of that activity and the next activity in the trace.  Results
//! are grouped by `(target_activity, next_activity)` pair with aggregate
//! statistics (min, max, mean, median, count).
//!
//! Ported from pm4wasm `discovery/performance_spectrum.rs`.

use crate::error::{codes, wasm_err};
use crate::models::{parse_timestamp_ms, AttributeValue, EventLog};
use crate::state::{get_or_init_state, StoredObject};
use crate::utilities::to_js;
use rustc_hash::FxHashMap;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

// ─── Public types ──────────────────────────────────────────────────────────

/// Aggregate performance measurements for one directly-follows pair.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ActivityPerformance {
    /// The target activity (the activity being analysed).
    pub activity: String,
    /// The activity that directly follows the target.
    pub next_activity: String,
    /// Number of observed occurrences of this pair.
    pub count: usize,
    /// Minimum duration in milliseconds.
    pub min_duration_ms: f64,
    /// Maximum duration in milliseconds.
    pub max_duration_ms: f64,
    /// Mean (average) duration in milliseconds.
    pub mean_duration_ms: f64,
    /// Median duration in milliseconds.
    pub median_duration_ms: f64,
}

/// Full performance spectrum result for a target activity.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PerformanceSpectrumResult {
    /// Per-pair performance measurements, sorted by next_activity name.
    pub measurements: Vec<ActivityPerformance>,
    /// The activity that was analysed.
    pub target_activity: String,
}

// ─── Core algorithm ────────────────────────────────────────────────────────

/// Discover the performance spectrum for `activity` in the given event log.
///
/// For every trace, each occurrence of `activity` is paired with the
/// immediately following event (if any).  The time difference between the
/// two timestamps is recorded.  Events without parseable timestamps are
/// silently skipped.
///
/// Returns an empty `measurements` vector when no valid pairs are found.
pub fn discover_performance_spectrum(
    log: &EventLog,
    activity: &str,
    activity_key: &str,
    timestamp_key: &str,
) -> PerformanceSpectrumResult {
    // Collect raw durations per (activity, next_activity) pair.
    let mut buckets: FxHashMap<(String, String), Vec<f64>> = FxHashMap::default();

    for trace in &log.traces {
        let events = &trace.events;
        for i in 0..events.len() {
            // Match target activity by attribute key
            let event_name = match events[i]
                .attributes
                .get(activity_key)
                .and_then(|v| v.as_string())
            {
                Some(name) if name == activity => name,
                _ => continue,
            };

            // Need a next event with a timestamp.
            let next_idx = i + 1;
            if next_idx >= events.len() {
                continue;
            }

            let ts_start = events[i]
                .attributes
                .get(timestamp_key)
                .and_then(|v| {
                    if let AttributeValue::Date(s) = v {
                        parse_timestamp_ms(s)
                    } else {
                        None
                    }
                });

            let next_name = events[next_idx]
                .attributes
                .get(activity_key)
                .and_then(|v| v.as_string());

            let ts_end = events[next_idx]
                .attributes
                .get(timestamp_key)
                .and_then(|v| {
                    if let AttributeValue::Date(s) = v {
                        parse_timestamp_ms(s)
                    } else {
                        None
                    }
                });

            match (ts_start, ts_end, next_name) {
                (Some(start_ms), Some(end_ms), Some(next_act)) => {
                    let duration_ms = (end_ms - start_ms) as f64;
                    let key = (event_name.to_string(), next_act.to_string());
                    buckets.entry(key).or_default().push(duration_ms);
                }
                _ => continue,
            }
        }
    }

    // Compute aggregate statistics per bucket.
    let mut measurements: Vec<ActivityPerformance> = buckets
        .into_iter()
        .map(|((act, next_act), mut durations)| {
            durations.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
            let count = durations.len();
            let min_d = durations.first().copied().unwrap_or(0.0);
            let max_d = durations.last().copied().unwrap_or(0.0);
            let sum: f64 = durations.iter().sum();
            let mean_d = if count > 0 {
                sum / count as f64
            } else {
                0.0
            };
            let median_d = if count > 0 {
                let mid = count / 2;
                if count % 2 == 0 && count >= 2 {
                    (durations[mid - 1] + durations[mid]) / 2.0
                } else {
                    durations[mid]
                }
            } else {
                0.0
            };
            ActivityPerformance {
                activity: act,
                next_activity: next_act,
                count,
                min_duration_ms: min_d,
                max_duration_ms: max_d,
                mean_duration_ms: mean_d,
                median_duration_ms: median_d,
            }
        })
        .collect();

    measurements.sort_by(|a, b| a.next_activity.cmp(&b.next_activity));

    PerformanceSpectrumResult {
        measurements,
        target_activity: activity.to_string(),
    }
}

// ─── WASM export ───────────────────────────────────────────────────────────

/// Discover the performance spectrum for a target activity.
///
/// Measures time durations between each occurrence of `target_activity`
/// and the immediately following event.  Returns aggregate statistics
/// (min, max, mean, median, count) per `(target, next)` pair.
///
/// # Arguments
///
/// * `eventlog_handle` - Handle to a stored EventLog
/// * `activity_key` - Attribute key for activity names (e.g. "concept:name")
/// * `timestamp_key` - Attribute key for timestamps (e.g. "time:timestamp")
/// * `target_activity` - The activity to analyse
#[wasm_bindgen]
pub fn discover_performance_spectrum_wasm(
    eventlog_handle: &str,
    activity_key: &str,
    timestamp_key: &str,
    target_activity: &str,
) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let result =
                discover_performance_spectrum(log, target_activity, activity_key, timestamp_key);
            to_js(&result)
        }
        Some(_) => Err(wasm_err(
            codes::INVALID_INPUT,
            "Object is not an EventLog",
        )),
        None => Err(wasm_err(
            codes::INVALID_HANDLE,
            format!("EventLog '{}' not found", eventlog_handle),
        )),
    })
}

// ─── Tests ─────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{AttributeValue, Event, EventLog, Trace};
    use std::collections::HashMap;

    fn make_event(name: &str, timestamp: &str) -> Event {
        let mut attrs = HashMap::new();
        attrs.insert("concept:name".to_string(), AttributeValue::String(name.to_string()));
        attrs.insert(
            "time:timestamp".to_string(),
            AttributeValue::Date(timestamp.to_string()),
        );
        Event { attributes: attrs }
    }

    fn make_event_no_ts(name: &str) -> Event {
        let mut attrs = HashMap::new();
        attrs.insert("concept:name".to_string(), AttributeValue::String(name.to_string()));
        Event { attributes: attrs }
    }

    fn make_log(traces: Vec<Trace>) -> EventLog {
        EventLog {
            attributes: HashMap::new(),
            traces,
        }
    }

    #[test]
    fn test_single_pair_basic_stats() {
        // Two traces: A->B with known durations of 1000ms and 3000ms.
        let log = make_log(vec![
            Trace {
                attributes: HashMap::new(),
                events: vec![
                    make_event("A", "2020-01-01T00:00:00Z"),
                    make_event("B", "2020-01-01T00:00:01Z"),
                ],
            },
            Trace {
                attributes: HashMap::new(),
                events: vec![
                    make_event("A", "2020-01-01T01:00:00Z"),
                    make_event("B", "2020-01-01T01:00:03Z"),
                ],
            },
        ]);
        let result = discover_performance_spectrum(&log, "A", "concept:name", "time:timestamp");
        assert_eq!(result.target_activity, "A");
        assert_eq!(result.measurements.len(), 1);
        let m = &result.measurements[0];
        assert_eq!(m.next_activity, "B");
        assert_eq!(m.count, 2);
        assert_eq!(m.min_duration_ms, 1000.0);
        assert_eq!(m.max_duration_ms, 3000.0);
        assert_eq!(m.mean_duration_ms, 2000.0);
        assert_eq!(m.median_duration_ms, 2000.0);
    }

    #[test]
    fn test_median_odd_count() {
        // Three durations: 1000, 2000, 5000 -> median should be 2000.
        let log = make_log(vec![
            Trace {
                attributes: HashMap::new(),
                events: vec![
                    make_event("A", "2020-01-01T00:00:00Z"),
                    make_event("B", "2020-01-01T00:00:01Z"), // 1000ms
                ],
            },
            Trace {
                attributes: HashMap::new(),
                events: vec![
                    make_event("A", "2020-01-01T01:00:00Z"),
                    make_event("B", "2020-01-01T01:00:02Z"), // 2000ms
                ],
            },
            Trace {
                attributes: HashMap::new(),
                events: vec![
                    make_event("A", "2020-01-01T02:00:00Z"),
                    make_event("B", "2020-01-01T02:00:05Z"), // 5000ms
                ],
            },
        ]);
        let result = discover_performance_spectrum(&log, "A", "concept:name", "time:timestamp");
        assert_eq!(result.measurements[0].count, 3);
        assert_eq!(result.measurements[0].median_duration_ms, 2000.0);
    }

    #[test]
    fn test_multiple_next_activities() {
        // A->B and A->C pairs.
        let log = make_log(vec![
            Trace {
                attributes: HashMap::new(),
                events: vec![
                    make_event("A", "2020-01-01T00:00:00Z"),
                    make_event("B", "2020-01-01T00:00:02Z"),
                ],
            },
            Trace {
                attributes: HashMap::new(),
                events: vec![
                    make_event("A", "2020-01-01T01:00:00Z"),
                    make_event("C", "2020-01-01T01:00:10Z"),
                ],
            },
        ]);
        let result = discover_performance_spectrum(&log, "A", "concept:name", "time:timestamp");
        assert_eq!(result.measurements.len(), 2);
        // Sorted by next_activity: B comes before C.
        assert_eq!(result.measurements[0].next_activity, "B");
        assert_eq!(result.measurements[0].mean_duration_ms, 2000.0);
        assert_eq!(result.measurements[1].next_activity, "C");
        assert_eq!(result.measurements[1].mean_duration_ms, 10000.0);
    }

    #[test]
    fn test_missing_timestamps_skipped() {
        // Events without timestamps should be silently skipped.
        let log = make_log(vec![Trace {
            attributes: HashMap::new(),
            events: vec![
                make_event_no_ts("A"),
                make_event("B", "2020-01-01T00:00:05Z"),
            ],
        }]);
        let result = discover_performance_spectrum(&log, "A", "concept:name", "time:timestamp");
        assert_eq!(result.measurements.len(), 0);
    }

    #[test]
    fn test_no_occurrences() {
        let log = make_log(vec![Trace {
            attributes: HashMap::new(),
            events: vec![
                make_event("X", "2020-01-01T00:00:00Z"),
                make_event("Y", "2020-01-01T00:00:01Z"),
            ],
        }]);
        let result = discover_performance_spectrum(&log, "A", "concept:name", "time:timestamp");
        assert!(result.measurements.is_empty());
    }

    #[test]
    fn test_multiple_occurrences_in_one_trace() {
        // A appears twice in one trace, each followed by a different activity.
        let log = make_log(vec![Trace {
            attributes: HashMap::new(),
            events: vec![
                make_event("A", "2020-01-01T00:00:00Z"),
                make_event("B", "2020-01-01T00:00:01Z"),
                make_event("A", "2020-01-01T00:00:05Z"),
                make_event("C", "2020-01-01T00:00:06Z"),
            ],
        }]);
        let result = discover_performance_spectrum(&log, "A", "concept:name", "time:timestamp");
        assert_eq!(result.measurements.len(), 2);
    }

    #[test]
    fn test_custom_attribute_keys() {
        // Use non-default attribute keys.
        let mut attrs_a1 = HashMap::new();
        attrs_a1.insert("activity".to_string(), AttributeValue::String("A".to_string()));
        attrs_a1.insert(
            "ts".to_string(),
            AttributeValue::Date("2020-01-01T00:00:00Z".to_string()),
        );
        let mut attrs_b = HashMap::new();
        attrs_b.insert("activity".to_string(), AttributeValue::String("B".to_string()));
        attrs_b.insert(
            "ts".to_string(),
            AttributeValue::Date("2020-01-01T00:00:02Z".to_string()),
        );

        let log = make_log(vec![Trace {
            attributes: HashMap::new(),
            events: vec![
                Event { attributes: attrs_a1 },
                Event { attributes: attrs_b },
            ],
        }]);
        let result = discover_performance_spectrum(&log, "A", "activity", "ts");
        assert_eq!(result.measurements.len(), 1);
        assert_eq!(result.measurements[0].mean_duration_ms, 2000.0);
    }
}
