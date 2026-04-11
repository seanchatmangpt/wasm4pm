//! Correlation miner: discover a DFG from events **without** case identifiers.
//!
//! Based on Pourmirza, Dijkman, and Grefen (2017), "Correlation miner: mining
//! business process models and event correlations without case identifiers."
//!
//! The algorithm flattens all events across traces, sorts by timestamp, groups by
//! activity, then:
//! 1. Computes a precede-succeed matrix (fraction of i-end-times < j-start-times).
//! 2. Computes a duration matrix (average time delta via greedy FIFO/LIFO matching
//!    within threshold).
//! 3. Greedily assigns edge weights minimising cost (duration / PS / min_count)
//!    while respecting activity occurrence counts and avoiding cycles.
//! 4. Derives start/end activities from in-degree/out-degree.

use crate::error::{codes, wasm_err};
use crate::models::{parse_timestamp_ms, AttributeValue, EventLog};
use crate::state::{get_or_init_state, StoredObject};
use crate::utilities::to_js;
use rustc_hash::FxHashMap;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use wasm_bindgen::prelude::*;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/// Configuration for the correlation miner.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CorrelationConfig {
    /// Maximum time gap (in seconds) between correlated events. Default: 86400 (24h).
    pub correlation_threshold: f64,
    /// Minimum frequency for an edge to be included. Default: 1.
    pub min_edge_frequency: u32,
}

impl Default for CorrelationConfig {
    fn default() -> Self {
        CorrelationConfig {
            correlation_threshold: 86400.0,
            min_edge_frequency: 1,
        }
    }
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

/// Result of correlation mining.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CorrelationResult {
    /// DFG edges: `(source_activity, target_activity, frequency)`.
    pub edges: Vec<(String, String, u32)>,
    /// Start activities with their frequency.
    pub start_activities: Vec<(String, u32)>,
    /// End activities with their frequency.
    pub end_activities: Vec<(String, u32)>,
    /// Number of correlated traces discovered.
    pub num_traces: usize,
}

// ---------------------------------------------------------------------------
// WASM export
// ---------------------------------------------------------------------------

/// Discover a DFG from events without case IDs using temporal correlation.
///
/// # Arguments
///
/// * `eventlog_handle` - Handle to an EventLog stored in the WASM state.
/// * `activity_key` - Attribute key for activity names (e.g. `"concept:name"`).
/// * `timestamp_key` - Attribute key for timestamps (e.g. `"time:timestamp"`).
/// * `threshold` - Correlation threshold in seconds (default: 86400).
///
/// # Returns
///
/// A `CorrelationResult` serialised as a JS object containing edges,
/// start/end activities, and estimated trace count.
#[wasm_bindgen]
pub fn discover_correlation(
    eventlog_handle: &str,
    activity_key: &str,
    timestamp_key: &str,
    threshold: f64,
) -> Result<JsValue, JsValue> {
    let cfg = CorrelationConfig {
        correlation_threshold: if threshold > 0.0 { threshold } else { 86400.0 },
        min_edge_frequency: 1,
    };

    let result = get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let result = mine_correlation(log, activity_key, timestamp_key, &cfg);
            to_js(&result)
        }
        Some(_) => Err(wasm_err(codes::INVALID_HANDLE, "Object is not an EventLog")),
        None => Err(wasm_err(codes::INVALID_HANDLE, "EventLog not found")),
    })?;

    Ok(result)
}

// ---------------------------------------------------------------------------
// Core algorithm
// ---------------------------------------------------------------------------

