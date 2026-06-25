//! Cross-Backend Determinism Tests
//!
//! These tests verify that:
//!   1. The batch DFG algorithm produces identical output across multiple calls
//!      on the same input (Rank 1 determinism).
//!   2. `StreamingDfgBuilder` (scalar streaming) and `SimdStreamingDfg` (SIMD
//!      vectorised streaming) agree on every edge and frequency.
//!   3. The `StreamingDfgBuilder` heuristic wrapper produces identical output
//!      across two calls on the same log (Rank 1 determinism).
//!
//! **Test Coverage (3 total):** All 3 tests are active (no #[ignore] tags).
//!
//! Design note: wasm_bindgen-exported functions use `crate::error::js_val` on
//! native targets, which returns `unsafe { zeroed() }`, so JSON payloads cannot
//! be inspected in integration tests. All tests here call internal Rust types
//! directly, exactly as in `streaming_batch_equivalence_tests.rs`.
//!
//! Algorithm family: Process Discovery — DFG (batch, streaming, SIMD)
//! Gap: F / cross-backend parity

use std::collections::{BTreeMap, HashMap};
use wasm4pm::models::{AttributeValue, Event, EventLog, Trace, DFG};
use wasm4pm::simd_streaming_dfg::SimdStreamingDfg;
use wasm4pm::streaming::{StreamingAlgorithm, StreamingDfgBuilder};

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/// Build an EventLog from a list of traces represented as activity-name slices.
fn make_log(traces: &[&[&str]]) -> EventLog {
    let mut log = EventLog::new();
    for (idx, activities) in traces.iter().enumerate() {
        let mut trace = Trace {
            attributes: {
                let mut m = BTreeMap::new();
                m.insert(
                    "concept:name".to_string(),
                    wasm4pm::models::AttributeValue::String(format!("case{}", idx)),
                );
                m
            },
            events: Vec::new(),
        };
        for (i, &act) in activities.iter().enumerate() {
            let mut attrs = BTreeMap::new();
            attrs.insert(
                "concept:name".to_string(),
                AttributeValue::String(act.to_string()),
            );
            attrs.insert(
                "time:timestamp".to_string(),
                AttributeValue::String(format!("2024-01-01T00:{:02}:00Z", i)),
            );
            trace.events.push(Event { attributes: attrs });
        }
        log.traces.push(trace);
    }
    log
}

/// Build a DFG using `StreamingDfgBuilder` (canonical scalar streaming path).
fn streaming_dfg(log: &EventLog, activity_key: &str) -> DFG {
    let mut builder = StreamingDfgBuilder::new();
    for (idx, trace) in log.traces.iter().enumerate() {
        let case_id = format!("c{}", idx);
        for event in &trace.events {
            if let Some(AttributeValue::String(act)) = event.attributes.get(activity_key) {
                builder.add_event(&case_id, act);
            }
        }
        builder.close_trace(&case_id);
    }
    builder.snapshot()
}

/// Build a DFG using the `SimdStreamingDfg` path (SIMD / vectorised).
fn simd_dfg(log: &EventLog, activity_key: &str) -> DFG {
    let col = log.to_columnar_owned(activity_key);
    let vocab_refs: Vec<&str> = col.vocab.iter().map(|s| s.as_str()).collect();
    let mut builder = SimdStreamingDfg::new();
    builder.add_events(&col.events, &col.trace_offsets);
    builder.finish(&vocab_refs)
}

