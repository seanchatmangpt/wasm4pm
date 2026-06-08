//! Tests for RL State Space Dimensionality Analysis
//!
//! Validates:
//! 1. Dimension usage tracking and coverage calculation
//! 2. Bottleneck detection (low-variance dimensions)
//! 3. High-variance dimension identification
//! 4. Gap detection in observed value ranges
//! 5. Multi-dimensional interaction analysis
//! 6. State distribution entropy calculation

#![cfg(feature = "cloud")]

use wasm4pm::{analyze_dimension_usage, format_dimensionality_report, RlState};

#[test]
fn test_dimensionality_analysis_empty_states() {
    let analyzer = analyze_dimension_usage(&[], 0);
    assert_eq!(analyzer.clustering.unique_states, 0);
    assert_eq!(analyzer.clustering.total_states_observed, 0);
    assert_eq!(analyzer.total_cycles, 0);
}

#[test]
fn test_dimensionality_analysis_single_state() {
    let state = RlState {
        health_level: 1,
        event_rate_q: 2,
        activity_count_q: 3,
        spc_alert_level: 0,
        drift_status: 1,
        rework_ratio_q: 2,
        circuit_state: 0,
        cycle_phase: 1,
    };

    let analyzer = analyze_dimension_usage(&[state], 1);
    assert_eq!(analyzer.clustering.unique_states, 1);
    assert_eq!(analyzer.clustering.total_states_observed, 1);
    assert_eq!(analyzer.total_cycles, 1);

    // Each dimension should have exactly 1 unique value
    for report in &analyzer.per_dimension_reports {
        assert_eq!(report.unique_count, 1);
    }
}

#[test]
fn test_dimension_coverage_full_range() {
    // Create states that cover all values in health_level dimension (0-4)
    let mut states = Vec::new();
    for health in 0..=4 {
        states.push(RlState {
            health_level: health,
            event_rate_q: 0,
            activity_count_q: 0,
            spc_alert_level: 0,
            drift_status: 0,
            rework_ratio_q: 0,
            circuit_state: 0,
            cycle_phase: 0,
        });
    }

    let analyzer = analyze_dimension_usage(&states, 5);
    let health_report = &analyzer.per_dimension_reports[0];

    // health_level: 5 unique values / 5 max = 100% coverage
    assert_eq!(health_report.unique_count, 5);
    assert_eq!(health_report.coverage_percent, 100.0);
    assert!(!health_report.is_bottleneck);
    assert!(health_report.gaps.is_empty());
}

#[test]
fn test_bottleneck_detection_single_value() {
    // Create states that only use first value of most dimensions
    let states = vec![RlState {
        health_level: 0,
        event_rate_q: 0,
        activity_count_q: 0,
        spc_alert_level: 0,
        drift_status: 0,
        rework_ratio_q: 0,
        circuit_state: 0,
        cycle_phase: 0,
    }];

    let analyzer = analyze_dimension_usage(&states, 1);

    // Dimensions with many levels should be bottlenecks (1 value out of 8)
    for (i, report) in analyzer.per_dimension_reports.iter().enumerate() {
        if i == 1 || i == 2 || i == 5 {
            // event_rate_q, activity_count_q, rework_ratio_q have 8 levels
            // 1/8 = 12.5% < 30% threshold
            assert!(
                report.is_bottleneck,
                "Dimension {} should be bottleneck (coverage: {:.1}%)",
                report.dimension_name, report.coverage_percent
            );
        }
    }

    // Check that bottleneck_dimensions list is populated
    assert!(!analyzer.clustering.bottleneck_dimensions.is_empty());
}

#[test]
fn test_gap_detection_in_values() {
    // Create states that skip some values
    let mut states = Vec::new();
    for val in [0u8, 2, 4].iter() {
        states.push(RlState {
            health_level: *val,
            event_rate_q: 0,
            activity_count_q: 0,
            spc_alert_level: 0,
            drift_status: 0,
            rework_ratio_q: 0,
            circuit_state: 0,
            cycle_phase: 0,
        });
    }

    let analyzer = analyze_dimension_usage(&states, 3);
    let health_report = &analyzer.per_dimension_reports[0];

    // health_level: observed [0, 2, 4], missing [1, 3]
    assert_eq!(health_report.unique_count, 3);
    assert!(!health_report.gaps.is_empty());

    // Should have gaps at 1 and 3
    let gap_strings: Vec<String> = health_report
        .gaps
        .iter()
        .map(|(s, e)| {
            if s == e {
                format!("{}", s)
            } else {
                format!("{}-{}", s, e)
            }
        })
        .collect();

    assert!(
        gap_strings.iter().any(|g| g == "1"),
        "Missing gap at value 1"
    );
    assert!(
        gap_strings.iter().any(|g| g == "3"),
        "Missing gap at value 3"
    );
}

#[test]
fn test_high_variance_dimension_detection() {
    // Create states that cover most of a dimension's values
    let mut states = Vec::new();
    for event_rate in 0..=7 {
        states.push(RlState {
            health_level: 0,
            event_rate_q: event_rate,
            activity_count_q: 0,
            spc_alert_level: 0,
            drift_status: 0,
            rework_ratio_q: 0,
            circuit_state: 0,
            cycle_phase: 0,
        });
    }

    let analyzer = analyze_dimension_usage(&states, 8);
    let event_rate_report = &analyzer.per_dimension_reports[1];

    // event_rate_q: 8 unique values / 8 max = 100% coverage
    assert_eq!(event_rate_report.unique_count, 8);
    assert_eq!(event_rate_report.coverage_percent, 100.0);
    assert!(event_rate_report.is_high_variance);
    assert!(!analyzer.clustering.high_variance_dimensions.is_empty());
}

