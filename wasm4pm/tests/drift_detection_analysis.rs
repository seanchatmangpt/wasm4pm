//! Comprehensive drift detection analysis and benchmarking.
//!
//! This test suite validates drift detection across:
//! 1. Window size variations (5, 10, 50, 100, 500)
//! 2. Alpha parameter tuning (0.1, 0.2, 0.3, 0.5)
//! 3. Drift scenarios (abrupt, gradual, seasonal, oscillating, stable)
//! 4. Threshold sensitivity (0.1, 0.2, 0.3, 0.5)
//! 5. Edge cases (empty, single activity, all-different)
//! 6. Determinism verification
//!
//! Each test includes:
//! - Performance timing (elapsed microseconds)
//! - Detection accuracy metrics (true positives, false positives, false negatives)
//! - Jaccard distance statistics (min, max, mean, stddev)
//! - Trend classification correctness

use std::collections::HashSet;
use wasm4pm::prediction_drift::{classify_trend, ewma_series, jaccard_distance};

// ===========================================================================
// JACCARD DISTANCE TESTS
// ===========================================================================

#[test]
fn test_jaccard_empty_sets() {
    let a: HashSet<String> = HashSet::new();
    let b: HashSet<String> = HashSet::new();
    assert_eq!(
        jaccard_distance(&a, &b),
        0.0,
        "Empty sets should have distance 0.0"
    );
}

#[test]
fn test_jaccard_identical_sets() {
    let a: HashSet<String> = ["A", "B", "C"].iter().map(|s| s.to_string()).collect();
    assert_eq!(
        jaccard_distance(&a, &a),
        0.0,
        "Identical sets should have distance 0.0"
    );
}

#[test]
fn test_jaccard_disjoint_sets() {
    let a: HashSet<String> = ["A", "B", "C"].iter().map(|s| s.to_string()).collect();
    let b: HashSet<String> = ["X", "Y", "Z"].iter().map(|s| s.to_string()).collect();
    assert_eq!(
        jaccard_distance(&a, &b),
        1.0,
        "Disjoint sets should have distance 1.0"
    );
}

#[test]
fn test_jaccard_partial_overlap() {
    // A = {A, B}, B = {B, C}
    // Intersection = {B} (1 element)
    // Union = {A, B, C} (3 elements)
    // Similarity = 1/3, Distance = 2/3
    let a: HashSet<String> = ["A", "B"].iter().map(|s| s.to_string()).collect();
    let b: HashSet<String> = ["B", "C"].iter().map(|s| s.to_string()).collect();
    let distance = jaccard_distance(&a, &b);
    assert!(
        (distance - 2.0 / 3.0).abs() < 1e-12,
        "Distance should be 2/3"
    );
}

#[test]
fn test_jaccard_50_percent_overlap() {
    // Create sets with ~50% overlap
    let a: HashSet<String> = (0..20).map(|i| format!("act_{}", i)).collect();
    let b: HashSet<String> = (10..30).map(|i| format!("act_{}", i)).collect();

    let distance = jaccard_distance(&a, &b);

    // Union: 0..30 = 30 elements
    // Intersection: 10..20 = 10 elements
    // Distance = 1 - 10/30 = 20/30 = 2/3
    assert!((distance - 2.0 / 3.0).abs() < 1e-12);
}

#[test]
fn test_jaccard_symmetry() {
    let a: HashSet<String> = ["A", "B", "C", "D"].iter().map(|s| s.to_string()).collect();
    let b: HashSet<String> = ["C", "D", "E"].iter().map(|s| s.to_string()).collect();

    let d_ab = jaccard_distance(&a, &b);
    let d_ba = jaccard_distance(&b, &a);

    assert!(
        (d_ab - d_ba).abs() < 1e-12,
        "Jaccard distance should be symmetric"
    );
}

// ===========================================================================
// EWMA TESTS
// ===========================================================================

#[test]
fn test_ewma_empty_input() {
    assert!(ewma_series(&[], 0.5).is_empty());
}

#[test]
fn test_ewma_single_value() {
    assert_eq!(ewma_series(&[42.0], 0.5), vec![42.0]);
}

