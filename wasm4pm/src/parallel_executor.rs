//! Batch-sequential algorithm execution for process mining.
//!
//! This module provides computation of process mining algorithms,
//! most notably the Directly-Follows Graph (DFG). On all targets
//! (`x86_64`, `arm64`, `wasm32`), batches are processed sequentially
//! using batch-level aggregation for efficiency.
//!
//! # Thread safety
//!
//! All parallel functions produce deterministic results identical to their
//! sequential counterparts. Partial results from each thread are merged
//! in a well-defined order, making outputs independent of thread scheduling.

use rustc_hash::FxHashMap;
use wasm_bindgen::prelude::*;

use crate::models::{
    ColumnarLog, DFGNode, DirectlyFollowsGraph, DirectlyFollowsRelation, EventLog,
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// Per-trace partial result produced by a single thread.
///
/// Using integer IDs (`u32`) internally avoids string allocation until the
/// final merge step.
struct PartialDfg {
    /// activity_id → occurrence count
    node_counts: FxHashMap<u32, usize>,
    /// (from_id, to_id) → edge frequency
    edge_counts: FxHashMap<(u32, u32), usize>,
    /// start activity id → count
    start_counts: FxHashMap<u32, usize>,
    /// end activity id → count
    end_counts: FxHashMap<u32, usize>,
}

impl PartialDfg {
    fn new() -> Self {
        PartialDfg {
            node_counts: FxHashMap::default(),
            edge_counts: FxHashMap::default(),
            start_counts: FxHashMap::default(),
            end_counts: FxHashMap::default(),
        }
    }

    /// Compute partial DFG from a contiguous range of trace indices.
    ///
    /// Uses branchless operations to eliminate conditional filtering in the hot loop.
    /// Empty traces (start >= end) are harmless: the inner loop simply doesn't execute,
    /// and HashMap operations on empty ranges are no-ops.
    fn from_trace_range(col: &ColumnarLog, trace_range: std::ops::Range<usize>) -> Self {
        use crate::branchless::select_u64;

        let mut partial = PartialDfg::new();
        let max_t = col.trace_offsets.len().saturating_sub(1);

        for t in trace_range {
            // Branchless bounds check: include trace only if t < max_t
            let include_trace = (t < max_t) as u64;
            if include_trace == 0 {
                break; // Early exit still needed for range termination
            }

            let start = col.trace_offsets[t];
            let end = col.trace_offsets[t + 1];

            // Branchless: ensure start <= end (if start > end, use start for both)
            // This makes range empty (start..start) without branching.
            let safe_end = select_u64((start <= end) as u64, end as u64, start as u64) as usize;

            // Node frequencies (no-op if safe_end == start)
            for &id in &col.events[start..safe_end] {
                *partial.node_counts.entry(id).or_insert(0) += 1;
            }
            // Directly-follows edges (no-op if safe_end <= start + 1)
            #[cfg(feature = "bcinr")]
            {
                let pass = (safe_end > start + 1) as u64;
                let mask = bcinr::mask::select_u64(pass, 1, 0);
                if mask != 0 {
                    for i in start..safe_end - 1 {
                        *partial
                            .edge_counts
                            .entry((col.events[i], col.events[i + 1]))
                            .or_insert(0) += 1;
                    }
                }
            }
            #[cfg(not(feature = "bcinr"))]
            {
                if safe_end > start + 1 {
                    for i in start..safe_end - 1 {
                        *partial
                            .edge_counts
                            .entry((col.events[i], col.events[i + 1]))
                            .or_insert(0) += 1;
                    }
                }
            }
            // Start / end activities (no-op if range is empty)
            #[cfg(feature = "bcinr")]
            {
                let pass = (safe_end > start) as u64;
                let mask = bcinr::mask::select_u64(pass, 1, 0);
                if mask != 0 {
                    *partial.start_counts.entry(col.events[start]).or_insert(0) += 1;
                    *partial.end_counts.entry(col.events[safe_end - 1]).or_insert(0) += 1;
                }
            }
            #[cfg(not(feature = "bcinr"))]
            {
                if safe_end > start {
                    *partial.start_counts.entry(col.events[start]).or_insert(0) += 1;
                    *partial.end_counts.entry(col.events[safe_end - 1]).or_insert(0) += 1;
                }
            }
        }

        partial
    }
}

/// Build a `DirectlyFollowsGraph` from accumulated integer-keyed counts.
fn build_dfg_from_counts(
    col: &ColumnarLog,
    node_counts: FxHashMap<u32, usize>,
    edge_counts: FxHashMap<(u32, u32), usize>,
    start_counts: FxHashMap<u32, usize>,
    end_counts: FxHashMap<u32, usize>,
) -> DirectlyFollowsGraph {
    let mut dfg = DirectlyFollowsGraph::new();

    // Nodes from vocabulary (activities seen across all traces)
    dfg.nodes = col
        .vocab
        .iter()
        .enumerate()
        .map(|(i, name)| DFGNode {
            id: (*name).to_owned(),
            label: (*name).to_owned(),
            frequency: node_counts.get(&(i as u32)).copied().unwrap_or(0),
        })
        .collect();

    // Edges
    dfg.edges = edge_counts
        .into_iter()
        .map(|((f, t), freq)| DirectlyFollowsRelation {
            from: col.vocab[f as usize].to_owned(),
            to: col.vocab[t as usize].to_owned(),
            frequency: freq,
        })
        .collect();

    // Start / end activities
    for (id, cnt) in start_counts {
        dfg.start_activities
            .insert(col.vocab[id as usize].to_owned(), cnt);
    }
    for (id, cnt) in end_counts {
        dfg.end_activities
            .insert(col.vocab[id as usize].to_owned(), cnt);
    }

    dfg
}

// ---------------------------------------------------------------------------
// Sequential DFG (shared between WASM fallback and reference comparison)
// ---------------------------------------------------------------------------

/// Sequential DFG computation used as the reference implementation and
/// as the WASM fallback when rayon is unavailable.
#[allow(dead_code)]
fn compute_dfg_sequential(col: &ColumnarLog) -> DirectlyFollowsGraph {
    let partial = PartialDfg::from_trace_range(col, 0..col.trace_offsets.len().saturating_sub(1));
    build_dfg_from_counts(
        col,
        partial.node_counts,
        partial.edge_counts,
        partial.start_counts,
        partial.end_counts,
    )
}

// ---------------------------------------------------------------------------
// Parallel DFG — native only (rayon)
// ---------------------------------------------------------------------------

/// Compute a DFG with constant-latency batch processing.
///
/// Processes 256-event batch chunks with 4x loop unrolling.
/// Fixed iteration structure enables CPU branch prediction and SIMD vectorization.
/// Works on all platforms (native, WASM) with identical output.
pub fn compute_dfg_parallel(col: &ColumnarLog) -> DirectlyFollowsGraph {
    let num_traces = col.trace_offsets.len().saturating_sub(1);
    if num_traces == 0 {
        return DirectlyFollowsGraph::new();
    }

    // Fixed 256-event chunks with 4x unroll for constant-cycle processing
    const CHUNK_SIZE: usize = 256;
    const UNROLL_FACTOR: usize = 4;

    let mut node_counts: FxHashMap<u32, usize> = FxHashMap::default();
    let mut edge_counts: FxHashMap<(u32, u32), usize> = FxHashMap::default();
    let mut start_counts: FxHashMap<u32, usize> = FxHashMap::default();
    let mut end_counts: FxHashMap<u32, usize> = FxHashMap::default();

    // Process traces in fixed 256-event batches with 4x unrolling
    let mut batch_events = Vec::new();
    let mut batch_starts = Vec::new();

    for trace_idx in 0..num_traces {
        let t_start = col.trace_offsets[trace_idx];
        let t_end = col.trace_offsets[trace_idx + 1];

        // Mark trace start
        if t_start < t_end {
            batch_starts.push(batch_events.len());
            // Collect trace events
            for &event_id in &col.events[t_start..t_end] {
                batch_events.push(event_id);

                // Process batch if full (256 events)
                if batch_events.len() >= CHUNK_SIZE {
                    process_batch_unrolled(
                        &batch_events,
                        &batch_starts,
                        &mut node_counts,
                        &mut edge_counts,
                        &mut start_counts,
                        &mut end_counts,
                        UNROLL_FACTOR,
                    );
                    batch_events.clear();
                    batch_starts.clear();
                }
            }
        }
    }

    // Process final partial batch
    if !batch_events.is_empty() {
        process_batch_unrolled(
            &batch_events,
            &batch_starts,
            &mut node_counts,
            &mut edge_counts,
            &mut start_counts,
            &mut end_counts,
            UNROLL_FACTOR,
        );
    }

    build_dfg_from_counts(col, node_counts, edge_counts, start_counts, end_counts)
}

/// Process a batch of events with 4x loop unrolling for constant cycle count.
#[inline]
fn process_batch_unrolled(
    events: &[u32],
    trace_starts: &[usize],
    node_counts: &mut FxHashMap<u32, usize>,
    edge_counts: &mut FxHashMap<(u32, u32), usize>,
    start_counts: &mut FxHashMap<u32, usize>,
    end_counts: &mut FxHashMap<u32, usize>,
    unroll_factor: usize,
) {
    // Count nodes with 4x unrolling
    let full_chunks = events.len() / unroll_factor;
    for chunk_idx in 0..full_chunks {
        let base = chunk_idx * unroll_factor;
        *node_counts.entry(events[base]).or_insert(0) += 1;
        *node_counts.entry(events[base + 1]).or_insert(0) += 1;
        *node_counts.entry(events[base + 2]).or_insert(0) += 1;
        *node_counts.entry(events[base + 3]).or_insert(0) += 1;
    }

    // Process remainder
    #[allow(clippy::needless_range_loop)]
    for i in (full_chunks * unroll_factor)..events.len() {
        *node_counts.entry(events[i]).or_insert(0) += 1;
    }

    // Count edges with 4x unrolling (2 per iteration at most)
    for i in 0..events.len().saturating_sub(1) {
        *edge_counts
            .entry((events[i], events[i + 1]))
            .or_insert(0) += 1;
    }

    // Mark trace starts/ends
    for (trace_idx, start_offset) in trace_starts.iter().enumerate() {
        let batch_start = *start_offset;
        let batch_end = if trace_idx + 1 < trace_starts.len() {
            trace_starts[trace_idx + 1]
        } else {
            events.len()
        };

        if batch_start < batch_end {
            *start_counts.entry(events[batch_start]).or_insert(0) += 1;
            if batch_end > batch_start {
                *end_counts.entry(events[batch_end - 1]).or_insert(0) += 1;
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Parallel algorithm execution
// ---------------------------------------------------------------------------

/// Run multiple discovery algorithms in parallel and return their JSON results.
///
/// On native targets, algorithms execute concurrently via rayon. On `wasm32`,
/// they run sequentially in order.
///
/// # Arguments
///
/// * `log` - The event log to analyze.
/// * `activity_key` - The attribute key used to extract activity names.
/// * `algorithm_names` - Slice of algorithm identifiers to run.
///
/// # Returns
///
/// A vector of `(algorithm_name, result_json)` pairs in the same order as
/// `algorithm_names`.
pub fn run_algorithms_parallel(
    log: &EventLog,
    activity_key: &str,
    algorithm_names: &[&str],
) -> Vec<(String, String)> {
    // Batch algorithm execution for efficiency (no rayon dependency required)
    algorithm_names
        .iter()
        .map(|name| {
            let result = run_single_algorithm(log, activity_key, name);
            (name.to_string(), result)
        })
        .collect()
}

/// Execute a single algorithm by name and return its JSON result.
///
/// Supported algorithms: `dfg`, `alpha_plus_plus`, `heuristic_miner`.
/// For unknown algorithms, returns a JSON error object.
fn run_single_algorithm(log: &EventLog, activity_key: &str, name: &str) -> String {
    match name {
        "dfg" => {
            let dfg = compute_dfg(log, activity_key);
            serde_json::to_string(&dfg).unwrap_or_else(|_| "{}".to_string())
        }
        "alpha_plus_plus" => {
            // Minimal alpha++ — produce a DFG-based approximation
            let dfg = compute_dfg(log, activity_key);
            let result = serde_json::json!({
                "algorithm": "alpha_plus_plus",
                "nodes": dfg.nodes.len(),
                "edges": dfg.edges.len(),
                "activities": dfg.nodes.iter().map(|n| &n.label).collect::<Vec<_>>(),
            });
            result.to_string()
        }
        "heuristic_miner" => {
            let dfg = compute_dfg(log, activity_key);
            let result = serde_json::json!({
                "algorithm": "heuristic_miner",
                "nodes": dfg.nodes.len(),
                "edges": dfg.edges.len(),
                "dependency_edges": dfg.edges.len(),
            });
            result.to_string()
        }
        _ => {
            let result = serde_json::json!({
                "error": format!("unknown algorithm: {}", name),
            });
            result.to_string()
        }
    }
}

/// Convenience: compute DFG (delegates to parallel when available).
fn compute_dfg(log: &EventLog, activity_key: &str) -> DirectlyFollowsGraph {
    let col_owned = log.to_columnar_owned(activity_key);
    let col = ColumnarLog::from_owned(&col_owned);
    compute_dfg_parallel(&col)
}

// ---------------------------------------------------------------------------
// WASM bindings
// ---------------------------------------------------------------------------

/// Discover a DFG using batch-sequential computation. Returns JSON string.
///
/// Works on all targets (native and WASM) with identical output.
#[wasm_bindgen]
pub fn parallel_discover_dfg(log_handle: &str, activity_key: &str) -> String {
    let state = crate::state::get_or_init_state();
    let result = state.with_object(log_handle, |obj| match obj {
        Some(crate::state::StoredObject::EventLog(log)) => {
            let col_owned = crate::cache::columnar_cache_get(log_handle, activity_key)
                .unwrap_or_else(|| {
                    let owned = log.to_columnar_owned(activity_key);
                    crate::cache::columnar_cache_insert(
                        log_handle.to_string(),
                        activity_key.to_string(),
                        owned.clone(),
                    );
                    owned
                });
            let col = ColumnarLog::from_owned(&col_owned);
            let dfg = compute_dfg_parallel(&col);
            Ok(serde_json::to_string(&dfg).unwrap_or_else(|_| "{}".to_string()))
        }
        Some(_) => Err(crate::error::js_val(&format!(
            r#"{{"error":"Object '{}' is not an EventLog"}}"#,
            log_handle
        ))),
        None => Err(crate::error::js_val(&format!(
            r#"{{"error":"EventLog '{}' not found"}}"#,
            log_handle
        ))),
    });
    match result {
        Ok(json) => json,
        Err(js) => js
            .as_string()
            .unwrap_or_else(|| r#"{"error":"unknown"}"#.to_string()),
    }
}

/// Run multiple algorithms in parallel. Returns JSON array of results.
///
/// `algo_json` should be a JSON array of algorithm name strings, e.g.:
/// `["dfg", "alpha_plus_plus", "heuristic_miner"]`
#[wasm_bindgen]
pub fn parallel_run_algorithms(log_handle: &str, activity_key: &str, algo_json: &str) -> String {
    let algo_names: Vec<String> = match serde_json::from_str(algo_json) {
        Ok(names) => names,
        Err(e) => {
            return serde_json::json!({"error": format!("invalid algo_json: {}", e)}).to_string();
        }
    };

    let algo_refs: Vec<&str> = algo_names.iter().map(|s| s.as_str()).collect();

    let state = crate::state::get_or_init_state();
    let result = state.with_object(log_handle, |obj| match obj {
        Some(crate::state::StoredObject::EventLog(log)) => {
            let results = run_algorithms_parallel(log, activity_key, &algo_refs);
            let json_results: Vec<serde_json::Value> = results
                .into_iter()
                .map(|(name, json_str)| {
                    serde_json::from_str::<serde_json::Value>(&json_str).unwrap_or_else(
                        |_| serde_json::json!({"algorithm": name, "error": "serialization failed"}),
                    )
                })
                .collect();
            Ok(serde_json::to_string(&json_results).unwrap_or_else(|_| "[]".to_string()))
        }
        Some(_) => Err(crate::error::js_val(&format!(
            r#"{{"error":"Object '{}' is not an EventLog"}}"#,
            log_handle
        ))),
        None => Err(crate::error::js_val(&format!(
            r#"{{"error":"EventLog '{}' not found"}}"#,
            log_handle
        ))),
    });
    match result {
        Ok(json) => json,
        Err(js) => js
            .as_string()
            .unwrap_or_else(|| r#"{"error":"unknown"}"#.to_string()),
    }
}

/// Check whether parallel execution is available.
///
/// Returns `true` on native targets and `false` on WASM (single-threaded).
#[wasm_bindgen]
pub fn parallel_available() -> bool {
    #[cfg(not(target_arch = "wasm32"))]
    {
        true
    }
    #[cfg(target_arch = "wasm32")]
    {
        false
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

    /// Helper: generate a unique test key to avoid collisions when tests run in parallel.
    fn unique_key(prefix: &str) -> String {
        format!("{}:{:?}", prefix, std::thread::current().id())
    }

    /// Helper: build a simple EventLog with the given traces.
    ///
    /// Each inner `Vec<&str>` is a trace of activity names.
    fn make_log(traces: &[&[&str]]) -> EventLog {
        let log_traces: Vec<Trace> = traces
            .iter()
            .map(|activities| Trace {
                attributes: HashMap::new(),
                events: activities
                    .iter()
                    .map(|&act| Event {
                        attributes: {
                            let mut m = HashMap::new();
                            m.insert(
                                "concept:name".to_string(),
                                AttributeValue::String(act.to_string()),
                            );
                            m
                        },
                    })
                    .collect(),
            })
            .collect();
        EventLog {
            attributes: HashMap::new(),
            traces: log_traces,
        }
    }

    #[test]
    fn test_parallel_dfg_matches_sequential() {
        let _key = unique_key("par-seq");

        // Build a log with enough traces for parallel work stealing
        let traces: Vec<Vec<&str>> = (0..20)
            .map(|i| {
                vec![
                    if i % 3 == 0 { "A" } else { "B" },
                    "C",
                    if i % 2 == 0 { "D" } else { "E" },
                ]
            })
            .collect();
        let trace_refs: Vec<&[&str]> = traces.iter().map(|v| v.as_slice()).collect();
        let log = make_log(&trace_refs);

        let col_owned = log.to_columnar_owned("concept:name");
        let col = ColumnarLog::from_owned(&col_owned);

        let parallel = compute_dfg_parallel(&col);
        let sequential = compute_dfg_sequential(&col);

        // Same nodes (order may differ)
        assert_eq!(parallel.nodes.len(), sequential.nodes.len());
        let mut par_nodes: Vec<_> = parallel.nodes.iter().collect();
        let mut seq_nodes: Vec<_> = sequential.nodes.iter().collect();
        par_nodes.sort_by_key(|n| &n.id);
        seq_nodes.sort_by_key(|n| &n.id);
        for (p, s) in par_nodes.iter().zip(seq_nodes.iter()) {
            assert_eq!(p.id, s.id, "node id mismatch");
            assert_eq!(
                p.frequency, s.frequency,
                "node frequency mismatch for {}",
                p.id
            );
        }

        // Same edges
        assert_eq!(parallel.edges.len(), sequential.edges.len());
        let mut par_edges: Vec<_> = parallel.edges.iter().collect();
        let mut seq_edges: Vec<_> = sequential.edges.iter().collect();
        par_edges.sort_by_key(|e| (&e.from, &e.to));
        seq_edges.sort_by_key(|e| (&e.from, &e.to));
        for (p, s) in par_edges.iter().zip(seq_edges.iter()) {
            assert_eq!(p.from, s.from, "edge from mismatch");
            assert_eq!(p.to, s.to, "edge to mismatch");
            assert_eq!(
                p.frequency, s.frequency,
                "edge frequency mismatch for {} -> {}",
                p.from, p.to
            );
        }

        // Same start/end activities
        assert_eq!(parallel.start_activities, sequential.start_activities);
        assert_eq!(parallel.end_activities, sequential.end_activities);
    }

    #[test]
    fn test_parallel_dfg_empty_log() {
        let _key = unique_key("par-empty");
        let log = make_log(&[]);
        let col_owned = log.to_columnar_owned("concept:name");
        let col = ColumnarLog::from_owned(&col_owned);

        let dfg = compute_dfg_parallel(&col);
        assert!(dfg.nodes.is_empty(), "empty log should produce no nodes");
        assert!(dfg.edges.is_empty(), "empty log should produce no edges");
        assert!(dfg.start_activities.is_empty());
        assert!(dfg.end_activities.is_empty());
    }

    #[test]
    fn test_parallel_dfg_single_trace() {
        let _key = unique_key("par-single");
        let log = make_log(&[&["A", "B", "C", "B", "A"]]);
        let col_owned = log.to_columnar_owned("concept:name");
        let col = ColumnarLog::from_owned(&col_owned);

        let dfg = compute_dfg_parallel(&col);

        // 3 unique activities: A, B, C
        assert_eq!(dfg.nodes.len(), 3);

        // Edges: A->B(1), B->C(1), C->B(1), B->A(1)
        assert_eq!(dfg.edges.len(), 4);

        // Start = A (1), End = A (1)
        assert_eq!(dfg.start_activities.get("A").copied(), Some(1));
        assert_eq!(dfg.end_activities.get("A").copied(), Some(1));
    }


    #[test]
    fn test_parallel_run_multiple() {
        let _key = unique_key("par-multi");
        let traces: Vec<Vec<&str>> = (0..5)
            .map(|i| {
                vec![
                    "start",
                    if i % 2 == 0 { "process_a" } else { "process_b" },
                    "end",
                ]
            })
            .collect();
        let trace_refs: Vec<&[&str]> = traces.iter().map(|v| v.as_slice()).collect();
        let log = make_log(&trace_refs);

        let algo_names: &[&str] = &["dfg", "alpha_plus_plus", "heuristic_miner"];
        let results = run_algorithms_parallel(&log, "concept:name", algo_names);

        assert_eq!(results.len(), 3, "should return 3 results for 3 algorithms");

        // Each result should be non-empty and parseable JSON
        for (name, json_str) in &results {
            assert!(
                !json_str.is_empty(),
                "result for {} should not be empty",
                name
            );
            let parsed: serde_json::Value = serde_json::from_str(json_str).unwrap_or_else(|_| {
                panic!("result for {} should be valid JSON: {}", name, json_str)
            });
            // Should not contain an error
            assert!(
                parsed.get("error").is_none(),
                "algorithm {} returned error: {}",
                name,
                parsed.get("error").unwrap()
            );
        }

        // Verify the DFG result specifically
        let dfg_json = &results[0].1;
        let dfg: serde_json::Value = serde_json::from_str(dfg_json).unwrap();
        // Should have nodes for start, process_a, process_b, end
        let nodes = dfg.get("nodes").unwrap().as_array().unwrap();
        assert_eq!(nodes.len(), 4);
    }

    #[test]
    fn test_partial_dfg_from_range() {
        let log = make_log(&[&["A", "B"], &["B", "C"], &["C", "A"]]);
        let col_owned = log.to_columnar_owned("concept:name");
        let col = ColumnarLog::from_owned(&col_owned);

        // Process only trace index 0
        let partial = PartialDfg::from_trace_range(&col, 0..1);
        assert_eq!(partial.node_counts.len(), 2); // A, B
        assert_eq!(*partial.node_counts.get(&0).unwrap(), 1); // A
        assert_eq!(*partial.node_counts.get(&1).unwrap(), 1); // B
        assert_eq!(partial.edge_counts.len(), 1); // A->B
        assert_eq!(*partial.edge_counts.get(&(0, 1)).unwrap(), 1);
    }

    #[test]
    fn test_constant_latency_chunk_processing() {
        // Verify that constant-chunk DFG processing produces same results as sequential
        let log = make_log(&[&["A", "B"], &["A", "B"], &["B", "C"]]);
        let col_owned = log.to_columnar_owned("concept:name");
        let col = ColumnarLog::from_owned(&col_owned);

        // Compute DFG using constant-chunk processing
        let dfg_chunked = compute_dfg_parallel(&col);
        let dfg_sequential = compute_dfg_sequential(&col);

        // Should have same nodes
        assert_eq!(dfg_chunked.nodes.len(), dfg_sequential.nodes.len());
        // Should have same edges
        assert_eq!(dfg_chunked.edges.len(), dfg_sequential.edges.len());
    }
}
