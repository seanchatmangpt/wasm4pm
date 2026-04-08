//! Rayon-based parallel algorithm execution for multi-core CPUs.
//!
//! This module provides parallel computation of process mining algorithms,
//! most notably the Directly-Follows Graph (DFG). On native targets
//! (`x86_64` / `arm64`), work is distributed across threads via [rayon].
//! On `wasm32` targets, graceful sequential fallbacks are used since rayon
//! does not support the WebAssembly threading model.
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
    fn from_trace_range(col: &ColumnarLog, trace_range: std::ops::Range<usize>) -> Self {
        let mut partial = PartialDfg::new();

        for t in trace_range {
            if t >= col.trace_offsets.len().saturating_sub(1) {
                break;
            }
            let start = col.trace_offsets[t];
            let end = col.trace_offsets[t + 1];
            if start >= end {
                continue;
            }

            // Node frequencies
            for &id in &col.events[start..end] {
                *partial.node_counts.entry(id).or_insert(0) += 1;
            }
            // Directly-follows edges
            for i in start..end - 1 {
                *partial
                    .edge_counts
                    .entry((col.events[i], col.events[i + 1]))
                    .or_insert(0) += 1;
            }
            // Start / end activities
            *partial
                .start_counts
                .entry(col.events[start])
                .or_insert(0) += 1;
            *partial
                .end_counts
                .entry(col.events[end - 1])
                .or_insert(0) += 1;
        }

        partial
    }
}

