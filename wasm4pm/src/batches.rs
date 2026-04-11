//! Batch processing pattern detection for event logs.
//!
//! Identifies four types of batch processing based on temporal overlap
//! of activity executions across cases, following Martin et al. (2015).
//!
//! Ported from pm4wasm `discovery/batches.rs`.

use crate::error::{codes, wasm_err};
use crate::models::{parse_timestamp_ms, AttributeValue, EventLog};
use crate::state::{get_or_init_state, StoredObject};
use crate::utilities::to_js;
use rustc_hash::FxHashMap;
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use wasm_bindgen::prelude::*;

/// Classification of a detected batch pattern.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum BatchType {
    /// End of one execution equals start of the next.
    Sequential,
    /// Overlapping executions that are not sequential or parallel.
    Concurrent,
    /// Identical start and end timestamps across all executions.
    Parallel,
    /// Large overlapping batch that disrupts normal flow.
    Disruptive,
}

/// A single detected batch instance.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BatchInstance {
    pub activity: String,
    pub batch_type: BatchType,
    pub case_ids: Vec<String>,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub size: usize,
}

/// Aggregated result of batch detection across all activities.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BatchDetectionResult {
    pub batches: Vec<BatchInstance>,
    pub total_batches: usize,
}

// ─── Internal types ────────────────────────────────────────────────────────

#[derive(Clone, Debug)]
struct Execution {
    start_ts: i64,
    end_ts: i64,
    start_str: String,
    end_str: String,
    case_id: String,
}

#[derive(Clone, Debug)]
struct Interval {
    start_ts: i64,
    end_ts: i64,
    start_str: String,
    end_str: String,
    case_ids: BTreeSet<String>,
}

impl Ord for Interval {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.start_ts.cmp(&other.start_ts)
    }
}
impl PartialOrd for Interval {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}
impl Eq for Interval {}
impl PartialEq for Interval {
    fn eq(&self, other: &Self) -> bool {
        self.start_ts == other.start_ts && self.end_ts == other.end_ts
    }
}

const MERGE_DISTANCE_MS: i64 = 15 * 60 * 1000; // 15 minutes in milliseconds
const MIN_BATCH_SIZE: usize = 2;
const DISRUPTIVE_THRESHOLD: usize = 5;

// ─── Interval merging ──────────────────────────────────────────────────────

/// Merge overlapping time intervals. Two intervals [a,b] and [c,d] overlap if a <= c <= b.
fn merge_overlapping(mut intervals: Vec<Interval>) -> Vec<Interval> {
    intervals.sort();
    let mut merged: Vec<Interval> = Vec::new();
    for interval in intervals {
        if let Some(last) = merged.last_mut() {
            if last.end_ts >= interval.start_ts {
                if interval.end_ts > last.end_ts {
                    last.end_ts = interval.end_ts;
                    last.end_str = interval.end_str.clone();
                }
                last.case_ids.extend(interval.case_ids.iter().cloned());
                continue;
            }
        }
        merged.push(interval);
    }
    merged
}

/// Merge non-overlapping intervals closer than `max_distance` milliseconds.
fn merge_near(mut intervals: Vec<Interval>, max_distance: i64) -> Vec<Interval> {
    intervals.sort();
    let mut merged: Vec<Interval> = Vec::new();
    for interval in intervals {
        if let Some(last) = merged.last_mut() {
            if interval.start_ts - last.end_ts <= max_distance {
                if interval.end_ts > last.end_ts {
                    last.end_ts = interval.end_ts;
                    last.end_str = interval.end_str.clone();
                }
                last.case_ids.extend(interval.case_ids.iter().cloned());
                continue;
            }
        }
        merged.push(interval);
    }
    merged
}

// ─── Batch type classification ─────────────────────────────────────────────

/// Classify a merged batch interval into a specific batch type based on the
/// temporal relationship of its constituent executions.
fn classify_batch(
    activity: &str,
    interval: &Interval,
    executions: &[Execution],
) -> Option<BatchInstance> {
    let size = interval.case_ids.len();
    if size < MIN_BATCH_SIZE {
        return None;
    }

    let mut batch_execs: Vec<&Execution> = executions
        .iter()
        .filter(|e| interval.case_ids.contains(&e.case_id))
        .collect();
    batch_execs.sort_by_key(|e| e.start_ts);

    let min_start = batch_execs.iter().map(|e| e.start_ts).min().unwrap_or(0);
    let max_start = batch_execs.iter().map(|e| e.start_ts).max().unwrap_or(0);
    let min_end = batch_execs.iter().map(|e| e.end_ts).min().unwrap_or(0);
    let max_end = batch_execs.iter().map(|e| e.end_ts).max().unwrap_or(0);

    let batch_type = if min_start == max_start && min_end == max_end {
        BatchType::Parallel
    } else if min_start == max_start || min_end == max_end {
        BatchType::Concurrent
    } else {
        let is_sequential = batch_execs.windows(2).all(|w| w[0].end_ts == w[1].start_ts);
        if is_sequential {
            BatchType::Sequential
        } else if size >= DISRUPTIVE_THRESHOLD {
            BatchType::Disruptive
        } else {
            BatchType::Concurrent
        }
    };

    Some(BatchInstance {
        activity: activity.to_string(),
        batch_type,
        case_ids: interval.case_ids.iter().cloned().collect(),
        start_time: Some(interval.start_str.clone()),
        end_time: Some(interval.end_str.clone()),
        size,
    })
}

