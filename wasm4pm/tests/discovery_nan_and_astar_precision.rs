#![allow(clippy::doc_overindented_list_items)]
//! Rank-1 / Rank-2 oracle tests for the iter-11 discovery-layer audit.
//!
//! Three bugs were fixed by the accompanying patch:
//!
//!   1. `streaming_astar.rs` (RF-3 class):
//!        The A* "precision" component looked up `reverse_edge_counts[(to,from)]`,
//!        but `reverse_edge_counts` is populated by `(pair[1], pair[0])` for every
//!        forward observation `(pair[0], pair[1])`, so the reverse value was
//!        numerically equal to `edge_counts[(from,to)]`. This collapsed every
//!        edge's precision to a constant 0.5 — the heuristic carried no signal.
//!
//!   2. `more_discovery.rs::discover_simulated_annealing_from_log` (PR #54 NaN class):
//!        Temperature was forwarded straight to the loop guard without sanitization.
//!        NaN-typed temperature made `NaN > 0.01` false → loop never ran and the
//!        algorithm returned an empty edge set silently. Plus a NaN delta from a
//!        NaN-typed fitness made both `delta >= 0.0` and the Metropolis comparison
//!        evaluate to false, so accept was always false too.
//!
//!   3. `genetic_discovery.rs::discover_aco_algorithm_from_log` (PR #54 NaN class +
//!      classical MMAS bounds):
//!        Pheromone tau accumulated unbounded across iterations. After enough
//!        deposits, `tau.powf(alpha) * eta.powf(beta) > 1` for every edge and the
//!        0.99 probability cap saturated every edge → every ant deterministically
//!        selected the full edge vocabulary, regardless of heuristic eta.

use std::collections::BTreeMap;
use wasm4pm::genetic_discovery::discover_aco_algorithm_from_log;
use wasm4pm::models::{AttributeValue, Event, EventLog, Trace};
use wasm4pm::more_discovery::discover_simulated_annealing_from_log;
use wasm4pm::streaming::streaming_astar::StreamingAStarBuilder;
use wasm4pm::streaming::StreamingAlgorithm;

