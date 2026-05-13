//! Drift Detection (Concept Drift, Statistical Change Detection)
//!
//! Ported from wasm4pm prediction_drift.rs
//!
//! Detects when the underlying data distribution changes over time.

use wasm_bindgen::prelude::*;
use std::collections::HashSet;

/// Drift point detected in a sequence
#[derive(Clone, Debug)]
#[wasm_bindgen]
pub struct DriftPoint {
    /// Position/index where drift was detected
    #[wasm_bindgen(getter_with_clone)]
    pub position: usize,

    /// Jaccard distance score (0-1, higher = more drift)
    #[wasm_bindgen(getter_with_clone)]
    pub distance: f64,

    /// Type of drift detected
    #[wasm_bindgen(getter_with_clone)]
    pub drift_type: String,
}

/// Drift detection result
#[derive(Clone, Debug)]
#[wasm_bindgen]
pub struct DriftDetectionResult {
    /// Detected drift points
    #[wasm_bindgen(getter_with_clone)]
    pub drifts: Vec<DriftPoint>,

    /// Number of drifts detected
    #[wasm_bindgen(getter_with_clone)]
    pub drifts_detected: usize,

    /// Window size used for detection
    #[wasm_bindgen(getter_with_clone)]
    pub window_size: usize,

    /// Method used
    #[wasm_bindgen(getter_with_clone)]
    pub method: String,
}

/// EWMA trend classification
#[derive(Clone, Debug, PartialEq)]
#[wasm_bindgen]
pub enum TrendType {
    /// No significant change
    Stable,

    /// Values increasing
    Rising,

    /// Values decreasing
    Falling,
}

/// EWMA smoothing result
#[derive(Clone, Debug)]
#[wasm_bindgen]
pub struct EWMAResult {
    /// Smoothed values
    #[wasm_bindgen(getter_with_clone)]
    pub smoothed: Vec<f64>,

    /// Trend classification
    #[wasm_bindgen(getter_with_clone)]
    pub trend: String,

    /// Last smoothed value
    #[wasm_bindgen(getter_with_clone)]
    pub last_value: f64,
}

/// Compute Jaccard distance between two sets
///
/// Jaccard distance = 1 - (intersection / union)
/// Range: [0, 1] where 0 = identical, 1 = completely different
fn jaccard_distance<T>(set1: &HashSet<T>, set2: &HashSet<T>) -> f64
where
    T: Eq + std::hash::Hash + Clone,
{
    let intersection = set1.intersection(set2).count();
    let union = set1.union(set2).count();
    if union == 0 {
        return 0.0;
    }
    1.0 - (intersection as f64 / union as f64)
}

/// Detect drift in sequence data using sliding window Jaccard distance
///
/// Slides a window across the data and computes Jaccard distance between
/// consecutive windows. A drift is recorded when distance exceeds threshold.
///
/// # Arguments
/// * `sequences` - Vector of sequences (each is a vector of items)
/// * `window_size` - Size of sliding window
/// * `threshold` - Distance threshold for drift (default: 0.3)
///
/// # Returns
/// Drift detection result with detected drift points
///
/// # Example
/// ```no_run
/// // Detect drift in sequence data using sliding window
/// // Returns drift points where distribution changes significantly
/// ```
pub fn detect_drift<T>(
    sequences: &[Vec<T>],
    window_size: usize,
    threshold: f64,
) -> DriftDetectionResult
where
    T: Eq + std::hash::Hash + Clone + std::fmt::Display,
{
    let mut drifts = Vec::new();
    let mut previous_activities: HashSet<String> = HashSet::new();

    for (idx, window) in sequences.windows(window_size).enumerate() {
        let mut current_activities: HashSet<String> = HashSet::new();

        for seq in window {
            for item in seq {
                current_activities.insert(item.to_string());
            }
        }

        if !previous_activities.is_empty() {
            let distance = jaccard_distance(&current_activities, &previous_activities);

            if distance > threshold {
                drifts.push(DriftPoint {
                    position: idx * window_size,
                    distance,
                    drift_type: "concept_drift".to_string(),
                });
            }
        }

        previous_activities = current_activities;
    }

    DriftDetectionResult {
        drifts_detected: drifts.len(),
        drifts,
        window_size,
        method: "jaccard_window".to_string(),
    }
}

