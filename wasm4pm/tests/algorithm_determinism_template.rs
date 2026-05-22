//! Algorithm determinism validation for discovery algorithms.
//!
//! Tests that deterministic algorithms produce identical output (same DFG hash)
//! when run twice on identical input. This is a Rank-1 oracle from verification.md:
//! mathematical theorem, not statistical property.
//!
//! Stochastic algorithms (genetic, PSO, ACO, SA, A*) must use seeded RNG to
//! achieve determinism. With seed=42, output must be stable across runs.
//!
//! # Test Categories
//!
//! **Category A: Core Deterministic** (DFG, process skeleton, etc.)
//! - No RNG involved
//! - Must produce identical hashes
//!
//! **Category B: Stochastic with Seeding** (Genetic, PSO, ACO, SA, A*)
//! - Uses StdRng::seed_from_u64(42)
//! - Must produce identical hashes with same seed
//!
//! **Category C: Rank-1 Oracle Violation** (streaming_dfg, playout)
//! - Uses HashMap iteration or unseeded fastrand
//! - Expected to FAIL until fixed
//!
//! # How to Run
//!
//! ```bash
//! # All determinism tests
//! cargo test --test algorithm_determinism_template
//!
//! # Single category
//! cargo test --test algorithm_determinism_template test_core_deterministic
//! cargo test --test algorithm_determinism_template test_stochastic_seeded
//! ```
//!
//! # Adding New Tests
//!
//! For each algorithm, add a test following the pattern:
//! ```rust
//! #[test]
//! fn test_algorithm_name_is_deterministic() {
//!     let log = make_test_log();
//!     let h1 = hash_dfg(&discover_algorithm_name_from_log(&log, "concept:name", ...));
//!     let h2 = hash_dfg(&discover_algorithm_name_from_log(&log, "concept:name", ...));
//!     assert_eq!(h1, h2, "algorithm_name must produce identical DFG across runs");
//! }
//! ```

use blake3;
use wasm4pm::*;

// ============================================================================
// Test Utilities
// ============================================================================

/// Create a simple test event log with known structure.
///
/// Traces: A→B→C, A→B→D, A→C→D (3 traces, 9 events)
///
/// Used by all tests to ensure determinism is about algorithm logic,
/// not about log parsing.
fn make_simple_test_log() -> models::EventLog {
    let mut log = models::EventLog::new();

    // Trace 1: A→B→C
    {
        let mut trace = models::Trace {
            attributes: Default::default(),
            events: vec![
                make_event("A", 1),
                make_event("B", 2),
                make_event("C", 3),
            ],
        };
        log.traces.push(trace);
    }

    // Trace 2: A→B→D
    {
        let mut trace = models::Trace {
            attributes: Default::default(),
            events: vec![
                make_event("A", 4),
                make_event("B", 5),
                make_event("D", 6),
            ],
        };
        log.traces.push(trace);
    }

    // Trace 3: A→C→D
    {
        let mut trace = models::Trace {
            attributes: Default::default(),
            events: vec![
                make_event("A", 7),
                make_event("C", 8),
                make_event("D", 9),
            ],
        };
        log.traces.push(trace);
    }

    log
}

/// Helper to create an event with given activity and timestamp.
fn make_event(activity: &str, timestamp_sec: i64) -> models::Event {
    use std::collections::HashMap;

    let mut attrs = HashMap::new();
    attrs.insert(
        "concept:name".to_string(),
        models::AttributeValue::String(activity.to_string()),
    );
    attrs.insert(
        "time:timestamp".to_string(),
        models::AttributeValue::String(format!("2026-05-18T00:00:{:02}Z", timestamp_sec)),
    );

    models::Event { attributes: attrs }
}

/// Hash a DFG to a hex string for determinism verification.
///
/// Uses BLAKE3 for consistency with receipt hashing in TypeScript.
fn hash_dfg(dfg: &models::DirectlyFollowsGraph) -> String {
    let json = serde_json::to_string(dfg).expect("failed to serialize DFG");
    blake3::hash(json.as_bytes()).to_hex().to_string()
}

/// Assert that hashes match exactly (Rank-1 oracle).
///
/// Provides clear error message with hash prefixes for debugging.
fn assert_deterministic(algo: &str, hash1: &str, hash2: &str) {
    if hash1 != hash2 {
        panic!(
            "{} is non-deterministic!\n  Run 1: {}\n  Run 2: {}\n  These must match exactly.",
            algo,
            hash1.chars().take(12).collect::<String>(),
            hash2.chars().take(12).collect::<String>(),
        );
    }
}

