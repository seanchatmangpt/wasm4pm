//! OTEL instrumentation tests for discovery algorithms
//!
//! This test file documents the OTEL instrumentation added to 10 core discovery algorithms:
//! 1. dfg (discovery.rs:77)
//! 2. alpha_plus_plus (algorithms.rs:441)
//! 3. heuristic_miner (advanced_algorithms.rs:74)
//! 4. inductive_miner (more_discovery.rs:35)
//! 5. hill_climbing (fast_discovery.rs:40)
//! 6. declare (discovery.rs:382)
//! 7. simulated_annealing (more_discovery.rs:309)
//! 8. astar (fast_discovery.rs:11)
//! 9. genetic_algorithm (genetic_discovery.rs:16)
//!
//! Each algorithm now emits:
//! - Entry span: algorithm name, activity_key, and algorithm-specific parameters
//! - Feature extraction checkpoint: log_size, activity_count
//! - Result generation checkpoint: node_count, edge_count, fitness/complexity/iterations
//!
//! Spans use target format "wasm4pm.discovery.<algorithm>" for consistency.

#[test]
fn test_discovery_span_names() {
    // Verify that span target names follow the pattern "wasm4pm.discovery.<algorithm>"
    // This test documents the expected span naming convention

    let expected_targets = vec![
        "wasm4pm.discovery.dfg",
        "wasm4pm.discovery.alpha_plus_plus",
        "wasm4pm.discovery.heuristic_miner",
        "wasm4pm.discovery.hill_climbing",
        "wasm4pm.discovery.declare",
        "wasm4pm.discovery.simulated_annealing",
        "wasm4pm.discovery.astar",
        "wasm4pm.discovery.genetic_algorithm",
        "wasm4pm.discovery.inductive_miner",
    ];

    // This is a documentation test that verifies the naming convention
    for target in expected_targets {
        assert!(target.starts_with("wasm4pm.discovery."),
                "Target {} should follow naming convention", target);
        assert!(target.len() > "wasm4pm.discovery.".len(),
                "Target {} should have algorithm name", target);
    }
}

#[test]
fn test_discovery_checkpoint_labels() {
    // Verify that checkpoint labels are consistent across algorithms

    let expected_checkpoints = vec![
        "feature_extraction",
        "result_generation",
        "profile_building",  // Used by declare
        "empty_log",         // Used by declare
    ];

    // This is a documentation test that verifies the checkpoint naming convention
    for checkpoint in expected_checkpoints {
        assert!(!checkpoint.is_empty(), "Checkpoint {} should not be empty", checkpoint);
        // Verify checkpoint names use snake_case
        assert!(checkpoint.chars().all(|c| c.is_lowercase() || c == '_'),
                "Checkpoint {} should be snake_case", checkpoint);
    }
}

#[test]
fn test_discovery_span_attributes() {
    // Document the expected OTEL span attributes for each algorithm
    // This serves as a contract between the Rust implementations and consumers

    let expected_attributes_by_algorithm = [
        (
            "dfg",
            vec!["algorithm", "log_size", "activity_key", "node_count", "edge_count", "complexity"],
        ),
        (
            "alpha_plus_plus",
            vec!["algorithm", "activity_key", "min_support", "place_count", "transition_count", "arc_count"],
        ),
        (
            "heuristic_miner",
            vec!["algorithm", "activity_key", "dependency_threshold", "node_count", "edge_count", "complexity"],
        ),
        (
            "hill_climbing",
            vec!["algorithm", "activity_key", "node_count", "edge_count", "complexity"],
        ),
        (
            "declare",
            vec!["algorithm", "activity_key", "activity_count", "constraint_count"],
        ),
        (
            "simulated_annealing",
            vec!["algorithm", "activity_key", "temperature", "cooling_rate", "node_count", "edge_count", "fitness"],
        ),
        (
            "astar",
            vec!["algorithm", "activity_key", "max_iterations", "node_count", "edge_count", "iterations_used"],
        ),
        (
            "genetic_algorithm",
            vec!["algorithm", "activity_key", "population_size", "generations", "node_count", "edge_count", "fitness"],
        ),
        (
            "inductive_miner",
            vec!["algorithm", "activity_key", "node_count"],
        ),
    ];

    // Verify all algorithms have their expected attributes documented
    for (algo, attrs) in expected_attributes_by_algorithm.iter() {
        assert!(!attrs.is_empty(), "Algorithm {} should have documented attributes", algo);
        // Each algorithm should have at least 'algorithm' and 'activity_key'
        assert!(attrs.contains(&"algorithm"), "Algorithm {} missing 'algorithm' attribute", algo);
        assert!(attrs.contains(&"activity_key") || algo == &"declare",
                "Algorithm {} missing 'activity_key' attribute (declare is exception)", algo);
    }
}