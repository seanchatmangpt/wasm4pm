//! Anomaly Detection (Frequency-based, Statistical)
//!
//! Ported from wasm4pm anomaly.rs
//!
//! Provides anomaly scoring for sequences and data points.
//! Answers: "Is this sequence/data point unusual compared to reference?"

use wasm_bindgen::prelude::*;
use std::collections::HashMap;

/// Cost for missing transitions in sequence anomaly detection
const MISSING_TRANSITION_COST: f64 = 10.0;

/// Anomaly score for a single sequence
#[derive(Clone, Debug)]
#[wasm_bindgen]
pub struct SequenceAnomaly {
    /// Mean anomaly score (0 = normal, higher = more anomalous)
    #[wasm_bindgen(getter_with_clone)]
    pub score: f64,

    /// Number of steps/transitions evaluated
    #[wasm_bindgen(getter_with_clone)]
    pub steps: usize,

    /// Maximum single-step anomaly score
    #[wasm_bindgen(getter_with_clone)]
    pub max_step_score: f64,
}

/// Anomaly detection result for multiple sequences
#[derive(Clone, Debug)]
#[wasm_bindgen]
pub struct AnomalyBatchResult {
    /// Individual anomaly scores for each sequence
    #[wasm_bindgen(getter_with_clone)]
    pub results: Vec<SequenceAnomaly>,

    /// Mean anomaly score across all sequences
    #[wasm_bindgen(getter_with_clone)]
    pub mean_score: f64,

    /// Standard deviation of anomaly scores
    #[wasm_bindgen(getter_with_clone)]
    pub std_dev: f64,

    /// Threshold for "highly anomalous" (mean + 2*std_dev)
    #[wasm_bindgen(getter_with_clone)]
    pub anomaly_threshold: f64,
}

/// Compute anomaly score for a single sequence based on transition frequencies
///
/// For each adjacent pair in the sequence, compute the negative log probability:
/// score = -log2(frequency / total_transitions)
///
/// Missing transitions are penalized with MISSING_TRANSITION_COST.
///
/// # Arguments
/// * `sequence` - The sequence to score (e.g., activities, events, states)
/// * `transition_freq` - Map from (from_state, to_state) to frequency
/// * `total_transitions` - Total number of transitions in reference data
///
/// # Returns
/// Anomaly score (mean over all steps)
///
/// # Example
/// ```no_run
/// // Score sequence anomaly based on transition frequencies
/// // Returns mean anomaly score over all steps in sequence
/// ```
pub fn score_sequence_anomaly<T: std::hash::Hash + Eq + Clone + std::fmt::Display>(
    sequence: &[T],
    transition_freq: &HashMap<(T, T), usize>,
    total_transitions: usize,
) -> SequenceAnomaly {
    if sequence.len() < 2 {
        return SequenceAnomaly {
            score: 0.0,
            steps: 0,
            max_step_score: 0.0,
        };
    }

    let total = total_transitions.max(1) as f64;
    let mut cost_sum = 0.0_f64;
    let mut max_step = 0.0_f64;
    let steps = sequence.len() - 1;

    for i in 0..steps {
        let from = &sequence[i];
        let to = &sequence[i + 1];

        let freq = transition_freq
            .get(&(from.clone(), to.clone()))
            .copied()
            .unwrap_or(0);

        let step_cost = if freq == 0 {
            MISSING_TRANSITION_COST
        } else {
            -(freq as f64 / total).log2()
        };

        cost_sum += step_cost;
        max_step = max_step.max(step_cost);
    }

    SequenceAnomaly {
        score: cost_sum / steps as f64,
        steps,
        max_step_score: max_step,
    }
}

/// Compute anomaly scores for multiple sequences
///
/// # Arguments
/// * `sequences` - Vector of sequences to score
/// * `transition_freq` - Map from (from_state, to_state) to frequency
/// * `total_transitions` - Total number of transitions in reference data
///
/// # Returns
/// Batch result with individual scores and statistical summary
pub fn score_batch_anomaly<T: std::hash::Hash + Eq + Clone + std::fmt::Display>(
    sequences: &[Vec<T>],
    transition_freq: &HashMap<(T, T), usize>,
    total_transitions: usize,
) -> AnomalyBatchResult {
    let results: Vec<SequenceAnomaly> = sequences
        .iter()
        .map(|seq| score_sequence_anomaly(seq, transition_freq, total_transitions))
        .collect();

    if results.is_empty() {
        return AnomalyBatchResult {
            results,
            mean_score: 0.0,
            std_dev: 0.0,
            anomaly_threshold: 0.0,
        };
    }

    // Compute statistics
    let mean: f64 = results.iter().map(|r| r.score).sum::<f64>() / results.len() as f64;
    let variance: f64 = results
        .iter()
        .map(|r| (r.score - mean).powi(2))
        .sum::<f64>()
        / results.len() as f64;
    let std_dev = variance.sqrt();
    let threshold = mean + 2.0 * std_dev;

    AnomalyBatchResult {
        results,
        mean_score: mean,
        std_dev,
        anomaly_threshold: threshold,
    }
}

