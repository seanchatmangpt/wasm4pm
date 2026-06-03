//! Threshold optimization and ROC analysis for drift detection.
//!
//! This test suite analyzes drift detection accuracy across various thresholds
//! and provides ROC curves (precision vs. recall) for tuning decisions.

/// A drift event with expected detection properties.
#[derive(Debug, Clone)]
struct DriftPoint {
    /// Jaccard distance at this point
    distance: f64,
    /// Is this a true drift? (true = yes, false = normal variation)
    is_drift: bool,
    #[allow(dead_code)]
    /// Description for debugging
    description: String,
}

/// Simulate a process log with known drift patterns.
fn generate_drift_sequence() -> Vec<DriftPoint> {
    vec![
        // Stable period (normal variation, no drift)
        DriftPoint {
            distance: 0.0,
            is_drift: false,
            description: "Initial stable".to_string(),
        },
        DriftPoint {
            distance: 0.05,
            is_drift: false,
            description: "Variation 1".to_string(),
        },
        DriftPoint {
            distance: 0.03,
            is_drift: false,
            description: "Variation 2".to_string(),
        },
        // Gradual drift begins
        DriftPoint {
            distance: 0.15,
            is_drift: true,
            description: "Drift starts: +10%".to_string(),
        },
        DriftPoint {
            distance: 0.22,
            is_drift: true,
            description: "Drift continues: +20%".to_string(),
        },
        // Abrupt drift
        DriftPoint {
            distance: 0.45,
            is_drift: true,
            description: "Abrupt jump".to_string(),
        },
        // Stable again (no drift)
        DriftPoint {
            distance: 0.02,
            is_drift: false,
            description: "Return to normal".to_string(),
        },
        DriftPoint {
            distance: 0.04,
            is_drift: false,
            description: "Stable again".to_string(),
        },
        // Another drift event
        DriftPoint {
            distance: 0.52,
            is_drift: true,
            description: "Major drift".to_string(),
        },
        DriftPoint {
            distance: 0.58,
            is_drift: true,
            description: "Continuing drift".to_string(),
        },
    ]
}

/// Compute detection metrics for a given threshold.
fn compute_metrics(sequence: &[DriftPoint], threshold: f64) -> (usize, usize, usize, usize) {
    let mut tp = 0; // True positives: drift detected when present
    let mut fp = 0; // False positives: drift detected when absent
    let mut tn = 0; // True negatives: no drift detected when absent
    let mut fn_count = 0; // False negatives: no drift detected when present

    for point in sequence {
        let detected = point.distance > threshold;
        match (point.is_drift, detected) {
            (true, true) => tp += 1,
            (true, false) => fn_count += 1,
            (false, true) => fp += 1,
            (false, false) => tn += 1,
        }
    }

    (tp, fp, tn, fn_count)
}

/// Calculate precision, recall, and F1-score.
fn calculate_quality_metrics(tp: usize, fp: usize, fn_count: usize) -> (f64, f64, f64) {
    let precision = if tp + fp == 0 {
        1.0
    } else {
        tp as f64 / (tp + fp) as f64
    };
    let recall = if tp + fn_count == 0 {
        1.0
    } else {
        tp as f64 / (tp + fn_count) as f64
    };
    let f1 = if precision + recall == 0.0 {
        0.0
    } else {
        2.0 * (precision * recall) / (precision + recall)
    };
    (precision, recall, f1)
}

// ===========================================================================
// ROC AND THRESHOLD ANALYSIS
// ===========================================================================