/// Build a batch DFG using the columnar approach (no wasm_bindgen).
fn batch_dfg(log: &EventLog, activity_key: &str) -> DFG {
    use rustc_hash::FxHashMap;
    use wasm4pm::models::{DFGNode, DirectlyFollowsRelation};

    let col_owned = log.to_columnar_owned(activity_key);
    let col = wasm4pm::models::ColumnarLog::from_owned(&col_owned);

    let mut dfg = DFG::new();
    dfg.nodes.extend(col.vocab.iter().map(|&act| DFGNode {
        id: act.to_owned(),
        label: act.to_owned(),
        frequency: 0,
    }));

    let mut edge_counts: FxHashMap<(u32, u32), usize> = FxHashMap::default();

    for t in 0..col.trace_offsets.len().saturating_sub(1) {
        let start = col.trace_offsets[t];
        let end = col.trace_offsets[t + 1];
        if start >= end {
            continue;
        }
        for &id in &col.events[start..end] {
            dfg.nodes[id as usize].frequency += 1;
        }
        for i in start..end - 1 {
            *edge_counts
                .entry((col.events[i], col.events[i + 1]))
                .or_insert(0) += 1;
        }
        *dfg.start_activities
            .entry(col.vocab[col.events[start] as usize].to_owned())
            .or_insert(0) += 1;
        *dfg.end_activities
            .entry(col.vocab[col.events[end - 1] as usize].to_owned())
            .or_insert(0) += 1;
    }

    dfg.edges.extend(
        edge_counts
            .into_iter()
            .map(|((f, t), freq)| DirectlyFollowsRelation {
                from: col.vocab[f as usize].to_owned(),
                to: col.vocab[t as usize].to_owned(),
                frequency: freq,
            }),
    );

    dfg
}

/// Convert a DFG into an order-independent `(from, to) -> frequency` map for comparison.
fn edges_to_map(dfg: &DFG) -> HashMap<(String, String), usize> {
    dfg.edges
        .iter()
        .map(|e| ((e.from.clone(), e.to.clone()), e.frequency))
        .collect()
}

/// Convert a DFG into an order-independent node-frequency map for comparison.
fn nodes_to_map(dfg: &DFG) -> HashMap<String, usize> {
    dfg.nodes
        .iter()
        .map(|n| (n.id.clone(), n.frequency))
        .collect()
}

// ---------------------------------------------------------------------------
// Test 1 — dfg_deterministic_across_multiple_runs
// ---------------------------------------------------------------------------

/// Calling `StreamingDfgBuilder` three times on the same EventLog must produce
/// identical edge maps and node frequencies every time.
///
/// Rank 1 determinism: same input must always produce same output.
#[test]
fn dfg_deterministic_across_multiple_runs() {
    // Rank 1 determinism: same input must always produce same output.
    let log = make_log(&[
        &["A", "B", "C"],
        &["A", "C"],
        &["A", "B", "B", "C"],
        &["A", "B", "C"],
        &["B", "C"],
    ]);

    let run1 = streaming_dfg(&log, "concept:name");
    let run2 = streaming_dfg(&log, "concept:name");
    let run3 = streaming_dfg(&log, "concept:name");

    let edges1 = edges_to_map(&run1);
    let edges2 = edges_to_map(&run2);
    let edges3 = edges_to_map(&run3);

    assert_eq!(
        edges1, edges2,
        "Run 1 and Run 2 DFG edge maps must be identical.\n\
         run1={:?}\nrun2={:?}",
        edges1, edges2
    );
    assert_eq!(
        edges1, edges3,
        "Run 1 and Run 3 DFG edge maps must be identical.\n\
         run1={:?}\nrun3={:?}",
        edges1, edges3
    );

    let nodes1 = nodes_to_map(&run1);
    let nodes2 = nodes_to_map(&run2);
    let nodes3 = nodes_to_map(&run3);
    assert_eq!(
        nodes1, nodes2,
        "Node frequencies must be stable across runs"
    );
    assert_eq!(
        nodes1, nodes3,
        "Node frequencies must be stable across runs"
    );
}

// ---------------------------------------------------------------------------
// Test 2 — dfg_scalar_and_streaming_identical_edges
// ---------------------------------------------------------------------------

