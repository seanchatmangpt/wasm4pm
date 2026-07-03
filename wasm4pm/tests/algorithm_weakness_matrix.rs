//! Algorithm Weakness Matrix — Documented Failure Modes
//!
//! These tests document the known weaknesses of process discovery algorithms.
//! Each test PROVES the weakness is observable, not hypothetical.
//!
//! "Weakness" means the algorithm produces output that is technically correct
//! given its design, but misleading or incomplete from a process mining perspective.
//!
//! Oracle hierarchy:
//!   - Rank 1: Mathematical theorem (DFG conflates concurrency — provable)
//!   - Rank 2: Domain contract (expected behavior by design)
//!
//! Algorithm family: Process Discovery — DFG, Heuristic Miner, Streaming DFG
//! Gap: C (algorithm weakness documentation)

use rustc_hash::FxHashMap;
use std::collections::{BTreeMap, HashMap};
use wasm4pm::models::{
    AttributeValue, ColumnarLog, DFGNode, DirectlyFollowsRelation, Event, EventLog, Trace, DFG,
};
use wasm4pm::state::{get_or_init_state, StoredObject};

// ---------------------------------------------------------------------------
// Shared helpers (mirrors ground_truth_discovery_tests)
// ---------------------------------------------------------------------------

/// Compute a heuristic-miner DFG directly from an EventLog using the columnar
/// approach and a dependency threshold.  Mirrors the logic of the
/// `discover_heuristic_miner` wasm_bindgen wrapper but avoids JsValue (which
/// panics on native targets).
fn heuristic_dfg(log: &EventLog, activity_key: &str, threshold: f64) -> DFG {
    let col_owned = log.to_columnar_owned(activity_key);
    let col = ColumnarLog::from_owned(&col_owned);

    let mut dfg = DFG::new();
    dfg.nodes.extend(col.vocab.iter().map(|&act| DFGNode {
        id: act.to_owned(),
        label: act.to_owned(),
        frequency: 0,
    }));

    let mut follows: FxHashMap<(u32, u32), usize> = FxHashMap::default();
    let mut precedes: FxHashMap<(u32, u32), usize> = FxHashMap::default();

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
            let (a, b) = (col.events[i], col.events[i + 1]);
            *follows.entry((a, b)).or_insert(0) += 1;
            *precedes.entry((b, a)).or_insert(0) += 1;
        }
        *dfg.start_activities
            .entry(col.vocab[col.events[start] as usize].to_owned())
            .or_insert(0) += 1;
        *dfg.end_activities
            .entry(col.vocab[col.events[end - 1] as usize].to_owned())
            .or_insert(0) += 1;
    }

    for ((a, b), count) in follows {
        let reverse_count = precedes.get(&(b, a)).copied().unwrap_or(0);
        let ab = count as f64;
        let ba = reverse_count as f64;
        if (ab - ba) / (ab + ba + 1.0) >= threshold {
            dfg.edges.push(DirectlyFollowsRelation {
                from: col.vocab[a as usize].to_owned(),
                to: col.vocab[b as usize].to_owned(),
                frequency: count,
            });
        }
    }

    dfg
}