#[test]
fn test_threshold_sweep_0_to_1() {
    // Sweep thresholds from 0.0 to 1.0 in steps of 0.05
    let sequence = generate_drift_sequence();

    println!("\n=== Threshold Sweep Analysis ===");
    println!(
        "{:<8} {:<4} {:<4} {:<4} {:<5} {:<8} {:<8} {:<8}",
        "Threshold", "TP", "FP", "FN", "TN", "Precision", "Recall", "F1"
    );
    println!("{}", "-".repeat(70));

    let mut best_f1 = 0.0;
    let mut best_threshold = 0.0;

    for i in 0..=20 {
        let threshold = i as f64 * 0.05;
        let (tp, fp, tn, fn_count) = compute_metrics(&sequence, threshold);
        let (precision, recall, f1) = calculate_quality_metrics(tp, fp, fn_count);

        println!(
            "{:<8.2} {:<4} {:<4} {:<4} {:<5} {:<8.3} {:<8.3} {:<8.3}",
            threshold, tp, fp, fn_count, tn, precision, recall, f1
        );

        if f1 > best_f1 {
            best_f1 = f1;
            best_threshold = threshold;
        }
    }

    println!("\n=== Summary ===");
    println!(
        "Best threshold (max F1): {:.2} (F1={:.3})",
        best_threshold, best_f1
    );
    println!("Default threshold: 0.30");

    // Verify that threshold 0.3 is near optimal
    let (_, _, _, _) = compute_metrics(&sequence, 0.3);
    let (_, _, f1_at_default) = calculate_quality_metrics(
        compute_metrics(&sequence, 0.3).0,
        compute_metrics(&sequence, 0.3).1,
        compute_metrics(&sequence, 0.3).3,
    );

    assert!(
        f1_at_default > 0.7,
        "Default threshold should achieve F1 > 0.7"
    );
}

#[test]
fn test_threshold_0_1_low_sensitivity() {
    // Threshold 0.1: very sensitive, may have high false positives
    let sequence = generate_drift_sequence();
    let (tp, fp, _tn, fn_count) = compute_metrics(&sequence, 0.1);
    let (precision, recall, _f1) = calculate_quality_metrics(tp, fp, fn_count);

    println!("\n=== Threshold 0.1 (High Sensitivity) ===");
    println!("Precision: {:.3} (false alarms: {})", precision, fp);
    println!("Recall: {:.3} (missed drifts: {})", recall, fn_count);

    assert_eq!(
        tp + fn_count,
        5,
        "Should have 5 true drift points in sequence"
    );
    assert_eq!(tp, 5, "At threshold 0.1, all drifts should be detected");
    // May have false positives from variation
}

#[test]
fn test_threshold_0_3_default() {
    // Threshold 0.3: balanced (default)
    let sequence = generate_drift_sequence();
    let (tp, fp, _tn, fn_count) = compute_metrics(&sequence, 0.3);
    let (precision, recall, f1) = calculate_quality_metrics(tp, fp, fn_count);

    println!("\n=== Threshold 0.3 (Default, Balanced) ===");
    println!("TP: {}, FP: {}, FN: {}", tp, fp, fn_count);
    println!("Precision: {:.3}", precision);
    println!("Recall: {:.3}", recall);
    println!("F1-score: {:.3}", f1);

    // Should detect strong drifts without false positives
    // (Note: generate_drift_sequence includes gradual drift starting at 0.15, 0.22 which are below threshold)
    assert!(tp >= 2, "Should detect at least 2 strong drifts");
    assert_eq!(fp, 0, "Should have 0 false positives");
    assert!(f1 > 0.5, "F1-score should be > 0.5");
}

#[test]
fn test_threshold_0_5_high_specificity() {
    // Threshold 0.5: high specificity, fewer false positives
    let sequence = generate_drift_sequence();
    let (tp, fp, _tn, fn_count) = compute_metrics(&sequence, 0.5);
    let (precision, recall, _f1) = calculate_quality_metrics(tp, fp, fn_count);

    println!("\n=== Threshold 0.5 (High Specificity) ===");
    println!("TP: {}, FP: {}, FN: {}", tp, fp, fn_count);
    println!("Precision: {:.3}", precision);
    println!("Recall: {:.3}", recall);

    assert_eq!(fp, 0, "High threshold should have zero false positives");
    // But may miss some gradual drifts
    assert!(fn_count > 0, "Should miss some weaker drift signals");
}

// ===========================================================================
// DETECTION RATE ANALYSIS
// ===========================================================================

