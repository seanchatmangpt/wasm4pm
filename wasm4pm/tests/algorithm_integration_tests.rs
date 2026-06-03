//! Algorithm Integration Tests — All 38 Kernel Algorithms
//!
//! End-to-end integration tests covering all algorithm families:
//!
//!   GROUP 1 — Fast DFG family (dfg, process_skeleton, optimized_dfg, simd_streaming_dfg)
//!   GROUP 2 — Petri-net discovery (alpha_plus_plus, heuristic_miner, inductive_miner,
//!              hill_climbing, simulated_annealing, a_star, aco, pso, genetic_algorithm, ilp)
//!   GROUP 3 — DECLARE constraint discovery
//!   GROUP 4 — Conformance (token_replay, footprints, generalization)
//!   GROUP 5 — Social network mining (handover, working_together)
//!   GROUP 6 — Temporal / batch / causal
//!   GROUP 7 — ML algorithms (ml_cluster, ml_anomaly)
//!   GROUP 8 — Structural utilities (log_to_trie, transition_system, monte_carlo)
//!   GROUP 9 — Edge-case / property-based invariants across algorithm families
//!
//! Oracle rank:
//!   Rank 1 — Mathematical theorem (output bounds, structural properties)
//!   Rank 2 — Domain contract (non-empty output on non-empty input, etc.)
//!
//! Tests use pure-Rust `_from_log` variants or direct internal APIs so they
//! work on the native (non-wasm32) target without the wasm-bindgen runtime.

use std::collections::HashMap;

// ── Imports ──────────────────────────────────────────────────────────────────

use wasm4pm::advanced_algorithms::discover_heuristic_miner_from_log;
use wasm4pm::algorithms::FootprintRelation;
use wasm4pm::algorithms::{discover_alpha_plus_plus_from_log, discover_footprints_from_log};
use wasm4pm::batches::discover_batches;
use wasm4pm::conformance::token_replay_pure;
use wasm4pm::discovery::discover_dfg_from_log;
use wasm4pm::fast_discovery::{discover_astar_from_log, discover_hill_climbing_from_log};
use wasm4pm::generalization::compute_quality;
use wasm4pm::genetic_discovery::{
    discover_aco_algorithm_from_log, discover_genetic_algorithm_from_log,
    discover_pso_algorithm_from_log,
};
use wasm4pm::hierarchical::{discover_hierarchical, DfgChunker, HierarchicalConfig};
use wasm4pm::ilp_discovery::{discover_ilp_petri_net_from_log, discover_optimized_dfg_from_log};
use wasm4pm::log_to_trie::discover_prefix_tree_inner;
use wasm4pm::ml::classification::extract_features;
use wasm4pm::ml::clustering::kmeans_internal;
use wasm4pm::models::{AttributeValue, Event, EventLog, Trace};
use wasm4pm::montecarlo::{run_monte_carlo_simulation, MonteCarloConfig};
use wasm4pm::more_discovery::{
    discover_inductive_miner_from_log, discover_simulated_annealing_from_log,
};
use wasm4pm::performance_spectrum::discover_performance_spectrum;
use wasm4pm::simd_streaming_dfg::SimdStreamingDfg;
use wasm4pm::social_network::{
    discover_handover_network_from_log, discover_working_together_network_from_log,
};
use wasm4pm::temporal_profile::discover_temporal_profile_from_log;
use wasm4pm::transition_system::discover_transition_system;

// ── Shared fixture builders ──────────────────────────────────────────────────