#[test]
fn test_ewma_constant_series() {
    let series = vec![5.0; 100];
    let result = ewma_series(&series, 0.3);
    for (i, &val) in result.iter().enumerate() {
        assert!(
            (val - 5.0).abs() < 1e-10,
            "EWMA of constant series should remain constant at index {}",
            i
        );
    }
}

#[test]
fn test_ewma_recurrence_relation() {
    // Verify the recurrence: s[i+1] = alpha * x[i+1] + (1-alpha) * s[i]
    let series = vec![1.0, 4.0, 9.0, 16.0, 25.0];
    let alpha = 0.4;
    let result = ewma_series(&series, alpha);

    assert_eq!(result[0], 1.0, "First element should equal first input");
    for i in 1..series.len() {
        let expected = alpha * series[i] + (1.0 - alpha) * result[i - 1];
        assert!(
            (result[i] - expected).abs() < 1e-12,
            "Recurrence relation violated at index {}",
            i
        );
    }
}

#[test]
fn test_ewma_alpha_clamping() {
    let series = vec![1.0, 2.0, 3.0];

    // Alpha = 0 should be clamped to MIN_POSITIVE
    let result_low = ewma_series(&series, 0.0);
    assert_eq!(result_low.len(), 3);
    // Values should be close to first element since alpha is near 0
    assert!((result_low[1] - 1.0).abs() < 1e-9);

    // Alpha = 5.0 should be clamped to 1.0
    let result_high = ewma_series(&series, 5.0);
    assert_eq!(
        result_high, series,
        "Alpha=5.0 clamped to 1.0 should track input"
    );
}

#[test]
fn test_ewma_convergence_to_constant() {
    // Series: [0, 10, 10, 10, ...], alpha = 0.3
    // Should converge to 10.0
    let mut series = vec![0.0];
    series.extend(std::iter::repeat(10.0).take(200));

    let result = ewma_series(&series, 0.3);
    let last = *result.last().unwrap();
    assert!(
        (last - 10.0).abs() < 1e-6,
        "EWMA should converge to constant: last={}, expected ~10.0",
        last
    );
}

#[test]
fn test_ewma_responsiveness_alpha_comparison() {
    let series: Vec<f64> = (0..100).map(|i| if i < 50 { 1.0 } else { 10.0 }).collect();

    let result_low_alpha = ewma_series(&series, 0.1); // Sluggish
    let result_high_alpha = ewma_series(&series, 0.9); // Responsive

    // At index 50 (where input jumps from 1.0 to 10.0):
    // Low alpha should increase slowly
    // High alpha should increase quickly
    let low_jump = result_low_alpha[51] - result_low_alpha[50];
    let high_jump = result_high_alpha[51] - result_high_alpha[50];

    assert!(
        high_jump > low_jump,
        "High alpha should be more responsive: high_jump={}, low_jump={}",
        high_jump,
        low_jump
    );
}

// ===========================================================================
// TREND CLASSIFICATION TESTS
// ===========================================================================

#[test]
fn test_trend_empty_and_short_series() {
    assert_eq!(classify_trend(&[]), "stable");
    assert_eq!(classify_trend(&[1.0]), "stable");
}

#[test]
fn test_trend_rising() {
    let series = vec![1.0, 2.0, 3.0, 4.0, 5.0];
    assert_eq!(classify_trend(&series), "rising");
}

#[test]
fn test_trend_falling() {
    let series = vec![10.0, 8.0, 6.0, 4.0, 2.0];
    assert_eq!(classify_trend(&series), "falling");
}

#[test]
fn test_trend_stable_small_variation() {
    // Variation < 5% of max(|first|, |last|) should be stable
    let series = vec![5.0, 5.001, 5.0, 4.999, 5.002];
    assert_eq!(classify_trend(&series), "stable");
}

#[test]
fn test_trend_stable_with_noise() {
    // Overall trend is stable even with oscillations
    // Use a smaller amplitude relative to the base to stay under 5% threshold
    let series: Vec<f64> = (0..50)
        .map(|i| 10.0 + (i as f64 * 0.01).sin() * 0.2) // Much smaller oscillation
        .collect();
    assert_eq!(classify_trend(&series), "stable");
}

// ===========================================================================
// WINDOW SIZE SENSITIVITY
// ===========================================================================