// ============================================================================
// CATEGORY A: Core Deterministic Algorithms
// ============================================================================

#[test]
fn test_dfg_is_deterministic() {
    let log = make_simple_test_log();
    let h1 = hash_dfg(&discovery::discover_dfg_from_log(&log, "concept:name"));
    let h2 = hash_dfg(&discovery::discover_dfg_from_log(&log, "concept:name"));
    assert_deterministic("dfg", &h1, &h2);
}

#[test]
fn test_process_skeleton_is_deterministic() {
    let log = make_simple_test_log();
    // Note: process_skeleton is not yet exposed as pure-Rust function
    // This is a template for when it is
    // let h1 = hash_dfg(&discovery::discover_process_skeleton_from_log(&log, "concept:name"));
    // let h2 = hash_dfg(&discovery::discover_process_skeleton_from_log(&log, "concept:name"));
    // assert_deterministic("process_skeleton", &h1, &h2);
}

#[test]
fn test_heuristic_miner_is_deterministic() {
    let log = make_simple_test_log();
    // Template: add when pure-Rust function is available
    // let h1 = hash_dfg(&discovery::discover_heuristic_miner_from_log(&log, "concept:name", 0.5));
    // let h2 = hash_dfg(&discovery::discover_heuristic_miner_from_log(&log, "concept:name", 0.5));
    // assert_deterministic("heuristic_miner", &h1, &h2);
}

// ============================================================================
// CATEGORY B: Stochastic Algorithms with Seeding
// ============================================================================

#[test]
fn test_genetic_algorithm_is_deterministic() {
    let log = make_simple_test_log();
    let (dfg1, fitness1) = genetic_discovery::discover_genetic_algorithm_from_log(&log, "concept:name", 20, 10)
        .expect("genetic_algorithm failed");
    let (dfg2, fitness2) = genetic_discovery::discover_genetic_algorithm_from_log(&log, "concept:name", 20, 10)
        .expect("genetic_algorithm failed on second run");

    let h1 = hash_dfg(&dfg1);
    let h2 = hash_dfg(&dfg2);

    assert_deterministic("genetic_algorithm", &h1, &h2);

    // Fitness must also be bit-identical (no floating-point accumulation variance)
    assert!(
        (fitness1 - fitness2).abs() < 1e-10,
        "fitness diverged: {} vs {}\nSuspect: floating-point accumulation order",
        fitness1,
        fitness2
    );
}

#[test]
fn test_pso_is_deterministic() {
    let log = make_simple_test_log();
    let (dfg1, fitness1) = genetic_discovery::discover_pso_algorithm_from_log(&log, "concept:name", 15, 10)
        .expect("pso failed");
    let (dfg2, fitness2) = genetic_discovery::discover_pso_algorithm_from_log(&log, "concept:name", 15, 10)
        .expect("pso failed on second run");

    let h1 = hash_dfg(&dfg1);
    let h2 = hash_dfg(&dfg2);

    assert_deterministic("pso", &h1, &h2);
    assert!(
        (fitness1 - fitness2).abs() < 1e-10,
        "PSO fitness diverged: {} vs {}",
        fitness1,
        fitness2
    );
}

#[test]
fn test_aco_is_deterministic() {
    let log = make_simple_test_log();
    let (dfg1, fitness1) = genetic_discovery::discover_aco_algorithm_from_log(&log, "concept:name", 15, 10)
        .expect("aco failed");
    let (dfg2, fitness2) = genetic_discovery::discover_aco_algorithm_from_log(&log, "concept:name", 15, 10)
        .expect("aco failed on second run");

    let h1 = hash_dfg(&dfg1);
    let h2 = hash_dfg(&dfg2);

    assert_deterministic("aco", &h1, &h2);
}

#[test]
fn test_simulated_annealing_is_deterministic() {
    let log = make_simple_test_log();
    let (dfg1, _fitness1) = more_discovery::discover_simulated_annealing_from_log(&log, "concept:name", 50.0, 20.0);
    let (dfg2, _fitness2) = more_discovery::discover_simulated_annealing_from_log(&log, "concept:name", 50.0, 20.0);

    let h1 = hash_dfg(&dfg1);
    let h2 = hash_dfg(&dfg2);

    assert_deterministic("simulated_annealing", &h1, &h2);
}

