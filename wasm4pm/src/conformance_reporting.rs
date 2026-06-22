//! Enhanced conformance reporting with detailed fitness breakdowns and activity-level analytics.
//!
//! Provides detailed per-activity fitness contributions, bottleneck identification,
//! and structured metrics for multi-model comparison.

use crate::models::ConformanceResult;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Activity-level fitness contribution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivityFitnessContribution {
    pub activity: String,
    pub occurrences: usize,
    pub conforming_occurrences: usize,
    pub fitness: f64,
    pub missing_tokens: usize,
    pub consumed_tokens: usize,
    pub produced_tokens: usize,
}

/// Fitness breakdown with token percentages
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FitnessBreakdown {
    pub overall_fitness: f64,
    pub token_missing_pct: f64,
    pub token_produced_pct: f64,
    pub token_consumed_pct: f64,
    pub token_remaining_pct: f64,
    pub total_missing: usize,
    pub total_produced: usize,
    pub total_consumed: usize,
    pub total_remaining: usize,
    pub activity_contributions: Vec<ActivityFitnessContribution>,
    pub bottleneck_activities: Vec<String>,
}

/// Enhanced conformance report combining fitness and precision
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnhancedConformanceReport {
    pub fitness_breakdown: FitnessBreakdown,
    pub precision: Option<f64>,
    pub conforming_traces: usize,
    pub total_traces: usize,
    pub conformance_rate: f64,
    pub trace_details: Option<Vec<TraceConformanceDetail>>,
}

/// Per-trace conformance details (optional, for --detailed output)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TraceConformanceDetail {
    pub case_id: String,
    pub is_conforming: bool,
    pub trace_fitness: f64,
    pub tokens_missing: usize,
    pub tokens_remaining: usize,
    pub deviation_count: usize,
}

/// Compute fitness breakdown from ConformanceResult
pub fn compute_fitness_breakdown(result: &ConformanceResult) -> FitnessBreakdown {
    let mut total_missing = 0usize;
    let mut total_remaining = 0usize;
    let mut activity_map: HashMap<String, ActivityFitnessContribution> = HashMap::new();

    // Aggregate per-trace metrics
    for trace_result in &result.case_fitness {
        total_missing += trace_result.tokens_missing;
        total_remaining += trace_result.tokens_remaining;

        // Process deviations to extract activity information
        for deviation in &trace_result.deviations {
            let activity = &deviation.activity;
            activity_map
                .entry(activity.clone())
                .or_insert_with(|| ActivityFitnessContribution {
                    activity: activity.clone(),
                    occurrences: 0,
                    conforming_occurrences: 0,
                    fitness: 0.0,
                    missing_tokens: 0,
                    consumed_tokens: 0,
                    produced_tokens: 0,
                })
                .missing_tokens += 1;
        }
    }

    // Estimate produced/consumed from overall fitness formula
    // fitness = 1 - (missing + consumed) / (produced + remaining)
    // For approximation, assume balanced token flow
    let total_produced = result
        .case_fitness
        .iter()
        .map(|t| t.trace_fitness as usize)
        .sum::<usize>()
        .max(total_missing);
    let total_consumed = total_missing;

    // Calculate percentages (with safe division)
    let total_tokens = (total_produced + total_remaining).max(1) as f64;
    let token_missing_pct = (total_missing as f64 / total_tokens) * 100.0;
    let token_produced_pct = (total_produced as f64 / total_tokens) * 100.0;
    let token_consumed_pct = (total_consumed as f64 / total_tokens) * 100.0;
    let token_remaining_pct = (total_remaining as f64 / total_tokens) * 100.0;

    // Identify bottleneck activities (those with highest deviation counts)
    let mut activities: Vec<_> = activity_map.values().collect();
    activities.sort_unstable_by_key(|a| std::cmp::Reverse(a.missing_tokens));
    let bottleneck_activities: Vec<String> = activities
        .iter()
        .take(3)
        .map(|a| a.activity.clone())
        .collect();

    FitnessBreakdown {
        overall_fitness: result.avg_fitness,
        token_missing_pct,
        token_produced_pct,
        token_consumed_pct,
        token_remaining_pct,
        total_missing,
        total_produced,
        total_consumed,
        total_remaining,
        activity_contributions: activity_map.into_values().collect(),
        bottleneck_activities,
    }
}

/// Compute enhanced report with optional trace details
pub fn compute_enhanced_report(
    result: &ConformanceResult,
    precision: Option<f64>,
    include_trace_details: bool,
) -> EnhancedConformanceReport {
    let fitness_breakdown = compute_fitness_breakdown(result);
    let conformance_rate = if result.total_cases > 0 {
        result.conforming_cases as f64 / result.total_cases as f64
    } else {
        0.0
    };

    let trace_details = if include_trace_details {
        Some(
            result
                .case_fitness
                .iter()
                .map(|t| TraceConformanceDetail {
                    case_id: t.case_id.clone(),
                    is_conforming: t.is_conforming,
                    trace_fitness: t.trace_fitness,
                    tokens_missing: t.tokens_missing,
                    tokens_remaining: t.tokens_remaining,
                    deviation_count: t.deviations.len(),
                })
                .collect(),
        )
    } else {
        None
    };

    EnhancedConformanceReport {
        fitness_breakdown,
        precision,
        conforming_traces: result.conforming_cases,
        total_traces: result.total_cases,
        conformance_rate,
        trace_details,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::TokenReplayResult;

    #[test]
    fn test_fitness_breakdown_calculation() {
        let result = ConformanceResult {
            case_fitness: vec![TokenReplayResult {
                case_id: "case1".to_string(),
                is_conforming: true,
                trace_fitness: 1.0,
                tokens_missing: 0,
                tokens_remaining: 0,
                deviations: vec![],
            }],
            avg_fitness: 1.0,
            conforming_cases: 1,
            total_cases: 1,
        };

        let breakdown = compute_fitness_breakdown(&result);
        assert_eq!(breakdown.overall_fitness, 1.0);
        assert!(breakdown.token_missing_pct >= 0.0);
    }

    #[test]
    fn test_enhanced_report_generation() {
        let result = ConformanceResult {
            case_fitness: vec![],
            avg_fitness: 0.85,
            conforming_cases: 85,
            total_cases: 100,
        };

        let report = compute_enhanced_report(&result, Some(0.8), false);
        assert_eq!(report.fitness_breakdown.overall_fitness, 0.85);
        assert_eq!(report.precision, Some(0.8));
        assert_eq!(report.conformance_rate, 0.85);
        assert!(report.trace_details.is_none());
    }

    #[test]
    fn test_trace_details_inclusion() {
        let result = ConformanceResult {
            case_fitness: vec![TokenReplayResult {
                case_id: "case1".to_string(),
                is_conforming: true,
                trace_fitness: 0.9,
                tokens_missing: 1,
                tokens_remaining: 0,
                deviations: vec![],
            }],
            avg_fitness: 0.9,
            conforming_cases: 1,
            total_cases: 1,
        };

        let report = compute_enhanced_report(&result, None, true);
        assert!(report.trace_details.is_some());
        let details = report.trace_details.unwrap();
        assert_eq!(details.len(), 1);
        assert_eq!(details[0].case_id, "case1");
        assert_eq!(details[0].trace_fitness, 0.9);
    }
}