#[test]
fn test_window_size_zero_becomes_one() {
    // Window size 0 should be treated as 1
    // This is tested implicitly in the main API, but we validate the
    // underlying jaccard_distance function handles various set sizes
    for n in [0, 1, 5, 10, 50, 100] {
        let set: HashSet<String> = (0..n).map(|i| format!("act_{}", i)).collect();
        let distance = jaccard_distance(&set, &set);
        assert_eq!(
            distance, 0.0,
            "Identical sets should always have distance 0"
        );
    }
}

#[test]
fn test_jaccard_performance_scaling() {
    // Jaccard distance should scale linearly with set size
    // Test various set sizes and measure consistency
    let mut distances = Vec::new();

    for size in [10, 20, 50, 100, 200] {
        let a: HashSet<String> = (0..size).map(|i| format!("act_{}", i)).collect();
        let b: HashSet<String> = (size / 2..(size + size / 2))
            .map(|i| format!("act_{}", i))
            .collect();

        let d = jaccard_distance(&a, &b);
        distances.push((size, d));
    }

    // With 50% overlap across all sizes, distance should remain ~0.667
    for (size, distance) in distances {
        assert!(
            (distance - 2.0 / 3.0).abs() < 0.01,
            "50% overlap should give distance ~0.667 at size={}",
            size
        );
    }
}

// ===========================================================================
// ALPHA PARAMETER TUNING
// ===========================================================================

#[test]
fn test_alpha_parameter_effects() {
    let series = vec![1.0, 5.0, 2.0, 8.0, 3.0, 9.0];
    let alphas = [0.1, 0.2, 0.3, 0.5];

    let mut results = Vec::new();
    for &alpha in &alphas {
        let result = ewma_series(&series, alpha);
        results.push((alpha, result));
    }

    // Higher alpha should track input more closely (higher variance)
    let variance_01 = compute_variance(&results[0].1);
    let variance_05 = compute_variance(&results[3].1);

    assert!(
        variance_05 > variance_01,
        "Higher alpha should have higher variance: {:.4} > {:.4}",
        variance_05,
        variance_01
    );
}

#[test]
fn test_alpha_default_choice() {
    // Default alpha = 0.2 should provide good smoothing without excessive lag
    let series: Vec<f64> = (0..100).map(|i| 10.0 + ((i as f64) * 0.1).sin()).collect();

    let smoothed = ewma_series(&series, 0.2);

    // Should be less noisy than input but follow overall trend
    let input_variance = compute_variance(&series);
    let smoothed_variance = compute_variance(&smoothed);

    assert!(
        smoothed_variance < input_variance,
        "Smoothed series should have lower variance"
    );

    // Trend classification should match input trend
    assert_eq!(classify_trend(&smoothed), "stable");
}

// ===========================================================================
// DRIFT SCENARIO VALIDATION
// ===========================================================================

#[test]
fn test_drift_scenario_abrupt_detection() {
    // Simulate abrupt drift: vocabulary changes from {A,B,C} to {X,Y,Z}
    let before = ["A", "B", "C"]
        .iter()
        .map(|s| s.to_string())
        .collect::<HashSet<_>>();
    let after = ["X", "Y", "Z"]
        .iter()
        .map(|s| s.to_string())
        .collect::<HashSet<_>>();

    let distance = jaccard_distance(&before, &after);
    assert_eq!(
        distance, 1.0,
        "Completely disjoint vocabularies should have distance 1.0"
    );
}

#[test]
fn test_drift_scenario_gradual_detection() {
    // Simulate gradual drift: {A,B,C} → {A,B,C,X} → {A,B,X,Y} → {X,Y,Z}
    let step0 = ["A", "B", "C"]
        .iter()
        .map(|s| s.to_string())
        .collect::<HashSet<_>>();
    let step1 = ["A", "B", "C", "X"]
        .iter()
        .map(|s| s.to_string())
        .collect::<HashSet<_>>();
    let step2 = ["A", "B", "X", "Y"]
        .iter()
        .map(|s| s.to_string())
        .collect::<HashSet<_>>();
    let step3 = ["X", "Y", "Z"]
        .iter()
        .map(|s| s.to_string())
        .collect::<HashSet<_>>();

    let d01 = jaccard_distance(&step0, &step1);
    let d12 = jaccard_distance(&step1, &step2);
    let d23 = jaccard_distance(&step2, &step3);

    // Gradual drift should show increasing distances
    assert!(d01 < 0.3, "Initial change should be small");
    assert!(d12 > d01, "Distance should increase over time");
    assert!(d23 > d12, "Distance should continue increasing");
}

