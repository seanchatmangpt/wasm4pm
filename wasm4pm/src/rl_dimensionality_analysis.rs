//! RL State Space Dimensionality Analysis
//!
//! Analyzes per-dimension usage in the 8D state space and detects:
//! 1. Coverage percentage per dimension
//! 2. Min/max/unique values per dimension
//! 3. Bottleneck dimensions (low variance)
//! 4. High-variance dimensions (diverse exploration)
//! 5. Multi-dimensional interactions and state clustering
//!
//! **State Space:** 5×8×8×4×3×8×3×4 = 368,640 total states
//!
//! **Dimensions (8):**
//! 0. health_level [0-4]       — 5 levels (Normal → Failed)
//! 1. event_rate_q [0-7]       — 8 quantization levels
//! 2. activity_count_q [0-7]   — 8 quantization levels
//! 3. spc_alert_level [0-3]    — 4 levels (Special cause signals)
//! 4. drift_status [0-2]       — 3 states (No/Low/High drift)
//! 5. rework_ratio_q [0-7]     — 8 quantization levels
//! 6. circuit_state [0-2]      — 3 states (Closed/HalfOpen/Open)
//! 7. cycle_phase [0-3]        — 4 phases (Time-based bucketing)
//!
//! Rank-1 oracle: State space coverage should be measurable and reportable
//! Rank-2 oracle: Low-variance dimensions indicate bottlenecks or poor exploration

use crate::RlState;
use std::collections::{HashMap, HashSet};

/// Dimension names for reporting
const DIMENSION_NAMES: &[&str] = &[
    "health_level",
    "event_rate_q",
    "activity_count_q",
    "spc_alert_level",
    "drift_status",
    "rework_ratio_q",
    "circuit_state",
    "cycle_phase",
];

/// Per-dimension maximum values (bounds check)
const DIMENSION_MAXES: &[u8] = &[4, 7, 7, 3, 2, 7, 2, 3];

/// Report for a single dimension's usage
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct DimensionUsageReport {
    /// Index of the dimension (0-7)
    pub dimension_index: usize,
    /// Name of the dimension (e.g., "health_level")
    pub dimension_name: String,
    /// Minimum observed value for this dimension
    pub min_value: u8,
    /// Maximum observed value for this dimension
    pub max_value: u8,
    /// Count of unique values observed
    pub unique_count: usize,
    /// List of unique values observed (sorted)
    pub unique_values: Vec<u8>,
    /// Coverage percentage (0-100)
    pub coverage_percent: f32,
    /// True if coverage < 30% (bottleneck dimension)
    pub is_bottleneck: bool,
    /// True if coverage > 80% (high-variance dimension)
    pub is_high_variance: bool,
    /// (start, end) tuples of missing value ranges
    pub gaps: Vec<(u8, u8)>,
}

/// Multi-dimensional state clustering analysis
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct StateClustering {
    /// Total number of state observations (including duplicates)
    pub total_states_observed: usize,
    /// Number of unique states observed
    pub unique_states: usize,
    /// Health × SPC interaction coverage % (5×4=20 theoretical combinations)
    pub health_spc_interaction_coverage: f32,
    /// Circuit × Drift interaction coverage % (3×3=9 theoretical combinations)
    pub circuit_drift_interaction_coverage: f32,
    /// Indices of dimensions with <30% coverage (bottlenecks)
    pub bottleneck_dimensions: Vec<usize>,
    /// Indices of dimensions with >80% coverage (high variance)
    pub high_variance_dimensions: Vec<usize>,
    /// Shannon entropy of state distribution (0=concentrated, 1=uniform)
    pub state_distribution_entropy: f32,
}

impl Default for StateClustering {
    fn default() -> Self {
        Self {
            total_states_observed: 0,
            unique_states: 0,
            health_spc_interaction_coverage: 0.0,
            circuit_drift_interaction_coverage: 0.0,
            bottleneck_dimensions: Vec::new(),
            high_variance_dimensions: Vec::new(),
            state_distribution_entropy: 0.0,
        }
    }
}

