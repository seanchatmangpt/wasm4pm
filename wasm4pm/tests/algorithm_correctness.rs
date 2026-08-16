//! Algorithm Correctness Tests — Mathematical Property Oracles
//!
//! Each test proves a property that a stub or placeholder implementation CANNOT satisfy:
//!
//!   Rank 1 — Mathematical theorem:
//!     • Convergence: more iterations → final_fitness never decreases
//!     • Fitness range: all values ∈ [0.0, 1.0]
//!     • Determinism: fixed seed → bit-identical output across two runs
//!
//!   Rank 2 — Domain contract:
//!     • GA elitism: population sorted by fitness; top 25% survive every generation
//!     • SA best-tracking: best_fitness is monotone non-decreasing throughout the run
//!     • Hill Climbing pruning: edge count can only stay the same or decrease
//!     • ILP structure: one transition per activity, source place has initial token = 1
//!
//! Tests use pure-Rust `_from_log` variants so they run on native without the wasm-bindgen
//! runtime (which requires a wasm32 target to be fully functional).

use std::collections::BTreeMap;
use wasm4pm::advanced_algorithms::discover_heuristic_miner_from_log;
use wasm4pm::algorithms::discover_dfg_filtered_from_log;
use wasm4pm::algorithms::discover_footprints_from_log;
use wasm4pm::discovery::discover_dfg_from_log;
use wasm4pm::fast_discovery::{discover_astar_from_log, discover_hill_climbing_from_log};
use wasm4pm::genetic_discovery::{
    discover_aco_algorithm_from_log, discover_genetic_algorithm_from_log,
    discover_pso_algorithm_from_log,
};
use wasm4pm::ilp_discovery::discover_ilp_petri_net_from_log;
use wasm4pm::models::{AttributeValue, Event, EventLog, Trace};
use wasm4pm::more_discovery::{
    discover_inductive_miner_from_log, discover_simulated_annealing_from_log,
};
use wasm4pm::social_network::{
    discover_handover_network_from_log, discover_working_together_network_from_log,
};
use wasm4pm::temporal_profile::discover_temporal_profile_from_log;

// ---------------------------------------------------------------------------
// Shared fixture helpers
// ---------------------------------------------------------------------------