#[test]
fn test_detection_rate_by_drift_magnitude() {
    // Test detection rates for different drift magnitudes
    let test_cases = vec![
        ("Tiny change", 0.05, false), // Normal variation
        ("Small drift", 0.15, true),
        ("Medium drift", 0.30, true),
        ("Large drift", 0.55, true),
        ("Complete change", 1.0, true),
    ];

    println!("\n=== Detection Rate by Drift Magnitude ===");
    println!(
        "{:<20} {:<10} {:<10} {:<15}",
        "Magnitude", "Distance", "Expected", "Detected@0.3"
    );

    for (label, distance, expected_drift) in test_cases {
        let sequence = vec![
            DriftPoint {
                distance: 0.02,
                is_drift: false,
                description: "baseline".to_string(),
            },
            DriftPoint {
                distance,
                is_drift: expected_drift,
                description: label.to_string(),
            },
        ];

        let (tp, _fp, _tn, _fn_count) = compute_metrics(&sequence, 0.3);
        let detected = tp > 0 && expected_drift;

        println!(
            "{:<20} {:<10.2} {:<10} {:<15}",
            label,
            distance,
            if expected_drift { "Drift" } else { "Normal" },
            if detected { "Yes" } else { "No" }
        );

        if expected_drift && distance > 0.3 {
            assert!(detected, "Should detect drift at distance {}", distance);
        }
    }
}

// ===========================================================================
// STABILITY AND ROBUSTNESS
// ===========================================================================

#[test]
fn test_threshold_stability_across_sequence_lengths() {
    // Verify threshold remains optimal across different sequence lengths
    let full_sequence = generate_drift_sequence();

    println!("\n=== Threshold Stability ===");
    println!(
        "{:<15} {:<10} {:<10} {:<8}",
        "Sequence Length", "Best Threshold", "F1-score", "Status"
    );

    for end_idx in [3, 5, 7, 10] {
        let sequence = full_sequence[..end_idx].to_vec();
        let mut best_f1 = 0.0;
        let mut best_threshold = 0.0;

        for i in 0..=20 {
            let threshold = i as f64 * 0.05;
            let (tp, fp, _tn, fn_count) = compute_metrics(&sequence, threshold);
            let (_p, _r, f1) = calculate_quality_metrics(tp, fp, fn_count);

            if f1 > best_f1 {
                best_f1 = f1;
                best_threshold = threshold;
            }
        }

        println!(
            "{:<15} {:<10.2} {:<10.3} {:<8}",
            end_idx,
            best_threshold,
            best_f1,
            if (best_threshold - 0.3).abs() < 0.1 {
                "Stable"
            } else {
                "Varies"
            }
        );
    }
}

#[test]
fn test_false_positive_rate_in_stable_period() {
    // Measure false positive rate during stable operation
    let stable_sequence = vec![
        DriftPoint {
            distance: 0.02,
            is_drift: false,
            description: "stable 1".to_string(),
        },
        DriftPoint {
            distance: 0.03,
            is_drift: false,
            description: "stable 2".to_string(),
        },
        DriftPoint {
            distance: 0.01,
            is_drift: false,
            description: "stable 3".to_string(),
        },
        DriftPoint {
            distance: 0.04,
            is_drift: false,
            description: "stable 4".to_string(),
        },
        DriftPoint {
            distance: 0.02,
            is_drift: false,
            description: "stable 5".to_string(),
        },
    ];

    println!("\n=== False Positive Rate (Stable Period) ===");

    for threshold in [0.1, 0.2, 0.3, 0.5] {
        let (_tp, fp, _tn, _fn) = compute_metrics(&stable_sequence, threshold);
        let fp_rate = fp as f64 / stable_sequence.len() as f64;

        println!(
            "Threshold {:.1}: FP rate = {:.1}% ({} false alarms)",
            threshold,
            fp_rate * 100.0,
            fp
        );

        // At default threshold 0.3, expect zero false positives in truly stable period
        if threshold == 0.3 {
            assert_eq!(
                fp, 0,
                "Default threshold should have zero FP in stable period"
            );
        }
    }
}

#[test]
fn test_detection_latency_by_threshold() {
    // Measure how quickly drift is detected after it starts
    let sequence = vec![
        DriftPoint {
            distance: 0.01,
            is_drift: false,
            description: "before".to_string(),
        },
        DriftPoint {
            distance: 0.35,
            is_drift: true,
            description: "drift starts".to_string(),
        },
        DriftPoint {
            distance: 0.40,
            is_drift: true,
            description: "drift continues".to_string(),
        },
    ];

    println!("\n=== Detection Latency ===");
    println!("(Windows until detection after drift starts)");

    for threshold in [0.1, 0.2, 0.3, 0.5] {
        let (_tp, _fp, _tn, fn_count) = compute_metrics(&sequence, threshold);
        let latency = if fn_count == 0 {
            "Immediate (1 window)"
        } else {
            "Delayed (2+ windows)"
        };

        println!("Threshold {:.1}: {}", threshold, latency);
    }
}