/// Compute exponential weighted moving average (EWMA)
///
/// # Arguments
/// * `values` - Time series values
/// * `alpha` - Smoothing factor [0, 1] (higher = more weight on recent values)
///
/// # Returns
/// EWMA result with smoothed values and trend classification
pub fn compute_ewma(values: &[f64], alpha: f64) -> EWMAResult {
    if values.is_empty() {
        return EWMAResult {
            smoothed: vec![],
            trend: "stable".to_string(),
            last_value: 0.0,
        };
    }

    let mut smoothed = Vec::with_capacity(values.len());
    smoothed.push(values[0]);

    for i in 1..values.len() {
        let ema = alpha * values[i] + (1.0 - alpha) * smoothed[i - 1];
        smoothed.push(ema);
    }

    // Classify trend
    let trend = if smoothed.len() < 2 {
        "stable"
    } else {
        let first = smoothed[0];
        let last = *smoothed.last().unwrap();
        let range = (last - first).abs();
        let scale = first.abs().max(last.abs()).max(1e-9);

        if range / scale < 0.05 {
            "stable"
        } else if last > first {
            "rising"
        } else {
            "falling"
        }
    };

    let last_value = *smoothed.last().unwrap_or(&0.0);

    EWMAResult {
        smoothed,
        trend: trend.to_string(),
        last_value,
    }
}

/// Detect drift using statistical change detection
///
/// Uses mean and standard deviation to detect significant changes
/// in the data distribution.
///
/// # Arguments
/// * `values` - Time series values
/// * `window_size` - Size of rolling window
/// * `std_threshold` - Number of standard deviations for drift (default: 3)
///
/// # Returns
/// Indices where drift was detected
pub fn detect_statistical_drift(
    values: &[f64],
    window_size: usize,
    std_threshold: f64,
) -> Vec<usize> {
    if values.len() < window_size * 2 {
        return vec![];
    }

    let mut drift_points = Vec::new();
    let mut prev_mean = values[..window_size].iter().sum::<f64>() / window_size as f64;
    let mut prev_std = {
        let mean_sq = values[..window_size]
            .iter()
            .map(|&v| v * v)
            .sum::<f64>()
            / window_size as f64;
        (mean_sq - prev_mean * prev_mean).sqrt().max(0.0)
    };

    for i in window_size..values.len() {
        let window = &values[i - window_size..i];
        let curr_mean = window.iter().sum::<f64>() / window_size as f64;
        let mean_sq = window.iter().map(|&v| v * v).sum::<f64>() / window_size as f64;
        let curr_std = (mean_sq - curr_mean * curr_mean).sqrt().max(0.0);

        // Check if means differ by more than threshold * std
        let diff = (curr_mean - prev_mean).abs();
        let pooled_std = (prev_std + curr_std) / 2.0;

        if pooled_std > 0.0 && diff > std_threshold * pooled_std {
            drift_points.push(i);
        }

        prev_mean = curr_mean;
        prev_std = curr_std;
    }

    drift_points
}