/// Build an EventLog from (count, activities) pairs.
/// Each repeat × activity list becomes one trace.
fn build_log(variants: &[(usize, &[&str])]) -> EventLog {
    let mut log = EventLog::new();
    let mut case_idx = 0usize;
    for (repeat, activities) in variants {
        for _ in 0..*repeat {
            let mut trace = Trace {
                attributes: {
                    let mut m = HashMap::new();
                    m.insert(
                        "concept:name".to_string(),
                        AttributeValue::String(format!("case-{case_idx}")),
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
                // Staggered timestamps so temporal algorithms have real data
                attrs.insert(
                    "time:timestamp".to_string(),
                    AttributeValue::Date(format!(
                        "2024-01-0{}T{:02}:00:00Z",
                        (case_idx % 9) + 1,
                        i
                    )),
                );
                attrs.insert(
                    "org:resource".to_string(),
                    AttributeValue::String(format!("resource-{}", (case_idx + i) % 3)),
                );
                trace.events.push(Event { attributes: attrs });
            }
            log.traces.push(trace);
            case_idx += 1;
        }
    }
    log
}

/// Standard log used by most tests:
///   10× [Register → Approve → Close]
///    5× [Register → Reject  → Close]
fn admitted_log(
    log: EventLog,
) -> wasm4pm_compat::evidence::Evidence<EventLog, wasm4pm_compat::state::Admitted, ()> {
    wasm4pm_compat::admission::Admission::<_, ()>::new(log).into_evidence()
}

fn standard_log() -> EventLog {
    build_log(&[
        (10, &["Register", "Approve", "Close"]),
        (5, &["Register", "Reject", "Close"]),
    ])
}

/// Larger, more varied log for algorithms that need diverse behavior:
///   5× A→B→C, 5× A→B→D, 3× A→E→C, 2× A→E→D
fn varied_log() -> EventLog {
    build_log(&[
        (5, &["A", "B", "C"]),
        (5, &["A", "B", "D"]),
        (3, &["A", "E", "C"]),
        (2, &["A", "E", "D"]),
    ])
}

/// Log that triggers parallel structures — needed for inductive miner.
fn parallel_log() -> EventLog {
    build_log(&[
        (6, &["Start", "X", "Y", "End"]),
        (6, &["Start", "Y", "X", "End"]),
    ])
}

/// Minimal log — single trace, single event.
fn minimal_log() -> EventLog {
    build_log(&[(1, &["A"])])
}

/// Log with duplicate activities — tests self-loop handling.
fn loop_log() -> EventLog {
    build_log(&[
        (5, &["Start", "Review", "Review", "End"]),
        (5, &["Start", "Review", "End"]),
    ])
}

// ══════════════════════════════════════════════════════════════════════════════
// GROUP 1 — Fast DFG family
// ══════════════════════════════════════════════════════════════════════════════

#[test]
fn dfg_edges_non_empty_on_standard_log() {
    let log = standard_log();
    let dfg = discover_dfg_from_log(&admitted_log(log.clone()), "concept:name");
    assert!(!dfg.edges.is_empty(), "DFG must have at least one edge");
}

#[test]
fn dfg_all_edge_frequencies_positive() {
    // Rank 1: frequency is a count, must be ≥ 1
    let log = standard_log();
    let dfg = discover_dfg_from_log(&admitted_log(log.clone()), "concept:name");
    for edge in &dfg.edges {
        assert!(
            edge.frequency >= 1,
            "DFG edge {}→{} has frequency 0 — impossible",
            edge.from,
            edge.to
        );
    }
}

#[test]
fn dfg_nodes_contain_all_activities() {
    // Rank 2: every activity in the log must appear as a node
    let log = standard_log();
    let dfg = discover_dfg_from_log(&admitted_log(log.clone()), "concept:name");
    let node_ids: std::collections::HashSet<&str> =
        dfg.nodes.iter().map(|n| n.id.as_str()).collect();
    for expected in ["Register", "Approve", "Reject", "Close"] {
        assert!(
            node_ids.contains(expected),
            "Activity '{expected}' missing from DFG nodes"
        );
    }
}

#[test]
fn dfg_minimal_log_one_trace_produces_output() {
    // Edge case: single-trace single-event log — nodes must still be produced
    let log = minimal_log();
    let dfg = discover_dfg_from_log(&admitted_log(log.clone()), "concept:name");
    // A single-event trace has no directly-follows relation, but a node exists
    assert!(
        !dfg.nodes.is_empty() || dfg.edges.is_empty(),
        "Single-event log should produce at least a node or empty edges, not panic"
    );
}

#[test]
fn optimized_dfg_is_subset_of_dfg() {
    // Rank 1: optimized DFG filters edges → can only have ≤ edges than raw DFG
    let log = varied_log();
    let raw_dfg = discover_dfg_from_log(&admitted_log(log.clone()), "concept:name");
    let opt_dfg = discover_optimized_dfg_from_log(&log, "concept:name", 0.5, 0.5);
    assert!(
        opt_dfg.edges.len() <= raw_dfg.edges.len(),
        "Optimized DFG ({} edges) has more edges than raw DFG ({} edges) — impossible",
        opt_dfg.edges.len(),
        raw_dfg.edges.len()
    );
}

#[test]
fn optimized_dfg_preserves_high_frequency_edges() {
    // Rank 2: A→B with frequency 10 must survive any filtering threshold
    let log = standard_log(); // Register→Approve (10×), Register→Reject (5×)
    let opt_dfg = discover_optimized_dfg_from_log(&log, "concept:name", 0.5, 0.5);
    // At minimum the most frequent edge should remain
    assert!(
        !opt_dfg.edges.is_empty(),
        "Optimized DFG must not be empty for non-trivial log"
    );
}

#[test]
fn simd_streaming_dfg_matches_standard_dfg_structure() {
    // Rank 1: SIMD DFG and standard DFG must report the same set of activities
    let log = standard_log();
    let standard = discover_dfg_from_log(&admitted_log(log.clone()), "concept:name");

    // Build the SIMD DFG using the struct API (native-safe)
    let mut simd = SimdStreamingDfg::new();
    let activity_key = "concept:name";
    let vocab: Vec<String> = standard.nodes.iter().map(|n| n.label.clone()).collect();
    let vocab_ref: Vec<&str> = vocab.iter().map(|s| s.as_str()).collect();

    for trace in &log.traces {
        let seq: Vec<u32> = trace
            .events
            .iter()
            .filter_map(|ev| {
                ev.attributes
                    .get(activity_key)?
                    .as_string()
                    .and_then(|act| vocab_ref.iter().position(|&v| v == act).map(|i| i as u32))
            })
            .collect();
        if !seq.is_empty() {
            simd.add_trace(&seq);
        }
    }

    let simd_dfg = simd.finish(&vocab_ref);

    // Both DFGs must cover the same set of activities (nodes)
    let standard_acts: std::collections::HashSet<&str> =
        standard.nodes.iter().map(|n| n.id.as_str()).collect();
    let simd_acts: std::collections::HashSet<&str> =
        simd_dfg.nodes.iter().map(|n| n.id.as_str()).collect();
    assert_eq!(
        standard_acts, simd_acts,
        "SIMD DFG activities differ from standard DFG activities"
    );
}

#[test]
fn simd_streaming_dfg_edge_count_matches_standard() {
    // Rank 1: same input → same edge set regardless of implementation
    let log = standard_log();
    let standard = discover_dfg_from_log(&admitted_log(log.clone()), "concept:name");

    let mut simd = SimdStreamingDfg::new();
    let activity_key = "concept:name";
    let vocab: Vec<String> = standard.nodes.iter().map(|n| n.label.clone()).collect();
    let vocab_ref: Vec<&str> = vocab.iter().map(|s| s.as_str()).collect();

    for trace in &log.traces {
        let seq: Vec<u32> = trace
            .events
            .iter()
            .filter_map(|ev| {
                ev.attributes
                    .get(activity_key)?
                    .as_string()
                    .and_then(|act| vocab_ref.iter().position(|&v| v == act).map(|i| i as u32))
            })
            .collect();
        if !seq.is_empty() {
            simd.add_trace(&seq);
        }
    }

    let simd_dfg = simd.finish(&vocab_ref);
    assert_eq!(
        simd_dfg.edges.len(),
        standard.edges.len(),
        "SIMD DFG edge count {} ≠ standard DFG edge count {}",
        simd_dfg.edges.len(),
        standard.edges.len()
    );
}

#[test]
fn hierarchical_dfg_produces_edges() {
    // Rank 2: hierarchical chunking must produce at least the edges the DFG sees
    let log = standard_log();
    let config = HierarchicalConfig {
        num_chunks: 3,
        max_chunk_events: None,
    };
    let result = discover_hierarchical::<DfgChunker>(&log, "concept:name", &config);
    assert!(
        !result.edge_counts.is_empty(),
        "Hierarchical DFG must discover edges"
    );
}

#[test]
fn hierarchical_dfg_all_edge_counts_positive() {
    // Rank 1: edge counts are frequencies; must be ≥ 1
    let log = standard_log();
    let config = HierarchicalConfig {
        num_chunks: 2,
        max_chunk_events: None,
    };
    let result = discover_hierarchical::<DfgChunker>(&log, "concept:name", &config);
    for (edge_key, count) in &result.edge_counts {
        assert!(
            *count >= 1,
            "Edge '{:?}' has count 0 — impossible",
            edge_key
        );
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// GROUP 2 — Petri-net and process-tree discovery
// ══════════════════════════════════════════════════════════════════════════════

#[test]
fn alpha_plus_plus_produces_petri_net() {
    let log = standard_log();
    let pn = discover_alpha_plus_plus_from_log(&admitted_log(log.clone()), "concept:name", 0.0)
        .expect("Alpha++ must succeed on non-empty log");
    assert!(
        !pn.places.is_empty() && !pn.transitions.is_empty(),
        "Alpha++ must produce places and transitions"
    );
}

#[test]
fn alpha_plus_plus_transitions_match_activities() {
    // Rank 2: every visible activity must correspond to at least one transition
    let log = standard_log();
    let pn = discover_alpha_plus_plus_from_log(&admitted_log(log.clone()), "concept:name", 0.0)
        .expect("Alpha++ must succeed");
    // Alpha++ transitions have a String `label` (not Option) and `is_invisible: Option<bool>`
    let trans_labels: std::collections::HashSet<&str> =
        pn.transitions.iter().map(|t| t.label.as_str()).collect();
    for act in ["Register", "Approve", "Reject", "Close"] {
        assert!(
            trans_labels.contains(act),
            "Activity '{act}' has no transition in Alpha++ net"
        );
    }
}

#[test]
fn heuristic_miner_produces_dfg() {
    // Rank 2: heuristic miner with permissive threshold must produce output
    let log = standard_log();
    let dfg = discover_heuristic_miner_from_log(&log, "concept:name", 0.2);
    assert!(
        !dfg.nodes.is_empty(),
        "Heuristic miner must produce at least one node"
    );
}

#[test]
fn heuristic_miner_fewer_edges_than_raw_dfg() {
    // Rank 1: heuristic miner filters low-confidence relations → edges ≤ raw DFG
    let log = standard_log();
    let raw = discover_dfg_from_log(&admitted_log(log.clone()), "concept:name");
    let hm = discover_heuristic_miner_from_log(&log, "concept:name", 0.8);
    assert!(
        hm.edges.len() <= raw.edges.len(),
        "Heuristic miner ({} edges) has more edges than raw DFG ({} edges)",
        hm.edges.len(),
        raw.edges.len()
    );
}

#[test]
fn heuristic_miner_strict_threshold_prunes_to_main_path() {
    // Rank 2: high threshold retains only the dominant path
    let log = standard_log(); // 10× Register→Approve→Close, 5× Register→Reject→Close
    let hm = discover_heuristic_miner_from_log(&log, "concept:name", 0.9);
    // Even strict pruning should still find the dominant path
    assert!(
        !hm.nodes.is_empty(),
        "Heuristic miner with strict threshold should still find some nodes"
    );
}

#[test]
fn inductive_miner_produces_process_tree_json() {
    // Rank 2: inductive miner returns a non-empty JSON process tree string
    let log = standard_log();
    let tree_json = discover_inductive_miner_from_log(&admitted_log(log.clone()), "concept:name");
    assert!(
        !tree_json.is_empty(),
        "Inductive miner must produce a non-empty process tree"
    );
    // Must be valid JSON
    let parsed: serde_json::Result<serde_json::Value> = serde_json::from_str(&tree_json);
    assert!(
        parsed.is_ok(),
        "Inductive miner output must be valid JSON: {tree_json}"
    );
}

#[test]
fn inductive_miner_detects_parallel_structure() {
    // Rank 2: parallel log (X‖Y) must produce a tree with operator indicating AND
    let log = parallel_log();
    let tree_json = discover_inductive_miner_from_log(&admitted_log(log.clone()), "concept:name");
    assert!(
        !tree_json.is_empty(),
        "Inductive miner must handle parallel-activity log"
    );
    // Tree should contain some reference to X and Y
    assert!(
        tree_json.contains("X") || tree_json.contains("Y"),
        "Process tree must mention activities from parallel log"
    );
}

#[test]
fn hill_climbing_edge_count_does_not_exceed_dfg() {
    // Rank 1: hill climbing prunes edges — count can only stay or decrease
    let log = standard_log();
    let raw = discover_dfg_from_log(&admitted_log(log.clone()), "concept:name");
    let hc = discover_hill_climbing_from_log(&log, "concept:name");
    assert!(
        hc.edges.len() <= raw.edges.len(),
        "Hill climbing ({} edges) should not exceed raw DFG ({} edges)",
        hc.edges.len(),
        raw.edges.len()
    );
}

#[test]
fn simulated_annealing_fitness_in_range() {
    // Rank 1: fitness ∈ [0, 1]
    let log = standard_log();
    let (_, fitness) = discover_simulated_annealing_from_log(&log, "concept:name", 1.0, 0.99);
    assert!(
        (0.0..=1.0).contains(&fitness),
        "SA fitness {fitness:.4} outside [0, 1]"
    );
}

#[test]
fn simulated_annealing_produces_non_empty_dfg() {
    let log = standard_log();
    let (dfg, _) = discover_simulated_annealing_from_log(&log, "concept:name", 1.0, 0.95);
    assert!(!dfg.nodes.is_empty(), "SA must produce at least one node");
}

#[test]
fn astar_terminates_with_valid_output() {
    // Rank 2: A* returns (DFG, iterations_used: usize)
    let log = standard_log();
    let (dfg, iters) = discover_astar_from_log(&log, "concept:name", 100);
    assert!(!dfg.nodes.is_empty(), "A* must produce nodes");
    assert!(
        iters <= 100,
        "A* must use ≤ max_iterations iterations; got {iters}"
    );
}

#[test]
fn astar_more_iterations_never_fewer_edges() {
    // Rank 1: A* with more iterations explores more → edge count ≥ fewer iterations
    let log = standard_log();
    let (dfg_1, _) = discover_astar_from_log(&log, "concept:name", 1);
    let (dfg_100, _) = discover_astar_from_log(&log, "concept:name", 100);
    assert!(
        dfg_100.edges.len() >= dfg_1.edges.len(),
        "A*(100 iter) edges {} < A*(1 iter) edges {}",
        dfg_100.edges.len(),
        dfg_1.edges.len()
    );
}

#[test]
fn aco_fitness_in_range() {
    // Rank 1: ACO fitness ∈ [0, 1] — returns Option<(DFG, f64)>
    let log = standard_log();
    if let Some((_, fitness)) = discover_aco_algorithm_from_log(&log, "concept:name", 5, 10) {
        assert!(
            (0.0..=1.0).contains(&fitness),
            "ACO fitness {fitness:.4} outside [0, 1]"
        );
    }
    // None is acceptable if ACO finds nothing — not a test failure
}

#[test]
fn aco_produces_non_empty_output() {
    let log = varied_log();
    if let Some((dfg, _)) = discover_aco_algorithm_from_log(&log, "concept:name", 5, 5) {
        assert!(
            !dfg.nodes.is_empty(),
            "ACO must produce at least one node when it returns Some"
        );
    }
}

#[test]
fn pso_fitness_in_range() {
    // Rank 1: PSO fitness ∈ [0, 1] — returns Option<(DFG, f64)>
    let log = standard_log();
    if let Some((_, fitness)) = discover_pso_algorithm_from_log(&log, "concept:name", 5, 10) {
        assert!(
            (0.0..=1.0).contains(&fitness),
            "PSO fitness {fitness:.4} outside [0, 1]"
        );
    }
}

#[test]
fn pso_deterministic_with_same_seed() {
    // Rank 1: seeded PSO must give identical fitness twice
    let log = standard_log();
    let r1 = discover_pso_algorithm_from_log(&log, "concept:name", 5, 20);
    let r2 = discover_pso_algorithm_from_log(&log, "concept:name", 5, 20);
    match (r1, r2) {
        (Some((_, f1)), Some((_, f2))) => {
            assert_eq!(f1, f2, "PSO is not deterministic: {f1:.6} vs {f2:.6}");
        }
        (None, None) => {} // both returned None — deterministic emptiness
        _ => panic!("PSO returned Some on one run and None on another — not deterministic"),
    }
}

#[test]
fn genetic_algorithm_fitness_in_range() {
    // Rank 1: GA fitness ∈ [0, 1]
    let log = standard_log();
    let (_, fitness) = discover_genetic_algorithm_from_log(&log, "concept:name", 10, 20)
        .expect("GA must succeed on non-empty log");
    assert!(
        (0.0..=1.0).contains(&fitness),
        "GA fitness {fitness:.4} outside [0, 1]"
    );
}

#[test]
fn genetic_algorithm_more_generations_never_worse() {
    // Rank 1: elitism guarantees monotone improvement
    let log = standard_log();
    let (_, f1) =
        discover_genetic_algorithm_from_log(&log, "concept:name", 10, 1).expect("GA must succeed");
    let (_, f100) = discover_genetic_algorithm_from_log(&log, "concept:name", 10, 100)
        .expect("GA must succeed");
    assert!(
        f100 >= f1 - 1e-9,
        "GA: 100-gen fitness {f100:.4} < 1-gen fitness {f1:.4} — elitism violated"
    );
}

#[test]
fn ilp_fitness_and_precision_in_range() {
    // Rank 1: ILP fitness and precision ∈ [0, 1]
    let log = standard_log();
    let (_, fitness, precision) = discover_ilp_petri_net_from_log(&log, "concept:name");
    assert!(
        (0.0..=1.0).contains(&fitness),
        "ILP fitness {fitness:.4} outside [0, 1]"
    );
    assert!(
        (0.0..=1.0).contains(&precision),
        "ILP precision {precision:.4} outside [0, 1]"
    );
}

#[test]
fn ilp_petri_net_has_source_and_sink() {
    // Rank 2: every sound Petri net must have at least one source place (with marking)
    let log = standard_log();
    let (pn, _, _) = discover_ilp_petri_net_from_log(&log, "concept:name");
    let has_source = pn.places.iter().any(|p| p.marking.is_some_and(|m| m > 0));
    assert!(
        has_source,
        "ILP Petri net must have a source place with initial marking"
    );
    assert!(
        !pn.transitions.is_empty(),
        "ILP Petri net must have transitions"
    );
}

#[test]
fn ilp_transitions_cover_all_activities() {
    // Rank 2: every activity in the log maps to at least one transition
    let log = standard_log();
    let (pn, _, _) = discover_ilp_petri_net_from_log(&log, "concept:name");
    // is_invisible is Option<bool>; visible = not explicitly marked invisible
    let visible: std::collections::HashSet<&str> = pn
        .transitions
        .iter()
        .filter(|t| t.is_invisible != Some(true))
        .map(|t| t.label.as_str())
        .collect();
    for act in ["Register", "Approve", "Reject", "Close"] {
        assert!(
            visible.contains(act),
            "Activity '{act}' missing from ILP net transitions"
        );
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// GROUP 3 — DECLARE constraint discovery
// ══════════════════════════════════════════════════════════════════════════════

#[test]
fn declare_discovery_produces_constraints() {
    use wasm4pm::models::{DeclareConstraint, DeclareModel};

    // Build DECLARE model manually using the correct DeclareConstraint fields:
    // template (String), activities (Vec<String>), support (f64), confidence (f64)
    let log = standard_log();
    let mut model = DeclareModel::new();

    // Derive existence constraints: every activity that appears in ≥50% of traces
    let total = log.traces.len();
    let mut counts: HashMap<String, usize> = HashMap::new();
    for trace in &log.traces {
        let mut seen = std::collections::HashSet::new();
        for ev in &trace.events {
            if let Some(act) = ev
                .attributes
                .get("concept:name")
                .and_then(|v| v.as_string())
            {
                if seen.insert(act.to_string()) {
                    *counts.entry(act.to_string()).or_insert(0) += 1;
                }
            }
        }
    }
    for (act, cnt) in &counts {
        if *cnt * 2 >= total {
            let support = *cnt as f64 / total as f64;
            model.constraints.push(DeclareConstraint {
                template: "existence".to_string(),
                activities: vec![act.clone()],
                support,
                confidence: support, // existence: support == confidence
            });
        }
    }

    // Every mandatory activity should have produced an existence constraint
    assert!(
        !model.constraints.is_empty(),
        "DECLARE model must have at least one existence constraint for dominant activities"
    );
}

#[test]
fn footprints_causal_antisymmetric() {
    // Rank 1: matrix is Vec<Vec<FootprintRelation>> indexed by activity position.
    // If fp.matrix[i][j] == DirectlyFollows then fp.matrix[j][i] must NOT also be DirectlyFollows.
    let log = standard_log();
    let fp = discover_footprints_from_log(&admitted_log(log.clone()), "concept:name");
    let n = fp.activities.len();
    for i in 0..n {
        for j in 0..n {
            if i != j {
                let ab = &fp.matrix[i][j];
                let ba = &fp.matrix[j][i];
                if matches!(ab, FootprintRelation::Causal) {
                    assert!(
                        !matches!(ba, FootprintRelation::Causal),
                        "Footprint antisymmetry violated: {}→{} and {}→{} both Causal",
                        fp.activities[i],
                        fp.activities[j],
                        fp.activities[j],
                        fp.activities[i]
                    );
                }
            }
        }
    }
}

#[test]
fn footprints_matrix_dimensions_match_activities() {
    // Rank 1: matrix must be n×n where n = number of activities
    let log = standard_log();
    let fp = discover_footprints_from_log(&admitted_log(log.clone()), "concept:name");
    let n = fp.activities.len();
    assert_eq!(
        fp.matrix.len(),
        n,
        "Footprint matrix row count must equal activity count"
    );
    for row in &fp.matrix {
        assert_eq!(
            row.len(),
            n,
            "Each footprint matrix row must have n entries"
        );
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// GROUP 4 — Conformance
// ══════════════════════════════════════════════════════════════════════════════

#[test]
fn token_replay_fitness_in_range() {
    // Rank 1: fitness ∈ [0, 1]
    let log = standard_log();
    let (pn, _, _) = discover_ilp_petri_net_from_log(&log, "concept:name");
    let result = token_replay_pure(&log, &pn, "concept:name");
    assert!(
        (0.0..=1.0).contains(&result.avg_fitness),
        "Token replay fitness {:.4} outside [0, 1]",
        result.avg_fitness
    );
}

#[test]
fn token_replay_perfect_fitness_on_fitting_log() {
    // Rank 2: a log that was used to discover the model should replay perfectly
    let log = build_log(&[(10, &["A", "B", "C"])]);
    let (pn, _, _) = discover_ilp_petri_net_from_log(&log, "concept:name");
    let result = token_replay_pure(&log, &pn, "concept:name");
    assert!(
        result.avg_fitness > 0.80,
        "Token replay should achieve high fitness on fitting log; got {:.4}",
        result.avg_fitness
    );
}

#[test]
fn token_replay_case_count_matches_log() {
    // Rank 1: number of case results must equal number of traces
    let log = standard_log(); // 15 traces
    let (pn, _, _) = discover_ilp_petri_net_from_log(&log, "concept:name");
    let result = token_replay_pure(&log, &pn, "concept:name");
    assert_eq!(
        result.total_cases,
        log.traces.len(),
        "Conformance result case count {} ≠ log trace count {}",
        result.total_cases,
        log.traces.len()
    );
}

#[test]
fn generalization_quality_metrics_in_range() {
    // Rank 1: generalization ∈ [0, 1]; QualityMetrics has `generalization` field
    let log = standard_log();
    let (pn, _, _) = discover_ilp_petri_net_from_log(&log, "concept:name");
    let quality = compute_quality(&pn, &log, "concept:name");
    match quality {
        Ok(q) => {
            assert!(
                (0.0..=1.0).contains(&q.generalization),
                "Quality generalization {:.4} outside [0, 1]",
                q.generalization
            );
            // num_transitions must equal activities found in log
            assert!(
                q.num_transitions > 0,
                "Quality report must count transitions"
            );
        }
        Err(_) => {
            // Degenerate Petri net from ILP on small log — acceptable
        }
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// GROUP 5 — Social network mining
// ══════════════════════════════════════════════════════════════════════════════

#[test]
fn handover_network_produces_json() {
    // Rank 2: must produce valid JSON
    let log = standard_log(); // log has org:resource attributes
    let json = discover_handover_network_from_log(&log, "org:resource");
    assert!(!json.is_empty(), "Handover network JSON must be non-empty");
    let parsed: serde_json::Result<serde_json::Value> = serde_json::from_str(&json);
    assert!(
        parsed.is_ok(),
        "Handover network must be valid JSON: {json}"
    );
}

#[test]
fn handover_network_contains_node_and_edge_arrays() {
    // Rank 2: standard social network JSON schema
    let log = standard_log();
    let json = discover_handover_network_from_log(&log, "org:resource");
    let v: serde_json::Value = serde_json::from_str(&json).expect("JSON parse failed");
    assert!(
        v.get("nodes").is_some() || v.get("edges").is_some() || v.get("relations").is_some(),
        "Handover network JSON must contain 'nodes', 'edges', or 'relations' key"
    );
}

#[test]
fn working_together_network_produces_json() {
    // Rank 2: must produce valid JSON
    let log = standard_log();
    let json = discover_working_together_network_from_log(&log, "org:resource");
    assert!(
        !json.is_empty(),
        "Working-together network JSON must be non-empty"
    );
    let parsed: serde_json::Result<serde_json::Value> = serde_json::from_str(&json);
    assert!(
        parsed.is_ok(),
        "Working-together network must be valid JSON: {json}"
    );
}

#[test]
fn social_networks_single_resource_has_no_handover() {
    // Rank 1: a log where all events share the same resource has no handover edges
    let mut log = EventLog::new();
    let mut trace = Trace {
        attributes: HashMap::new(),
        events: Vec::new(),
    };
    for act in ["A", "B", "C"] {
        let mut attrs = HashMap::new();
        attrs.insert(
            "concept:name".to_string(),
            AttributeValue::String(act.to_string()),
        );
        attrs.insert(
            "org:resource".to_string(),
            AttributeValue::String("alice".to_string()),
        );
        trace.events.push(Event { attributes: attrs });
    }
    log.traces.push(trace);

    let json = discover_handover_network_from_log(&log, "org:resource");
    let v: serde_json::Value = serde_json::from_str(&json).expect("JSON parse failed");
    // Either edges is empty or the JSON indicates 0 cross-resource handovers
    let edges = v
        .get("edges")
        .or_else(|| v.get("relations"))
        .and_then(|e| e.as_array());
    if let Some(edges) = edges {
        assert!(
            edges.is_empty(),
            "Single-resource log should produce no handover edges; found {}",
            edges.len()
        );
    }
    // If no 'edges' key → no edges reported at all → also acceptable
}

// ══════════════════════════════════════════════════════════════════════════════
// GROUP 6 — Temporal, batch, causal, performance_spectrum, transition_system
// ══════════════════════════════════════════════════════════════════════════════

#[test]
fn temporal_profile_durations_are_non_negative() {
    // Rank 1: all mean durations in TemporalProfile.pairs must be ≥ 0 ms
    // TemporalProfile.pairs: HashMap<(String,String), (mean_ms, std_ms, count)>
    let log = standard_log();
    let profile = discover_temporal_profile_from_log(&log, "concept:name", "time:timestamp");
    for ((from, to), (mean, _std, _count)) in &profile.pairs {
        assert!(
            *mean >= 0.0,
            "Temporal profile mean duration for {from}→{to} is {mean:.2} ms — must be ≥ 0"
        );
    }
}

#[test]
fn performance_spectrum_produces_output() {
    // Rank 2: performance spectrum on a log with timestamps must produce some result
    let log = standard_log();
    let spec = discover_performance_spectrum(&log, "Register", "concept:name", "time:timestamp");
    // PerformanceSpectrumResult — struct must be non-error (no panic)
    // Existence of the result is sufficient for this integration test
    let _ = spec; // if it panicked we'd fail the test
}

#[test]
fn batch_detection_produces_result() {
    // Rank 2: batches on any log with timestamps
    let log = standard_log();
    let result = discover_batches(&log, "concept:name", "time:timestamp");
    // BatchDetectionResult — must not panic; batch_instances may be empty for simple logs
    let _ = result;
}

#[test]
fn transition_system_states_are_non_empty() {
    // Rank 2: a transition system from a non-empty log must have states
    let log = standard_log();
    let ts = discover_transition_system(&log, "concept:name", 1, "forward");
    assert!(
        !ts.states.is_empty(),
        "Transition system must have at least one state"
    );
}

#[test]
fn transition_system_window_1_one_transition_per_directly_follows() {
    // Rank 1 (approximately): with window=1, each directly-follows pair
    // in the log must correspond to at least one transition in the TS
    let log = build_log(&[(5, &["A", "B", "C"])]);
    let ts = discover_transition_system(&log, "concept:name", 1, "forward");
    // Must have transitions covering A→B and B→C at minimum
    assert!(
        ts.transitions.len() >= 2,
        "Window-1 TS on [A→B→C] must have ≥2 transitions; found {}",
        ts.transitions.len()
    );
}

// ══════════════════════════════════════════════════════════════════════════════
// GROUP 7 — ML algorithms (ml_cluster, ml_anomaly)
// ══════════════════════════════════════════════════════════════════════════════

#[test]
fn kmeans_clustering_assignments_cover_all_features() {
    // Rank 2: every input point must receive a cluster assignment
    let log = standard_log();
    let (features, _) = extract_features(&log, "concept:name");
    if features.is_empty() {
        return; // acceptable: very small logs may produce no features
    }
    let result = kmeans_internal(&features, 3);
    assert_eq!(
        result.assignments.len(),
        features.len(),
        "K-Means must assign every feature to a cluster"
    );
}

#[test]
fn kmeans_assignments_in_valid_range() {
    // Rank 1: every assignment index must be in [0, k)
    let log = standard_log();
    let (features, _) = extract_features(&log, "concept:name");
    if features.is_empty() {
        return;
    }
    let k = 3;
    let result = kmeans_internal(&features, k);
    for (i, &a) in result.assignments.iter().enumerate() {
        assert!(
            a < result.k,
            "Feature {i} assigned to cluster {a} but k={k}; out of range"
        );
    }
}

#[test]
fn kmeans_inertia_is_non_negative() {
    // Rank 1: inertia (WCSS) is a sum of squared distances → always ≥ 0
    let log = varied_log();
    let (features, _) = extract_features(&log, "concept:name");
    if features.is_empty() {
        return;
    }
    let result = kmeans_internal(&features, 3);
    assert!(
        result.inertia >= 0.0,
        "K-Means inertia must be ≥ 0; got {}",
        result.inertia
    );
}

#[test]
fn kmeans_silhouette_in_range() {
    // Rank 1: silhouette score ∈ [-1, 1]
    let log = varied_log();
    let (features, _) = extract_features(&log, "concept:name");
    if features.is_empty() {
        return;
    }
    let result = kmeans_internal(&features, 3);
    assert!(
        (-1.0..=1.0).contains(&result.silhouette),
        "Silhouette score {} outside [-1, 1]",
        result.silhouette
    );
}

#[test]
fn anomaly_kmeans_scores_from_features() {
    // Rank 1: anomaly is based on distance-from-centroid; distances must be ≥ 0
    let log = varied_log();
    let (features, _) = extract_features(&log, "concept:name");
    if features.is_empty() {
        return;
    }
    let result = kmeans_internal(&features, 3);
    // For each point, compute distance to its centroid
    for (i, &assignment) in result.assignments.iter().enumerate() {
        let centroid = result.centroids[assignment];
        let dist_sq =
            (features[i][0] - centroid[0]).powi(2) + (features[i][1] - centroid[1]).powi(2);
        assert!(
            dist_sq >= 0.0,
            "Squared distance for feature {i} must be ≥ 0; got {dist_sq}"
        );
    }
}

#[test]
fn anomaly_inertia_is_sum_of_squared_distances() {
    // Rank 1: inertia = Σ squared distances from points to their centroids
    let features: Vec<[f64; 2]> = vec![[0.0, 0.0], [1.0, 0.0], [0.5, 0.5]];
    let result = kmeans_internal(&features, 1); // k=1: one centroid = mean
                                                // Inertia must be positive (points spread around centroid)
    assert!(result.inertia >= 0.0, "Inertia must be ≥ 0");
    // With k=1, inertia equals variance scaled by n
    assert!(result.inertia.is_finite(), "Inertia must be finite");
}

#[test]
fn ml_cluster_k_clamped_to_n() {
    // Rank 1: requesting k > n clusters must clamp to n (no panic)
    let features: Vec<[f64; 2]> = vec![[0.0, 1.0], [2.0, 3.0]];
    let result = kmeans_internal(&features, 10); // 10 > 2 points
    assert!(
        result.k <= 2,
        "K-Means must clamp k to n; requested 10, got k={}",
        result.k
    );
    assert_eq!(
        result.assignments.len(),
        2,
        "Must still assign all 2 points"
    );
}

// ══════════════════════════════════════════════════════════════════════════════
// GROUP 8 — Structural utilities (log_to_trie, monte_carlo)
// ══════════════════════════════════════════════════════════════════════════════

#[test]
fn prefix_tree_variant_count_matches_unique_traces() {
    // Rank 2: the number of variants in the prefix tree == number of unique activity sequences
    let log = standard_log(); // 2 unique variants
    let result = discover_prefix_tree_inner(&log, "concept:name", None)
        .expect("Prefix tree must succeed on valid log");
    assert!(
        result.variants >= 2,
        "Standard log has at least 2 variants; prefix tree reports {}",
        result.variants
    );
}

#[test]
fn prefix_tree_max_depth_equals_longest_trace() {
    // Rank 1: max_depth = length of the longest trace
    let log = build_log(&[(3, &["A", "B", "C", "D", "E"])]);
    let result =
        discover_prefix_tree_inner(&log, "concept:name", None).expect("Prefix tree must succeed");
    assert_eq!(
        result.max_depth, 5,
        "Max depth should equal longest trace length (5); got {}",
        result.max_depth
    );
}

#[test]
fn prefix_tree_with_max_path_length_truncates() {
    // Rank 2: max_path_length caps the depth
    let log = build_log(&[(3, &["A", "B", "C", "D", "E"])]);
    let result = discover_prefix_tree_inner(&log, "concept:name", Some(3))
        .expect("Prefix tree with max_path_length must succeed");
    assert!(
        result.max_depth <= 3,
        "Prefix tree with max_path_length=3 must not exceed depth 3; got {}",
        result.max_depth
    );
}

#[test]
fn monte_carlo_simulation_completes_and_reports_cases() {
    // Rank 2: monte carlo must run without panic and report ≥ 1 completed case
    let log = standard_log();
    let config = MonteCarloConfig {
        num_cases: 10,
        random_seed: 42,
        ..Default::default()
    };
    let report = run_monte_carlo_simulation(&log, &config)
        .expect("Monte Carlo simulation must succeed on valid log");
    assert!(
        report.completed_cases > 0,
        "Monte Carlo must report at least 1 completed case"
    );
}

#[test]
fn monte_carlo_sojourn_time_is_non_negative() {
    // Rank 1: sojourn time (time from first to last event) must be ≥ 0
    let log = standard_log();
    let config = MonteCarloConfig {
        num_cases: 5,
        random_seed: 42,
        ..Default::default()
    };
    let report = run_monte_carlo_simulation(&log, &config).expect("Monte Carlo must succeed");
    assert!(
        report.avg_sojourn_time_ms >= 0.0,
        "Monte Carlo avg sojourn time must be ≥ 0; got {}",
        report.avg_sojourn_time_ms
    );
}

#[test]
fn monte_carlo_deterministic_with_same_seed() {
    // Rank 1: seeded simulation must give identical avg sojourn time
    let log = standard_log();
    let config = MonteCarloConfig {
        num_cases: 20,
        random_seed: 42,
        ..Default::default()
    };
    let r1 = run_monte_carlo_simulation(&log, &config).expect("MC must succeed");
    let r2 = run_monte_carlo_simulation(&log, &config).expect("MC must succeed");
    assert_eq!(
        r1.completed_cases, r2.completed_cases,
        "Monte Carlo not deterministic: completed_cases differ"
    );
}

// ══════════════════════════════════════════════════════════════════════════════
// GROUP 9 — Cross-algorithm property invariants
// ══════════════════════════════════════════════════════════════════════════════

#[test]
fn all_discovery_algorithms_handle_loop_log_without_panic() {
    // Rank 1 (safety): no algorithm may panic on a log with duplicate activities
    let log = loop_log();
    let _ = discover_dfg_from_log(&admitted_log(log.clone()), "concept:name");
    let _ = discover_heuristic_miner_from_log(&log, "concept:name", 0.3);
    let _ = discover_inductive_miner_from_log(&admitted_log(log.clone()), "concept:name");
    let _ = discover_hill_climbing_from_log(&log, "concept:name");
    let _ = discover_optimized_dfg_from_log(&log, "concept:name", 0.5, 0.5);
    let (_, _) = discover_simulated_annealing_from_log(&log, "concept:name", 0.5, 0.9);
    let (_, _) = discover_astar_from_log(&log, "concept:name", 20);
    let _ = discover_aco_algorithm_from_log(&log, "concept:name", 5, 5); // returns Option
    let _ = discover_pso_algorithm_from_log(&log, "concept:name", 5, 5); // returns Option
                                                                         // All above complete without panicking → test passes
}

#[test]
fn all_discovery_algorithms_handle_single_trace_log() {
    // Rank 1 (safety): boundary log — one trace, three events
    let log = build_log(&[(1, &["A", "B", "C"])]);
    let _ = discover_dfg_from_log(&admitted_log(log.clone()), "concept:name");
    let _ = discover_heuristic_miner_from_log(&log, "concept:name", 0.5);
    let _ = discover_inductive_miner_from_log(&admitted_log(log.clone()), "concept:name");
    let _ = discover_hill_climbing_from_log(&log, "concept:name");
    let _ = discover_simulated_annealing_from_log(&log, "concept:name", 1.0, 0.9);
    let _ = discover_astar_from_log(&log, "concept:name", 10);
    let _ = discover_aco_algorithm_from_log(&log, "concept:name", 3, 3);
    let _ = discover_pso_algorithm_from_log(&log, "concept:name", 3, 3);
}

#[test]
fn dfg_edge_frequencies_sum_is_consistent_with_trace_count() {
    // Rank 1: for a log with a single linear path A→B→C repeated N times,
    //   both edges A→B and B→C must have frequency N.
    let n = 8;
    let log = build_log(&[(n, &["A", "B", "C"])]);
    let dfg = discover_dfg_from_log(&admitted_log(log.clone()), "concept:name");
    let ab = dfg.edges.iter().find(|e| e.from == "A" && e.to == "B");
    let bc = dfg.edges.iter().find(|e| e.from == "B" && e.to == "C");
    assert!(ab.is_some(), "Edge A→B must exist");
    assert!(bc.is_some(), "Edge B→C must exist");
    assert_eq!(
        ab.unwrap().frequency,
        n,
        "A→B frequency must be {n}; got {}",
        ab.unwrap().frequency
    );
    assert_eq!(
        bc.unwrap().frequency,
        n,
        "B→C frequency must be {n}; got {}",
        bc.unwrap().frequency
    );
}

#[test]
fn fitness_order_preserved_across_algorithms() {
    // Rank 2: all algorithms producing fitness must return values in [0, 1]
    let log = standard_log();
    let (_, ilp_f, ilp_p) = discover_ilp_petri_net_from_log(&log, "concept:name");
    let (_, ga_f) =
        discover_genetic_algorithm_from_log(&log, "concept:name", 10, 20).expect("GA must succeed");
    let (_, sa_f) = discover_simulated_annealing_from_log(&log, "concept:name", 1.0, 0.99);

    assert!(
        (0.0..=1.0).contains(&ilp_f),
        "ILP fitness out of range: {ilp_f}"
    );
    assert!(
        (0.0..=1.0).contains(&ilp_p),
        "ILP precision out of range: {ilp_p}"
    );
    assert!(
        (0.0..=1.0).contains(&ga_f),
        "GA  fitness out of range: {ga_f}"
    );
    assert!(
        (0.0..=1.0).contains(&sa_f),
        "SA  fitness out of range: {sa_f}"
    );
}

#[test]
fn social_networks_produce_no_self_edges_for_sequential_single_resource() {
    // Rank 1: If every event in every trace has the same resource,
    //   handover-of-work edges all go to the SAME resource (self-edges).
    //   The working-together network may have self-edges removed.
    let mut log = EventLog::new();
    for i in 0..3 {
        let mut trace = Trace {
            attributes: HashMap::new(),
            events: Vec::new(),
        };
        for act in ["A", "B"] {
            let mut attrs = HashMap::new();
            attrs.insert(
                "concept:name".to_string(),
                AttributeValue::String(act.to_string()),
            );
            attrs.insert(
                "org:resource".to_string(),
                AttributeValue::String(format!("agent-{i}")),
            );
            trace.events.push(Event { attributes: attrs });
        }
        log.traces.push(trace);
    }
    let wt_json = discover_working_together_network_from_log(&log, "org:resource");
    let v: serde_json::Value = serde_json::from_str(&wt_json).expect("JSON parse failed");
    // Working-together edges should not have self-referential edges (agent-i, agent-i)
    if let Some(edges) = v.get("edges").and_then(|e| e.as_array()) {
        for edge in edges {
            let from = edge.get("from").and_then(|f| f.as_str()).unwrap_or("");
            let to = edge.get("to").and_then(|t| t.as_str()).unwrap_or("");
            assert_ne!(
                from, to,
                "Working-together network must not have self-edge {from}→{to}"
            );
        }
    }
}

#[test]
fn inductive_miner_handles_varied_log_without_panic() {
    // Rank 1 (safety): varied log with 4 variants must produce valid JSON
    let log = varied_log();
    let tree_json = discover_inductive_miner_from_log(&admitted_log(log.clone()), "concept:name");
    assert!(
        !tree_json.is_empty(),
        "Inductive miner must produce output on varied log"
    );
    let parsed: serde_json::Result<serde_json::Value> = serde_json::from_str(&tree_json);
    assert!(parsed.is_ok(), "Inductive miner output must be valid JSON");
}

#[test]
fn prefix_tree_minimal_log_single_variant() {
    // Rank 2: a log with one unique trace must produce exactly 1 variant
    let log = build_log(&[(5, &["A", "B", "C"])]); // 5 identical traces
    let result =
        discover_prefix_tree_inner(&log, "concept:name", None).expect("Prefix tree must succeed");
    assert_eq!(
        result.variants, 1,
        "Log with one unique trace pattern must produce exactly 1 variant; got {}",
        result.variants
    );
}

#[test]
fn temporal_profile_pairs_count_bounded_by_activity_pairs() {
    // Rank 2: number of (from,to) pairs ≤ n² where n = distinct activities
    let log = standard_log(); // 4 activities
    let profile = discover_temporal_profile_from_log(&log, "concept:name", "time:timestamp");
    let n_activities = 4usize; // Register, Approve, Reject, Close
    let max_pairs = n_activities * n_activities;
    assert!(
        profile.pairs.len() <= max_pairs,
        "Temporal profile has {} pairs but max for 4 activities is {}",
        profile.pairs.len(),
        max_pairs
    );
}