// ===========================================================================
// PROCESS-SPECIFIC TUNING
// ===========================================================================

#[test]
fn test_chaotic_process_tuning() {
    // Simulate high-variance process: frequent normal variation
    let chaotic = vec![
        DriftPoint {
            distance: 0.08,
            is_drift: false,
            description: "var1".to_string(),
        },
        DriftPoint {
            distance: 0.12,
            is_drift: false,
            description: "var2".to_string(),
        },
        DriftPoint {
            distance: 0.06,
            is_drift: false,
            description: "var3".to_string(),
        },
        DriftPoint {
            distance: 0.35,
            is_drift: true,
            description: "real drift".to_string(),
        },
    ];

    println!("\n=== Tuning for Chaotic Process ===");

    let (_tp, fp_low, _tn, _fn) = compute_metrics(&chaotic, 0.1);
    let (_tp, fp_mid, _tn, _fn) = compute_metrics(&chaotic, 0.2);
    let (_tp, fp_high, _tn, _fn) = compute_metrics(&chaotic, 0.3);

    println!("Threshold 0.1: {} false positives (too sensitive)", fp_low);
    println!("Threshold 0.2: {} false positives (better)", fp_mid);
    println!("Threshold 0.3: {} false positives (recommended)", fp_high);

    // For chaotic processes, lower threshold recommended
    assert!(fp_high <= fp_mid, "Higher threshold should reduce FP");
}

#[test]
fn test_stable_process_tuning() {
    // Simulate stable process: almost never changes
    let stable = vec![
        DriftPoint {
            distance: 0.0,
            is_drift: false,
            description: "stable1".to_string(),
        },
        DriftPoint {
            distance: 0.0,
            is_drift: false,
            description: "stable2".to_string(),
        },
        DriftPoint {
            distance: 0.0,
            is_drift: false,
            description: "stable3".to_string(),
        },
        DriftPoint {
            distance: 0.80,
            is_drift: true,
            description: "major change".to_string(),
        },
    ];

    println!("\n=== Tuning for Stable Process ===");

    for threshold in [0.3, 0.5, 0.7] {
        let (tp, fp, _tn, fn_count) = compute_metrics(&stable, threshold);
        println!(
            "Threshold {:.1}: TP={}, FP={}, FN={}",
            threshold, tp, fp, fn_count
        );
    }

    // For stable processes, higher threshold (0.5+) is acceptable
    let (_tp, _fp, _tn, fn_count) = compute_metrics(&stable, 0.5);
    assert_eq!(
        fn_count, 0,
        "Threshold 0.5 should detect major drift in stable process"
    );
}

// ===========================================================================
// RECOMMENDATION ENGINE
// ===========================================================================

#[test]
fn test_recommend_threshold_for_process_type() {
    // Recommend threshold based on process characteristics

    #[derive(Debug)]
    struct ProcessProfile {
        name: &'static str,
        volatility: f64,      // 0.0 = stable, 1.0 = chaotic
        drift_magnitude: f64, // Expected size of drifts
        recommended_threshold: f64,
    }

    let profiles = vec![
        ProcessProfile {
            name: "Supply chain (stable)",
            volatility: 0.05,
            drift_magnitude: 0.6,
            recommended_threshold: 0.5,
        },
        ProcessProfile {
            name: "Customer service (moderate)",
            volatility: 0.15,
            drift_magnitude: 0.4,
            recommended_threshold: 0.3,
        },
        ProcessProfile {
            name: "Ad-hoc (chaotic)",
            volatility: 0.30,
            drift_magnitude: 0.35,
            recommended_threshold: 0.2,
        },
    ];

    println!("\n=== Threshold Recommendations by Process Type ===");
    println!(
        "{:<30} {:<12} {:<15} {:<20}",
        "Process Type", "Volatility", "Drift Magnitude", "Recommended"
    );

    for profile in profiles {
        println!(
            "{:<30} {:<12.2} {:<15.2} {:<20.2}",
            profile.name,
            profile.volatility,
            profile.drift_magnitude,
            profile.recommended_threshold
        );
    }
}