/// Discover a DFG from an [`EventLog`] without using case IDs.
///
/// Flattens all events, sorts by timestamp, groups by activity, then computes
/// precede-succeed and duration matrices to resolve edge weights.
pub fn mine_correlation(
    log: &EventLog,
    activity_key: &str,
    timestamp_key: &str,
    cfg: &CorrelationConfig,
) -> CorrelationResult {
    let indexed = parse_and_sort(log, activity_key, timestamp_key);
    if indexed.len() < 2 {
        return empty_result();
    }

    // Collect distinct activities (sorted) and their end/start timestamp arrays.
    let mut act_map: BTreeMap<String, (Vec<i64>, Vec<i64>)> = BTreeMap::new();
    for ie in &indexed {
        let (end_ts, start_ts) = act_map.entry(ie.activity.clone()).or_default();
        end_ts.push(ie.end_time);
        start_ts.push(ie.start_time);
    }
    // Each (end_ts, start_ts) is already sorted because `indexed` is sorted.

    let activities: Vec<String> = act_map.keys().cloned().collect();
    let n = activities.len();
    if n < 1 {
        return empty_result();
    }

    // Single activity: no edges possible, but still report trace count.
    if n < 2 {
        return CorrelationResult {
            edges: Vec::new(),
            start_activities: activities
                .iter()
                .map(|a| (a.clone(), act_map[a].0.len() as u32))
                .collect(),
            end_activities: activities
                .iter()
                .map(|a| (a.clone(), act_map[a].0.len() as u32))
                .collect(),
            num_traces: estimate_trace_count(&indexed, cfg),
        };
    }

    let act_counts: Vec<usize> = activities.iter().map(|a| act_map[a].0.len()).collect();

    // Step 3: Precede-succeed matrix.
    let ps = compute_ps_matrix(&activities, &act_map);

    // Step 4: Duration matrix.
    let dur = compute_duration_matrix(&activities, &act_map, cfg);

    // Step 5: Resolve edge weights via greedy cost-minimisation.
    let edge_freq = resolve_edges(&act_counts, &ps, &dur);

    // Step 6: Build DFG, filter by min_edge_frequency.
    let mut out_deg: FxHashMap<String, u32> = FxHashMap::default();
    let mut in_deg: FxHashMap<String, u32> = FxHashMap::default();
    let mut edges: Vec<(String, String, u32)> = Vec::new();

    for (&(i, j), &freq) in &edge_freq {
        if freq < cfg.min_edge_frequency {
            continue;
        }
        let src = &activities[i];
        let tgt = &activities[j];
        *out_deg.entry(src.clone()).or_insert(0) += freq;
        *in_deg.entry(tgt.clone()).or_insert(0) += freq;
        edges.push((src.clone(), tgt.clone(), freq));
    }

    let start_activities: Vec<(String, u32)> = activities
        .iter()
        .enumerate()
        .filter(|(_, a)| in_deg.get(*a).copied().unwrap_or(0) == 0)
        .map(|(i, a)| (a.clone(), act_counts[i] as u32))
        .collect();

    let end_activities: Vec<(String, u32)> = activities
        .iter()
        .enumerate()
        .filter(|(_, a)| out_deg.get(*a).copied().unwrap_or(0) == 0)
        .map(|(i, a)| (a.clone(), act_counts[i] as u32))
        .collect();

    CorrelationResult {
        edges,
        start_activities,
        end_activities,
        num_traces: estimate_trace_count(&indexed, cfg),
    }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

struct IndexedEvent {
    index: usize,
    activity: String,
    end_time: i64,
    start_time: i64,
}

/// Parse activity names and timestamps from an EventLog, sort chronologically.
fn parse_and_sort(log: &EventLog, activity_key: &str, timestamp_key: &str) -> Vec<IndexedEvent> {
    let mut parsed = Vec::new();
    let mut idx = 0usize;
    for trace in &log.traces {
        for event in &trace.events {
            let activity = match event
                .attributes
                .get(activity_key)
                .and_then(|v| v.as_string())
            {
                Some(a) => a.to_owned(),
                None => continue,
            };
            let ts_ms = match event.attributes.get(timestamp_key) {
                Some(AttributeValue::Date(s)) => parse_timestamp_ms(s),
                _ => continue,
            };
            let Some(ts_ms) = ts_ms else {
                continue;
            };
            let ts_secs = ts_ms / 1000;
            parsed.push(IndexedEvent {
                index: idx,
                activity,
                end_time: ts_secs,
                start_time: ts_secs,
            });
            idx += 1;
        }
    }
    parsed.sort_by_key(|ie| (ie.start_time, ie.end_time, ie.index));
    parsed
}

/// Precede-succeed matrix: `PS[i][j]` = fraction of activity-i end-times that
/// precede at least one activity-j start-time. Values in [0.0, 1.0].
fn compute_ps_matrix(
    activities: &[String],
    act_map: &BTreeMap<String, (Vec<i64>, Vec<i64>)>,
) -> Vec<Vec<f64>> {
    let n = activities.len();
    let mut ps = vec![vec![0.0f64; n]; n];
    for i in 0..n {
        let ai = &act_map[&activities[i]].0; // end times
        if ai.is_empty() {
            continue;
        }
        for j in 0..n {
            if i == j {
                continue;
            }
            let aj = &act_map[&activities[j]].1; // start times
            if aj.is_empty() {
                continue;
            }
            let count = ai
                .iter()
                .filter(|t| aj.partition_point(|&x| x <= **t) < aj.len())
                .count();
            ps[i][j] = count as f64 / (ai.len() * aj.len()) as f64;
        }
    }
    ps
}

/// Duration matrix: `dur[i][j]` = avg (j.start - i.end) for correlated pairs
/// within threshold, using greedy FIFO/LIFO matching.
fn compute_duration_matrix(
    activities: &[String],
    act_map: &BTreeMap<String, (Vec<i64>, Vec<i64>)>,
    cfg: &CorrelationConfig,
) -> Vec<Vec<f64>> {
    let n = activities.len();
    let thr = cfg.correlation_threshold as i64;
    let mut dur = vec![vec![0.0f64; n]; n];
    for i in 0..n {
        let ai = &act_map[&activities[i]].0;
        if ai.is_empty() {
            continue;
        }
        for j in 0..n {
            if i == j {
                continue;
            }
            let aj = &act_map[&activities[j]].1;
            if aj.is_empty() {
                continue;
            }
            dur[i][j] = greedy_fifo_avg(ai, aj, thr).min(greedy_lifo_avg(ai, aj, thr));
        }
    }
    dur
}

/// Greedy FIFO: for each ai in order, match first aj > ai within threshold.
fn greedy_fifo_avg(ai: &[i64], aj: &[i64], thr: i64) -> f64 {
    let mut matches = Vec::new();
    let mut z = 0;
    for &t in ai {
        while z < aj.len() {
            if t < aj[z] {
                let d = aj[z] - t;
                if d <= thr {
                    matches.push(d);
                }
                z += 1;
                break;
            }
            z += 1;
        }
    }
    avg(&matches)
}

/// Greedy LIFO: scan from end, match aj to latest ai < aj within threshold.
fn greedy_lifo_avg(ai: &[i64], aj: &[i64], thr: i64) -> f64 {
    let mut matches = Vec::new();
    let mut k = ai.len() as isize - 1;
    for z in (0..aj.len()).rev() {
        while k >= 0 {
            if ai[k as usize] < aj[z] {
                let d = aj[z] - ai[k as usize];
                if d <= thr {
                    matches.push(d);
                }
                k -= 1;
                break;
            }
            k -= 1;
        }
    }
    avg(&matches)
}

fn avg(v: &[i64]) -> f64 {
    if v.is_empty() {
        0.0
    } else {
        v.iter().sum::<i64>() as f64 / v.len() as f64
    }
}

/// Greedy edge resolution: assign edge weights minimising cost
/// (duration / PS / min_count) while respecting activity occurrence counts.
fn resolve_edges(
    act_counts: &[usize],
    ps: &[Vec<f64>],
    dur: &[Vec<f64>],
) -> FxHashMap<(usize, usize), u32> {
    let n = act_counts.len();
    let mut candidates: Vec<(f64, usize, usize)> = Vec::new();
    for i in 0..n {
        for j in 0..n {
            if i == j || ps[i][j] <= 0.0 {
                continue;
            }
            let mc = act_counts[i].min(act_counts[j]);
            if mc == 0 {
                continue;
            }
            candidates.push((dur[i][j] / ps[i][j] / mc as f64, i, j));
        }
    }
    candidates.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));

    let mut out_rem: Vec<u32> = act_counts.iter().map(|&c| c as u32).collect();
    let mut in_rem: Vec<u32> = act_counts.iter().map(|&c| c as u32).collect();
    let mut edge_freq: FxHashMap<(usize, usize), u32> = FxHashMap::default();

    for (_cost, i, j) in candidates {
        if out_rem[i] == 0 || in_rem[j] == 0 {
            continue;
        }
        // Avoid cycles: skip if reverse direction has equal or higher precedence
        // (meaning events don't clearly go i->j).
        if ps[j][i] >= ps[i][j] * 0.8 {
            continue;
        }
        let assign = out_rem[i].min(in_rem[j]);
        out_rem[i] -= assign;
        in_rem[j] -= assign;
        *edge_freq.entry((i, j)).or_insert(0) += assign;
    }
    edge_freq
}

