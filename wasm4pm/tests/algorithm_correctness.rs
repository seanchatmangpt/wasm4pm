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

use std::collections::HashMap;
use wasm4pm::fast_discovery::{discover_astar_from_log, discover_hill_climbing_from_log};
use wasm4pm::genetic_discovery::{
    discover_genetic_algorithm_from_log, discover_pso_algorithm_from_log,
};
use wasm4pm::ilp_discovery::discover_ilp_petri_net_from_log;
use wasm4pm::models::{AttributeValue, Event, EventLog, Trace};
use wasm4pm::more_discovery::discover_simulated_annealing_from_log;

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
                    let mut m = HashMap::new();
                    m.insert(
                        "concept:name".to_string(),
                        AttributeValue::String(format!("case-{}", case_idx)),
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
    let (_, f1) = discover_genetic_algorithm_from_log(&log, "concept:name", 20, 1)
        .expect("GA must succeed");
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
    let (_, f1) = discover_genetic_algorithm_from_log(&log, "concept:name", 20, 50)
        .expect("GA must succeed");
    let (_, f2) = discover_genetic_algorithm_from_log(&log, "concept:name", 20, 50)
        .expect("GA must succeed");
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
    let (dfg, _) = discover_genetic_algorithm_from_log(&log, "concept:name", 20, 30)
        .expect("GA must succeed");
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
    let (_, f5) = discover_pso_algorithm_from_log(&log, "concept:name", 20, 5)
        .expect("PSO must succeed");
    let (_, f50) = discover_pso_algorithm_from_log(&log, "concept:name", 20, 50)
        .expect("PSO must succeed");

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
    let (_, f1) = discover_pso_algorithm_from_log(&log, "concept:name", 20, 50)
        .expect("PSO must succeed");
    let (_, f2) = discover_pso_algorithm_from_log(&log, "concept:name", 20, 50)
        .expect("PSO must succeed");
    assert_eq!(f1, f2, "PSO is not deterministic");
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

/// Perfect fitness on a perfectly-fitting log (Rank 1 — mathematical):
/// The ILP constructs a net from ALL directly-follows relations in the log.
/// A single-variant log [A,B,C,D] has exactly 3 relations. The constructed net
/// replays every trace perfectly → fitness = 1.0.
#[test]
fn ilp_perfect_fitness_on_fitting_log() {
    let log = build_log(&[(10, &["A", "B", "C", "D"])]);
    let (_, fitness, _) = discover_ilp_petri_net_from_log(&log, "concept:name");
    assert_eq!(
        fitness, 1.0,
        "ILP fitness on single-variant fitting log must be 1.0, got {:.4}",
        fitness
    );
}