// ─── Per-activity detection ────────────────────────────────────────────────

fn detect_single(activity: &str, mut executions: Vec<Execution>) -> Vec<BatchInstance> {
    if executions.len() < MIN_BATCH_SIZE {
        return Vec::new();
    }
    executions.sort_by_key(|e| e.start_ts);

    let intervals: Vec<Interval> = executions
        .iter()
        .map(|e| {
            let mut cases = BTreeSet::new();
            cases.insert(e.case_id.clone());
            Interval {
                start_ts: e.start_ts,
                end_ts: e.end_ts,
                start_str: e.start_str.clone(),
                end_str: e.end_str.clone(),
                case_ids: cases,
            }
        })
        .collect();

    let merged = merge_near(merge_overlapping(intervals), MERGE_DISTANCE_MS);

    merged
        .iter()
        .filter_map(|interval| classify_batch(activity, interval, &executions))
        .collect()
}

// ─── Public API ────────────────────────────────────────────────────────────

/// Discover batch processing patterns in an event log.
///
/// Groups events by activity, then for each activity detects temporal
/// overlaps between executions across different cases. Activities without
/// timestamps are silently skipped.
///
/// # Arguments
///
/// * `log` - The event log to analyse
/// * `activity_key` - Attribute key for activity names (e.g. "concept:name")
/// * `timestamp_key` - Attribute key for timestamps (e.g. "time:timestamp")
pub fn discover_batches(
    log: &EventLog,
    activity_key: &str,
    timestamp_key: &str,
) -> BatchDetectionResult {
    let mut activity_execs: FxHashMap<String, Vec<Execution>> = FxHashMap::default();

    for trace in &log.traces {
        // Derive a case identifier from trace attributes or use index.
        let case_id = trace
            .attributes
            .get("concept:name")
            .and_then(|v| v.as_string())
            .map(|s| s.to_string())
            .unwrap_or_default();

        for event in &trace.events {
            let activity_name = match event
                .attributes
                .get(activity_key)
                .and_then(|v| v.as_string())
            {
                Some(name) => name.to_string(),
                None => continue,
            };

            let ts_str = match event.attributes.get(timestamp_key) {
                Some(AttributeValue::Date(s)) => s.clone(),
                _ => continue,
            };

            let epoch_ms = match parse_timestamp_ms(&ts_str) {
                Some(ms) => ms,
                None => continue,
            };

            activity_execs
                .entry(activity_name)
                .or_default()
                .push(Execution {
                    start_ts: epoch_ms,
                    end_ts: epoch_ms,
                    start_str: ts_str.clone(),
                    end_str: ts_str,
                    case_id: case_id.clone(),
                });
        }
    }

    let mut all_batches: Vec<BatchInstance> = Vec::new();
    for (activity, executions) in &activity_execs {
        all_batches.extend(detect_single(activity, executions.clone()));
    }
    all_batches.sort_by(|a, b| b.size.cmp(&a.size));

    BatchDetectionResult {
        total_batches: all_batches.len(),
        batches: all_batches,
    }
}

// ─── WASM export ───────────────────────────────────────────────────────────