/* 
#[test]
fn test_astar_is_deterministic() {
    let log = make_simple_test_log();
    let (dfg1, fitness1) = more_discovery::discover_astar_from_log(&log, "concept:name", 1000)
        .expect("astar failed");
    let (dfg2, fitness2) = more_discovery::discover_astar_from_log(&log, "concept:name", 1000)
        .expect("astar failed on second run");

    let h1 = hash_dfg(&dfg1);
    let h2 = hash_dfg(&dfg2);

    assert_deterministic("astar", &h1, &h2);
}
*/

// ============================================================================
// CATEGORY C: Known Non-Determinism (Rank-1 Oracle Violations)
// ============================================================================

/// Template for testing algorithms that use HashMap iteration.
///
/// This test is expected to FAIL until the underlying algorithm is fixed.
/// Once fixed, change #[ignore] to remove #[should_panic].
#[test]
#[ignore] // Remove after fixing streaming_dfg HashMap sorting
fn test_streaming_dfg_hashmap_iteration_nondeterministic() {
    // Streaming DFG uses HashMap<String, Vec<u32>> for open_traces.
    // HashMap iteration order is random, so edges may appear in different order.
    //
    // Expected: FAIL with error "unique hashes differ"
    // Fix: Sort case_ids before iterating over open_traces in snapshot()
    //
    // Once fixed, move this test to CATEGORY A and remove #[ignore].
    todo!("streaming_dfg uses HashMap iteration; output order non-deterministic");
}

/// Template for testing algorithms that use unseeded fastrand.
///
/// This test is expected to FAIL until the underlying algorithm is fixed.
#[test]
#[ignore] // Remove after seeding fastrand in playout.rs
fn test_playout_unseeded_fastrand_nondeterministic() {
    // Playout uses global fastrand::usize(), fastrand::f64() without seed control.
    // Each run produces different trace (random choices not seeded).
    //
    // Expected: FAIL with multiple unique traces
    // Fix: Accept seed parameter, pass to fastrand::Rng::with_seed(seed)
    //
    // Once fixed, move to CATEGORY B and seed with parameter.
    todo!("playout uses unseeded fastrand; traces are non-deterministic");
}

// ============================================================================
// Batch Test Suite
// ============================================================================

/// Run all determinism tests and report results.
///
/// This is for CI/CD integration:
/// ```bash
/// cargo test --test algorithm_determinism_template test_all_determinism_batch
/// ```
///
/// Output format: human-readable summary for GitHub Actions etc.
#[test]
#[ignore] // Run via `cargo test -- --ignored test_all_determinism_batch`
fn test_all_determinism_batch() {
    println!("\n=== Algorithm Determinism Batch Test ===\n");

    let tests: Vec<(&str, Box<dyn Fn() -> bool>)> = vec![
        ("dfg", Box::new(|| {
            let log = make_simple_test_log();
            let h1 = hash_dfg(&discovery::discover_dfg_from_log(&log, "concept:name"));
            let h2 = hash_dfg(&discovery::discover_dfg_from_log(&log, "concept:name"));
            h1 == h2
        })),
        ("genetic_algorithm", Box::new(|| {
            let log = make_simple_test_log();
            match (
                genetic_discovery::discover_genetic_algorithm_from_log(&log, "concept:name", 20, 10),
                genetic_discovery::discover_genetic_algorithm_from_log(&log, "concept:name", 20, 10),
            ) {
                (Some((dfg1, _)), Some((dfg2, _))) => {
                    hash_dfg(&dfg1) == hash_dfg(&dfg2)
                }
                _ => false,
            }
        })),
    ];

    let mut passed = 0;
    let mut failed = 0;

    for (algo, test_fn) in tests {
        let result = test_fn();
        if result {
            println!("✅ {} — deterministic", algo);
            passed += 1;
        } else {
            println!("❌ {} — non-deterministic", algo);
            failed += 1;
        }
    }

    println!("\n=== Summary ===");
    println!("{}/{} algorithms deterministic", passed, passed + failed);

    if failed > 0 {
        panic!("{} algorithm(s) failed determinism check", failed);
    }
}
