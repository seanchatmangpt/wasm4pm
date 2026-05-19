//! Pattern Analysis for YAWL Pattern Dispatch
//!
//! This module analyzes trace structure to dynamically select the most appropriate
//! YAWL workflow pattern for process mining operations. It quantitatively evaluates
//! trace characteristics (concurrency, loops, choice points) to dispatch to the
//! optimal pattern handler.

use crate::pattern_dispatch::PatternType;
use std::collections::{HashMap, HashSet};

/// Trace structure analysis results
#[derive(Debug, Clone)]
pub struct TraceStructureAnalysis {
    /// Primary pattern type detected
    #[cfg(feature = "discovery_advanced")]
    pub primary_pattern: PatternType,
    /// Confidence score [0, 1] for pattern selection
    pub confidence: f64,
    /// Quantitative characteristics of the trace structure
    pub characteristics: StructureCharacteristics,
}

/// Quantitative trace characteristics
///
/// These metrics are computed from raw traces and activity frequencies
/// to enable data-driven pattern selection.
#[derive(Debug, Clone)]
pub struct StructureCharacteristics {
    // Basic metrics
    /// Average number of events per trace
    pub avg_trace_length: f64,
    /// Number of unique activities across all traces
    pub unique_activity_count: usize,

    // Parallelism indicators
    /// Maximum number of distinct outgoing edges from any activity
    pub max_out_degree: usize,
    /// Concurrency score [0, 1] — higher means more parallel execution paths
    pub concurrency_score: f64,

    // Loop indicators
    /// Rework score [0, 1] — higher means more repetitive activity
    pub rework_score: f64,
    /// Whether any trace contains repeated activities
    pub has_repetitions: bool,

    // Choice indicators
    /// Number of branch points (activities with multiple outgoing edges)
    pub branch_points: usize,
    /// Choice score [0, 1] — higher means more decision points
    pub choice_score: f64,
}

/// Analyze trace structure from traces and activity frequencies
///
/// This function computes quantitative characteristics of the event log
/// and selects the most appropriate YAWL pattern based on those characteristics.
///
/// # Arguments
///
/// * `traces` - Vector of traces, where each trace is a vector of activity names
/// * `activity_frequencies` - HashMap mapping activity names to occurrence counts
///
/// # Returns
///
/// A `TraceStructureAnalysis` containing the selected pattern, confidence score,
/// and detailed characteristics.
///
/// # Examples
///
/// ```
/// # use std::collections::HashMap;
/// # use wasm4pm::pattern_analysis::analyze_trace_structure;
/// # use wasm4pm::pattern_dispatch::PatternType;
/// let traces = vec![
///     vec!["A".to_string(), "B".to_string(), "C".to_string()],
///     vec!["A".to_string(), "B".to_string(), "C".to_string()],
/// ];
/// let activity_frequencies = HashMap::new();
///
/// let analysis = analyze_trace_structure(&traces, &activity_frequencies);
/// assert_eq!(analysis.primary_pattern, PatternType::Sequence);
/// ```
pub fn analyze_trace_structure(
    traces: &[Vec<String>],
    activity_frequencies: &HashMap<String, usize>,
) -> TraceStructureAnalysis {
    let chars = compute_characteristics(traces, activity_frequencies);
    let (pattern, confidence) = select_pattern(&chars);

    TraceStructureAnalysis {
        primary_pattern: pattern,
        confidence,
        characteristics: chars,
    }
}

/// Compute quantitative characteristics from traces
fn compute_characteristics(
    traces: &[Vec<String>],
    _activity_frequencies: &HashMap<String, usize>,
) -> StructureCharacteristics {
    // Basic metrics
    let avg_trace_length = if !traces.is_empty() {
        traces.iter().map(|t| t.len()).sum::<usize>() as f64 / traces.len() as f64
    } else {
        0.0
    };

    let unique_activities: HashSet<String> =
        traces.iter().flat_map(|t| t.iter().cloned()).collect();

    // Detect concurrency (activities appearing in different orders)
    let (concurrency_score, max_out_degree) = detect_concurrency(traces);

    // Detect loops (repetitions within traces)
    let (rework_score, has_repetitions) = detect_loops(traces);

    // Detect choice points (branching)
    let (branch_points, choice_score) = detect_choice_points(traces);

    StructureCharacteristics {
        avg_trace_length,
        unique_activity_count: unique_activities.len(),
        max_out_degree,
        concurrency_score,
        rework_score,
        has_repetitions,
        branch_points,
        choice_score,
    }
}

/// Detect concurrency by analyzing activity ordering across traces
///
/// Returns (concurrency_score, max_out_degree)
/// Concurrency score is [0, 1] where higher means more parallel paths
fn detect_concurrency(traces: &[Vec<String>]) -> (f64, usize) {
    if traces.len() < 2 {
        return (0.0, 0);
    }

    // Build orderings from each trace
    let mut orderings: HashSet<(String, String)> = HashSet::new();
    let mut all_activities: HashSet<String> = HashSet::new();

    for trace in traces {
        for i in 0..trace.len().saturating_sub(1) {
            orderings.insert((trace[i].clone(), trace[i + 1].clone()));
            all_activities.insert(trace[i].clone());
            all_activities.insert(trace[i + 1].clone());
        }
    }

    // Count concurrent pairs (A before B in some, B before A in others)
    let mut concurrent_count = 0;
    let activities: Vec<&String> = all_activities.iter().collect();

    for i in 0..activities.len() {
        for j in (i + 1)..activities.len() {
            let a = activities[i];
            let b = activities[j];
            let ab = orderings.contains(&(a.clone(), b.clone()));
            let ba = orderings.contains(&(b.clone(), a.clone()));

            if ab && ba {
                concurrent_count += 1;
            }
        }
    }

    let total_possible = activities.len() * (activities.len() - 1) / 2;
    let concurrency_score = if total_possible > 0 {
        concurrent_count as f64 / total_possible as f64
    } else {
        0.0
    };

    (concurrency_score, activities.len())
}