/// Detect batch processing patterns in an event log.
///
/// Identifies sequential, concurrent, parallel, and disruptive batch patterns
/// based on temporal overlap of activity executions across cases.
///
/// # Arguments
///
/// * `eventlog_handle` - Handle to a stored EventLog
/// * `activity_key` - Attribute key for activity names (e.g. "concept:name")
/// * `timestamp_key` - Attribute key for timestamps (e.g. "time:timestamp")
#[wasm_bindgen]
pub fn discover_batches_wasm(
    eventlog_handle: &str,
    activity_key: &str,
    timestamp_key: &str,
) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let result = discover_batches(log, activity_key, timestamp_key);
            to_js(&result)
        }
        Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Object is not an EventLog")),
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

    fn ts(minute: i64) -> String {
        format!("2024-01-01T00:{:02}:00+00:00", minute)
    }

    fn make_event(name: &str, minute: i64) -> Event {
        let mut attrs = HashMap::default();
        attrs.insert(
            "concept:name".to_string(),
            AttributeValue::String(name.to_string()),
        );
        attrs.insert(
            "time:timestamp".to_string(),
            AttributeValue::Date(ts(minute)),
        );
        Event { attributes: attrs }
    }

    fn make_trace(case_name: &str, events: Vec<Event>) -> Trace {
        let mut attrs = HashMap::default();
        attrs.insert(
            "concept:name".to_string(),
            AttributeValue::String(case_name.to_string()),
        );
        Trace {
            attributes: attrs,
            events,
        }
    }

    fn make_log(traces: Vec<Trace>) -> EventLog {
        EventLog {
            attributes: HashMap::default(),
            traces,
        }
    }

    #[test]
    fn test_empty_log_returns_no_batches() {
        let log = make_log(vec![]);
        let result = discover_batches(&log, "concept:name", "time:timestamp");
        assert_eq!(result.total_batches, 0);
        assert!(result.batches.is_empty());
    }

    #[test]
    fn test_log_without_timestamps_returns_no_batches() {
        let mut attrs_a = HashMap::default();
        attrs_a.insert(
            "concept:name".to_string(),
            AttributeValue::String("A".to_string()),
        );
        let mut attrs_b = HashMap::default();
        attrs_b.insert(
            "concept:name".to_string(),
            AttributeValue::String("B".to_string()),
        );
        let log = make_log(vec![make_trace(
            "c1",
            vec![
                Event {
                    attributes: attrs_a,
                },
                Event {
                    attributes: attrs_b,
                },
            ],
        )]);
        assert_eq!(
            discover_batches(&log, "concept:name", "time:timestamp").total_batches,
            0
        );
    }

    #[test]
    fn test_detects_batches() {
        let log = make_log(vec![
            make_trace(
                "case1",
                vec![make_event("Check", 0), make_event("Approve", 3)],
            ),
            make_trace(
                "case2",
                vec![make_event("Check", 1), make_event("Approve", 4)],
            ),
            make_trace(
                "case3",
                vec![make_event("Check", 2), make_event("Approve", 5)],
            ),
        ]);
        let result = discover_batches(&log, "concept:name", "time:timestamp");
        assert!(result.total_batches >= 1);
        let check = result
            .batches
            .iter()
            .find(|b| b.activity == "Check")
            .unwrap();
        assert_eq!(check.size, 3);
    }

    #[test]
    fn test_single_event_per_activity_no_batch() {
        let log = make_log(vec![make_trace(
            "c1",
            vec![make_event("A", 0), make_event("B", 1)],
        )]);
        assert_eq!(
            discover_batches(&log, "concept:name", "time:timestamp").total_batches,
            0
        );
    }

    #[test]
    fn test_parallel_batch_identical_timestamps() {
        let log = make_log(vec![
            make_trace("case1", vec![make_event("Print", 10)]),
            make_trace("case2", vec![make_event("Print", 10)]),
        ]);
        let result = discover_batches(&log, "concept:name", "time:timestamp");
        assert_eq!(result.total_batches, 1);
        assert_eq!(result.batches[0].batch_type, BatchType::Parallel);
        assert_eq!(result.batches[0].size, 2);
    }

    #[test]
    fn test_disruptive_batch_large_size() {
        let traces: Vec<Trace> = (0..6)
            .map(|i| make_trace(&format!("case{}", i + 1), vec![make_event("Ship", i)]))
            .collect();
        let result = discover_batches(&make_log(traces), "concept:name", "time:timestamp");
        let ship = result
            .batches
            .iter()
            .find(|b| b.activity == "Ship")
            .unwrap();
        assert_eq!(ship.size, 6);
        assert_eq!(ship.batch_type, BatchType::Disruptive);
    }

    #[test]
    fn test_custom_attribute_keys() {
        // Use non-default attribute keys.
        let mut attrs1 = HashMap::default();
        attrs1.insert(
            "activity".to_string(),
            AttributeValue::String("Print".to_string()),
        );
        attrs1.insert(
            "ts".to_string(),
            AttributeValue::Date("2024-01-01T00:10:00+00:00".to_string()),
        );
        let mut attrs2 = HashMap::default();
        attrs2.insert(
            "activity".to_string(),
            AttributeValue::String("Print".to_string()),
        );
        attrs2.insert(
            "ts".to_string(),
            AttributeValue::Date("2024-01-01T00:10:00+00:00".to_string()),
        );

        let log = make_log(vec![
            make_trace("case1", vec![Event { attributes: attrs1 }]),
            make_trace("case2", vec![Event { attributes: attrs2 }]),
        ]);
        let result = discover_batches(&log, "activity", "ts");
        assert_eq!(result.total_batches, 1);
        assert_eq!(result.batches[0].batch_type, BatchType::Parallel);
    }
}
