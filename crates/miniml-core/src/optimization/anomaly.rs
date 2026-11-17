//! Anomaly Detection (Frequency-based, Statistical)
//!
//! Ported from wasm4pm anomaly.rs
//!
//! Provides anomaly scoring for sequences and data points.
//! Answers: "Is this sequence/data point unusual compared to reference?"

use std::collections::HashMap;
use wasm_bindgen::prelude::*;

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

        for w in seq.windows(2) {
            *freq.entry((w[0].clone(), w[1].clone())).or_default() += 1;
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
pub fn detect_statistical_outliers(values: &[f64], reference: &[f64], threshold: f64) -> Vec<bool> {
    if reference.is_empty() || reference.len() < 2 {
        return vec![false; values.len()];
    }

    // Compute mean and std dev of reference
    let mean: f64 = reference.iter().sum::<f64>() / reference.len() as f64;
    let variance: f64 =
        reference.iter().map(|&v| (v - mean).powi(2)).sum::<f64>() / reference.len() as f64;
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

/// Subsample size (psi) per isolation tree, per Liu et al. 2008.
///
/// Each tree is built on a random subsample of at most this many reference
/// points; sub-sampling swamps the effect of outliers in the training data.
const IF_SUBSAMPLE: usize = 256;

/// Fixed RNG seed — identical inputs always produce a byte-identical score.
const IF_SEED: u64 = 42;

/// Euler–Mascheroni constant, for the harmonic number H(i) = ln(i) + gamma.
const EULER_GAMMA: f64 = 0.577_215_664_901_532_9;

/// XORShift64 PRNG (same algorithm as `optimization/genetic.rs`), local to a
/// call so that scoring is never perturbed by other RNG consumers.
struct XorShift64 {
    state: u64,
}

impl XorShift64 {
    fn new(seed: u64) -> Self {
        Self {
            state: if seed == 0 { 1 } else { seed },
        }
    }

    /// Uniform f64 in [0, 1)
    fn next_f64(&mut self) -> f64 {
        let mut x = self.state;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.state = x;
        (x >> 11) as f64 / (1u64 << 53) as f64
    }
}

/// H(i) = ln(i) + gamma; H(1) defined as 1 (standard convention, gives c(2)=2).
fn harmonic_number(i: usize) -> f64 {
    if i <= 1 {
        1.0
    } else {
        (i as f64).ln() + EULER_GAMMA
    }
}

/// Average path length of an unsuccessful BST search over n points:
/// c(n) = 2H(n-1) - 2(n-1)/n. Returns 0 for n <= 1 (no BST exists).
fn average_path_length(n: usize) -> f64 {
    match n {
        0 | 1 => 0.0,
        2 => 2.0,
        n => 2.0 * harmonic_number(n - 1) - 2.0 * (n - 1) as f64 / n as f64,
    }
}

/// A node of an isolation tree. Leaves record how many training points
/// reached them, used for the unresolved-node path adjustment.
enum ITreeNode {
    Leaf {
        size: usize,
    },
    Split {
        feature: usize,
        split_value: f64,
        left: Box<ITreeNode>,
        right: Box<ITreeNode>,
    },
}

/// Build one isolation tree over `indices` (into `reference`).
///
/// Splitting rule (Liu et al. 2008): pick a random feature q, then a random
/// split value p uniform in (min, max) of feature q over the node's points.
/// A node whose chosen feature has zero range (constant column, or all points
/// equal on q) cannot be split and becomes a leaf — the path adjustment in
/// `path_length` accounts for its remaining points.
fn build_itree(
    indices: &[usize],
    depth: usize,
    height_limit: usize,
    rng: &mut XorShift64,
    reference: &[Vec<f64>],
) -> ITreeNode {
    if depth >= height_limit || indices.len() <= 1 {
        return ITreeNode::Leaf {
            size: indices.len(),
        };
    }

    let feature = (rng.next_f64() * reference[0].len() as f64) as usize;
    let mut min = f64::INFINITY;
    let mut max = f64::NEG_INFINITY;
    for &i in indices {
        let v = reference[i].get(feature).copied().unwrap_or(0.0);
        if v < min {
            min = v;
        }
        if v > max {
            max = v;
        }
    }

    // Zero-range (degenerate) node: cannot partition, treat as leaf.
    if !(max > min) {
        return ITreeNode::Leaf {
            size: indices.len(),
        };
    }

    let mut split_value = min + rng.next_f64() * (max - min);
    if split_value <= min {
        // Guard against rounding to the boundary; midpoint is strictly inside.
        split_value = min + 0.5 * (max - min);
    }

    let left: Vec<usize> = indices
        .iter()
        .copied()
        .filter(|&i| reference[i].get(feature).copied().unwrap_or(0.0) < split_value)
        .collect();
    let right: Vec<usize> = indices
        .iter()
        .copied()
        .filter(|&i| reference[i].get(feature).copied().unwrap_or(0.0) >= split_value)
        .collect();

    ITreeNode::Split {
        feature,
        split_value,
        left: Box::new(build_itree(
            &left, depth + 1, height_limit, rng, reference,
        )),
        right: Box::new(build_itree(
            &right,
            depth + 1,
            height_limit,
            rng,
            reference,
        )),
    }
}

/// Adjusted path length h(x) of `point` through `tree`.
///
/// At a leaf with n > 1 training points (height-limit cutoff or unsplittable
/// node), the expected remaining path is added: h = depth + c(n).
fn path_length(node: &ITreeNode, point: &[f64], depth: usize) -> f64 {
    match node {
        ITreeNode::Leaf { size } => {
            if *size <= 1 {
                depth as f64
            } else {
                depth as f64 + average_path_length(*size)
            }
        }
        ITreeNode::Split {
            feature,
            split_value,
            left,
            right,
        } => {
            let v = point.get(*feature).copied().unwrap_or(0.0);
            if v < *split_value {
                path_length(left, point, depth + 1)
            } else {
                path_length(right, point, depth + 1)
            }
        }
    }
}

/// Canonical Isolation Forest anomaly score (Liu, Ting & Zhou, ICDM 2008).
///
/// Each of `n_trees` trees is built on a random subsample of
/// `psi = min(256, reference.len())` points, splitting on a random feature at
/// a random value in that feature's range, capped at
/// `min(max_depth, ceil(log2 psi))` height. The score is the canonical
/// s(x) = 2^(-E(h)/c(psi)), where E(h) is the mean adjusted path length of
/// `point` over the forest: values near 1 are anomalous (isolated quickly),
/// values near 0.5 or below are normal.
///
/// Fully deterministic: fixed internal seed, no external RNG state.
///
/// # Arguments
/// * `point` - Point to score (vector of features)
/// * `reference` - Reference data points
/// * `n_trees` - Number of isolation trees (default: 100)
/// * `max_depth` - Upper bound on per-tree height (the effective cap is
///   `min(max_depth, ceil(log2 psi))`, matching the paper)
///
/// # Returns
/// Anomaly score in (0, 1); higher = more anomalous
pub fn isolation_forest_score(
    point: &[f64],
    reference: &[Vec<f64>],
    n_trees: usize,
    max_depth: usize,
) -> f64 {
    if reference.is_empty() || point.is_empty() || n_trees == 0 {
        return 0.0;
    }

    let psi = IF_SUBSAMPLE.min(reference.len());
    if psi <= 1 {
        // A single reference point carries no distribution to isolate from.
        return 0.0;
    }

    let height_limit = max_depth.min((psi as f64).log2().ceil() as usize).max(1);
    let norm = average_path_length(psi);
    if norm <= 0.0 {
        return 0.0;
    }

    let mut rng = XorShift64::new(IF_SEED);
    let mut total_path = 0.0;

    for _ in 0..n_trees {
        // Subsample psi points without replacement (partial Fisher–Yates).
        let mut order: Vec<usize> = (0..reference.len()).collect();
        let n = order.len();
        for i in 0..psi.min(n) {
            let j = i + (rng.next_f64() * (n - i) as f64) as usize;
            order.swap(i, j);
        }
        let sample = &order[..psi.min(n)];

        let tree = build_itree(sample, 0, height_limit, &mut rng, reference);
        total_path += path_length(&tree, point, 0);
    }

    let expected_h = total_path / n_trees as f64;
    (-expected_h / norm).exp2()
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
        let sequences = vec![vec!["A", "B", "C"], vec!["A", "B", "C"], vec!["A", "B"]];

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

        // Planted far outlier isolates strictly faster than any inlier.
        assert!(
            anomaly_score > normal_score,
            "anomaly {} must exceed normal {}",
            anomaly_score,
            normal_score
        );
        assert!((0.0..=1.0).contains(&normal_score));
        assert!((0.0..=1.0).contains(&anomaly_score));
    }

    #[test]
    fn test_isolation_forest_deterministic_double_run() {
        let reference: Vec<Vec<f64>> = (0..64)
            .map(|i| vec![i as f64 * 0.25, ((i * 7) % 13) as f64 * 0.5])
            .collect();
        let point = vec![3.0, 4.0];

        let a = isolation_forest_score(&point, &reference, 100, 10);
        let b = isolation_forest_score(&point, &reference, 100, 10);

        // Byte-equal across runs: fixed seed, no external RNG state.
        assert_eq!(a.to_bits(), b.to_bits());
    }

    #[test]
    fn test_isolation_forest_constant_column() {
        // Degenerate case: one constant feature; separation happens on dim 1.
        let reference: Vec<Vec<f64>> = (0..32)
            .map(|i| vec![7.0, (((i * 5) % 9) as f64) * 0.1])
            .collect();
        let inlier = vec![7.0, 0.4];
        let outlier = vec![7.0, 50.0];

        let inlier_score = isolation_forest_score(&inlier, &reference, 100, 10);
        let outlier_score = isolation_forest_score(&outlier, &reference, 100, 10);

        // Old bug scored this 0.0; now constant column is simply unsplittable
        // and the other feature does the isolating.
        assert!(outlier_score > inlier_score);
        assert!(outlier_score > 0.0);
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