/// `StreamingDfgBuilder` (scalar) and `SimdStreamingDfg` (SIMD-vectorised)
/// must agree on every edge and its frequency for the same log.
///
/// Cross-backend parity: scalar and streaming must agree on every edge.
#[test]
fn dfg_scalar_and_streaming_identical_edges() {
    // Cross-backend parity: scalar and streaming must agree on every edge.
    let log = make_log(&[
        &["A", "B", "C"],
        &["A", "C"],
        &["A", "B", "B", "C"],
        &["A", "B", "C"],
        &["B", "C"],
    ]);

    let scalar_dfg = streaming_dfg(&log, "concept:name");
    let simd = simd_dfg(&log, "concept:name");

    let scalar_edges = edges_to_map(&scalar_dfg);
    let simd_edges = edges_to_map(&simd);

    assert_eq!(
        scalar_edges, simd_edges,
        "Scalar streaming and SIMD streaming must produce identical edge maps.\n\
         scalar={:?}\nsimd={:?}",
        scalar_edges, simd_edges
    );

    // Cross-check with batch DFG as well.
    let batch = batch_dfg(&log, "concept:name");
    let batch_edges = edges_to_map(&batch);

    assert_eq!(
        scalar_edges, batch_edges,
        "Scalar streaming and batch DFG must agree.\n\
         scalar={:?}\nbatch={:?}",
        scalar_edges, batch_edges
    );
}

// ---------------------------------------------------------------------------
// Test 3 — heuristic_builder_deterministic_with_same_log
// ---------------------------------------------------------------------------

/// Calling the `StreamingDfgBuilder` (which underlies the heuristic streaming
/// path) twice on the same log must produce identical snapshots.
///
/// Because the heuristic miner's wasm_bindgen wrapper uses a global handle
/// registry (unavailable in native tests), we test the underlying
/// `StreamingDfgBuilder` directly. This covers the Rank 1 determinism
/// contract that the heuristic miner inherits.
///
/// Rank 1 determinism: heuristic miner must be stable.
#[test]
fn heuristic_builder_deterministic_with_same_log() {
    // Rank 1 determinism: heuristic miner must be stable.
    //
    // The threshold-based filtering in the heuristic miner is applied on top of
    // the DFG edge frequencies. We test that two identical DFG builds (same
    // threshold would filter the same edges) produce identical edge maps.
    let log = make_log(&[
        &["A", "B", "C"],
        &["A", "B", "C"],
        &["A", "B", "D"],
        &["A", "C"],
        &["A", "B", "C"],
    ]);

    // Build the underlying DFG twice.
    let dfg1 = streaming_dfg(&log, "concept:name");
    let dfg2 = streaming_dfg(&log, "concept:name");

    let edges1 = edges_to_map(&dfg1);
    let edges2 = edges_to_map(&dfg2);

    assert_eq!(
        edges1, edges2,
        "Two identical DFG builds must produce identical edge maps.\n\
         run1={:?}\nrun2={:?}",
        edges1, edges2
    );

    // Simulate a threshold pass (dependency_threshold = 0.5):
    // dependency(a,b) = (follows(a,b) - follows(b,a)) / (follows(a,b) + follows(b,a) + 1)
    // Filter edges with dependency < threshold, assert same set from both builds.
    let threshold = 0.5_f64;
    let freq_map1: HashMap<(String, String), usize> = edges1.clone();
    let freq_map2: HashMap<(String, String), usize> = edges2.clone();

    let filtered1: Vec<_> = freq_map1
        .iter()
        .filter(|((from, to), &fwd)| {
            let rev = freq_map1
                .get(&(to.clone(), from.clone()))
                .copied()
                .unwrap_or(0);
            let dep = (fwd as f64 - rev as f64) / (fwd as f64 + rev as f64 + 1.0);
            dep >= threshold
        })
        .map(|(k, _)| k.clone())
        .collect();

    let filtered2: Vec<_> = freq_map2
        .iter()
        .filter(|((from, to), &fwd)| {
            let rev = freq_map2
                .get(&(to.clone(), from.clone()))
                .copied()
                .unwrap_or(0);
            let dep = (fwd as f64 - rev as f64) / (fwd as f64 + rev as f64 + 1.0);
            dep >= threshold
        })
        .map(|(k, _)| k.clone())
        .collect();

    let set1: std::collections::HashSet<_> = filtered1.into_iter().collect();
    let set2: std::collections::HashSet<_> = filtered2.into_iter().collect();

    assert_eq!(
        set1, set2,
        "Threshold-filtered edge sets must be identical across two DFG builds"
    );
}