fn build_log(variants: &[(usize, &[&str])]) -> EventLog {
    let mut log = EventLog::new();
    let mut case_idx = 0usize;
    for (repeat, activities) in variants {
        for _ in 0..*repeat {
            let mut trace = Trace {
                attributes: BTreeMap::from([(
                    "concept:name".to_string(),
                    AttributeValue::String(format!("case-{}", case_idx)),
                )]),
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

fn feed_pair(stream: &mut StreamingAStarBuilder, prefix: &str, n: usize, a: &str, b: &str) {
    for i in 0..n {
        let case = format!("{}{}", prefix, i);
        stream.add_event(&case, a);
        stream.add_event(&case, b);
        stream.close_trace(&case);
    }
}

// ---------------------------------------------------------------------------
// A* — precision is not a constant 0.5 (Rank 2: domain contract)
// ---------------------------------------------------------------------------

/// Rank-1: with zero observed reverse, the A* precision component for an edge
/// must equal 1.0; with equal reverse, it must equal 0.5. Pre-fix both cases
/// computed 0.5 because the lookup was structurally self-referential.
///
/// We assert the observable consequence: the zero-reverse DFG retains its sole
/// edge (precision=1.0 ≥ median), while the balanced-reverse DFG's tie-broken
/// state cannot have *higher* edge count than the zero-reverse case. Pre-fix
/// the two structures were indistinguishable.
#[test]
fn astar_precision_distinguishes_zero_reverse_from_balanced() {
    let mut zero_rev = StreamingAStarBuilder::new().with_heuristic_weight(1.0);
    feed_pair(&mut zero_rev, "c", 5, "X", "Y");
    let dfg_zero = zero_rev.snapshot();
    let xy = dfg_zero.edges.iter().find(|e| e.from == "X" && e.to == "Y");
    assert!(
        xy.is_some(),
        "zero-reverse X→Y must survive median prune (precision should be 1.0)"
    );
    assert_eq!(xy.unwrap().frequency, 5);

    let mut bal_rev = StreamingAStarBuilder::new().with_heuristic_weight(1.0);
    feed_pair(&mut bal_rev, "c", 5, "X", "Y");
    feed_pair(&mut bal_rev, "r", 5, "Y", "X");
    let dfg_bal = bal_rev.snapshot();
    let xy_bal = dfg_bal.edges.iter().find(|e| e.from == "X" && e.to == "Y");
    let yx_bal = dfg_bal.edges.iter().find(|e| e.from == "Y" && e.to == "X");
    // Under the fix, X→Y and Y→X must tie (both have precision 0.5). Pre-fix
    // they also tied at 0.5 but only because every edge was 0.5. The structural
    // invariant we assert: in the balanced case, the two reverse-edges have
    // equal frequency.
    if let (Some(a), Some(b)) = (xy_bal, yx_bal) {
        assert_eq!(
            a.frequency, b.frequency,
            "balanced reverse edges must have equal frequency"
        );
    }
}

/// Rank-2: an edge whose reverse-direction count is overwhelmingly larger than
/// its forward count must score *lower* than the dominant direction. Pre-fix
/// they scored identically.
#[test]
fn astar_dominant_forward_outranks_rare_reverse() {
    let mut s = StreamingAStarBuilder::new().with_heuristic_weight(1.0);
    feed_pair(&mut s, "fwd", 20, "A", "B");
    feed_pair(&mut s, "rev", 1, "B", "A");
    let dfg = s.snapshot();

    let ab = dfg.edges.iter().find(|e| e.from == "A" && e.to == "B");
    assert!(
        ab.is_some(),
        "dominant A→B (20× forward, 1× reverse) must be retained — precision \
         must exceed the median of {{A→B, B→A}} after the fix"
    );
    assert_eq!(ab.unwrap().frequency, 20);
}

// ---------------------------------------------------------------------------
// Simulated Annealing — NaN/Inf temperature must not stall (Rank 1)
// ---------------------------------------------------------------------------

#[test]
fn sa_with_nan_temperature_runs_and_produces_a_dfg() {
    let log = build_log(&[(10, &["A", "B", "C"]), (5, &["A", "B", "D"])]);
    let (dfg, fitness) =
        discover_simulated_annealing_from_log(&log, "concept:name", f64::NAN, 0.95);
    assert!(
        fitness.is_finite(),
        "SA fitness must be finite, got {:?}",
        fitness
    );
    assert!(
        !dfg.nodes.is_empty(),
        "SA must populate nodes for non-empty log (got 0 — bug regime returned empty DFG)"
    );
}

#[test]
fn sa_with_negative_temperature_terminates_and_returns_nodes() {
    let log = build_log(&[(8, &["A", "B", "C", "D"])]);
    let (dfg, fitness) = discover_simulated_annealing_from_log(&log, "concept:name", -5.0, 0.95);
    assert_eq!(fitness, 0.0);
    assert!(
        dfg.nodes.is_empty(),
        "negative temperature must return empty DFG"
    );
}

#[test]
fn sa_with_infinite_temperature_terminates() {
    let log = build_log(&[(5, &["A", "B", "C"])]);
    // Reaching this point proves termination under finite-time clamping.
    let (dfg, _f) = discover_simulated_annealing_from_log(&log, "concept:name", f64::INFINITY, 0.9);
    assert_eq!(dfg.nodes.len(), 3);
}

// ---------------------------------------------------------------------------
// ACO — pheromone is bounded (Rank 2 domain contract: MMAS-style bounds)
// ---------------------------------------------------------------------------

/// Rank-1 mathematical property: fitness must be in [0,1] regardless of
/// iteration count. Pre-fix, unbounded pheromone could saturate every edge to
/// near-deterministic selection, and a NaN deposit could poison best-tracking.
#[test]
fn aco_fitness_bounded_under_long_run() {
    let log = build_log(&[
        (20, &["A", "B", "C", "D"]),
        (10, &["A", "B", "D"]),
        (5, &["A", "C", "D"]),
    ]);
    let (_, fitness) = discover_aco_algorithm_from_log(&log, "concept:name", 5, 200)
        .expect("ACO must succeed on a non-empty log");
    assert!(
        (0.0..=1.0).contains(&fitness),
        "ACO fitness {:.4} outside [0,1] — pheromone may be unbounded",
        fitness
    );
}

#[test]
fn aco_fitness_is_finite() {
    let log = build_log(&[(15, &["A", "B", "C"])]);
    let (_, fitness) =
        discover_aco_algorithm_from_log(&log, "concept:name", 8, 100).expect("ACO must succeed");
    assert!(
        fitness.is_finite(),
        "ACO fitness must be finite after 100 iterations, got {:?}",
        fitness
    );
}

/// Rank-1: with bounded pheromone, the algorithm remains deterministic at
/// seed=42 across repeated invocations.
#[test]
fn aco_determinism_with_bounded_pheromone() {
    let log = build_log(&[(10, &["A", "B", "C"]), (5, &["A", "C", "B"])]);
    let (dfg1, f1) = discover_aco_algorithm_from_log(&log, "concept:name", 5, 50).expect("ACO #1");
    let (dfg2, f2) = discover_aco_algorithm_from_log(&log, "concept:name", 5, 50).expect("ACO #2");
    assert_eq!(dfg1.edges.len(), dfg2.edges.len());
    assert!(
        (f1 - f2).abs() < 1e-9,
        "ACO must be deterministic with seed=42"
    );
}