/// Estimate number of correlated traces by detecting temporal gaps.
fn estimate_trace_count(indexed: &[IndexedEvent], cfg: &CorrelationConfig) -> usize {
    if indexed.is_empty() {
        return 0;
    }
    let thr = cfg.correlation_threshold as i64;
    let mut count = 1;
    for w in indexed.windows(2) {
        if w[1].start_time - w[0].end_time > thr {
            count += 1;
        }
    }
    count
}

fn empty_result() -> CorrelationResult {
    CorrelationResult {
        edges: Vec::new(),
        start_activities: Vec::new(),
        end_activities: Vec::new(),
        num_traces: 0,
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{AttributeValue, Event, EventLog, Trace};
    use std::collections::HashMap;

    /// Helper: build an EventLog from a list of `(activity, timestamp)` tuples.
    /// Uses `std::collections::HashMap` (NOT FxHashMap) for Event/Trace attributes.
    fn make_log(events: &[(&str, &str)]) -> EventLog {
        let trace_events: Vec<Event> = events
            .iter()
            .map(|(activity, ts)| {
                let mut attrs = HashMap::new();
                attrs.insert(
                    "concept:name".to_owned(),
                    AttributeValue::String((*activity).to_owned()),
                );
                attrs.insert(
                    "time:timestamp".to_owned(),
                    AttributeValue::Date((*ts).to_owned()),
                );
                Event { attributes: attrs }
            })
            .collect();
        EventLog {
            attributes: HashMap::new(),
            traces: vec![Trace {
                attributes: HashMap::new(),
                events: trace_events,
            }],
        }
    }

    /// Helper: build an EventLog with multiple traces.
    fn make_multi_trace_log(traces: &[Vec<(&str, &str)>]) -> EventLog {
        EventLog {
            attributes: HashMap::new(),
            traces: traces
                .iter()
                .map(|events| Trace {
                    attributes: HashMap::new(),
                    events: events
                        .iter()
                        .map(|(activity, ts)| {
                            let mut attrs = HashMap::new();
                            attrs.insert(
                                "concept:name".to_owned(),
                                AttributeValue::String((*activity).to_owned()),
                            );
                            attrs.insert(
                                "time:timestamp".to_owned(),
                                AttributeValue::Date((*ts).to_owned()),
                            );
                            Event { attributes: attrs }
                        })
                        .collect(),
                })
                .collect(),
        }
    }

    #[test]
    fn correlation_discovers_clear_temporal_pattern() {
        // Three cases: A->B->C repeated at 00:00, 00:10, 00:20
        let log = make_log(&[
            ("A", "2024-01-01T00:00:00Z"),
            ("B", "2024-01-01T00:00:01Z"),
            ("C", "2024-01-01T00:00:02Z"),
            ("A", "2024-01-01T00:00:10Z"),
            ("B", "2024-01-01T00:00:11Z"),
            ("C", "2024-01-01T00:00:12Z"),
            ("A", "2024-01-01T00:00:20Z"),
            ("B", "2024-01-01T00:00:21Z"),
            ("C", "2024-01-01T00:00:22Z"),
        ]);
        let cfg = CorrelationConfig {
            correlation_threshold: 5.0,
            min_edge_frequency: 1,
        };
        let result = mine_correlation(&log, "concept:name", "time:timestamp", &cfg);

        assert!(!result.edges.is_empty(), "Expected non-empty DFG edges");
        let ab = result.edges.iter().find(|(s, t, _)| s == "A" && t == "B");
        assert!(
            ab.is_some(),
            "Expected A -> B edge, got: {:?}",
            result.edges
        );
        assert!(ab.unwrap().2 >= 2);
        let bc = result.edges.iter().find(|(s, t, _)| s == "B" && t == "C");
        assert!(bc.is_some(), "Expected B -> C edge");
        assert!(
            result.start_activities.iter().any(|(a, _)| a == "A"),
            "A should be start"
        );
        assert!(
            result.end_activities.iter().any(|(a, _)| a == "C"),
            "C should be end"
        );
        assert_eq!(result.num_traces, 3);
    }

    #[test]
    fn correlation_empty_input() {
        let log = EventLog {
            attributes: HashMap::new(),
            traces: vec![Trace {
                attributes: HashMap::new(),
                events: Vec::new(),
            }],
        };
        let result = mine_correlation(
            &log,
            "concept:name",
            "time:timestamp",
            &CorrelationConfig::default(),
        );
        assert!(result.edges.is_empty() && result.start_activities.is_empty());
        assert_eq!(result.num_traces, 0);
    }

    #[test]
    fn correlation_single_activity_no_edges() {
        let log = make_log(&[("A", "2024-01-01T00:00:00Z"), ("A", "2024-01-01T00:00:01Z")]);
        let result = mine_correlation(
            &log,
            "concept:name",
            "time:timestamp",
            &CorrelationConfig::default(),
        );
        assert!(result.edges.is_empty());
        assert_eq!(result.num_traces, 1);
    }

    #[test]
    fn correlation_no_timestamps_returns_empty() {
        let log = EventLog {
            attributes: HashMap::new(),
            traces: vec![Trace {
                attributes: HashMap::new(),
                events: vec![
                    {
                        let mut attrs = HashMap::new();
                        attrs.insert(
                            "concept:name".to_owned(),
                            AttributeValue::String("A".to_owned()),
                        );
                        Event { attributes: attrs }
                    },
                    {
                        let mut attrs = HashMap::new();
                        attrs.insert(
                            "concept:name".to_owned(),
                            AttributeValue::String("B".to_owned()),
                        );
                        Event { attributes: attrs }
                    },
                ],
            }],
        };
        let result = mine_correlation(
            &log,
            "concept:name",
            "time:timestamp",
            &CorrelationConfig::default(),
        );
        assert!(result.edges.is_empty() && result.num_traces == 0);
    }

    #[test]
    fn correlation_from_log_ignores_case_ids() {
        let log = make_multi_trace_log(&[
            vec![("A", "2024-01-01T00:00:00Z"), ("B", "2024-01-01T00:00:05Z")],
            vec![("A", "2024-01-01T00:01:00Z"), ("B", "2024-01-01T00:01:05Z")],
        ]);
        let result = mine_correlation(
            &log,
            "concept:name",
            "time:timestamp",
            &CorrelationConfig::default(),
        );
        assert!(result.edges.iter().any(|(s, t, _)| s == "A" && t == "B"));
    }

    #[test]
    fn correlation_min_edge_frequency_filters() {
        let log = make_log(&[
            ("A", "2024-01-01T00:00:00Z"),
            ("B", "2024-01-01T00:00:01Z"),
            ("A", "2024-01-01T00:00:10Z"),
            ("B", "2024-01-01T00:00:11Z"),
            ("A", "2024-01-01T00:00:20Z"),
            ("B", "2024-01-01T00:00:21Z"),
        ]);
        let cfg = CorrelationConfig {
            correlation_threshold: 3600.0,
            min_edge_frequency: 5,
        };
        let result = mine_correlation(&log, "concept:name", "time:timestamp", &cfg);
        assert!(
            result.edges.is_empty(),
            "min_edge_frequency=5 should filter all edges"
        );
    }

    #[test]
    fn correlation_detects_separate_traces_by_gap() {
        let log = make_log(&[
            ("A", "2024-01-01T00:00:00Z"),
            ("B", "2024-01-01T00:00:01Z"),
            ("A", "2024-01-01T02:00:00Z"),
            ("B", "2024-01-01T02:00:01Z"),
        ]);
        let cfg = CorrelationConfig {
            correlation_threshold: 3600.0,
            min_edge_frequency: 1,
        };
        let result = mine_correlation(&log, "concept:name", "time:timestamp", &cfg);
        assert_eq!(
            result.num_traces, 2,
            "2-hour gap should split into 2 traces"
        );
    }

    #[test]
    fn correlation_no_activities_returns_empty() {
        let log = EventLog {
            attributes: HashMap::new(),
            traces: vec![Trace {
                attributes: HashMap::new(),
                events: vec![{
                    let mut attrs = HashMap::new();
                    attrs.insert(
                        "time:timestamp".to_owned(),
                        AttributeValue::Date("2024-01-01T00:00:00Z".to_owned()),
                    );
                    Event { attributes: attrs }
                }],
            }],
        };
        let result = mine_correlation(
            &log,
            "concept:name",
            "time:timestamp",
            &CorrelationConfig::default(),
        );
        assert!(result.edges.is_empty());
        assert_eq!(result.num_traces, 0);
    }
}