/// Merge a `PartialDfg` into the target accumulators.
fn merge_partial(
    node_counts: &mut FxHashMap<u32, usize>,
    edge_counts: &mut FxHashMap<(u32, u32), usize>,
    start_counts: &mut FxHashMap<u32, usize>,
    end_counts: &mut FxHashMap<u32, usize>,
    partial: PartialDfg,
) {
    for (id, cnt) in partial.node_counts {
        *node_counts.entry(id).or_insert(0) += cnt;
    }
    for (edge, cnt) in partial.edge_counts {
        *edge_counts.entry(edge).or_insert(0) += cnt;
    }
    for (id, cnt) in partial.start_counts {
        *start_counts.entry(id).or_insert(0) += cnt;
    }
    for (id, cnt) in partial.end_counts {
        *end_counts.entry(id).or_insert(0) += cnt;
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

/// Compute a DFG in parallel by distributing trace chunks across rayon threads.
///
/// Each thread processes a contiguous range of traces and produces a
/// `PartialDfg`.  Partial results are merged into the final graph.
///
/// # Availability
///
/// Only available on native targets (`x86_64`, `arm64`). On `wasm32` a
/// sequential fallback with identical output is used.
#[cfg(not(target_arch = "wasm32"))]
pub fn compute_dfg_parallel(col: &ColumnarLog) -> DirectlyFollowsGraph {
    use rayon::prelude::*;

    let num_traces = col.trace_offsets.len().saturating_sub(1);
    if num_traces == 0 {
        return DirectlyFollowsGraph::new();
    }

    // Dynamic batching: process multiple traces per task to reduce spawn overhead.
    // BATCH_SIZE = 4 balances parallelism with task scheduling cost.
    const BATCH_SIZE: usize = 4;

    // Convert chunks to Vec for parallel iteration
    let trace_chunks: Vec<_> = (0..num_traces)
        .collect::<Vec<_>>()
        .chunks(BATCH_SIZE)
        .collect();

    let partials: Vec<PartialDfg> = trace_chunks
        .into_par_iter()
        .map(|chunk| {
            // Process all traces in this batch sequentially within the task
            let mut merged = PartialDfg::new();
            for &t in chunk {
                if t >= num_traces { break; }
                let partial = PartialDfg::from_trace_range(col, t..t + 1);
                // Merge into batch result
                for (id, cnt) in partial.node_counts {
                    *merged.node_counts.entry(id).or_insert(0) += cnt;
                }
                for (edge, cnt) in partial.edge_counts {
                    *merged.edge_counts.entry(edge).or_insert(0) += cnt;
                }
                for (id, cnt) in partial.start_counts {
                    *merged.start_counts.entry(id).or_insert(0) += cnt;
                }
                for (id, cnt) in partial.end_counts {
                    *merged.end_counts.entry(id).or_insert(0) += cnt;
                }
            }
            merged
        })
        .collect();

    // Merge all partial results
    let mut node_counts: FxHashMap<u32, usize> = FxHashMap::default();
    let mut edge_counts: FxHashMap<(u32, u32), usize> = FxHashMap::default();
    let mut start_counts: FxHashMap<u32, usize> = FxHashMap::default();
    let mut end_counts: FxHashMap<u32, usize> = FxHashMap::default();

    for partial in partials {
        merge_partial(
            &mut node_counts,
            &mut edge_counts,
            &mut start_counts,
            &mut end_counts,
            partial,
        );
    }

    build_dfg_from_counts(col, node_counts, edge_counts, start_counts, end_counts)
}

/// Compute a DFG in parallel (WASM fallback: sequential).
///
/// On `wasm32` targets, this delegates to [`compute_dfg_sequential`] which
/// produces identical output.
#[cfg(target_arch = "wasm32")]
pub fn compute_dfg_parallel(col: &ColumnarLog) -> DirectlyFollowsGraph {
    compute_dfg_sequential(col)
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
    #[cfg(not(target_arch = "wasm32"))]
    {
        use rayon::prelude::*;

        // Batch algorithm execution to reduce task spawn overhead.
        // For 14 algorithms, batching by 4 reduces spawns from 14 to 4.
        const BATCH_SIZE: usize = 4;

        // Convert chunks to Vec for parallel iteration
        let chunks: Vec<_> = algorithm_names.chunks(BATCH_SIZE).collect();

        chunks.into_par_iter()
            .flat_map(|chunk| {
                // Process algorithms in this chunk sequentially within the task
                chunk.iter()
                    .map(|name| {
                        let result = run_single_algorithm(log, activity_key, name);
                        (name.to_string(), result)
                    })
                    .collect::<Vec<_>>()
            })
            .collect()
    }

    #[cfg(target_arch = "wasm32")]
    {
        algorithm_names
            .iter()
            .map(|name| {
                let result = run_single_algorithm(log, activity_key, name);
                (name.to_string(), result)
            })
            .collect()
    }
}

/// Execute a single algorithm by name and return its JSON result.
///
/// Supported algorithms: `dfg`, `alpha_plus_plus`, `heuristic_miner`.
/// For unknown algorithms, returns a JSON error object.
fn run_single_algorithm(log: &EventLog, activity_key: &str, name: &str) -> String {
    match name {
        "dfg" => {
            let dfg = compute_dfg(&log, activity_key);
            serde_json::to_string(&dfg).unwrap_or_else(|_| "{}".to_string())
        }
        "alpha_plus_plus" => {
            // Minimal alpha++ — produce a DFG-based approximation
            let dfg = compute_dfg(&log, activity_key);
            let result = serde_json::json!({
                "algorithm": "alpha_plus_plus",
                "nodes": dfg.nodes.len(),
                "edges": dfg.edges.len(),
                "activities": dfg.nodes.iter().map(|n| &n.label).collect::<Vec<_>>(),
            });
            result.to_string()
        }
        "heuristic_miner" => {
            let dfg = compute_dfg(&log, activity_key);
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

/// Discover a DFG using parallel computation. Returns JSON string.
///
/// On native builds this uses rayon for multi-threaded execution.
/// On WASM builds this falls back to sequential computation.
#[wasm_bindgen]
pub fn parallel_discover_dfg(log_handle: &str, activity_key: &str) -> String {
    let state = crate::state::get_or_init_state();
    let result = state.with_object(log_handle, |obj| {
        match obj {
            Some(crate::state::StoredObject::EventLog(log)) => {
                let col_owned =
                    crate::cache::columnar_cache_get(log_handle, activity_key)
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
            Some(_) => Err(JsValue::from_str(&format!(
                r#"{{"error":"Object '{}' is not an EventLog"}}"#,
                log_handle
            ))),
            None => Err(JsValue::from_str(&format!(
                r#"{{"error":"EventLog '{}' not found"}}"#,
                log_handle
            ))),
        }
    });
    match result {
        Ok(json) => json,
        Err(js) => js.as_string().unwrap_or_else(|| r#"{"error":"unknown"}"#.to_string()),
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
                    serde_json::from_str::<serde_json::Value>(&json_str)
                        .unwrap_or_else(|_| serde_json::json!({"algorithm": name, "error": "serialization failed"}))
                })
                .collect();
            Ok(serde_json::to_string(&json_results).unwrap_or_else(|_| "[]".to_string()))
        }
        Some(_) => Err(JsValue::from_str(&format!(
            r#"{{"error":"Object '{}' is not an EventLog"}}"#,
            log_handle
        ))),
        None => Err(JsValue::from_str(&format!(
            r#"{{"error":"EventLog '{}' not found"}}"#,
            log_handle
        ))),
    });
    match result {
        Ok(json) => json,
        Err(js) => js.as_string().unwrap_or_else(|| r#"{"error":"unknown"}"#.to_string()),
    }
}

/// Check whether parallel execution is available.
///
/// Returns `true` on native targets (rayon available) and `false` on WASM.
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
            assert_eq!(p.frequency, s.frequency, "node frequency mismatch for {}", p.id);
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
            assert_eq!(p.frequency, s.frequency, "edge frequency mismatch for {} -> {}", p.from, p.to);
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
    fn test_parallel_available() {
        let _key = unique_key("par-avail");

        #[cfg(not(target_arch = "wasm32"))]
        {
            assert!(parallel_available(), "parallel should be available on native");
        }
        #[cfg(target_arch = "wasm32")]
        {
            assert!(!parallel_available(), "parallel should not be available on WASM");
        }
    }

    #[test]
    fn test_parallel_run_multiple() {
        let _key = unique_key("par-multi");
        let traces: Vec<Vec<&str>> = (0..5)
            .map(|i| {
                vec!["start", if i % 2 == 0 { "process_a" } else { "process_b" }, "end"]
            })
            .collect();
        let trace_refs: Vec<&[&str]> = traces.iter().map(|v| v.as_slice()).collect();
        let log = make_log(&trace_refs);

        let algo_names: &[&str] = &["dfg", "alpha_plus_plus", "heuristic_miner"];
        let results = run_algorithms_parallel(&log, "concept:name", algo_names);

        assert_eq!(results.len(), 3, "should return 3 results for 3 algorithms");

        // Each result should be non-empty and parseable JSON
        for (name, json_str) in &results {
            assert!(!json_str.is_empty(), "result for {} should not be empty", name);
            let parsed: serde_json::Value = serde_json::from_str(json_str)
                .unwrap_or_else(|_| panic!("result for {} should be valid JSON: {}", name, json_str));
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
    fn test_merge_preserves_counts() {
        let log = make_log(&[&["A", "B"], &["A", "B"], &["B", "C"]]);
        let col_owned = log.to_columnar_owned("concept:name");
        let col = ColumnarLog::from_owned(&col_owned);

        // Two partial DFGs covering different traces
        let p1 = PartialDfg::from_trace_range(&col, 0..2); // traces 0 and 1
        let p2 = PartialDfg::from_trace_range(&col, 2..3); // trace 2

        // Merge
        let mut node_counts: FxHashMap<u32, usize> = FxHashMap::default();
        let mut edge_counts: FxHashMap<(u32, u32), usize> = FxHashMap::default();
        let mut start_counts: FxHashMap<u32, usize> = FxHashMap::default();
        let mut end_counts: FxHashMap<u32, usize> = FxHashMap::default();

        merge_partial(&mut node_counts, &mut edge_counts, &mut start_counts, &mut end_counts, p1);
        merge_partial(&mut node_counts, &mut edge_counts, &mut start_counts, &mut end_counts, p2);

        // A appears in traces 0, 1 → 2 times, trace 2 doesn't have A as event
        assert_eq!(*node_counts.get(&0).unwrap(), 2); // A in traces 0, 1
        assert_eq!(*node_counts.get(&1).unwrap(), 3); // B in traces 0, 1, 2
        assert_eq!(*node_counts.get(&2).unwrap(), 1); // C in trace 2

        // A->B: 2 times (traces 0, 1)
        assert_eq!(*edge_counts.get(&(0, 1)).unwrap(), 2);
        // B->C: 1 time (trace 2)
        assert_eq!(*edge_counts.get(&(1, 2)).unwrap(), 1);
    }
}