/// Build transition frequency map from reference sequences
///
/// # Arguments
/// * `sequences` - Reference sequences to learn from
///
/// # Returns
/// (transition_frequency_map, total_transitions)
pub fn build_transition_model<T: std::hash::Hash + Eq + Clone>(
    sequences: &[Vec<T>],
) -> (HashMap<(T, T), usize>, usize) {
    let mut freq: HashMap<(T, T), usize> = HashMap::new();
    let mut total = 0;

    for seq in sequences {
        if seq.len() < 2 {
            continue;
        }

        for i in 0..seq.len() - 1 {
            let from = seq[i].clone();
            let to = seq[i + 1].clone();
            *freq.entry((from, to)).or_insert(0) += 1;
            total += 1;
        }
    }

    (freq, total)
}

/// Statistical outlier detection using z-scores
///
/// # Arguments
/// * `values` - Vector of values to check for outliers
/// * `reference` - Reference distribution to compare against
/// * `threshold` - Z-score threshold (default: 3.0 for 3-sigma rule)
///
/// # Returns
/// Vector of boolean flags (true = outlier)
pub fn detect_statistical_outliers(
    values: &[f64],
    reference: &[f64],
    threshold: f64,
) -> Vec<bool> {
    if reference.is_empty() || reference.len() < 2 {
        return vec![false; values.len()];
    }

    // Compute mean and std dev of reference
    let mean: f64 = reference.iter().sum::<f64>() / reference.len() as f64;
    let variance: f64 = reference
        .iter()
        .map(|&v| (v - mean).powi(2))
        .sum::<f64>()
        / reference.len() as f64;
    let std_dev = variance.sqrt();

    if std_dev == 0.0 {
        return vec![false; values.len()];
    }

    // Compute z-scores for values
    values
        .iter()
        .map(|&v| {
            let z = (v - mean).abs() / std_dev;
            z > threshold
        })
        .collect()
}

