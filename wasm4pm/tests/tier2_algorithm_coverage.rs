//! Tier 2 Algorithm Coverage Tests
//!
//! This test file adds coverage for 3 Tier 2 algorithms that were previously untested:
//! 1. discover_dfg_hierarchical (hierarchical chunking)
//! 2. discover_ml_pca (dimensionality reduction)
//! 3. discover_ml_regress (least-squares regression)
//!
//! Each test verifies:
//! - Output structure is valid
//! - Results are deterministic (same input → same output)
//! - Rank 1 properties (mathematical theorems)
//! - Rank 2 properties (domain contracts)

use std::collections::HashMap;
use wasm4pm::hierarchical::{discover_hierarchical, DfgChunker, DfgChunkResult, HierarchicalConfig, TraceInfo};
use wasm4pm::ml::pca::pca_internal;
use wasm4pm::ml::regression::regression_internal;
use wasm4pm::models::{AttributeValue, Event, EventLog, Trace};

// ---------------------------------------------------------------------------
// Fixture: Controlled EventLog
// ---------------------------------------------------------------------------

/// Build a simple EventLog from activity sequence variants.
fn build_test_log(variants: &[(usize, &[&str])]) -> EventLog {
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

/// Standard test log: 10 traces A→B→C, 5 traces A→B→D
fn standard_log() -> EventLog {
    build_test_log(&[
        (10, &["A", "B", "C"]),
        (5, &["A", "B", "D"]),
    ])
}

// ---------------------------------------------------------------------------
// hierarchical_dfg Tests
// ---------------------------------------------------------------------------

/// Helper: convert EventLog to traces and columnar representation for testing
fn log_to_traces(log: &EventLog, activity_key: &str) -> Vec<TraceInfo> {
    let col = log.to_columnar(activity_key);
    let total_traces = col.trace_offsets.len().saturating_sub(1);
    (0..total_traces)
        .filter_map(|t| {
            let start = col.trace_offsets[t];
            let end = col.trace_offsets[t + 1];
            if start >= end {
                return None;
            }
            TraceInfo::from_ids(&col.events[start..end])
        })
        .collect()
}

#[test]
fn hierarchical_dfg_rank1_output_valid() {
    // Rank 1: Mathematical theorem
    // The hierarchical algorithm must return a valid DFG chunk result
    let log = standard_log();

    let config = HierarchicalConfig {
        num_chunks: 3,
        max_chunk_events: None,
    };
    let result: DfgChunkResult = discover_hierarchical::<DfgChunker>(&log, "concept:name", &config);

    // Verify structure: edges should be present
    assert!(!result.edge_counts.is_empty(), "Hierarchical DFG must discover edges");

    // Verify edge counts are positive
    for (_, count) in result.edge_counts.iter() {
        assert!(*count > 0, "All edge counts must be positive");
    }
}

#[test]
fn hierarchical_dfg_rank1_determinism() {
    // Rank 1: Determinism
    // Same input → identical output across multiple runs
    let log = standard_log();

    let config = HierarchicalConfig {
        num_chunks: 2,
        max_chunk_events: None,
    };
    let result1: DfgChunkResult = discover_hierarchical::<DfgChunker>(&log, "concept:name", &config);
    let result2: DfgChunkResult = discover_hierarchical::<DfgChunker>(&log, "concept:name", &config);

    // Both should have identical edges
    assert_eq!(result1.edge_counts.len(), result2.edge_counts.len(), "Edge counts must be identical");

    for ((src1, dst1), count1) in result1.edge_counts.iter() {
        let count2 = result2.edge_counts.get(&(*src1, *dst1))
            .expect(&format!("Edge ({}, {}) must exist in both runs", src1, dst1));
        assert_eq!(count1, count2, "Edge counts must be bit-identical");
    }
}

#[test]
fn hierarchical_dfg_rank2_chunk_independence() {
    // Rank 2: Domain contract (Associativity of merge)
    // Number of chunks should not affect final edge counts (DFG is associative)
    let log = standard_log();

    let config_1 = HierarchicalConfig {
        num_chunks: 1,
        max_chunk_events: None,
    };
    let config_3 = HierarchicalConfig {
        num_chunks: 3,
        max_chunk_events: None,
    };

    let result_1chunk: DfgChunkResult = discover_hierarchical::<DfgChunker>(&log, "concept:name", &config_1);
    let result_3chunks: DfgChunkResult = discover_hierarchical::<DfgChunker>(&log, "concept:name", &config_3);

    // Edge count should be the same (DFG is associative)
    assert_eq!(
        result_1chunk.edge_counts.len(),
        result_3chunks.edge_counts.len(),
        "Chunk count should not affect number of discovered edges"
    );

    // All edges should have the same counts
    for ((src, dst), count1) in result_1chunk.edge_counts.iter() {
        let count3 = result_3chunks.edge_counts.get(&(*src, *dst))
            .expect("All edges from monolithic run must exist in chunked run");
        assert_eq!(count1, count3, "Edge counts must match across chunk strategies");
    }
}

#[test]
fn hierarchical_dfg_scalability() {
    // Verify hierarchical works on larger logs
    let variants = vec![
        (20, &["Register", "Review", "Approve", "Archive"][..]),
        (15, &["Register", "Review", "Reject", "Archive"][..]),
        (10, &["Register", "Reassign", "Review", "Approve", "Archive"][..]),
    ];
    let log = build_test_log(&variants);

    let config = HierarchicalConfig {
        num_chunks: 5,
        max_chunk_events: None,
    };
    let result: DfgChunkResult = discover_hierarchical::<DfgChunker>(&log, "concept:name", &config);

    // Should discover multiple edges
    assert!(result.edge_counts.len() >= 5, "Should discover multiple edges");
}

// ---------------------------------------------------------------------------
// ml_pca Tests
// ---------------------------------------------------------------------------

#[test]
fn pca_rank1_eigenvalues_positive() {
    // Rank 1: Mathematical theorem
    // Eigenvalues from PCA must be non-negative (variance is non-negative)
    let features = vec![
        [1.0, 2.0],
        [2.0, 4.0],
        [3.0, 6.0],
        [4.0, 8.0],
    ];

    let result = pca_internal(&features);

    // Both eigenvalues must be non-negative
    assert!(result.eigenvalues[0] >= 0.0, "First eigenvalue must be non-negative");
    assert!(result.eigenvalues[1] >= 0.0, "Second eigenvalue must be non-negative");

    // Larger eigenvalue should come first (by convention)
    if result.eigenvalues[0] > 1e-10 || result.eigenvalues[1] > 1e-10 {
        assert!(
            result.eigenvalues[0] >= result.eigenvalues[1],
            "Eigenvalues should be sorted descending"
        );
    }
}

#[test]
fn pca_rank1_explained_variance_sum() {
    // Rank 1: Mathematical theorem
    // Explained variance should sum to at most 1.0 (or be normalized fractions)
    let features = vec![
        [1.0, 3.0],
        [2.0, 6.0],
        [3.0, 9.0],
        [4.0, 12.0],
        [5.0, 15.0],
    ];

    let result = pca_internal(&features);

    let total_variance = result.explained_variance[0] + result.explained_variance[1];
    assert!(total_variance <= 1.0 + 1e-10, "Explained variance should not exceed 1.0");

    // Both components should be non-negative
    assert!(result.explained_variance[0] >= 0.0);
    assert!(result.explained_variance[1] >= 0.0);
}

#[test]
fn pca_rank2_determinism() {
    // Rank 2: Domain contract
    // Same feature matrix → identical PCA results
    let features = vec![
        [1.0, 5.0],
        [2.0, 10.0],
        [3.0, 15.0],
        [4.0, 20.0],
    ];

    let result1 = pca_internal(&features);
    let result2 = pca_internal(&features);

    assert_eq!(result1.eigenvalues[0], result2.eigenvalues[0]);
    assert_eq!(result1.eigenvalues[1], result2.eigenvalues[1]);
    assert_eq!(result1.explained_variance[0], result2.explained_variance[0]);
    assert_eq!(result1.explained_variance[1], result2.explained_variance[1]);
}

#[test]
fn pca_rank1_perfect_correlation() {
    // Rank 1: Mathematical theorem
    // Perfectly correlated features (y = 2x) should have high variance on first component
    let features = vec![
        [1.0, 2.0],
        [2.0, 4.0],
        [3.0, 6.0],
        [4.0, 8.0],
        [5.0, 10.0],
    ];

    let result = pca_internal(&features);

    // First eigenvalue should be dominant (nearly all variance explained)
    let total_var = result.eigenvalues[0] + result.eigenvalues[1];
    if total_var > 1e-10 {
        let ratio = result.eigenvalues[0] / total_var;
        assert!(ratio > 0.95, "Perfectly correlated data should explain >95% with first component");
    }
}

// ---------------------------------------------------------------------------
// ml_regress Tests
// ---------------------------------------------------------------------------

#[test]
fn regression_rank1_r_squared_in_range() {
    // Rank 1: Mathematical theorem
    // R² must be in [0, 1] for reasonable data (or slightly negative for poor fits)
    let x = vec![1.0, 2.0, 3.0, 4.0, 5.0];
    let y = vec![2.0, 4.0, 6.0, 8.0, 10.0];

    let result = regression_internal(&x, &y);

    // Perfect linear relationship: R² should be 1.0
    assert!(result.r_squared >= 0.99, "Perfect linear data should have R² ≈ 1.0");
}

#[test]
fn regression_rank1_perfect_fit() {
    // Rank 1: Mathematical theorem
    // y = 2x + 3 should be recovered exactly from points on the line
    let x = vec![0.0, 1.0, 2.0, 3.0, 4.0];
    let y = vec![3.0, 5.0, 7.0, 9.0, 11.0]; // y = 2x + 3

    let result = regression_internal(&x, &y);

    assert!((result.slope - 2.0).abs() < 1e-10, "Slope should be 2.0");
    assert!((result.intercept - 3.0).abs() < 1e-10, "Intercept should be 3.0");
    assert!(result.r_squared > 0.9999, "Perfect fit should have R² > 0.9999");
}

#[test]
fn regression_rank1_determinism() {
    // Rank 1: Determinism
    // Same x, y → identical regression results
    let x = vec![1.5, 2.5, 3.5, 4.5];
    let y = vec![3.2, 5.1, 7.0, 8.9];

    let result1 = regression_internal(&x, &y);
    let result2 = regression_internal(&x, &y);

    assert_eq!(result1.slope, result2.slope, "Slope must be deterministic");
    assert_eq!(result1.intercept, result2.intercept, "Intercept must be deterministic");
    assert_eq!(result1.r_squared, result2.r_squared, "R² must be deterministic");
}

#[test]
fn regression_rank2_positive_trend() {
    // Rank 2: Domain contract
    // For monotonically increasing x and y, slope should be positive
    let x = vec![1.0, 2.0, 3.0, 4.0, 5.0];
    let y = vec![1.0, 3.0, 5.0, 7.0, 9.0]; // Positive trend

    let result = regression_internal(&x, &y);

    assert!(result.slope > 0.0, "Positive trend data should have positive slope");
    assert!(result.r_squared > 0.9, "Positive trend data should have good R²");
}

#[test]
fn regression_rank2_negative_trend() {
    // Rank 2: Domain contract
    // For negative correlation, slope should be negative
    let x = vec![1.0, 2.0, 3.0, 4.0, 5.0];
    let y = vec![9.0, 7.0, 5.0, 3.0, 1.0]; // Negative trend

    let result = regression_internal(&x, &y);

    assert!(result.slope < 0.0, "Negative trend data should have negative slope");
    assert!(result.r_squared > 0.9, "Negative trend data should have good R²");
}

#[test]
fn regression_edge_case_single_point() {
    // Edge case: single data point
    // Regression is undefined but should not panic
    let x = vec![1.0];
    let y = vec![2.0];

    let result = regression_internal(&x, &y);

    // Should return some valid result (likely zero coefficients)
    assert!(result.r_squared.is_finite() || result.r_squared == 0.0);
}

#[test]
fn regression_edge_case_empty() {
    // Edge case: empty data
    // Regression should handle gracefully
    let x: Vec<f64> = vec![];
    let y: Vec<f64> = vec![];

    let result = regression_internal(&x, &y);

    // Should not panic
    assert_eq!(result.slope, 0.0);
    assert_eq!(result.intercept, 0.0);
    assert_eq!(result.r_squared, 0.0);
}