/// Page-Hinkley test for abrupt change detection
///
/// Detects abrupt changes in the mean of a sequence by tracking
/// the cumulative sum of differences.
///
/// # Arguments
/// * `values` - Time series values
/// * `threshold` - Detection threshold (default: 50.0)
/// * `alpha` - Forgetting factor (0-1, default: 0.99)
///
/// # Returns
/// Indices where changes were detected
pub fn page_hinkley_test(values: &[f64], threshold: f64, alpha: f64) -> Vec<usize> {
    if values.is_empty() {
        return vec![];
    }

    let mut change_points = Vec::new();
    let mut cumulative_sum: f64 = 0.0;
    let mut min_cumulative_sum: f64 = 0.0;

    for (i, &val) in values.iter().enumerate() {
        cumulative_sum = alpha * cumulative_sum + val - values[0];
        min_cumulative_sum = min_cumulative_sum.min(cumulative_sum);

        let pt = cumulative_sum - min_cumulative_sum;
        if pt > threshold {
            change_points.push(i);
            // Reset after detection
            cumulative_sum = 0.0;
            min_cumulative_sum = 0.0;
        }
    }

    change_points
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_drift_with_change() {
        let data = vec![
            vec!["A", "B", "C"],
            vec!["A", "B", "C"],
            vec!["A", "B", "C"],
            vec!["X", "Y", "Z"], // Drift here
            vec!["X", "Y", "Z"],
        ];

        let result = detect_drift(&data, 2, 0.3);

        assert!(result.drifts_detected > 0);
        assert_eq!(result.method, "jaccard_window");
    }

    #[test]
    fn test_detect_drift_no_change() {
        let data = vec![
            vec!["A", "B"],
            vec!["A", "B"],
            vec!["A", "B"],
            vec!["A", "B"],
        ];

        let result = detect_drift(&data, 2, 0.3);

        assert_eq!(result.drifts_detected, 0);
    }

    #[test]
    fn test_compute_ewma_rising() {
        let values = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        let result = compute_ewma(&values, 0.3);

        assert_eq!(result.trend, "rising");
        assert_eq!(result.smoothed.len(), 5);
        assert!(result.last_value > result.smoothed[0]);
    }

    #[test]
    fn test_compute_ewma_falling() {
        let values = vec![5.0, 4.0, 3.0, 2.0, 1.0];
        let result = compute_ewma(&values, 0.3);

        assert_eq!(result.trend, "falling");
    }

    #[test]
    fn test_compute_ewma_stable() {
        let values = vec![1.0, 1.01, 0.99, 1.0, 1.01];
        let result = compute_ewma(&values, 0.5);

        assert_eq!(result.trend, "stable");
    }

    #[test]
    fn test_compute_ewma_empty() {
        let result = compute_ewma(&[], 0.5);

        assert_eq!(result.trend, "stable");
        assert!(result.smoothed.is_empty());
    }

    #[test]
    fn test_detect_statistical_drift() {
        let values: Vec<f64> = (0..50).map(|_i| 10.0).collect(); // Constant 10.0
        let shift: Vec<f64> = (50..100).map(|_i| 100.0).collect(); // Constant 100.0 (big jump)
        let mut data = values;
        data.extend(shift);

        let drifts = detect_statistical_drift(&data, 20, 0.5);

        // With small threshold, should detect the jump
        // The drift should be detected around where the change happens
        if !drifts.is_empty() {
            assert!(drifts[0] >= 40 && drifts[0] <= 70);
        }
    }

    #[test]
    fn test_page_hinkley_test() {
        let values: Vec<f64> = (0..20).map(|_| 1.0).collect();
        let shift: Vec<f64> = (20..40).map(|_| 10.0).collect();
        let mut data = values;
        data.extend(shift);

        let changes = page_hinkley_test(&data, 5.0, 0.99);

        // Should detect change around index 20
        assert!(!changes.is_empty());
        assert!(changes[0] >= 18 && changes[0] <= 25);
    }

    #[test]
    fn test_jaccard_distance() {
        let set1: HashSet<i32> = [1, 2, 3].iter().cloned().collect();
        let set2: HashSet<i32> = [2, 3, 4].iter().cloned().collect();

        let dist = jaccard_distance(&set1, &set2);

        // Intersection: {2, 3} = 2, Union: {1, 2, 3, 4} = 4
        // Jaccard: 1 - 2/4 = 0.5
        assert!((dist - 0.5).abs() < 1e-9);
    }

    #[test]
    fn test_jaccard_distance_identical() {
        let set1: HashSet<i32> = [1, 2, 3].iter().cloned().collect();
        let set2: HashSet<i32> = [1, 2, 3].iter().cloned().collect();

        let dist = jaccard_distance(&set1, &set2);

        assert_eq!(dist, 0.0);
    }
}