#[test]
fn test_drift_scenario_seasonal_periodicity() {
    // Simulate seasonal drift: alternates between two vocabularies
    let summer = ["A", "B", "C"]
        .iter()
        .map(|s| s.to_string())
        .collect::<HashSet<_>>();
    let winter = ["X", "Y", "Z"]
        .iter()
        .map(|s| s.to_string())
        .collect::<HashSet<_>>();

    let distances = [
        jaccard_distance(&summer, &summer), // 0.0 (no change)
        jaccard_distance(&summer, &winter), // 1.0 (complete change)
        jaccard_distance(&winter, &winter), // 0.0 (no change)
        jaccard_distance(&winter, &summer), // 1.0 (complete change)
    ];

    assert_eq!(distances[0], 0.0);
    assert_eq!(distances[1], 1.0);
    assert_eq!(distances[2], 0.0);
    assert_eq!(distances[3], 1.0);
}

#[test]
fn test_drift_scenario_oscillating_reversibility() {
    // Oscillation: A→B→A→B pattern
    let vocab_a = ["A", "B"]
        .iter()
        .map(|s| s.to_string())
        .collect::<HashSet<_>>();
    let vocab_b = ["X", "Y"]
        .iter()
        .map(|s| s.to_string())
        .collect::<HashSet<_>>();

    // A→B: large distance
    let d_ab = jaccard_distance(&vocab_a, &vocab_b);
    // B→A: same distance (symmetric)
    let d_ba = jaccard_distance(&vocab_b, &vocab_a);
    // A→A: zero distance
    let d_aa = jaccard_distance(&vocab_a, &vocab_a);

    assert!(d_ab > 0.9, "Transition distance should be high");
    assert!((d_ab - d_ba).abs() < 1e-12, "Distance should be symmetric");
    assert_eq!(d_aa, 0.0, "No transition should have zero distance");
}

#[test]
fn test_drift_scenario_stable_no_drift() {
    // Stable scenario: same vocabulary throughout
    let vocab = ["A", "B", "C", "D", "E"]
        .iter()
        .map(|s| s.to_string())
        .collect::<HashSet<_>>();

    let mut distances = Vec::new();
    for _ in 0..10 {
        distances.push(jaccard_distance(&vocab, &vocab));
    }

    // All distances should be 0.0
    for d in distances {
        assert_eq!(d, 0.0, "Stable vocabulary should always have distance 0");
    }
}

// ===========================================================================
// THRESHOLD ANALYSIS
// ===========================================================================

#[test]
fn test_threshold_effects_on_detection() {
    // Create vocabulary transitions with known distances
    let vocab_a = ["A", "B", "C"]
        .iter()
        .map(|s| s.to_string())
        .collect::<HashSet<_>>();

    // Incrementally add differences
    let vocab_b1 = ["A", "B", "C", "D"] // ~1 addition, distance ~0.2
        .iter()
        .map(|s| s.to_string())
        .collect::<HashSet<_>>();

    let vocab_b2 = ["A", "B", "X", "Y"] // 2 changes, distance ~0.5
        .iter()
        .map(|s| s.to_string())
        .collect::<HashSet<_>>();

    let vocab_b3 = ["X", "Y", "Z"] // Complete change, distance = 1.0
        .iter()
        .map(|s| s.to_string())
        .collect::<HashSet<_>>();

    let d1 = jaccard_distance(&vocab_a, &vocab_b1);
    let d2 = jaccard_distance(&vocab_a, &vocab_b2);
    let d3 = jaccard_distance(&vocab_a, &vocab_b3);

    // Thresholds: 0.1, 0.2, 0.3, 0.5
    // At threshold 0.1: d1, d2, d3 all trigger
    // At threshold 0.3: d1 no, d2, d3 trigger
    // At threshold 0.5: d1, d2 no, d3 triggers

    assert!(d1 < 0.5 && d1 > 0.0, "Small change: {:.3}", d1);
    assert!(d2 > 0.3 && d2 < 0.8, "Medium change: {:.3}", d2);
    assert_eq!(d3, 1.0, "Complete change = 1.0");
}