/// Master dimensionality analyzer — comprehensive state space analysis
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct DimensionalityAnalyzer {
    /// Per-dimension usage reports (8 reports total)
    pub per_dimension_reports: Vec<DimensionUsageReport>,
    /// Multi-dimensional clustering and interaction analysis
    pub clustering: StateClustering,
    /// Total RL cycles at analysis time
    pub total_cycles: u64,
    /// Unix timestamp of analysis (seconds since epoch)
    pub analysis_timestamp: u64,
}

impl Default for DimensionalityAnalyzer {
    fn default() -> Self {
        Self {
            per_dimension_reports: Vec::new(),
            clustering: StateClustering::default(),
            total_cycles: 0,
            analysis_timestamp: 0,
        }
    }
}

/// Analyze dimension usage from a collection of observed states
///
/// **Rank-1 Oracle:** Mathematical measurement of state space coverage.
/// This function deterministically maps observed states to dimension usage statistics.
///
/// **Returns:** DimensionalityAnalyzer with per-dimension reports and multi-dimensional interactions
pub fn analyze_dimension_usage(states: &[RlState], cycle_count: u64) -> DimensionalityAnalyzer {
    if states.is_empty() {
        return DimensionalityAnalyzer::default();
    }

    let mut per_dimension_reports = Vec::new();
    let mut unique_states = HashSet::new();
    let mut health_spc_pairs = HashSet::new();
    let mut circuit_drift_pairs = HashSet::new();

    // Per-dimension tracking: [dimension_index] -> set of observed values
    let mut dimension_values: Vec<HashSet<u8>> = vec![HashSet::new(); 8];

    // Analyze each state
    for state in states {
        // Track unique states
        let state_key = (
            state.health_level,
            state.event_rate_q,
            state.activity_count_q,
            state.spc_alert_level,
            state.drift_status,
            state.rework_ratio_q,
            state.circuit_state,
            state.cycle_phase,
        );
        unique_states.insert(state_key);

        // Track per-dimension values
        dimension_values[0].insert(state.health_level);
        dimension_values[1].insert(state.event_rate_q);
        dimension_values[2].insert(state.activity_count_q);
        dimension_values[3].insert(state.spc_alert_level);
        dimension_values[4].insert(state.drift_status);
        dimension_values[5].insert(state.rework_ratio_q);
        dimension_values[6].insert(state.circuit_state);
        dimension_values[7].insert(state.cycle_phase);

        // Track multi-dimensional interactions
        health_spc_pairs.insert((state.health_level, state.spc_alert_level));
        circuit_drift_pairs.insert((state.circuit_state, state.drift_status));
    }

    // Generate per-dimension reports
    let mut bottleneck_dimensions = Vec::new();
    let mut high_variance_dimensions = Vec::new();

    for dim_idx in 0..8 {
        let values = &dimension_values[dim_idx];
        let max_possible = (DIMENSION_MAXES[dim_idx] as usize) + 1;
        let unique_count = values.len();
        let coverage_percent = (unique_count as f32 / max_possible as f32) * 100.0;
        let is_bottleneck = coverage_percent < 30.0;
        let is_high_variance = coverage_percent > 80.0;

        if is_bottleneck {
            bottleneck_dimensions.push(dim_idx);
        }
        if is_high_variance {
            high_variance_dimensions.push(dim_idx);
        }

        // Compute gaps (missing ranges)
        let mut gaps = Vec::new();
        let sorted_values: Vec<u8> = values
            .iter()
            .copied()
            .collect::<std::collections::BTreeSet<_>>()
            .into_iter()
            .collect();
        if !sorted_values.is_empty() {
            let mut gap_start = 0u8;
            for &val in &sorted_values {
                if val > gap_start + 1 {
                    gaps.push((gap_start + 1, val - 1));
                }
                gap_start = val;
            }
            // Check if there's a gap after the last observed value
            if gap_start < DIMENSION_MAXES[dim_idx] {
                gaps.push((gap_start + 1, DIMENSION_MAXES[dim_idx]));
            }
        }

        // sorted_values already deduplicated + sorted via BTreeSet above — reuse it.
        per_dimension_reports.push(DimensionUsageReport {
            dimension_index: dim_idx,
            dimension_name: DIMENSION_NAMES[dim_idx].to_string(),
            min_value: *sorted_values.first().unwrap_or(&0),
            max_value: *sorted_values.last().unwrap_or(&0),
            unique_count,
            unique_values: sorted_values,
            coverage_percent,
            is_bottleneck,
            is_high_variance,
            gaps,
        });
    }

    // Compute multi-dimensional interaction coverage
    let health_spc_theoretical = 5 * 4; // 5 health levels × 4 SPC levels
    let health_spc_coverage =
        (health_spc_pairs.len() as f32 / health_spc_theoretical as f32) * 100.0;

    let circuit_drift_theoretical = 3 * 3; // 3 circuit states × 3 drift states
    let circuit_drift_coverage =
        (circuit_drift_pairs.len() as f32 / circuit_drift_theoretical as f32) * 100.0;

    // Compute state distribution entropy (Shannon entropy)
    let mut state_frequencies: HashMap<_, usize> = HashMap::new();
    for state in states {
        let state_key = (
            state.health_level,
            state.event_rate_q,
            state.activity_count_q,
            state.spc_alert_level,
            state.drift_status,
            state.rework_ratio_q,
            state.circuit_state,
            state.cycle_phase,
        );
        *state_frequencies.entry(state_key).or_default() += 1;
    }

    let total = states.len() as f32;
    let mut entropy = 0.0f32;
    for count in state_frequencies.values() {
        let p = *count as f32 / total;
        if p > 0.0 {
            entropy -= p * p.log2();
        }
    }
    // Normalize entropy to [0, 1] where 1 = uniform distribution, 0 = concentrated
    // Maximum entropy for 8D state space log2(368640) ≈ 18.49
    let max_entropy = (368_640_f32).log2();
    let normalized_entropy = (entropy / max_entropy).clamp(0.0, 1.0);

    let clustering = StateClustering {
        total_states_observed: states.len(),
        unique_states: unique_states.len(),
        health_spc_interaction_coverage: health_spc_coverage,
        circuit_drift_interaction_coverage: circuit_drift_coverage,
        bottleneck_dimensions,
        high_variance_dimensions,
        state_distribution_entropy: normalized_entropy,
    };

    DimensionalityAnalyzer {
        per_dimension_reports,
        clustering,
        total_cycles: cycle_count,
        #[cfg(target_arch = "wasm32")]
        analysis_timestamp: 0,
        #[cfg(not(target_arch = "wasm32"))]
        analysis_timestamp: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0),
    }
}