/// Detect loops by analyzing repetitions within traces
///
/// Returns (rework_score, has_repetitions)
/// Rework score is [0, 1] where higher means more repetitive activity
fn detect_loops(traces: &[Vec<String>]) -> (f64, bool) {
    let mut total_repetitions = 0;
    let mut traces_with_repetitions = 0;

    for trace in traces {
        let mut seen: HashSet<&str> = HashSet::new();
        let mut has_repetition = false;

        for activity in trace {
            if seen.contains(activity.as_str()) {
                has_repetition = true;
                total_repetitions += 1;
            }
            seen.insert(activity.as_str());
        }

        if has_repetition {
            traces_with_repetitions += 1;
        }
    }

    let rework_score = if !traces.is_empty() {
        (traces_with_repetitions as f64 / traces.len() as f64)
            * (total_repetitions as f64 / traces.len() as f64)
    } else {
        0.0
    };

    (rework_score, traces_with_repetitions > 0)
}

/// Detect choice points by analyzing branching structure
///
/// Returns (branch_points, choice_score)
/// Branch points is the count of activities with multiple DIFFERENT outgoing edges
/// Choice score is [0, 1] where higher means more decision points
fn detect_choice_points(traces: &[Vec<String>]) -> (usize, f64) {
    // Track unique successors for each activity
    let mut outgoing: HashMap<String, HashSet<String>> = HashMap::new();

    for trace in traces {
        for i in 0..trace.len().saturating_sub(1) {
            outgoing
                .entry(trace[i].clone())
                .or_default()
                .insert(trace[i + 1].clone());
        }
    }

    // Count activities with multiple unique successors (real branch points)
    let branch_points = outgoing.values().filter(|set| set.len() > 1).count();

    // Choice score based on branch point diversity relative to total activities
    let choice_score = if !traces.is_empty() && !outgoing.is_empty() {
        branch_points as f64 / outgoing.len() as f64
    } else {
        0.0
    };

    (branch_points, choice_score)
}

/// Select the best pattern based on computed characteristics
///
/// Returns (pattern_type, confidence_score)
/// Confidence is [0, 1] where higher means more confident in the selection
fn select_pattern(chars: &StructureCharacteristics) -> (PatternType, f64) {
    // Scoring for each pattern type
    let sequence_score =
        if chars.concurrency_score < 0.2 && !chars.has_repetitions && chars.choice_score < 0.3 {
            0.9
        } else {
            0.0
        };

    let parallel_score = chars.concurrency_score;
    let loop_score = if chars.has_repetitions {
        chars.rework_score
    } else {
        0.0
    };
    let choice_score = chars.choice_score;

    // Select pattern with highest score
    let scores = vec![
        (PatternType::Sequence, sequence_score),
        (PatternType::ParallelSplit, parallel_score),
        (PatternType::StructuredLoop, loop_score),
        (PatternType::ExclusiveChoice, choice_score),
    ];

    let (pattern, confidence) = scores
        .into_iter()
        .max_by(|a, b| a.1.partial_cmp(&b.1).unwrap())
        .unwrap_or((PatternType::Sequence, 0.5));

    (pattern, confidence)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sequence_detection() {
        let traces = vec![
            vec!["A".to_string(), "B".to_string(), "C".to_string()],
            vec!["A".to_string(), "B".to_string(), "C".to_string()],
            vec!["A".to_string(), "B".to_string(), "C".to_string()],
        ];

        let analysis = analyze_trace_structure(&traces, &HashMap::new());

        assert_eq!(analysis.primary_pattern, PatternType::Sequence);
        assert!(!analysis.characteristics.has_repetitions);
        assert!(analysis.characteristics.concurrency_score < 0.2);
    }

    #[test]
    fn test_loop_detection() {
        let traces = vec![vec![
            "A".to_string(),
            "B".to_string(),
            "A".to_string(),
            "C".to_string(),
        ]];

        let analysis = analyze_trace_structure(&traces, &HashMap::new());

        assert!(analysis.characteristics.has_repetitions);
        assert!(analysis.characteristics.rework_score > 0.0);
    }

    #[test]
    fn test_concurrency_detection() {
        let traces = vec![
            vec!["A".to_string(), "B".to_string(), "C".to_string()],
            vec!["A".to_string(), "C".to_string(), "B".to_string()],
        ];

        let analysis = analyze_trace_structure(&traces, &HashMap::new());

        assert!(analysis.characteristics.concurrency_score > 0.0);
    }

    #[test]
    fn test_empty_traces() {
        let traces: Vec<Vec<String>> = vec![];
        let analysis = analyze_trace_structure(&traces, &HashMap::new());

        // Should default to Sequence with low confidence
        assert_eq!(analysis.primary_pattern, PatternType::Sequence);
    }
}