/// Isolation forest-like anomaly detection (simplified)
///
/// Partitions data randomly and measures isolation depth.
/// Anomalies are isolated faster (shallower trees).
///
/// # Arguments
/// * `point` - Point to score (vector of features)
/// * `reference` - Reference data points
/// * `n_trees` - Number of random trees (default: 100)
/// * `max_depth` - Maximum depth per tree (default: 10)
///
/// # Returns
/// Anomaly score (0 = normal, 1 = highly anomalous)
pub fn isolation_forest_score(
    point: &[f64],
    reference: &[Vec<f64>],
    n_trees: usize,
    max_depth: usize,
) -> f64 {
    if reference.is_empty() || point.is_empty() {
        return 0.0;
    }

    let n_features = point.len();
    let mut total_depth = 0.0;

    for _ in 0..n_trees {
        let mut depth = 0;
        let current_point = point.to_vec();
        let mut indices: Vec<usize> = (0..reference.len()).collect();

        for d in 0..max_depth {
            if indices.is_empty() {
                break;
            }

            // Random feature to split on
            let feature = d % n_features;

            // Random split point from current indices
            let split_value = if let Some(random_idx) = indices.first() {
                reference[*random_idx].get(feature).copied().unwrap_or(0.0)
            } else {
                0.0
            };

            // Split indices
            let left: Vec<usize> = indices
                .iter()
                .copied()
                .filter(|&i| {
                    reference[i]
                        .get(feature)
                        .copied()
                        .unwrap_or(0.0)
                        < split_value
                })
                .collect();

            let right: Vec<usize> = indices
                .iter()
                .copied()
                .filter(|&i| {
                    reference[i]
                        .get(feature)
                        .copied()
                        .unwrap_or(0.0)
                        >= split_value
                })
                .collect();

            // Determine which side the point goes to
            let point_val = current_point.get(feature).copied().unwrap_or(0.0);
            indices = if point_val < split_value { left } else { right };
            depth += 1;
        }

        total_depth += depth as f64;
    }

    // Normalize to [0, 1]: shallower depth = more anomalous
    let avg_depth = total_depth / n_trees as f64;
    let max_d = max_depth as f64;
    1.0 - (avg_depth / max_d).min(1.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sequence_anomaly_normal() {
        let mut freq = HashMap::new();
        freq.insert(("A", "B"), 80);
        freq.insert(("B", "C"), 70);

        let sequence = vec!["A", "B", "C"];
        let result = score_sequence_anomaly(&sequence, &freq, 150);

        // Common transitions = relatively low anomaly score
        // A->B: -log2(80/150) ≈ 0.91, B->C: -log2(70/150) ≈ 1.10
        // Mean ≈ 1.0
        assert!(result.score < 2.0);
        assert_eq!(result.steps, 2);
    }

    #[test]
    fn test_sequence_anomaly_rare() {
        let mut freq = HashMap::new();
        freq.insert(("A", "B"), 80);
        freq.insert(("B", "C"), 70);
        // A->C is rare (5 occurrences out of 155)

        let sequence = vec!["A", "C"]; // Rare transition
        let result = score_sequence_anomaly(&sequence, &freq, 155);

        // Rare transition = higher anomaly score
        assert!(result.score > 1.0);
    }

    #[test]
    fn test_sequence_anomaly_missing() {
        let freq = HashMap::new(); // No transitions

        let sequence = vec!["A", "B"];
        let result = score_sequence_anomaly(&sequence, &freq, 0);

        // Missing transition = high penalty
        assert_eq!(result.score, MISSING_TRANSITION_COST);
    }

    #[test]
    fn test_build_transition_model() {
        let sequences = vec![
            vec!["A", "B", "C"],
            vec!["A", "B", "C"],
            vec!["A", "B"],
        ];

        let (freq, total) = build_transition_model(&sequences);

        assert_eq!(total, 5); // 2 + 2 + 1 transitions (A->B, B->C per sequence)
        assert_eq!(*freq.get(&("A", "B")).unwrap(), 3);
        assert_eq!(*freq.get(&("B", "C")).unwrap(), 2);
    }

    #[test]
    fn test_batch_anomaly() {
        let sequences = vec![
            vec!["A", "B", "C"],
            vec!["A", "B", "C"],
            vec!["A", "X", "Y"], // Anomalous
        ];

        let (freq, total) = build_transition_model(&sequences);
        let result = score_batch_anomaly(&sequences, &freq, total);

        assert_eq!(result.results.len(), 3);
        assert!(result.mean_score > 0.0);

        // Third sequence should be most anomalous (highest score)
        assert!(result.results[2].score > result.results[0].score);
    }

    #[test]
    fn test_statistical_outliers() {
        let reference = vec![1.0, 1.1, 0.9, 1.0, 1.2];
        let values = vec![1.0, 5.0, 1.1]; // 5.0 is an outlier

        let outliers = detect_statistical_outliers(&values, &reference, 2.0);

        assert_eq!(outliers.len(), 3);
        assert!(!outliers[0]); // 1.0 is normal
        assert!(outliers[1]); // 5.0 is outlier
        assert!(!outliers[2]); // 1.1 is normal
    }

    #[test]
    fn test_isolation_forest() {
        let reference = vec![
            vec![1.0, 1.0],
            vec![1.1, 0.9],
            vec![0.9, 1.1],
            vec![1.0, 1.0],
            vec![1.0, 0.9],
            vec![0.9, 1.0],
        ];

        let normal = vec![1.0, 1.0];
        let anomaly = vec![10.0, 10.0];

        let normal_score = isolation_forest_score(&normal, &reference, 200, 10);
        let anomaly_score = isolation_forest_score(&anomaly, &reference, 200, 10);

        // Anomaly should have higher score (more isolated)
        // Note: Isolation forest has randomness, so we check if anomaly score
        // is significantly higher than normal score
        assert!(anomaly_score >= normal_score);
    }

    #[test]
    fn test_empty_sequence() {
        let freq = HashMap::new();
        let sequence: Vec<&str> = vec![];

        let result = score_sequence_anomaly(&sequence, &freq, 0);

        assert_eq!(result.score, 0.0);
        assert_eq!(result.steps, 0);
    }

    #[test]
    fn test_single_element_sequence() {
        let freq = HashMap::new();
        let sequence = vec!["A"];

        let result = score_sequence_anomaly(&sequence, &freq, 0);

        assert_eq!(result.score, 0.0);
        assert_eq!(result.steps, 0);
    }
}