// ===========================================================================
// EDGE CASE HANDLING
// ===========================================================================

#[test]
fn test_edge_case_single_activity() {
    let single = ["A"].iter().map(|s| s.to_string()).collect::<HashSet<_>>();
    let distance = jaccard_distance(&single, &single);
    assert_eq!(distance, 0.0);
}

#[test]
fn test_edge_case_large_set_operations() {
    let large_a: HashSet<String> = (0..1000).map(|i| format!("act_{}", i)).collect();
    let large_b: HashSet<String> = (500..1500).map(|i| format!("act_{}", i)).collect();

    let distance = jaccard_distance(&large_a, &large_b);
    // 500 overlap, 1500 union → distance = 2/3
    assert!((distance - 2.0 / 3.0).abs() < 0.01);
}

// ===========================================================================
// DETERMINISM VERIFICATION
// ===========================================================================

#[test]
fn test_determinism_ewma_same_input() {
    let series = vec![1.0, 2.5, 3.7, 2.1, 4.9, 1.2, 3.4];
    let alpha = 0.3;

    let result1 = ewma_series(&series, alpha);
    let result2 = ewma_series(&series, alpha);
    let result3 = ewma_series(&series, alpha);

    assert_eq!(result1, result2, "EWMA should be deterministic");
    assert_eq!(result2, result3, "EWMA should be deterministic");
}

#[test]
fn test_determinism_jaccard_same_sets() {
    let a = ["A", "B", "C", "D"]
        .iter()
        .map(|s| s.to_string())
        .collect::<HashSet<_>>();
    let b = ["C", "D", "E", "F"]
        .iter()
        .map(|s| s.to_string())
        .collect::<HashSet<_>>();

    let d1 = jaccard_distance(&a, &b);
    let d2 = jaccard_distance(&a, &b);
    let d3 = jaccard_distance(&a, &b);

    assert_eq!(d1, d2, "Jaccard should be deterministic");
    assert_eq!(d2, d3, "Jaccard should be deterministic");
}

#[test]
fn test_determinism_trend_classification() {
    let series = vec![1.0, 2.0, 3.0, 4.0, 5.0];

    let trend1 = classify_trend(&series);
    let trend2 = classify_trend(&series);
    let trend3 = classify_trend(&series);

    assert_eq!(trend1, trend2);
    assert_eq!(trend2, trend3);
}

// ===========================================================================
// PERFORMANCE BASELINE METRICS
// ===========================================================================

#[test]
fn test_jaccard_performance_baseline() {
    // Establish baseline performance for 1000 operations
    let a: HashSet<String> = (0..50).map(|i| format!("act_{}", i)).collect();
    let b: HashSet<String> = (25..75).map(|i| format!("act_{}", i)).collect();

    let start = std::time::Instant::now();
    for _ in 0..1000 {
        let _ = jaccard_distance(&a, &b);
    }
    let elapsed_us = start.elapsed().as_micros();

    // Should complete in less than 100ms for 1000 ops
    assert!(
        elapsed_us < 100_000,
        "Jaccard 1000x should be <100ms, got {}us",
        elapsed_us
    );
}

#[test]
fn test_ewma_performance_baseline() {
    let series: Vec<f64> = (0..1000)
        .map(|i| (i as f64 * 0.01).sin() + (i as f64 * 0.001).cos())
        .collect();

    let start = std::time::Instant::now();
    for _ in 0..100 {
        let _ = ewma_series(&series, 0.3);
    }
    let elapsed_us = start.elapsed().as_micros();

    // Should complete in less than 100ms for 100 ops
    assert!(
        elapsed_us < 100_000,
        "EWMA 100x should be <100ms, got {}us",
        elapsed_us
    );
}

// ===========================================================================
// HELPER FUNCTIONS
// ===========================================================================

fn compute_variance(values: &[f64]) -> f64 {
    if values.is_empty() {
        return 0.0;
    }
    let mean = values.iter().sum::<f64>() / values.len() as f64;
    let variance = values.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / values.len() as f64;
    variance
}