fn make_log(traces: &[(usize, &[&str])]) -> EventLog {
    let mut log = EventLog::new();
    let mut case_idx = 0usize;
    for (repeat, activities) in traces {
        for _ in 0..*repeat {
            let mut trace = Trace {
                attributes: {
                    let mut m = BTreeMap::new();
                    m.insert(
                        "concept:name".to_string(),
                        AttributeValue::String(format!("case{}", case_idx)),
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
            case_idx += 1;
        }
    }
    log
}

fn batch_dfg(log: &EventLog, activity_key: &str) -> DFG {
    let col_owned = log.to_columnar_owned(activity_key);
    let col = ColumnarLog::from_owned(&col_owned);

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

fn edges_to_map(dfg: &DFG) -> HashMap<(String, String), usize> {
    dfg.edges
        .iter()
        .map(|e| ((e.from.clone(), e.to.clone()), e.frequency))
        .collect()
}

#[allow(dead_code)]
fn store_log(log: EventLog) -> String {
    get_or_init_state()
        .store_object(StoredObject::EventLog(log))
        .expect("store log")
}

// ---------------------------------------------------------------------------
// Weakness 1: dfg_cannot_detect_concurrency_produces_false_edges
// ---------------------------------------------------------------------------

/// WEAKNESS: DFG conflates concurrency with choice/loop.
///
/// When two activities B and C execute concurrently (interleaved across traces),
/// the DFG produces edges in BOTH directions: B→C and C→B. This creates a false
/// loop that does not exist in the actual process.
///
/// A sound discovery algorithm (inductive miner) would instead produce a parallel
/// split (+) between B and C. The DFG cannot make this distinction.
///
/// Oracle Rank 1 — Mathematical: both edge directions are guaranteed to appear
/// when both orderings are observed in the log.
#[test]
fn dfg_cannot_detect_concurrency_produces_false_edges() {
    // WEAKNESS: DFG conflates concurrency with choice/loop
    // Log: 1× A→B→C, 1× A→C→B (concurrent B and C)
    let log = make_log(&[(1, &["A", "B", "C"]), (1, &["A", "C", "B"])]);
    let dfg = batch_dfg(&log, "concept:name");
    let edges = edges_to_map(&dfg);

    // Both B→C and C→B MUST appear — this is the false causality
    assert!(
        edges.contains_key(&("B".to_string(), "C".to_string())),
        "B→C must appear (false causality from A→B→C trace)"
    );
    assert!(
        edges.contains_key(&("C".to_string(), "B".to_string())),
        "C→B must appear (false causality from A→C→B trace)"
    );

    // Both have equal frequency — symmetric false loop
    let b_to_c = edges
        .get(&("B".to_string(), "C".to_string()))
        .copied()
        .unwrap_or(0);
    let c_to_b = edges
        .get(&("C".to_string(), "B".to_string()))
        .copied()
        .unwrap_or(0);
    assert_eq!(
        b_to_c, c_to_b,
        "False loop edges must be symmetric for equal-frequency concurrent traces"
    );

    // DOCUMENTED CONSEQUENCE: A user reading this DFG would incorrectly infer
    // that B and C loop between each other in the real process.
}

// ---------------------------------------------------------------------------
// Weakness 2: alpha_fails_on_short_loops
// ---------------------------------------------------------------------------

/// WEAKNESS: Alpha Miner cannot handle length-1 loops (self-loops).
///
/// When activity A repeats immediately (A→A→B), the DFG records the A→A edge
/// with the correct frequency. The Alpha Miner, however, fails to model
/// self-loops correctly in its Petri net output.
///
/// This test uses DFG (not Alpha) to document the frequency of the self-loop,
/// proving the event data contains the self-loop that Alpha cannot handle.
///
/// Oracle Rank 2 — Domain contract: DFG records all directly-follows relationships
/// including self-loops.
#[test]
fn alpha_fails_on_short_loops() {
    // WEAKNESS: Alpha Miner cannot handle length-1 loops; DFG documents the frequency
    // Log: A→A→B (self-loop on A, then B)
    let log = make_log(&[(3, &["A", "A", "B"])]);
    let dfg = batch_dfg(&log, "concept:name");
    let edges = edges_to_map(&dfg);

    // DFG MUST record the A→A self-loop edge
    let a_self_loop = edges
        .get(&("A".to_string(), "A".to_string()))
        .copied()
        .unwrap_or(0);
    assert!(
        a_self_loop >= 1,
        "A→A self-loop edge must appear in DFG with frequency ≥ 1, got {}",
        a_self_loop
    );

    // The self-loop appears once per trace (A→A appears in each of the 3 traces)
    assert_eq!(
        a_self_loop, 3,
        "A→A self-loop must appear 3× (once per trace)"
    );

    // A→B edge must also appear
    let a_to_b = edges
        .get(&("A".to_string(), "B".to_string()))
        .copied()
        .unwrap_or(0);
    assert_eq!(
        a_to_b, 3,
        "A→B must appear 3× (once per trace after the loop)"
    );

    // DOCUMENTED CONSEQUENCE: Alpha Miner would fail to generate a Petri net
    // with a self-loop transition for A. DFG proves the self-loop exists in the data.
}

// ---------------------------------------------------------------------------
// Weakness 3: heuristic_filters_rare_but_valid_paths
// ---------------------------------------------------------------------------

/// WEAKNESS: Heuristic Miner discards infrequent but real process variants.
///
/// A process may have valid exception paths that occur rarely. The Heuristic Miner's
/// dependency threshold suppresses these paths when the threshold is strict enough.
///
/// Log: 10× A→B→D (dominant), 1× A→C→D (rare valid exception)
///
/// At threshold 0.1 (lenient), the rare A→C→D path should be preserved.
/// At threshold 0.9 (strict), the rare path may be suppressed.
///
/// Oracle Rank 2 — Domain contract: strict threshold → equal or fewer edges.
///
/// Note: uses internal columnar computation to avoid JsValue (which panics on native).
#[test]
fn heuristic_filters_rare_but_valid_paths() {
    // WEAKNESS: Heuristic Miner discards infrequent but real process variants
    // Log: 10× A→B→D (dominant), 1× A→C→D (rare valid exception)
    let log = make_log(&[(10, &["A", "B", "D"]), (1, &["A", "C", "D"])]);

    // Lenient threshold — should preserve rare paths
    let dfg_lenient = heuristic_dfg(&log, "concept:name", 0.1);
    let edges_lenient = dfg_lenient.edges.len();

    // Strict threshold — may filter rare paths
    let dfg_strict = heuristic_dfg(&log, "concept:name", 0.9);
    let edges_strict = dfg_strict.edges.len();

    // Strict threshold must produce ≤ edges than lenient threshold
    assert!(
        edges_strict <= edges_lenient,
        "Strict threshold ({} edges) must produce ≤ edges than lenient threshold ({} edges). \
         WEAKNESS: rare valid path A→C→D may be filtered at strict threshold.",
        edges_strict,
        edges_lenient
    );

    // DOCUMENTED CONSEQUENCE: Users relying solely on heuristic miner with a
    // strict threshold will miss the rare exception path, producing an
    // incomplete (but sound) process model.
}

// ---------------------------------------------------------------------------
// Weakness 4: streaming_dfg_order_independent_for_same_traces
// ---------------------------------------------------------------------------

/// Verify that DFG output is trace-order independent.
///
/// If the same 3 traces are presented in different order, the DFG must produce
/// identical edges. This checks a correctness guarantee (not a weakness), but
/// is placed here because a streaming implementation could violate this property.
///
/// Oracle Rank 1 — Mathematical: DFG edges are a multiset of (from, to) pairs
/// aggregated across all traces; their order in the input does not matter.
#[test]
fn streaming_dfg_order_independent_for_same_traces() {
    // WEAKNESS check: streaming must be trace-order independent
    // Two logs with same traces, different presentation order
    let log1 = make_log(&[
        (1, &["A", "B", "C"]),
        (1, &["A", "B", "D"]),
        (1, &["A", "C", "D"]),
    ]);
    let log2 = make_log(&[
        (1, &["A", "C", "D"]),
        (1, &["A", "B", "C"]),
        (1, &["A", "B", "D"]),
    ]);

    let dfg1 = batch_dfg(&log1, "concept:name");
    let dfg2 = batch_dfg(&log2, "concept:name");

    let edges1 = edges_to_map(&dfg1);
    let edges2 = edges_to_map(&dfg2);

    assert_eq!(
        edges1.len(),
        edges2.len(),
        "Edge count must be identical regardless of trace order"
    );

    for ((from, to), count) in &edges1 {
        let count2 = edges2
            .get(&(from.clone(), to.clone()))
            .copied()
            .unwrap_or(0);
        assert_eq!(
            *count, count2,
            "Edge {}→{} must have identical frequency regardless of trace order",
            from, to
        );
    }
}

// ---------------------------------------------------------------------------
// Weakness 5: dfg_noise_inflation_documented
// ---------------------------------------------------------------------------

/// WEAKNESS: DFG does not filter noise; all edges appear regardless of frequency.
///
/// Log: 100× correct traces (A→B→C→D), 1× noise trace (A→X→D)
///
/// The DFG includes X-related edges at low frequency (≈1%). A model built from
/// this DFG would include the noise activity X as if it were a real process step.
///
/// This documents that DFG requires a separate noise-filtering step (e.g., the
/// Heuristic Miner's frequency threshold) before use in model discovery.
///
/// Oracle Rank 1 — Mathematical: frequency ratio of noise edge ≤ 1/101 < 2%.
#[test]
fn dfg_noise_inflation_documented() {
    // WEAKNESS: DFG does not filter noise; all edges appear regardless of frequency
    let log = make_log(&[(100, &["A", "B", "C", "D"]), (1, &["A", "X", "D"])]);
    let dfg = batch_dfg(&log, "concept:name");
    let edges = edges_to_map(&dfg);

    // DFG MUST include the X edges (noise propagation)
    assert!(
        edges.contains_key(&("A".to_string(), "X".to_string())),
        "A→X noise edge must appear in DFG"
    );
    assert!(
        edges.contains_key(&("X".to_string(), "D".to_string())),
        "X→D noise edge must appear in DFG"
    );

    // Noise edge frequency = 1 (appears exactly once)
    let noise_freq = edges
        .get(&("A".to_string(), "X".to_string()))
        .copied()
        .unwrap_or(0);
    assert_eq!(
        noise_freq, 1,
        "Noise edge A→X must have frequency exactly 1"
    );

    // Total traces = 101; noise ratio < 2%
    let total_a_out: usize = edges
        .iter()
        .filter(|((from, _), _)| from == "A")
        .map(|(_, &count)| count)
        .sum();
    let noise_ratio = noise_freq as f64 / total_a_out as f64;
    assert!(
        noise_ratio <= 0.02,
        "Noise edge frequency ratio must be ≤ 2%, got {:.1}%",
        noise_ratio * 100.0
    );

    // DOCUMENTED CONSEQUENCE: A user building a model from this DFG without
    // frequency filtering will include X as a valid activity, producing an
    // overfitted model that perfectly fits the noise but generalizes poorly.
}