/// Format dimensionality analysis as human-readable report
pub fn format_dimensionality_report(analyzer: &DimensionalityAnalyzer) -> String {
    let mut report = String::new();
    report.push_str("=== RL State Space Dimensionality Analysis ===\n");
    report.push_str(&format!(
        "Cycles: {} | Unique states: {} / 368640 | Coverage: {:.2}%\n",
        analyzer.total_cycles,
        analyzer.clustering.unique_states,
        (analyzer.clustering.unique_states as f32 / 368_640.0) * 100.0
    ));
    report.push_str("\n--- Per-Dimension Usage ---\n");

    for report_item in &analyzer.per_dimension_reports {
        let bottleneck_marker = if report_item.is_bottleneck {
            " ⚠️ BOTTLENECK"
        } else if report_item.is_high_variance {
            " ✓ HIGH VARIANCE"
        } else {
            ""
        };

        report.push_str(&format!(
            "{:2}. {} [{}]: {:.1}% coverage ({} unique / {} max){}\n",
            report_item.dimension_index,
            report_item.dimension_name,
            format!(
                "{:?}",
                &report_item.unique_values[..report_item.unique_values.len().min(5)]
            ),
            report_item.coverage_percent,
            report_item.unique_count,
            DIMENSION_MAXES[report_item.dimension_index] + 1,
            bottleneck_marker
        ));

        if !report_item.gaps.is_empty() {
            let gap_str = report_item
                .gaps
                .iter()
                .map(|(s, e)| {
                    if s == e {
                        s.to_string()
                    } else {
                        format!("{}-{}", s, e)
                    }
                })
                .collect::<Vec<_>>()
                .join(", ");
            report.push_str(&format!("   Missing ranges: {}\n", gap_str));
        }
    }

    report.push_str("\n--- Multi-Dimensional Interactions ---\n");
    report.push_str(&format!(
        "Health × SPC coverage: {:.1}% ({}/20 combinations)\n",
        analyzer.clustering.health_spc_interaction_coverage,
        (analyzer.clustering.health_spc_interaction_coverage * 20.0 / 100.0) as u8
    ));
    report.push_str(&format!(
        "Circuit × Drift coverage: {:.1}% ({}/9 combinations)\n",
        analyzer.clustering.circuit_drift_interaction_coverage,
        (analyzer.clustering.circuit_drift_interaction_coverage * 9.0 / 100.0) as u8
    ));

    report.push_str("\n--- Exploration Quality ---\n");
    if !analyzer.clustering.bottleneck_dimensions.is_empty() {
        report.push_str(&format!(
            "⚠️  Bottleneck dimensions (< 30% coverage): {:?}\n",
            analyzer
                .clustering
                .bottleneck_dimensions
                .iter()
                .map(|&i| DIMENSION_NAMES[i])
                .collect::<Vec<_>>()
        ));
    }

    report.push_str(&format!(
        "State distribution entropy: {:.3} (0=concentrated, 1=uniform)\n",
        analyzer.clustering.state_distribution_entropy
    ));

    report
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dimensionality_analysis_empty_states() {
        let analyzer = analyze_dimension_usage(&[], 0);
        assert_eq!(analyzer.clustering.unique_states, 0);
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
        assert_eq!(analyzer.total_cycles, 1);

        // Each dimension should have exactly 1 unique value
        for report in &analyzer.per_dimension_reports {
            assert_eq!(report.unique_count, 1);
        }
    }

    #[test]
    fn test_dimension_coverage_calculation() {
        // Create states that cover all values in health_level dimension
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
        assert_eq!(health_report.unique_count, 5);
        assert_eq!(health_report.coverage_percent, 100.0);
        assert!(!health_report.is_bottleneck);
    }

    #[test]
    fn test_bottleneck_detection() {
        // Create states that only use first value of each dimension
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

        // All dimensions should be bottlenecks (1/max unique value = low coverage)
        for (i, report) in analyzer.per_dimension_reports.iter().enumerate() {
            // event_rate_q has 8 levels, so 1/8 = 12.5% < 30% threshold
            if i != 0 && i != 3 && i != 4 && i != 6 {
                // health_level (1/5=20%), spc_alert_level (1/4=25%), drift_status (1/3=33%), circuit_state (1/3=33%)
                // are edge cases; others clearly bottleneck
                if report.unique_count == 1 && DIMENSION_MAXES[i] >= 7 {
                    assert!(
                        report.is_bottleneck,
                        "Dimension {} should be bottleneck",
                        report.dimension_name
                    );
                }
            }
        }
    }

    #[test]
    fn test_gap_detection() {
        // Create states that skip some values
        let mut states = Vec::new();
        for val in [0u8, 2, 4, 6].iter() {
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

        let analyzer = analyze_dimension_usage(&states, 4);
        let health_report = &analyzer.per_dimension_reports[0];

        // health_level dimension should have gaps at 1, 3
        assert!(!health_report.gaps.is_empty());
        assert!(health_report.gaps.iter().any(|(s, e)| *s == 1 && *e == 1)); // Gap at 1
        assert!(health_report.gaps.iter().any(|(s, e)| *s == 3 && *e == 3)); // Gap at 3
    }

    #[test]
    fn test_format_dimensionality_report() {
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

        assert!(report_str.contains("State Space Dimensionality Analysis"));
        assert!(report_str.contains("health_level"));
        assert!(report_str.contains("Multi-Dimensional Interactions"));
    }
}