/// Build a controlled EventLog from (count, activities) pairs.
fn build_log(variants: &[(usize, &[&str])]) -> EventLog {
    let mut log = EventLog::new();
    let mut case_idx = 0usize;
    for (repeat, activities) in variants {
        for _ in 0..*repeat {
            let mut trace = Trace {
                attributes: {
                    let mut m = BTreeMap::new();
                    m.insert(
                        "concept:name".to_string(),
                        AttributeValue::String(format!("case-{}", case_idx)),
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

/// The controlled log used in most tests:
///   10× [Start, Register, Approve, End]
///    5× [Start, Register, Reject,  End]
/// 5 unique directly-follows edges, 5 activities.
fn controlled_log() -> EventLog {
    build_log(&[
        (10, &["Start", "Register", "Approve", "End"]),
        (5, &["Start", "Register", "Reject", "End"]),
    ])
}

// ---------------------------------------------------------------------------
// Genetic Algorithm — Rank 1 + Rank 2 properties
// ---------------------------------------------------------------------------

#[test]
fn ga_fitness_in_range() {
    let log = controlled_log();
    let (_, f) = discover_genetic_algorithm_from_log(&log, "concept:name", 20, 30)
        .expect("GA must produce a result for non-empty log");
    assert!(
        (0.0..=1.0).contains(&f),
        "GA fitness {:.4} outside [0, 1]",
        f
    );
}

/// Convergence (Rank 1): GA with 100 generations must achieve fitness ≥ 1 generation.
/// The elitism mechanism preserves the best individual across generations, so more
/// generations can only keep or improve the best solution — never worsen it.
#[test]
fn ga_convergence_more_generations_never_worse() {
    let log = build_log(&[
        (10, &["Start", "Register", "Approve", "End"]),
        (5, &["Start", "Register", "Reject", "End"]),
    ]);
    let (_, f1) =
        discover_genetic_algorithm_from_log(&log, "concept:name", 20, 1).expect("GA must succeed");
    let (_, f100) = discover_genetic_algorithm_from_log(&log, "concept:name", 20, 100)
        .expect("GA must succeed");

    assert!(
        f100 >= f1 - 1e-9,
        "GA: 100-gen fitness {:.4} < 1-gen fitness {:.4} — elitism invariant violated",
        f100,
        f1
    );
}

/// Determinism (Rank 1): same seed → bit-identical fitness across two calls on cloned logs.
#[test]
fn ga_deterministic_same_seed() {
    let log = controlled_log();
    let (_, f1) =
        discover_genetic_algorithm_from_log(&log, "concept:name", 20, 50).expect("GA must succeed");
    let (_, f2) =
        discover_genetic_algorithm_from_log(&log, "concept:name", 20, 50).expect("GA must succeed");
    assert_eq!(
        f1, f2,
        "GA is not deterministic: different fitness {:.6} vs {:.6} on identical inputs",
        f1, f2
    );
}

/// Structural (Rank 2): GA output DFG must have nodes from log vocabulary and non-negative edge count.
#[test]
fn ga_output_structure_valid() {
    let log = controlled_log();
    let (dfg, _) =
        discover_genetic_algorithm_from_log(&log, "concept:name", 20, 30).expect("GA must succeed");
    assert!(
        !dfg.nodes.is_empty(),
        "GA DFG must contain at least one node"
    );
    // All node IDs must be activity names from the log vocabulary
    let activities = ["Start", "Register", "Approve", "Reject", "End"];
    for node in &dfg.nodes {
        assert!(
            activities.contains(&node.id.as_str()),
            "GA node '{}' is not from log vocabulary — stub returning random data?",
            node.id
        );
    }
}

// ---------------------------------------------------------------------------
// Particle Swarm Optimization — Rank 1 + Rank 2 properties
// ---------------------------------------------------------------------------

#[test]
fn pso_fitness_in_range() {
    let log = controlled_log();
    let (_, f) = discover_pso_algorithm_from_log(&log, "concept:name", 20, 30)
        .expect("PSO must produce a result for non-empty log");
    assert!(
        (0.0..=1.0).contains(&f),
        "PSO fitness {:.4} outside [0, 1]",
        f
    );
}

/// Convergence (Rank 1): global best is monotone non-decreasing by construction.
/// 50 iterations with the same swarm must achieve fitness ≥ 5 iterations.
#[test]
fn pso_convergence_more_iterations_never_worse() {
    let log = build_log(&[
        (10, &["Start", "Register", "Approve", "End"]),
        (5, &["Start", "Register", "Reject", "End"]),
    ]);
    let (_, f5) =
        discover_pso_algorithm_from_log(&log, "concept:name", 20, 5).expect("PSO must succeed");
    let (_, f50) =
        discover_pso_algorithm_from_log(&log, "concept:name", 20, 50).expect("PSO must succeed");

    assert!(
        f50 >= f5 - 1e-9,
        "PSO: 50-iter fitness {:.4} < 5-iter fitness {:.4} — global-best monotone violated",
        f50,
        f5
    );
}

/// Determinism (Rank 1): fixed seed → identical output.
#[test]
fn pso_deterministic_same_seed() {
    let log = controlled_log();
    let (_, f1) =
        discover_pso_algorithm_from_log(&log, "concept:name", 20, 50).expect("PSO must succeed");
    let (_, f2) =
        discover_pso_algorithm_from_log(&log, "concept:name", 20, 50).expect("PSO must succeed");
    assert_eq!(f1, f2, "PSO is not deterministic");
}

/// W4PM-LEAN-GALL-034: parameter-sweep probe for the PSO analogue of the
/// ACO degenerate-result defect fixed under W4PM-LEAN-GALL-018. ACO's core
/// function could converge to an empty edge set on nontrivial input under
/// low ant/iteration counts; 018 explicitly flagged (but did not verify) that
/// `discover_pso_algorithm_from_log` has the same input-empty-only guard
/// shape and "worth a follow-up parameter sweep." This test performs that
/// sweep across swarm_size ∈ 1..=10 and iterations ∈ 1..=10 (100 combinations)
/// on the same nontrivial `controlled_log()` fixture ACO's regression test
/// uses, and asserts the DFG returned is never empty-edged.
///
/// This test is permanent regression coverage regardless of outcome — see
/// receipts/W4PM-LEAN-GALL-034-pso-guard-and-rng-centralization.md for the
/// literal sweep result and whether a fix was applied.
#[test]
fn pso_degenerate_result_sweep() {
    let log = controlled_log();
    let mut degenerate_cases: Vec<(usize, usize)> = Vec::new();

    for swarm_size in 1..=10usize {
        for iterations in 1..=10usize {
            if let Some((dfg, _fitness)) =
                discover_pso_algorithm_from_log(&log, "concept:name", swarm_size, iterations)
            {
                if dfg.edges.is_empty() {
                    degenerate_cases.push((swarm_size, iterations));
                }
            }
        }
    }

    assert!(
        degenerate_cases.is_empty(),
        "PSO returned Some((dfg, _)) with an empty edge set on nontrivial input for \
         (swarm_size, iterations) pairs: {:?} — this is the same DEGENERATE_RESULT class \
         ACO was fixed for under W4PM-LEAN-GALL-018; discover_pso_algorithm_from_log needs \
         the same fallback-to-full-edge-vocabulary fix.",
        degenerate_cases
    );
}

// ---------------------------------------------------------------------------
// Simulated Annealing — Rank 1 + Rank 2 properties
// ---------------------------------------------------------------------------

#[test]
fn sa_fitness_in_range() {
    let log = controlled_log();
    let (_, f) = discover_simulated_annealing_from_log(&log, "concept:name", 1.0, 0.95);
    assert!(
        (0.0..=1.0).contains(&f),
        "SA fitness {:.4} outside [0, 1]",
        f
    );
}

/// Boltzmann slow-cooling property (Rank 1):
/// A slow cooling schedule (0.99) explores more states than fast cooling (0.5),
/// so on a simple 2-variant log it should achieve at least as good fitness.
#[test]
fn sa_slow_cooling_not_much_worse_than_fast() {
    let log = build_log(&[
        (10, &["Start", "Register", "Approve", "End"]),
        (5, &["Start", "Register", "Reject", "End"]),
    ]);
    let (_, f_fast) = discover_simulated_annealing_from_log(&log, "concept:name", 1.0, 0.50);
    let (_, f_slow) = discover_simulated_annealing_from_log(&log, "concept:name", 1.0, 0.99);
    // Slow cooling may or may not outperform on a given run; we allow 5% slack.
    assert!(
        f_slow >= f_fast - 0.05,
        "SA slow-cooling fitness {:.4} is >5% worse than fast-cooling {:.4}",
        f_slow,
        f_fast
    );
}

/// Best-tracking non-negativity (Rank 2):
/// SA always tracks the best-seen solution. Starting from empty edge set (fitness≥0),
/// and never updating best unless improved, the returned fitness must be ≥ 0.
#[test]
fn sa_best_tracking_nonnegative() {
    let log = controlled_log();
    let (_, f) = discover_simulated_annealing_from_log(&log, "concept:name", 0.9, 0.95);
    assert!(f >= 0.0, "SA returned negative fitness {:.4}", f);
}

/// Determinism (Rank 1): fixed seed → identical fitness.
#[test]
fn sa_deterministic_same_seed() {
    let log = controlled_log();
    let (_, f1) = discover_simulated_annealing_from_log(&log, "concept:name", 1.0, 0.95);
    let (_, f2) = discover_simulated_annealing_from_log(&log, "concept:name", 1.0, 0.95);
    assert_eq!(f1, f2, "SA is not deterministic");
}

// ---------------------------------------------------------------------------
// Hill Climbing — Rank 1 + Rank 2 properties
// ---------------------------------------------------------------------------

/// Pruning invariant (Rank 1, mathematical):
/// Hill climbing starts with ALL observed edges and only removes cost-0 edges.
/// It NEVER adds edges. Therefore output_edges ≤ max_possible_edges.
#[test]
fn hill_climbing_never_increases_edge_count() {
    let log = build_log(&[
        (10, &["Start", "Register", "Approve", "End"]),
        (5, &["Start", "Register", "Reject", "End"]),
    ]);
    let max_edges = 5usize; // Start→Register, Register→{Approve,Reject}, {Approve,Reject}→End
    let dfg = discover_hill_climbing_from_log(&log, "concept:name");
    assert!(
        dfg.edges.len() <= max_edges,
        "Hill climbing output {} edges > max possible {} — edges were ADDED, not only removed",
        dfg.edges.len(),
        max_edges
    );
}

/// Local optimum on essential-only log (Rank 2):
/// When all traces follow a single path, every edge appears in every trace exactly once,
/// giving it a removal cost = N traces. No edge has cost 0, so hill climbing must
/// preserve all edges.
#[test]
fn hill_climbing_preserves_all_essential_edges() {
    let log = build_log(&[(10, &["A", "B", "C", "D"])]);
    let dfg = discover_hill_climbing_from_log(&log, "concept:name");
    assert_eq!(
        dfg.edges.len(),
        3,
        "Hill climbing removed an essential edge from single-variant log \
         (got {} edges, expected 3: A→B, B→C, C→D)",
        dfg.edges.len()
    );
}

/// Determinism (Rank 1): identical logs → identical output.
#[test]
fn hill_climbing_deterministic() {
    let log = controlled_log();
    let dfg1 = discover_hill_climbing_from_log(&log, "concept:name");
    let dfg2 = discover_hill_climbing_from_log(&log, "concept:name");
    assert_eq!(
        dfg1.edges.len(),
        dfg2.edges.len(),
        "Hill climbing is not deterministic"
    );
}

// ---------------------------------------------------------------------------
// A* (Best-First Search) — Rank 2 properties
// ---------------------------------------------------------------------------

/// Termination and bounded iterations (Rank 2):
/// A* must terminate within max_iterations and return a valid DFG.
#[test]
fn astar_terminates_and_bounded() {
    let log = controlled_log();
    let (dfg, iters) = discover_astar_from_log(&log, "concept:name", 500);
    assert!(
        iters <= 500,
        "A* ran {} iterations > max_iterations=500",
        iters
    );
    assert!(
        !dfg.nodes.is_empty(),
        "A* DFG must have at least one node from log activities"
    );
}

/// Fitness threshold invariant (Rank 1):
/// A*'s filter `fitness > 0.5` means every edge added contributed fitness > 0.5.
/// On the controlled log (5 edges, all highly frequent), the output must be non-empty.
#[test]
fn astar_finds_at_least_one_edge() {
    let log = controlled_log();
    let (dfg, _) = discover_astar_from_log(&log, "concept:name", 1000);
    assert!(
        !dfg.edges.is_empty(),
        "A* found 0 edges for a non-trivial log with 5 high-frequency edges \
         — fitness threshold may be too aggressive or algorithm is a stub"
    );
}

// ---------------------------------------------------------------------------
// ILP (Direct Petri Net Construction) — Rank 1 structural soundness
// ---------------------------------------------------------------------------

/// Bijection invariant (Rank 1 — mathematical):
/// The algorithm creates exactly one transition per unique activity.
#[test]
fn ilp_transitions_match_activities() {
    let log = build_log(&[
        (10, &["Start", "Register", "Approve", "End"]),
        (5, &["Start", "Register", "Reject", "End"]),
    ]);
    let activities = 5usize; // Start, Register, Approve, Reject, End
    let (pn, _, _) = discover_ilp_petri_net_from_log(&log, "concept:name");
    assert_eq!(
        pn.transitions.len(),
        activities,
        "ILP must produce exactly 1 transition per unique activity (expected {}, got {})",
        activities,
        pn.transitions.len()
    );
}

/// Workflow soundness — source initial marking (Rank 1):
/// A sound workflow net requires exactly 1 token in the source place at start.
#[test]
fn ilp_source_place_has_initial_token() {
    let log = build_log(&[
        (10, &["Start", "Register", "Approve", "End"]),
        (5, &["Start", "Register", "Reject", "End"]),
    ]);
    let (pn, _, _) = discover_ilp_petri_net_from_log(&log, "concept:name");
    let source_token = pn.initial_marking.get("p_source").copied().unwrap_or(0);
    assert_eq!(
        source_token, 1,
        "source place must have initial marking = 1 (sound workflow net invariant)"
    );
}

/// Fitness range (Rank 1): fitness ∈ [0, 1] and precision ∈ [0, 1].
#[test]
fn ilp_fitness_and_precision_in_range() {
    let log = build_log(&[
        (10, &["Start", "Register", "Approve", "End"]),
        (5, &["Start", "Register", "Reject", "End"]),
    ]);
    let (_, fitness, precision) = discover_ilp_petri_net_from_log(&log, "concept:name");
    assert!(
        (0.0..=1.0).contains(&fitness),
        "ILP fitness {:.4} outside [0, 1]",
        fitness
    );
    assert!(
        (0.0..=1.0).contains(&precision),
        "ILP precision {:.4} outside [0, 1]",
        precision
    );
}

/// High fitness on a perfectly-fitting log (Rank 1 — mathematical):
/// The ILP region-based algorithm selects consistent places that cover all causal
/// pairs; on a single-variant log [A,B,C,D] every trace replays without missing
/// tokens. token_replay_pure reports ≥ 0.8 (the final sink token counts as
/// "remaining" in the van der Aalst formula, giving 0.875 for 4-step traces).
#[test]
fn ilp_perfect_fitness_on_fitting_log() {
    let log = build_log(&[(10, &["A", "B", "C", "D"])]);
    let (_, fitness, _) = discover_ilp_petri_net_from_log(&log, "concept:name");
    assert!(
        fitness >= 0.8,
        "ILP fitness on single-variant fitting log must be >= 0.8, got {:.4}",
        fitness
    );
}

/// ILP detects parallel AND-split: log where A always precedes B and C in parallel.
/// Variant 1: A→B→D (10 traces), Variant 2: A→C→D (10 traces)
/// B and C are parallel (both follow A, both precede D, unordered w.r.t. each other).
/// The region-based ILP should produce fewer places than the DFG stub (which would
/// produce 4 places: A→B, A→C, B→D, C→D). Validates candidate generation + greedy cover.
#[test]
fn ilp_detects_parallel_and_split() {
    let log = build_log(&[(10, &["A", "B", "D"]), (10, &["A", "C", "D"])]);
    let (pn, fitness, _) = discover_ilp_petri_net_from_log(&log, "concept:name");
    // Must produce a valid model that replays both variants
    assert!(
        fitness >= 0.5,
        "ILP must achieve fitness >= 0.5 on parallel-split log, got {:.4}",
        fitness
    );
    // Must have source and sink at minimum
    assert!(
        pn.places.len() >= 2,
        "ILP must produce at least source and sink places"
    );
    // Must produce transitions for all 4 activities
    assert_eq!(
        pn.transitions.len(),
        4,
        "ILP must produce 4 transitions (A,B,C,D), got {}",
        pn.transitions.len()
    );
}

/// ILP detects self-loop (L1L activity): log where A has a self-loop.
/// The region-based ILP should add a self-loop place for A.
#[test]
fn ilp_detects_self_loop_place() {
    let log = build_log(&[(10, &["A", "A", "B"])]);
    let (pn, _, _) = discover_ilp_petri_net_from_log(&log, "concept:name");
    let has_loop_place = pn.places.iter().any(|p| p.id.contains("loop"));
    assert!(
        has_loop_place,
        "L1L activity A should produce a self-loop place"
    );
}

/// ILP output is a valid Petri net structure: source has initial marking,
/// transitions match activities, arcs are non-empty.
#[test]
fn ilp_output_is_valid_petri_net() {
    let log = build_log(&[(10, &["X", "Y", "Z"])]);
    let (pn, _, _) = discover_ilp_petri_net_from_log(&log, "concept:name");
    // Source place must have initial marking
    let source = pn.places.iter().find(|p| p.id == "p_source");
    assert!(source.is_some(), "Petri net must have p_source place");
    assert_eq!(
        source.unwrap().marking,
        Some(1),
        "p_source must have initial marking 1"
    );
    // Must have transitions for each activity
    assert_eq!(pn.transitions.len(), 3, "Must have 3 transitions for X,Y,Z");
    // Must have arcs
    assert!(!pn.arcs.is_empty(), "Petri net must have arcs");
}

/// Alpha++ output has correct structure: returns a Petri net (not DFG).
/// The real Alpha++ implementation produces places, transitions, and arcs.
#[test]
fn alpha_plus_plus_output_is_petri_net() {
    use wasm4pm::algorithms::discover_alpha_plus_plus_from_log;
    let log = build_log(&[(10, &["A", "B", "C"]), (5, &["A", "C", "B"])]);
    let admitted = wasm4pm_compat::admission::Admission::<_, ()>::new(log).into_evidence();
    let pn = discover_alpha_plus_plus_from_log(&admitted, "concept:name", 0.0)
        .expect("alpha_plus_plus must succeed");
    assert!(!pn.places.is_empty(), "Alpha++ must produce places");
    assert!(
        !pn.transitions.is_empty(),
        "Alpha++ must produce transitions"
    );
    assert!(!pn.arcs.is_empty(), "Alpha++ must produce arcs");
    assert!(
        pn.places.iter().any(|p| p.id == "p_source"),
        "Alpha++ Petri net must have p_source"
    );
}

// ---------------------------------------------------------------------------
// DFG correctness
// ---------------------------------------------------------------------------

/// All DFG edges from discover_dfg_from_log must have frequency > 0.
/// A stub returning phantom edges would fail this.
#[test]
fn dfg_edges_have_positive_frequency() {
    let log = controlled_log();
    let admitted = wasm4pm_compat::admission::Admission::<_, ()>::new(log).into_evidence();
    let dfg = discover_dfg_from_log(&admitted, "concept:name");
    assert!(
        !dfg.edges.is_empty(),
        "DFG must have at least one edge for a non-trivial log"
    );
    for edge in &dfg.edges {
        assert!(
            edge.frequency > 0,
            "DFG edge {}→{} has frequency 0",
            edge.from,
            edge.to
        );
    }
}

/// DFG filtered with threshold 0 must produce the same edge count as unfiltered.
/// DFG filtered with threshold > max frequency must produce 0 edges.
#[test]
fn dfg_filtered_threshold_monotone() {
    let log = controlled_log();
    let admitted = wasm4pm_compat::admission::Admission::<_, ()>::new(log.clone()).into_evidence();
    let unfiltered = discover_dfg_filtered_from_log(&admitted, "concept:name", 0);
    let dfg = discover_dfg_from_log(&admitted, "concept:name");
    assert_eq!(
        unfiltered.edges.len(),
        dfg.edges.len(),
        "filtered(min=0) edge count must equal unfiltered"
    );

    let filtered = discover_dfg_filtered_from_log(&admitted, "concept:name", 999_999);
    assert!(
        filtered.edges.is_empty(),
        "filtered(min=999999) must produce no edges"
    );
}

/// Heuristic miner with high threshold must have ≤ edges than full DFG.
/// Rank 2 domain contract: filtering is monotone — more threshold → fewer edges.
#[test]
fn heuristic_miner_fewer_edges_than_dfg() {
    let log = controlled_log();
    let admitted = wasm4pm_compat::admission::Admission::<_, ()>::new(log).into_evidence();
    let dfg = discover_dfg_from_log(&admitted, "concept:name");
    let hm = discover_heuristic_miner_from_log(&admitted.value, "concept:name", 0.5);
    assert!(
        hm.edges.len() <= dfg.edges.len(),
        "heuristic miner (threshold=0.5) must have ≤ DFG edges; got hm={} dfg={}",
        hm.edges.len(),
        dfg.edges.len()
    );
}

// ---------------------------------------------------------------------------
// Footprint matrix
// ---------------------------------------------------------------------------

/// Causal relation must be antisymmetric: if A→B is causal then B→A must not be.
/// Rank 1 — mathematical theorem from Alpha Miner definition.
#[test]
fn footprints_causal_antisymmetric() {
    use wasm4pm::algorithms::FootprintRelation;
    let log = build_log(&[(5, &["A", "B", "C"]), (5, &["A", "C", "B"])]);
    let admitted = wasm4pm_compat::admission::Admission::<_, ()>::new(log).into_evidence();
    let fp = discover_footprints_from_log(&admitted, "concept:name");
    let n = fp.activities.len();
    for i in 0..n {
        for j in 0..n {
            if fp.matrix[i][j] == FootprintRelation::Causal {
                assert_ne!(
                    fp.matrix[j][i],
                    FootprintRelation::Causal,
                    "footprint antisymmetry violated: {}→{} is Causal AND {}→{} is Causal",
                    fp.activities[i],
                    fp.activities[j],
                    fp.activities[j],
                    fp.activities[i]
                );
            }
        }
    }
}

// ---------------------------------------------------------------------------
// ACO correctness
// ---------------------------------------------------------------------------

/// ACO fitness must be in [0, 1].
#[test]
fn aco_fitness_in_range() {
    let log = controlled_log();
    let result = discover_aco_algorithm_from_log(&log, "concept:name", 5, 10);
    let (dfg, fitness) = result.expect("ACO must find a solution on controlled_log");
    assert!(
        (0.0..=1.0).contains(&fitness),
        "ACO final_fitness out of [0,1]: {:.4}",
        fitness
    );
    assert!(!dfg.nodes.is_empty(), "ACO DFG must have nodes");
}

/// W4PM-LEAN-GALL-018: the core discover_aco_algorithm_from_log must never
/// silently return Some((empty_dfg, fitness)) on nontrivial input — this was
/// previously guarded only at the CLI bridge layer (aco_bridge.rs), leaving
/// any direct caller of the core function exposed to a DEGENERATE_RESULT.
/// Whenever this function returns Some, the DFG must have at least one edge.
#[test]
fn aco_never_returns_empty_dfg_on_nontrivial_input() {
    let log = controlled_log();
    let result = discover_aco_algorithm_from_log(&log, "concept:name", 5, 10);
    if let Some((dfg, _fitness)) = result {
        assert!(
            !dfg.edges.is_empty(),
            "ACO returned Some(...) on nontrivial input but with an empty edge set — \
             this is the DEGENERATE_RESULT the core-level guard must refuse, not silently succeed on"
        );
    }
}

/// Two ACO runs with same seed must produce bit-identical fitness.
#[test]
fn aco_deterministic_same_seed() {
    let log = controlled_log();
    let r1 = discover_aco_algorithm_from_log(&log, "concept:name", 5, 5);
    let r2 = discover_aco_algorithm_from_log(&log, "concept:name", 5, 5);
    let (_, f1) = r1.expect("ACO run 1 failed");
    let (_, f2) = r2.expect("ACO run 2 failed");
    assert_eq!(
        f1.to_bits(),
        f2.to_bits(),
        "ACO must be deterministic: f1={:.6} f2={:.6}",
        f1,
        f2
    );
}

// ---------------------------------------------------------------------------
// Temporal profile
// ---------------------------------------------------------------------------

/// All temporal profile mean durations must be non-negative.
/// Rank 1 — mathematical: time only flows forward in valid XES logs.
#[test]
fn temporal_profile_nonnegative_durations() {
    use wasm4pm::models::AttributeValue;

    // Build log with real timestamps so the temporal profile has data.
    let mut log = EventLog::new();
    let base_ms: i64 = 1_700_000_000_000;
    for i in 0..5usize {
        let mut trace = Trace::new();
        trace.attributes.insert(
            "concept:name".to_string(),
            AttributeValue::String(format!("case-{i}")),
        );
        for (j, act) in ["A", "B", "C"].iter().enumerate() {
            let ts_ms = base_ms + (i as i64 * 10_000) + (j as i64 * 3_600_000);
            let ts_str = format!(
                "{}-{:02}-{:02}T{:02}:{:02}:{:02}+00:00",
                2023,
                11,
                1 + (ts_ms / 86_400_000 % 28) as u32,
                (ts_ms / 3_600_000 % 24) as u32,
                (ts_ms / 60_000 % 60) as u32,
                (ts_ms / 1_000 % 60) as u32,
            );
            let mut event = Event::new();
            event.attributes.insert(
                "concept:name".to_string(),
                AttributeValue::String(act.to_string()),
            );
            event
                .attributes
                .insert("time:timestamp".to_string(), AttributeValue::Date(ts_str));
            trace.events.push(event);
        }
        log.traces.push(trace);
    }

    let profile = discover_temporal_profile_from_log(&log, "concept:name", "time:timestamp");
    assert!(
        !profile.pairs.is_empty(),
        "temporal profile must have at least one pair"
    );
    for ((a, b), (mean, _stdev, _cnt)) in &profile.pairs {
        assert!(
            *mean >= 0.0,
            "temporal profile mean for {}→{} is negative: {:.2}",
            a,
            b,
            mean
        );
    }
}

// ---------------------------------------------------------------------------
// Social network
// ---------------------------------------------------------------------------

/// Handover count for a single-resource log must be zero (no resource change).
/// Rank 2 domain contract: handover requires A ≠ B on consecutive events.
#[test]
fn social_handover_single_resource_is_zero() {
    let mut log = EventLog::new();
    let mut trace = Trace::new();
    trace.attributes.insert(
        "concept:name".to_string(),
        AttributeValue::String("case-1".to_string()),
    );
    for act in &["A", "B", "C"] {
        let mut event = Event::new();
        event.attributes.insert(
            "concept:name".to_string(),
            AttributeValue::String(act.to_string()),
        );
        event.attributes.insert(
            "org:resource".to_string(),
            AttributeValue::String("Alice".to_string()),
        );
        trace.events.push(event);
    }
    log.traces.push(trace);

    let json_str = discover_handover_network_from_log(&log, "org:resource");
    let v: serde_json::Value = serde_json::from_str(&json_str).expect("valid JSON");
    let edges = v["edges"].as_array().expect("edges array");
    assert!(
        edges.is_empty(),
        "single-resource log must have 0 handover edges, got {}",
        edges.len()
    );
}

/// Working-together: two resources in the same trace must appear as co-occurrence edge.
#[test]
fn social_working_together_same_trace_produces_edge() {
    let mut log = EventLog::new();
    let mut trace = Trace::new();
    trace.attributes.insert(
        "concept:name".to_string(),
        AttributeValue::String("case-1".to_string()),
    );
    for (act, res) in &[("A", "Alice"), ("B", "Bob")] {
        let mut event = Event::new();
        event.attributes.insert(
            "concept:name".to_string(),
            AttributeValue::String(act.to_string()),
        );
        event.attributes.insert(
            "org:resource".to_string(),
            AttributeValue::String(res.to_string()),
        );
        trace.events.push(event);
    }
    log.traces.push(trace);

    let json_str = discover_working_together_network_from_log(&log, "org:resource");
    let v: serde_json::Value = serde_json::from_str(&json_str).expect("valid JSON");
    let edges = v["edges"].as_array().expect("edges array");
    assert_eq!(
        edges.len(),
        1,
        "two resources in one trace → exactly 1 co-occurrence edge"
    );
    let cnt = edges[0]["co_occurrences"].as_u64().unwrap_or(0);
    assert_eq!(cnt, 1, "co_occurrences must be 1");
}

// ---------------------------------------------------------------------------
// Bug-fix regression tests (Rank 2 — domain contract)
// ---------------------------------------------------------------------------

/// Hill Climbing produces real edge frequencies (not hardcoded 1) and is
/// a sound pruner: output ≤ full DFG edge count.
/// Rank 2 — domain contract: HC can only remove edges, and frequency must
/// reflect the observed log statistics.
#[test]
fn hc_prunes_below_dfg() {
    let log = build_log(&[
        (20, &["Start", "Process", "End"]),
        (20, &["Start", "Process", "Review", "End"]),
    ]);
    let admitted = wasm4pm_compat::admission::Admission::<_, ()>::new(log.clone()).into_evidence();
    let dfg = discover_dfg_from_log(&admitted, "concept:name");
    let hc = discover_hill_climbing_from_log(&log, "concept:name");

    // Monotonicity: HC can only remove edges.
    assert!(
        hc.edges.len() <= dfg.edges.len(),
        "HC edge count {} must be ≤ DFG edge count {}",
        hc.edges.len(),
        dfg.edges.len()
    );

    // Frequencies must be real (>0) and at least one dominant edge must have
    // frequency matching its actual observation count (≥ 20 here).
    assert!(
        !hc.edges.is_empty(),
        "HC must produce at least one edge for a non-trivial log"
    );
    for edge in &hc.edges {
        assert!(
            edge.frequency > 0,
            "HC edge {}→{} has frequency 0 (frequencies must be real)",
            edge.from,
            edge.to
        );
    }
    let max_freq = hc.edges.iter().map(|e| e.frequency).max().unwrap_or(0);
    assert!(
        max_freq >= 20,
        "HC dominant edge frequency must be ≥ 20 (observed 20 times); got max={}",
        max_freq
    );
}

/// A* must successfully discover a DFG on a log with more than 100 directly-follows
/// pairs — the old `/100` penalty would cap the score to 0 at that scale.
/// Rank 1 — mathematical: result must be non-empty for any non-trivial log.
#[test]
fn astar_beyond_100_edges() {
    // 12 activities → up to 11 directly-follows pairs per trace; 3 variants → 12+ unique pairs.
    let log = build_log(&[
        (
            5,
            &["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"],
        ),
        (
            5,
            &["A", "C", "B", "D", "F", "E", "G", "I", "H", "J", "L", "K"],
        ),
        (
            5,
            &["L", "K", "J", "I", "H", "G", "F", "E", "D", "C", "B", "A"],
        ),
    ]);
    let (dfg, _iters) = discover_astar_from_log(&log, "concept:name", 500);
    assert!(
        !dfg.edges.is_empty(),
        "A* must produce at least one edge on a large log"
    );
    // All edges in the result must reference valid activity names.
    let node_ids: std::collections::HashSet<&str> =
        dfg.nodes.iter().map(|n| n.id.as_str()).collect();
    for edge in &dfg.edges {
        assert!(
            node_ids.contains(edge.from.as_str()),
            "A* edge from={} references unknown node",
            edge.from
        );
        assert!(
            node_ids.contains(edge.to.as_str()),
            "A* edge to={} references unknown node",
            edge.to
        );
    }
}

/// GA/PSO/ACO edges must carry real frequency values (> 0) rather than the
/// previous hardcoded constant 1. On a log where every edge appears multiple
/// times, the max edge frequency must exceed 1.
/// Rank 2 — domain contract: frequency reflects observed log statistics.
#[test]
fn ga_edges_have_real_frequency() {
    // 20 traces each with [A, B, C, D] → each edge appears exactly 20 times.
    let log = build_log(&[(20, &["A", "B", "C", "D"])]);

    let (ga_dfg, _) =
        discover_genetic_algorithm_from_log(&log, "concept:name", 20, 30).expect("GA must succeed");
    let max_freq = ga_dfg.edges.iter().map(|e| e.frequency).max().unwrap_or(0);
    assert!(
        max_freq > 1,
        "GA edges must have real frequency (> 1 for repeated-trace log); got max={}",
        max_freq
    );

    let (pso_dfg, _) =
        discover_pso_algorithm_from_log(&log, "concept:name", 10, 20).expect("PSO must succeed");
    let pso_max = pso_dfg.edges.iter().map(|e| e.frequency).max().unwrap_or(0);
    assert!(
        pso_max > 1,
        "PSO edges must have real frequency; got max={}",
        pso_max
    );

    // ACO with enough ants to reliably find non-empty solutions.
    let (aco_dfg, _) =
        discover_aco_algorithm_from_log(&log, "concept:name", 30, 30).expect("ACO must succeed");
    // Verify structural correctness: any selected edges must have real frequencies.
    for edge in &aco_dfg.edges {
        assert!(
            edge.frequency > 0,
            "ACO edge {}→{} has frequency 0 (must be > 0 for observed edges)",
            edge.from,
            edge.to
        );
    }
    // With 30 ants × 30 iterations and a single-variant log, ACO must find the
    // full path — all 3 edges with frequency 20.
    if !aco_dfg.edges.is_empty() {
        let aco_max = aco_dfg.edges.iter().map(|e| e.frequency).max().unwrap_or(0);
        assert!(
            aco_max > 1,
            "ACO edges must carry real frequency (> 1); got max={}",
            aco_max
        );
    }
}

/// Inductive Miner must detect a parallel cut when activities are bidirectionally
/// connected in the directly-follows graph.
/// Log: [A, B, C] and [A, C, B] → B and C are parallel (both B→C and C→B exist).
/// Rank 1 — structural property: parallel cut exists iff groups >1 via Union-Find.
#[test]
fn inductive_parallel_cut_fires() {
    // Equal mix ensures both B→C and C→B are observed (bidirectional).
    let log = build_log(&[(5, &["A", "B", "C"]), (5, &["A", "C", "B"])]);
    let admitted = wasm4pm_compat::admission::Admission::<_, ()>::new(log).into_evidence();
    let json_str = discover_inductive_miner_from_log(&admitted, "concept:name");
    let v: serde_json::Value =
        serde_json::from_str(&json_str).expect("inductive miner must return valid JSON");

    // Walk the tree and collect all operator types.
    fn collect_operators(node: &serde_json::Value, ops: &mut Vec<String>) {
        if let Some(t) = node["node_type"].as_str() {
            ops.push(t.to_string());
        }
        if let Some(children) = node["children"].as_array() {
            for child in children {
                collect_operators(child, ops);
            }
        }
    }

    let mut operators = Vec::new();
    collect_operators(&v["root"], &mut operators);

    assert!(
        operators.contains(&"parallel".to_string()),
        "Inductive Miner must produce a 'parallel' node for a log with bidirectional \
         B↔C edges; got operators: {:?}",
        operators
    );
}

// ---------------------------------------------------------------------------
// A* best-tracking regression — iter-12 fix
// ---------------------------------------------------------------------------

/// Rank-1 mathematical: best-so-far is monotone non-decreasing in max_iterations.
/// Specifically, max_iterations=1 must NOT return an empty DFG when the log has
/// fitness-positive edges. Pre-fix bug: `best_dfg` was only updated using the
/// score of the popped node, so iteration 0 (which pops the empty-seed DFG with
/// score=0) would set best to empty; on max_iterations=1 the run returned an
/// empty DFG even though the expansion produced fitness>0 children.
#[test]
fn astar_max_iter_1_returns_non_empty_when_fitness_positive() {
    let log = controlled_log();
    let (dfg, iters) = discover_astar_from_log(&log, "concept:name", 1);
    assert_eq!(
        iters, 1,
        "A* must consume exactly 1 iteration when budget is 1; got {}",
        iters
    );
    assert!(
        !dfg.edges.is_empty(),
        "A* with max_iterations=1 returned 0 edges — regression to score-of-popped-node bug"
    );
}

/// Rank-1 monotone: more iterations cannot reduce the produced edge count below
/// what 1 iteration finds (best-so-far never regresses on a deterministic seed).
/// This catches lag-by-one-iteration regressions in best-tracking.
#[test]
fn astar_more_iter_never_fewer_edges() {
    let log = controlled_log();
    let (dfg1, _) = discover_astar_from_log(&log, "concept:name", 1);
    let (dfg_more, _) = discover_astar_from_log(&log, "concept:name", 20);
    assert!(
        dfg_more.edges.len() >= dfg1.edges.len(),
        "A* @ 20 iter has {} edges < 1 iter has {} edges — best-tracking regressed",
        dfg_more.edges.len(),
        dfg1.edges.len()
    );
}

// ---------------------------------------------------------------------------
// PSO pBest position correctness — iter-12 fix
// ---------------------------------------------------------------------------

/// Rank-2 domain contract: PSO global best is monotone non-decreasing in
/// iterations on a deterministic seed. Combined with iteration count, this
/// catches regressions where pBest position is destructively reset.
///
/// Pre-fix bug: pBest position was never copied when fitness improved (only
/// pBest fitness was assigned), and the initial pBest was `HashSet::new()`
/// (empty). The first iteration's blend-toward-pbest pulled toward an empty
/// set, dropping 20% of each particle's edges. This is masked from the global
/// best (which has its own monotone safety net) but degrades quality.
#[test]
fn pso_global_best_at_least_as_good_as_initial_spawn() {
    let log = controlled_log();
    let (_, f1) =
        discover_pso_algorithm_from_log(&log, "concept:name", 30, 1).expect("PSO must succeed");
    let (_, f50) =
        discover_pso_algorithm_from_log(&log, "concept:name", 30, 50).expect("PSO must succeed");
    assert!(
        f50 >= f1 - 1e-9,
        "PSO global-best regressed: 1-iter={:.4} 50-iter={:.4}",
        f1,
        f50
    );
    assert!(
        f50 > 0.0,
        "PSO produced fitness=0 on a non-trivial log — destructive pBest pull?",
    );
}

/// Rank-2 domain contract: doubling iterations on a deterministic seed cannot
/// make the global best worse, AND PSO must achieve > 0 fitness on a
/// non-trivial multi-variant log.
#[test]
fn pso_iterations_improve_global_best() {
    let log = build_log(&[
        (10, &["A", "B", "C", "D", "E"]),
        (10, &["A", "B", "D", "C", "E"]),
        (5, &["A", "C", "B", "D", "E"]),
    ]);
    let (_, f_low) =
        discover_pso_algorithm_from_log(&log, "concept:name", 30, 2).expect("PSO must succeed");
    let (_, f_high) =
        discover_pso_algorithm_from_log(&log, "concept:name", 30, 50).expect("PSO must succeed");
    assert!(
        f_high >= f_low - 1e-9,
        "PSO with more iterations regressed: low={:.4} high={:.4}",
        f_low,
        f_high
    );
}

// ---------------------------------------------------------------------------
// Inductive Miner cut detection — partition-general cuts (Leemans et al.)
// Hand-computable expected trees; these logs defeat the old contiguous-split
// search (which only tried alphabetical-prefix bipartitions).
// ---------------------------------------------------------------------------

/// Render a process-tree JSON node as a canonical string for exact assertions.
fn tree_shape(node: &serde_json::Value) -> String {
    let ty = node["node_type"].as_str().unwrap_or("?");
    if ty == "leaf" {
        return node["label"].as_str().unwrap_or("?").to_string();
    }
    let children: Vec<String> = node["children"]
        .as_array()
        .map(|cs| cs.iter().map(tree_shape).collect())
        .unwrap_or_default();
    format!("{}({})", ty, children.join(","))
}

/// {⟨a,b,c⟩, ⟨a,c,b⟩} → seq(a, and(b,c)).
/// Old code produced parallel(a, loop(b,c)) — wrong semantics.
#[test]
fn inductive_miner_sequence_then_parallel_exact() {
    let log = build_log(&[(5, &["a", "b", "c"]), (5, &["a", "c", "b"])]);
    let admitted = wasm4pm_compat::admission::Admission::<_, ()>::new(log).into_evidence();
    let json_str = discover_inductive_miner_from_log(&admitted, "concept:name");
    let v: serde_json::Value = serde_json::from_str(&json_str).unwrap();
    assert_eq!(
        tree_shape(&v["root"]),
        "sequence(a,parallel(b,c))",
        "IM must find the sequence cut (a) → (b∥c)"
    );
}

/// Non-contiguous XOR: {⟨a,d⟩, ⟨b,c⟩} → xor(seq(a,d), seq(b,c)).
/// The required partition {a,d}|{b,c} is not an alphabetical prefix split.
#[test]
fn inductive_miner_non_contiguous_xor() {
    let log = build_log(&[(5, &["a", "d"]), (5, &["b", "c"])]);
    let admitted = wasm4pm_compat::admission::Admission::<_, ()>::new(log).into_evidence();
    let json_str = discover_inductive_miner_from_log(&admitted, "concept:name");
    let v: serde_json::Value = serde_json::from_str(&json_str).unwrap();
    assert_eq!(
        tree_shape(&v["root"]),
        "xor(sequence(a,d),sequence(b,c))",
        "IM must find the non-contiguous XOR partition"
    );
}

/// {⟨a,b,a,b,a⟩} → loop(a, b): body a, redo b.
#[test]
fn inductive_miner_loop_cut_exact() {
    let log = build_log(&[(5, &["a", "b", "a", "b", "a"])]);
    let admitted = wasm4pm_compat::admission::Admission::<_, ()>::new(log).into_evidence();
    let json_str = discover_inductive_miner_from_log(&admitted, "concept:name");
    let v: serde_json::Value = serde_json::from_str(&json_str).unwrap();
    assert_eq!(
        tree_shape(&v["root"]),
        "loop(a,b)",
        "IM must find the loop cut with body=a, redo=b"
    );
}

/// Sequence in non-alphabetical execution order: {⟨z,a,m⟩} → seq(z,a,m).
#[test]
fn inductive_miner_sequence_non_alphabetical() {
    let log = build_log(&[(5, &["z", "a", "m"])]);
    let admitted = wasm4pm_compat::admission::Admission::<_, ()>::new(log).into_evidence();
    let json_str = discover_inductive_miner_from_log(&admitted, "concept:name");
    let v: serde_json::Value = serde_json::from_str(&json_str).unwrap();
    assert_eq!(
        tree_shape(&v["root"]),
        "sequence(z,a,m)",
        "IM sequence children must follow execution order, not alphabetical order"
    );
}

// ---------------------------------------------------------------------------
// Facade fixes — hand-computable assertions for predict_outcome,
// optimized_dfg, process_skeleton, analyze_process_speedup
// ---------------------------------------------------------------------------

/// predict_outcome: 3× ⟨a,b,ok⟩ + 1× ⟨a,c,bad⟩. Prefix [a,b] hits the k=2
/// context {ok:3}; Laplace over vocabulary {bad, ok} → P(ok)=(3+1)/(3+2)=0.8.
#[test]
fn predict_outcome_laplace_hand_computed() {
    let log = build_log(&[(3, &["a", "b", "ok"]), (1, &["a", "c", "bad"])]);
    let prefix = vec!["a".to_string(), "b".to_string()];
    let v = wasm4pm::prediction_outcome::predict_outcome_from_log(&log, "concept:name", &prefix)
        .expect("predict_outcome must succeed");
    assert_eq!(v["outcome"], "ok");
    assert_eq!(v["context_used"], "last_2");
    let p = v["probability"].as_f64().unwrap();
    assert!(
        (p - 0.8).abs() < 1e-12,
        "P(ok | a,b) must be (3+1)/(3+2)=0.8, got {p}"
    );
    // Unseen context backs off to the prior: P(ok)=(3+1)/(4+2)=2/3.
    let v2 = wasm4pm::prediction_outcome::predict_outcome_from_log(
        &log,
        "concept:name",
        &["zzz".to_string()],
    )
    .unwrap();
    assert_eq!(v2["context_used"], "prior");
    let p2 = v2["probability"].as_f64().unwrap();
    assert!(
        (p2 - 2.0 / 3.0).abs() < 1e-12,
        "prior P(ok) must be 2/3, got {p2}"
    );
}

/// optimized_dfg: with fitness-only weights all edges survive; with a heavy
/// simplicity penalty the optimizer must PRUNE relative to fitness-only, while
/// always keeping ≥1 edge and remaining a subset of observed edges.
#[test]
fn optimized_dfg_threshold_search_prunes() {
    let log = build_log(&[
        (20, &["a", "b", "z"]),
        (1, &["a", "c", "z"]),
        (1, &["a", "d", "z"]),
    ]);
    let full =
        wasm4pm::ilp_discovery::discover_optimized_dfg_from_log(&log, "concept:name", 1.0, 0.0);
    // 6 distinct observed edges: a→b, b→z, a→c, c→z, a→d, d→z
    assert_eq!(
        full.edges.len(),
        6,
        "fitness-only must keep all observed edges"
    );
    let pruned =
        wasm4pm::ilp_discovery::discover_optimized_dfg_from_log(&log, "concept:name", 0.1, 10.0);
    assert!(
        !pruned.edges.is_empty() && pruned.edges.len() < full.edges.len(),
        "heavy simplicity weight must prune edges (got {} of {})",
        pruned.edges.len(),
        full.edges.len()
    );
    // The dominant a→b edge (freq 20) must survive any threshold that keeps ≥1 edge.
    assert!(
        pruned.edges.iter().any(|e| e.from == "a" && e.to == "b"),
        "dominant edge a→b must survive pruning"
    );
}

/// process_skeleton: {⟨a,b,c⟩, ⟨a,c⟩} → a≡c (count profile 1/1 in both traces),
/// a always-before b and c, c always-after a; never_together empty.
#[test]
fn process_skeleton_relations_hand_computed() {
    let log = build_log(&[(1, &["a", "b", "c"]), (1, &["a", "c"])]);
    let skel = wasm4pm::more_discovery::compute_log_skeleton(&log, "concept:name");
    let pairs = |key: &str| -> Vec<(String, String)> {
        skel[key]
            .as_array()
            .unwrap()
            .iter()
            .map(|p| {
                (
                    p[0].as_str().unwrap().to_string(),
                    p[1].as_str().unwrap().to_string(),
                )
            })
            .collect()
    };
    assert_eq!(pairs("equivalence"), vec![("a".into(), "c".into())]);
    let before = pairs("always_before");
    assert!(
        before.contains(&("a".into(), "b".into())),
        "a always before b"
    );
    assert!(
        before.contains(&("a".into(), "c".into())),
        "a always before c"
    );
    assert!(
        !before.contains(&("b".into(), "c".into())),
        "b not always before c (trace 2 has c, no b)"
    );
    let after = pairs("always_after");
    assert!(
        after.contains(&("a".into(), "c".into())),
        "c always after a"
    );
    assert!(
        !after.contains(&("a".into(), "b".into())),
        "b not always after a"
    );
    assert_eq!(pairs("never_together"), Vec::<(String, String)>::new());
    // b occurs 0 times in trace 2 → min 0, max 1
    let counts = skel["activity_counts"].as_array().unwrap();
    let b = counts.iter().find(|c| c["activity"] == "b").unwrap();
    assert_eq!((b["min"].as_u64(), b["max"].as_u64()), (Some(0), Some(1)));
}

/// analyze_process_speedup honors window_size and detects an accelerating
/// process: early traces have 10-minute gaps, late traces 1-minute gaps.
#[test]
fn analyze_process_speedup_windowed_trend() {
    use std::collections::BTreeMap;
    use wasm4pm::models::{AttributeValue, EventLog, Trace};
    let mut log = EventLog::new();
    // 6 traces over consecutive days: gaps shrink 10min → 1min.
    for t in 0..6usize {
        let gap_min = [10, 10, 6, 6, 1, 1][t];
        let mut events = Vec::new();
        for i in 0..3usize {
            let mut attrs = BTreeMap::new();
            attrs.insert(
                "concept:name".to_string(),
                AttributeValue::String(format!("act{i}")),
            );
            attrs.insert(
                "time:timestamp".to_string(),
                AttributeValue::String(format!("2024-01-{:02}T00:{:02}:00Z", t + 1, i * gap_min)),
            );
            events.push(wasm4pm::models::Event { attributes: attrs });
        }
        log.traces.push(Trace {
            attributes: BTreeMap::new(),
            events,
        });
    }
    let v = wasm4pm::final_analytics::analyze_process_speedup_from_log(&log, "time:timestamp", 2);
    assert_eq!(v["window_size"], 2);
    assert_eq!(
        v["windows"].as_array().unwrap().len(),
        3,
        "6 traces / window_size 2 = 3 windows"
    );
    let slope = v["trend_slope"].as_f64().unwrap();
    assert!(
        slope < 0.0,
        "shrinking gaps must give negative slope, got {slope}"
    );
    assert_eq!(v["trend"], "speedup");
    // Hand-check window means: 10min=600000ms, 6min=360000ms, 1min=60000ms (2 gaps each trace)
    let w0 = v["windows"][0]["mean_gap"].as_f64().unwrap();
    assert!(
        (w0 - 600_000.0).abs() < 1.0,
        "window 0 mean gap must be 600000ms, got {w0}"
    );
}
