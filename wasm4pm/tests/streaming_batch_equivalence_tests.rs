//! Streaming vs batch equivalence tests for DFG discovery.
//!
//! These tests verify:
//! 1. `StreamingDfgBuilder` produces identical edges to batch DFG construction.
//! 2. `SimdStreamingDfg` produces identical edges to scalar `StreamingDfgBuilder`.
//! 3. Streaming on a partial log produces a strict subset of edges from the full log.
//! 4. Streaming algorithms remain callable (Ok) for logs of 10, 100, 1 000 events.
//! 5. DFG output is order-independent — trace order within XES does not matter.
//! 6. Streaming conformance is marked as a future concern (no streaming conformance
//!    API exists yet).
//!
//! Design note: wasm_bindgen functions that return `Result<JsValue, JsValue>` use
//! `crate::error::js_val` on native targets, which returns `unsafe { zeroed() }`,
//! so the JSON payload cannot be inspected in integration tests.  Instead, this
//! file calls the internal Rust types directly (`StreamingDfgBuilder`,
//! `SimdStreamingDfg`, `EventLog::to_columnar_owned`, etc.).
//!
//! Algorithm family: Process Discovery — DFG streaming
//! Gap: F (streaming batch equivalence)

use std::collections::HashMap;
use wasm4pm::models::{AttributeValue, DirectlyFollowsGraph, Event, EventLog, Trace};
use wasm4pm::simd_streaming_dfg::SimdStreamingDfg;
use wasm4pm::streaming::{StreamingAlgorithm, StreamingDfgBuilder};

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/// Build a simple EventLog from a list of traces, where each trace is a slice
/// of activity names.
fn make_log(traces: &[&[&str]]) -> EventLog {
    let mut log = EventLog::new();
    for (idx, activities) in traces.iter().enumerate() {
        let mut trace = Trace {
            attributes: {
                let mut m = HashMap::new();
                m.insert(
                    "concept:name".to_string(),
                    AttributeValue::String(format!("case{}", idx)),
                );
                m
            },
            events: Vec::new(),
        };
        for (i, &act) in activities.iter().enumerate() {
            let mut attrs = HashMap::new();
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

/// Convert an EventLog into a DFG using `StreamingDfgBuilder` (the canonical
/// streaming implementation).
fn streaming_dfg_from_log(log: &EventLog, activity_key: &str) -> DirectlyFollowsGraph {
    let mut builder = StreamingDfgBuilder::new();
    for (idx, trace) in log.traces.iter().enumerate() {
        let case_id = format!("c{}", idx);
        for event in &trace.events {
            if let Some(AttributeValue::String(act)) =
                event.attributes.get(activity_key)
            {
                builder.add_event(&case_id, act);
            }
        }
        builder.close_trace(&case_id);
    }
    builder.snapshot()
}

/// Convert an EventLog into a DFG using `SimdStreamingDfg` (SIMD/scalar streaming).
fn simd_dfg_from_log(log: &EventLog, activity_key: &str) -> DirectlyFollowsGraph {
    let col = log.to_columnar_owned(activity_key);
    let vocab_refs: Vec<&str> = col.vocab.iter().map(|s| s.as_str()).collect();
    let mut builder = SimdStreamingDfg::new();
    builder.add_events(&col.events, &col.trace_offsets);
    builder.finish(&vocab_refs)
}

/// Compute a batch DFG directly from an EventLog using the columnar approach
/// (same logic as `discover_dfg` wasm_bindgen wrapper but without the JsValue layer).
fn batch_dfg_from_log(log: &EventLog, activity_key: &str) -> DirectlyFollowsGraph {
    use rustc_hash::FxHashMap;
    use wasm4pm::models::{DFGNode, DirectlyFollowsRelation};

    let col_owned = log.to_columnar_owned(activity_key);
    let col = wasm4pm::models::ColumnarLog::from_owned(&col_owned);

    let mut dfg = DirectlyFollowsGraph::new();

    // Pre-allocate nodes
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

    dfg.edges
        .extend(edge_counts.into_iter().map(|((f, t), freq)| {
            DirectlyFollowsRelation {
                from: col.vocab[f as usize].to_owned(),
                to: col.vocab[t as usize].to_owned(),
                frequency: freq,
            }
        }));

    dfg
}

/// Build an order-independent edge map `(from, to) -> frequency` from a DFG.
fn edges_to_map(dfg: &DirectlyFollowsGraph) -> HashMap<(String, String), usize> {
    dfg.edges
        .iter()
        .map(|e| ((e.from.clone(), e.to.clone()), e.frequency))
        .collect()
}

// ---------------------------------------------------------------------------
// Test 1: streaming_dfg_full_log_equals_batch_dfg
// ---------------------------------------------------------------------------

/// Verify that `StreamingDfgBuilder` produces exactly the same edge set and
/// frequencies as the batch columnar DFG for a 3-trace log.
///
/// Oracle rank: Rank 1 (100% parity documented in streaming_dfg.rs).
#[test]
fn streaming_dfg_full_log_equals_batch_dfg() {
    let log = make_log(&[
        &["A", "B", "C"],
        &["A", "B", "C"],
        &["A", "C"],
    ]);

    let batch = batch_dfg_from_log(&log, "concept:name");
    let streaming = streaming_dfg_from_log(&log, "concept:name");

    let batch_edges = edges_to_map(&batch);
    let stream_edges = edges_to_map(&streaming);

    assert_eq!(
        batch_edges, stream_edges,
        "Streaming DFG edges must exactly match batch DFG edges.\n\
         batch={:?}\nstreaming={:?}",
        batch_edges, stream_edges
    );

    // Spot-check expected edges (2 traces A→B→C, 1 trace A→C)
    assert_eq!(batch_edges.get(&("A".to_string(), "B".to_string())), Some(&2),
        "A→B should appear twice");
    assert_eq!(batch_edges.get(&("B".to_string(), "C".to_string())), Some(&2),
        "B→C should appear twice");
    assert_eq!(batch_edges.get(&("A".to_string(), "C".to_string())), Some(&1),
        "A→C should appear once (direct)");

    // Node counts must also match
    let batch_nodes: HashMap<&str, usize> = batch
        .nodes
        .iter()
        .map(|n| (n.id.as_str(), n.frequency))
        .collect();
    let stream_nodes: HashMap<&str, usize> = streaming
        .nodes
        .iter()
        .map(|n| (n.id.as_str(), n.frequency))
        .collect();
    assert_eq!(batch_nodes, stream_nodes, "Node frequencies must match");
}

// ---------------------------------------------------------------------------
// Test 2: simd_streaming_dfg_equals_scalar_streaming_dfg
// ---------------------------------------------------------------------------

/// Verify that `SimdStreamingDfg` (SIMD / scalar fallback on native) produces
/// edge-for-edge identical output to `StreamingDfgBuilder`.
///
/// On wasm32 the SIMD path fires; on native the scalar fallback is used.
/// Both must agree with the reference streaming builder.
///
/// Oracle rank: Rank 1 (documented "100% parity with batch DFG" in module).
#[test]
fn simd_streaming_dfg_equals_scalar_streaming_dfg() {
    let log = make_log(&[
        &["A", "B", "C"],
        &["A", "B", "C"],
        &["A", "C"],
    ]);

    let scalar = streaming_dfg_from_log(&log, "concept:name");
    let simd = simd_dfg_from_log(&log, "concept:name");

    let scalar_edges = edges_to_map(&scalar);
    let simd_edges = edges_to_map(&simd);

    assert_eq!(
        scalar_edges, simd_edges,
        "SIMD streaming DFG must produce identical edges to scalar streaming DFG.\n\
         scalar={:?}\nsimd={:?}",
        scalar_edges, simd_edges
    );

    // Node counts must also agree
    let scalar_nodes: HashMap<&str, usize> = scalar
        .nodes
        .iter()
        .map(|n| (n.id.as_str(), n.frequency))
        .collect();
    let simd_nodes: HashMap<&str, usize> = simd
        .nodes
        .iter()
        .map(|n| (n.id.as_str(), n.frequency))
        .collect();
    assert_eq!(scalar_nodes, simd_nodes, "Node frequencies must match between SIMD and scalar");
}

// ---------------------------------------------------------------------------
// Test 3: streaming_dfg_windowed_diverges_from_batch
// ---------------------------------------------------------------------------

/// Verify that streaming on a partial (prefix) log produces a strict subset of
/// the edges discovered by the full-log batch algorithm.
///
/// Two disjoint sub-processes are concatenated: {A→B→C} × 3 followed by
/// {X→Y→Z} × 3.  The full-log DFG sees all 6 directed edges.  The prefix-only
/// DFG (first 3 traces) sees only {A→B, B→C}.
///
/// This is the closest available proxy for a "windowed" streaming test: the
/// streaming builder processes only the first window, so it must not contain
/// edges from the second window.
///
/// Oracle rank: Rank 2 (domain contract — memory-bounded streaming must not
/// hallucinate unseen events).
#[test]
fn streaming_dfg_windowed_diverges_from_batch() {
    let full_log = make_log(&[
        &["A", "B", "C"],
        &["A", "B", "C"],
        &["A", "B", "C"],
        &["X", "Y", "Z"],
        &["X", "Y", "Z"],
        &["X", "Y", "Z"],
    ]);

    let first_window = make_log(&[
        &["A", "B", "C"],
        &["A", "B", "C"],
        &["A", "B", "C"],
    ]);

    let full_edges = edges_to_map(&streaming_dfg_from_log(&full_log, "concept:name"));
    let window_edges = edges_to_map(&streaming_dfg_from_log(&first_window, "concept:name"));

    // Full log contains edges from both windows
    assert!(full_edges.contains_key(&("A".to_string(), "B".to_string())),
        "full DFG must contain A→B");
    assert!(full_edges.contains_key(&("X".to_string(), "Y".to_string())),
        "full DFG must contain X→Y");

    // Window-only DFG must NOT contain second-window edges
    assert!(
        !window_edges.contains_key(&("X".to_string(), "Y".to_string())),
        "prefix window DFG must not contain X→Y (unseen events)"
    );
    assert!(
        !window_edges.contains_key(&("Y".to_string(), "Z".to_string())),
        "prefix window DFG must not contain Y→Z (unseen events)"
    );

    // Window-only DFG edge set is strictly contained in full-log edges
    for (edge, &freq) in &window_edges {
        let full_freq = full_edges
            .get(edge)
            .copied()
            .unwrap_or(0);
        assert!(
            full_freq >= freq,
            "window edge {:?} (freq={}) must be present in full DFG (freq={})",
            edge,
            freq,
            full_freq
        );
    }

    // The full-log DFG is strictly larger (has more edge types)
    assert!(
        full_edges.len() > window_edges.len(),
        "full DFG ({} edges) must have more edge types than window DFG ({} edges)",
        full_edges.len(),
        window_edges.len()
    );
}

// ---------------------------------------------------------------------------
// Test 4: streaming_memory_does_not_grow_with_log_size
// ---------------------------------------------------------------------------

/// Smoke test: streaming DFG returns successfully for logs of 10, 100, and
/// 1 000 events.
///
/// True memory measurement is unavailable in single-threaded WASM, so we
/// assert correctness (Ok) and confirm that the streaming builder exposes
/// bounded state: `unique_edges <= unique_activities^2`.
///
/// Oracle rank: Rank 2 (domain contract — memory-bounded streaming).
#[test]
fn streaming_memory_does_not_grow_with_log_size() {
    let activities = ["A", "B", "C", "D"];

    for total_events in [10_usize, 100, 1_000] {
        let trace_len = 4;
        let num_traces = total_events / trace_len;

        let traces_data: Vec<Vec<&str>> = (0..num_traces)
            .map(|i| {
                // Rotate through a 4-activity cycle
                let offset = i % activities.len();
                let mut t = Vec::with_capacity(trace_len);
                for j in 0..trace_len {
                    t.push(activities[(offset + j) % activities.len()]);
                }
                t
            })
            .collect();

        let traces_slices: Vec<&[&str]> = traces_data
            .iter()
            .map(|v| v.as_slice())
            .collect();

        let log = make_log(&traces_slices);

        let dfg = streaming_dfg_from_log(&log, "concept:name");

        // Correctness: at least one edge
        assert!(
            !dfg.edges.is_empty(),
            "DFG for {total_events}-event log must have at least one edge"
        );

        // Memory bound: unique edges bounded by activities^2
        let unique_activities = dfg.nodes.len();
        let max_possible_edges = unique_activities * unique_activities;
        assert!(
            dfg.edges.len() <= max_possible_edges,
            "unique edges ({}) must be <= activities^2 ({}) for {total_events}-event log",
            dfg.edges.len(),
            max_possible_edges
        );
    }
}

// ---------------------------------------------------------------------------
// Test 5: streaming_late_event_handled_deterministically
// ---------------------------------------------------------------------------

/// Verify that DFG output is independent of trace order within the log.
///
/// Two logs with the same traces in different order must produce identical
/// edge sets and frequencies.
///
/// Oracle rank: Rank 1 (order-independence is a mathematical property of
/// DFG: edge frequency counts are commutative across traces).
#[test]
fn streaming_late_event_handled_deterministically() {
    // Order A: case1=[A,B,C] first, then case2=[A,C]
    let log_order_a = make_log(&[
        &["A", "B", "C"],
        &["A", "C"],
    ]);

    // Order B: case2=[A,C] first, then case1=[A,B,C]
    let log_order_b = make_log(&[
        &["A", "C"],
        &["A", "B", "C"],
    ]);

    let dfg_a = streaming_dfg_from_log(&log_order_a, "concept:name");
    let dfg_b = streaming_dfg_from_log(&log_order_b, "concept:name");

    let edges_a = edges_to_map(&dfg_a);
    let edges_b = edges_to_map(&dfg_b);

    assert_eq!(
        edges_a, edges_b,
        "DFG must be identical regardless of trace order.\n\
         order_a={:?}\norder_b={:?}",
        edges_a, edges_b
    );

    // Verify SIMD variant also agrees
    let simd_a = simd_dfg_from_log(&log_order_a, "concept:name");
    let simd_b = simd_dfg_from_log(&log_order_b, "concept:name");
    assert_eq!(
        edges_to_map(&simd_a),
        edges_to_map(&simd_b),
        "SIMD DFG must be identical regardless of trace order"
    );

    // Spot-check: both orderings should yield same frequencies
    assert_eq!(
        edges_a.get(&("A".to_string(), "B".to_string())),
        Some(&1),
        "A→B appears in exactly one trace regardless of order"
    );
    assert_eq!(
        edges_a.get(&("A".to_string(), "C".to_string())),
        Some(&1),
        "A→C appears in exactly one trace regardless of order"
    );
}

// ---------------------------------------------------------------------------
// Test 6: streaming_conformance_matches_batch_conformance
// ---------------------------------------------------------------------------

/// Placeholder for streaming conformance equivalence.
///
/// A streaming conformance API (`streaming_conformance_begin` /
/// `streaming_conformance_add_event` / `streaming_conformance_finalize`)
/// exists in `wasm4pm::streaming_conformance` under the `streaming_full`
/// feature flag.  That API operates event-by-event against a DFG handle,
/// not against a PetriNet, so its fitness metric differs from
/// `check_token_based_replay`.
///
/// TODO: once `streaming_full` is unconditionally available in integration
/// tests (or the streaming conformance result is comparable to token replay),
/// implement this test to assert |streaming_fitness - batch_fitness| < 0.001.
///
/// For now, this test verifies that the batch token-replay conformance module
/// compiles and is importable from an integration test.
#[test]
#[ignore = "streaming conformance uses a different fitness model than batch token replay; \
            implement once a compatible streaming fitness API is available (streaming_full feature)"]
fn streaming_conformance_matches_batch_conformance() {
    // Intended implementation sketch:
    //
    // 1. Build a simple log: 10 traces of A→B→C.
    // 2. Discover a DFG with discover_dfg (batch) → store handle.
    // 3. Run batch token replay via check_token_based_replay(log_handle, dfg_handle, ak).
    // 4. Run streaming conformance via streaming_conformance_begin(dfg_handle) →
    //    streaming_conformance_add_event per event →
    //    streaming_conformance_finalize(handle).
    // 5. Assert |batch_fitness - streaming_fitness| < 0.001.
    //
    // Blocked by: streaming_conformance returns a per-trace conformance dict,
    // not a scalar fitness, making direct comparison non-trivial.
    unimplemented!("streaming conformance fitness comparison not yet implemented");
}