#[test]
fn test_multi_dimensional_interaction_coverage() {
    // Create states with different health × SPC combinations
    let mut states = Vec::new();

    // Combinations: (health=0, spc=0), (health=0, spc=1), (health=1, spc=0), (health=1, spc=1)
    for health in [0u8, 1] {
        for spc in [0u8, 1] {
            states.push(RlState {
                health_level: health,
                event_rate_q: 0,
                activity_count_q: 0,
                spc_alert_level: spc,
                drift_status: 0,
                rework_ratio_q: 0,
                circuit_state: 0,
                cycle_phase: 0,
            });
        }
    }

    let analyzer = analyze_dimension_usage(&states, 4);

    // health × SPC interaction: 4 combinations out of theoretical 5 × 4 = 20
    let health_spc_coverage = analyzer.clustering.health_spc_interaction_coverage;
    assert!(health_spc_coverage > 0.0);
    assert!(health_spc_coverage <= 100.0);
    // 4/20 = 20%
    assert!(health_spc_coverage >= 19.0 && health_spc_coverage <= 21.0);
}

#[test]
fn test_state_distribution_entropy() {
    // Create uniform distribution: each state visited once
    let mut states = Vec::new();
    for h in 0..2 {
        for e in 0..2 {
            for a in 0..2 {
                states.push(RlState {
                    health_level: h,
                    event_rate_q: e,
                    activity_count_q: a,
                    spc_alert_level: 0,
                    drift_status: 0,
                    rework_ratio_q: 0,
                    circuit_state: 0,
                    cycle_phase: 0,
                });
            }
        }
    }

    let analyzer = analyze_dimension_usage(&states, 8);
    let entropy = analyzer.clustering.state_distribution_entropy;

    // Uniform distribution should have high entropy (closer to 1.0)
    // With 8 unique states: log2(8) = 3 bits
    // Normalized entropy should be reasonably high
    assert!(entropy > 0.0 && entropy <= 1.0);
}

#[test]
fn test_concentrated_distribution_lower_entropy() {
    // Create concentrated distribution: most visits to one state
    let mut states = Vec::new();

    // Repeat first state 100 times
    for _ in 0..100 {
        states.push(RlState {
            health_level: 0,
            event_rate_q: 0,
            activity_count_q: 0,
            spc_alert_level: 0,
            drift_status: 0,
            rework_ratio_q: 0,
            circuit_state: 0,
            cycle_phase: 0,
        });
    }

    // Add 9 other unique states once each
    for i in 1..10 {
        states.push(RlState {
            health_level: (i % 5) as u8,
            event_rate_q: (i / 5) as u8,
            activity_count_q: 0,
            spc_alert_level: 0,
            drift_status: 0,
            rework_ratio_q: 0,
            circuit_state: 0,
            cycle_phase: 0,
        });
    }

    let analyzer = analyze_dimension_usage(&states, 109);
    let entropy = analyzer.clustering.state_distribution_entropy;

    // Concentrated distribution should have lower entropy
    assert!(entropy > 0.0 && entropy < 0.5);
}

#[test]
fn test_format_dimensionality_report_contains_sections() {
    let state = RlState {
        health_level: 1,
        event_rate_q: 2,
        activity_count_q: 3,
        spc_alert_level: 0,
        drift_status: 1,
        rework_ratio_q: 2,
        circuit_state: 0,
        cycle_phase: 1,
    };

    let analyzer = analyze_dimension_usage(&[state], 100);
    let report_str = format_dimensionality_report(&analyzer);

    // Check for key sections
    assert!(report_str.contains("State Space Dimensionality Analysis"));
    assert!(report_str.contains("Per-Dimension Usage"));
    assert!(report_str.contains("Multi-Dimensional Interactions"));
    assert!(report_str.contains("Exploration Quality"));
    assert!(report_str.contains("health_level"));
    assert!(report_str.contains("entropy"));
}

#[test]
fn test_all_8_dimensions_covered() {
    // Create a diverse set of states to ensure all dimensions are analyzed
    let mut states = Vec::new();
    for health in 0..2 {
        for event in 0..2 {
            for activity in 0..2 {
                for spc in 0..2 {
                    for drift in 0..2 {
                        states.push(RlState {
                            health_level: health,
                            event_rate_q: event,
                            activity_count_q: activity,
                            spc_alert_level: spc,
                            drift_status: drift,
                            rework_ratio_q: 0,
                            circuit_state: 0,
                            cycle_phase: 0,
                        });
                    }
                }
            }
        }
    }

    let analyzer = analyze_dimension_usage(&states, states.len() as u64);

    // Should have exactly 8 dimension reports
    assert_eq!(analyzer.per_dimension_reports.len(), 8);

    // Each report should have the correct dimension index
    for (idx, report) in analyzer.per_dimension_reports.iter().enumerate() {
        assert_eq!(report.dimension_index, idx);
    }
}

#[test]
fn test_dimension_names_correct() {
    let state = RlState {
        health_level: 0,
        event_rate_q: 0,
        activity_count_q: 0,
        spc_alert_level: 0,
        drift_status: 0,
        rework_ratio_q: 0,
        circuit_state: 0,
        cycle_phase: 0,
    };

    let analyzer = analyze_dimension_usage(&[state], 1);
    let expected_names = vec![
        "health_level",
        "event_rate_q",
        "activity_count_q",
        "spc_alert_level",
        "drift_status",
        "rework_ratio_q",
        "circuit_state",
        "cycle_phase",
    ];

    for (i, report) in analyzer.per_dimension_reports.iter().enumerate() {
        assert_eq!(report.dimension_name, expected_names[i]);
    }
}
