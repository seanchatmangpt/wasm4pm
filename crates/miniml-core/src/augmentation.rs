//! Data augmentation techniques
//!
//! Provides SMOTE, random oversampling, noise injection, mixup, and time series augmentation.

use crate::error::MlError;
use wasm_bindgen::prelude::*;
use std::f64::consts::E;

/// SMOTE (Synthetic Minority Over-sampling Technique)
///
/// # Arguments
/// * `X` - Feature matrix (n_samples × n_features)
/// * `y` - Labels (n_samples)
/// * `k` - Number of neighbors for SMOTE
/// * `sampling_rate` - Desired ratio of minority to majority samples
/// * `n_samples` - Total number of samples
/// * `n_features` - Number of features
#[wasm_bindgen]
pub fn smote(
    X: &[f64],
    y: &[f64],
    k: usize,
    sampling_rate: f64,
    n_samples: usize,
    n_features: usize,
) -> Result<js_sys::Array, JsError> {
    // Identify minority and majority classes (using u64 bits for HashMap key)
    let mut class_counts: std::collections::HashMap<u64, usize> = std::collections::HashMap::new();

    for &label in y.iter() {
        let label_bits = label.to_bits();
        *class_counts.entry(label_bits).or_insert(0) += 1;
    }

    // Find minority class (smallest count)
    let minority_class_bits = class_counts
        .iter()
        .min_by(|a, b| a.1.cmp(b.1))
        .map(|(bits, _count)| *bits)
        .ok_or_else(|| JsError::new("Need at least 2 classes"))?;

    // Find majority class (largest count)
    let majority_class_bits = class_counts
        .iter()
        .max_by(|a, b| a.1.cmp(b.1))
        .map(|(bits, _count)| *bits)
        .ok_or_else(|| JsError::new("Need at least 2 classes"))?;

    let minority_class = f64::from_bits(minority_class_bits);
    let majority_class = f64::from_bits(majority_class_bits);

    // Separate minority and majority samples
    let mut minority_indices = Vec::new();
    let mut majority_indices = Vec::new();

    for (i, &label) in y.iter().enumerate() {
        if label == minority_class {
            minority_indices.push(i);
        } else {
            majority_indices.push(i);
        }
    }

    let n_minority = minority_indices.len();
    let n_majority = majority_indices.len();
    let target_minority = (n_majority as f64 * sampling_rate) as usize;

    if n_minority == 0 {
        return Err(JsError::new("No minority samples found"));
    }

    // Generate synthetic samples
    let mut synthetic_X = Vec::new();
    let mut synthetic_y = Vec::new();

    let n_synthetic = target_minority.saturating_sub(n_minority);

    for _ in 0..n_synthetic {
        // Select random minority sample
        let idx = minority_indices[(js_sys::Math::random() * n_minority as f64).floor() as usize];

        // Find k nearest neighbors from minority class
        let mut distances = Vec::new();

        for &minority_idx in &minority_indices {
            if minority_idx == idx {
                continue;
            }

            let start_a = idx * n_features;
            let end_a = start_a + n_features;
            let start_b = minority_idx * n_features;
            let end_b = start_b + n_features;

            let mut dist = 0.0;
            for j in 0..n_features {
                let diff = X[start_a + j] - X[start_b + j];
                dist += diff * diff;
            }

            distances.push((dist.sqrt(), minority_idx));
        }

        // Sort by distance and select k nearest
        distances.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());
        let k_neighbors = distances.iter().take(k.min(distances.len())).collect::<Vec<_>>();

        // Generate synthetic sample
        let mut new_sample = vec![0.0; n_features];

        for j in 0..n_features {
            let original_val = X[idx * n_features + j];

            let mut neighbor_sum = 0.0;
            for (_, neighbor_idx) in &k_neighbors {
                neighbor_sum += X[neighbor_idx * n_features + j];
            }

            let neighbor_avg = neighbor_sum / k_neighbors.len() as f64;
            let diff = neighbor_avg - original_val;

            // Random interpolation
            let gap = js_sys::Math::random();
            new_sample[j] = original_val + gap * diff;
        }

        synthetic_X.extend(new_sample);
        synthetic_y.push(minority_class);
    }

    // Combine original and synthetic data
    let mut result_X = X.to_vec();
    let mut result_y = y.to_vec();

    result_X.extend(synthetic_X);
    result_y.extend(synthetic_y);

    // Return as arrays
    let x_array = js_sys::Array::new();
    for val in result_X {
        x_array.push(&JsValue::from_f64(val));
    }

    let y_array = js_sys::Array::new();
    for val in result_y {
        y_array.push(&JsValue::from_f64(val));
    }

    let result = js_sys::Array::new();
    result.push(&x_array);
    result.push(&y_array);

    Ok(result)
}

/// Random oversampling
///
/// # Arguments
/// * `X` - Feature matrix (n_samples × n_features)
/// * `y` - Labels (n_samples)
/// * `target_ratio` - Desired ratio of minority to majority samples
/// * `n_samples` - Total number of samples
/// * `n_features` - Number of features
#[wasm_bindgen]
pub fn random_oversample(
    X: &[f64],
    y: &[f64],
    target_ratio: f64,
    n_samples: usize,
    n_features: usize,
) -> Result<js_sys::Array, JsError> {
    // Identify minority and majority classes (using u64 bits for HashMap key)
    let mut class_counts: std::collections::HashMap<u64, usize> = std::collections::HashMap::new();

    for &label in y.iter() {
        let label_bits = label.to_bits();
        *class_counts.entry(label_bits).or_insert(0) += 1;
    }

    // Find minority class (smallest count)
    let minority_class_bits = class_counts
        .iter()
        .min_by(|a, b| a.1.cmp(b.1))
        .map(|(bits, _count)| *bits)
        .ok_or_else(|| JsError::new("Need at least 2 classes"))?;

    // Find majority class (largest count)
    let majority_class_bits = class_counts
        .iter()
        .max_by(|a, b| a.1.cmp(b.1))
        .map(|(bits, _count)| *bits)
        .ok_or_else(|| JsError::new("Need at least 2 classes"))?;

    let minority_class = f64::from_bits(minority_class_bits);
    let majority_class = f64::from_bits(majority_class_bits);

    // Separate minority and majority samples
    let mut minority_indices = Vec::new();
    let mut majority_indices = Vec::new();

    for (i, &label) in y.iter().enumerate() {
        if label == minority_class {
            minority_indices.push(i);
        } else {
            majority_indices.push(i);
        }
    }

    let n_minority = minority_indices.len();
    let n_majority = majority_indices.len();
    let target_minority = (n_majority as f64 * target_ratio) as usize;

    // Oversample minority class
    let mut result_X = X.to_vec();
    let mut result_y = y.to_vec();

    let n_to_add = target_minority.saturating_sub(n_minority);

    for _ in 0..n_to_add {
        let idx = minority_indices[(js_sys::Math::random() * n_minority as f64).floor() as usize];
        let start = idx * n_features;
        let end = start + n_features;

        result_X.extend_from_slice(&X[start..end]);
        result_y.push(minority_class);
    }

    // Return as arrays
    let x_array = js_sys::Array::new();
    for val in result_X {
        x_array.push(&JsValue::from_f64(val));
    }

    let y_array = js_sys::Array::new();
    for val in result_y {
        y_array.push(&JsValue::from_f64(val));
    }

    let result = js_sys::Array::new();
    result.push(&x_array);
    result.push(&y_array);

    Ok(result)
}

/// Noise injection for regularization (pure Rust, no WASM dependency)
///
/// # Arguments
/// * `X` - Feature matrix (n_samples × n_features)
/// * `noise_level` - Standard deviation of Gaussian noise
/// * `distribution` - Type of noise ("gaussian", "uniform")
/// * `n_samples` - Number of samples
/// * `n_features` - Number of features
/// * `rng` - Random number generator function
pub fn inject_noise_impl<F: Fn() -> f64>(
    X: &[f64],
    noise_level: f64,
    distribution: &str,
    n_samples: usize,
    n_features: usize,
    rng: &F,
) -> Vec<f64> {
    let mut noisy_X = Vec::with_capacity(X.len());

    for i in 0..n_samples {
        for j in 0..n_features {
            let val = X[i * n_features + j];
            let noise = match distribution {
                "gaussian" => {
                    // Box-Muller transform for normal distribution
                    let u1 = rng();
                    let u2 = rng();
                    let z = (-2.0 * u1.ln()).sqrt() * (2.0 * std::f64::consts::PI * u2).cos();
                    noise_level * z
                }
                "uniform" => {
                    let u = rng();
                    noise_level * (u - 0.5) * 2.0
                }
                _ => 0.0,
            };

            noisy_X.push(val + noise);
        }
    }

    noisy_X
}

#[wasm_bindgen]
pub fn inject_noise(
    X: &[f64],
    noise_level: f64,
    distribution: &str,
    n_samples: usize,
    n_features: usize,
) -> Vec<f64> {
    inject_noise_impl(X, noise_level, distribution, n_samples, n_features, &|| js_sys::Math::random())
}

/// Mixup augmentation
///
/// # Arguments
/// * `X1` - First dataset (n_samples1 × n_features)
/// * `y1` - First dataset labels
/// * `X2` - Second dataset (n_samples2 × n_features)
/// * `y2` - Second dataset labels
/// * `alpha` - Mixup interpolation strength
/// * `n_samples1` - Number of samples in first dataset
/// * `n_samples2` - Number of samples in second dataset
/// * `n_features` - Number of features
#[wasm_bindgen]
pub fn mixup(
    X1: &[f64],
    y1: &[f64],
    X2: &[f64],
    y2: &[f64],
    alpha: f64,
    n_samples1: usize,
    n_samples2: usize,
    n_features: usize,
) -> Result<js_sys::Array, JsError> {
    let n_mixup = n_samples1.min(n_samples2);

    let mut mixed_X = Vec::with_capacity(n_mixup * n_features);
    let mut mixed_y = Vec::with_capacity(n_mixup);

    for i in 0..n_mixup {
        // Sample lambda from Beta(alpha, alpha)
        let lambda = sample_beta(alpha, alpha);

        // Mix features
        for j in 0..n_features {
            let val1 = X1[i * n_features + j];
            let val2 = X2[i * n_features + j];
            mixed_X.push(lambda * val1 + (1.0 - lambda) * val2);
        }

        // Mix labels
        let label1 = y1[i];
        let label2 = y2[i];
        mixed_y.push(lambda * label1 + (1.0 - lambda) * label2);
    }

    // Return as arrays
    let x_array = js_sys::Array::new();
    for val in mixed_X {
        x_array.push(&JsValue::from_f64(val));
    }

    let y_array = js_sys::Array::new();
    for val in mixed_y {
        y_array.push(&JsValue::from_f64(val));
    }

    let result = js_sys::Array::new();
    result.push(&x_array);
    result.push(&y_array);

    Ok(result)
}

/// Time series warping
///
/// # Arguments
/// * `series` - Time series data
/// * `warp_factor` - Warping factor (>1 stretches, <1 compresses)
/// * `n_samples` - Length of series
#[wasm_bindgen]
pub fn time_series_warp(series: &[f64], warp_factor: f64, n_samples: usize) -> Vec<f64> {
    let n_warped = (n_samples as f64 * warp_factor) as usize;

    let mut warped = Vec::with_capacity(n_warped);

    for i in 0..n_warped {
        let orig_idx = (i as f64 / warp_factor) as usize;
        let idx = orig_idx.min(n_samples - 1);

        // Linear interpolation
        let frac = (i as f64 / warp_factor) - orig_idx as f64;
        let next_idx = (orig_idx + 1).min(n_samples - 1);

        let val = series[idx] + frac * (series[next_idx] - series[idx]);
        warped.push(val);
    }

    warped
}

/// Time series shifting
///
/// # Arguments
/// * `series` - Time series data
/// * `shift_range_min` - Minimum shift amount
/// * `shift_range_max` - Maximum shift amount
/// * `n_samples` - Length of series
#[wasm_bindgen]
pub fn time_series_shift(
    series: &[f64],
    shift_range_min: i32,
    shift_range_max: i32,
    n_samples: usize,
) -> Vec<f64> {
    let shift = if shift_range_min == shift_range_max {
        shift_range_min
    } else {
        let range = shift_range_max - shift_range_min;
        shift_range_min + (js_sys::Math::random() * range as f64) as i32
    };

    let mut shifted = Vec::with_capacity(n_samples);

    for i in 0..n_samples {
        let orig_idx = (i as i32 - shift) as usize;

        if orig_idx < n_samples {
            shifted.push(series[orig_idx]);
        } else {
            // Pad with boundary value
            shifted.push(series[n_samples - 1]);
        }
    }

    shifted
}

/// Sample from Beta distribution
fn sample_beta(alpha: f64, beta: f64) -> f64 {
    // Use rejection sampling from Gamma distribution
    // Simplified version - in production would use proper Beta sampler

    let gamma1 = sample_gamma(alpha, 1.0);
    let gamma2 = sample_gamma(beta, 1.0);

    if gamma1 + gamma2 == 0.0 {
        return 0.5;
    }

    gamma1 / (gamma1 + gamma2)
}

/// Sample from Gamma distribution
fn sample_gamma(shape: f64, scale: f64) -> f64 {
    // Marsaglia and Tsang's method
    if shape < 1.0 {
        return sample_gamma(shape + 1.0, scale) * js_sys::Math::random().powf(1.0 / shape);
    }

    let d = shape - 1.0 / 3.0;
    let c = 3.0 / (9.0 + d).sqrt();

    loop {
        let x = (js_sys::Math::random() * 2.0) - 1.0; // Normal approximation
        let v = 1.0 + c * x;

        if v <= 0.0 {
            continue;
        }

        let v_cubed = v.powi(3);
        let u = js_sys::Math::random();

        if u < 1.0 - 0.033 * (x * x).powi(2) {
            let y = x * x / v_cubed;
            if y < 1.0 - (2.0 / (9.0 + d)).exp() * (v_cubed - 1.0) {
                return shape * v_cubed * scale;
            }
        } else {
            let x_sq = x * x;
            if u < 0.5 * x_sq.exp() * (1.0 - x_sq) {
                return shape * v_cubed * scale;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_smote() {
        let X = vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0];
        let y = vec![0.0, 0.0, 1.0, 1.0, 1.0, 1.0];

        let result = smote(&X, &y, 2, 2.0, 6, 2).unwrap();

        assert_eq!(result.length(), 2); // X and y arrays

        let x_array = result.get(0);
        let y_array = result.get(1);

        assert!(x_array.is_array());
        assert!(y_array.is_array());
    }

    #[test]
    fn test_random_oversample() {
        let X = vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0];
        let y = vec![0.0, 0.0, 1.0, 1.0, 1.0, 1.0];

        let result = random_oversample(&X, &y, 2.0, 6, 2).unwrap();

        assert_eq!(result.length(), 2);

        let x_array = result.get(0);
        let y_array = result.get(1);

        assert!(x_array.is_array());
        assert!(y_array.is_array());
    }

    #[test]
    fn test_inject_noise_gaussian() {
        let X = vec![1.0, 2.0, 3.0, 4.0];
        let noisy = inject_noise(&X, 0.1, "gaussian", 2, 2);

        assert_eq!(noisy.len(), 4);
        // Values should be different from original
        assert!(noisy[0] != 1.0 || noisy[1] != 2.0);
    }

    #[test]
    fn test_time_series_warp() {
        let series = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        let warped = time_series_warp(&series, 1.5, 5);

        assert!(warped.len() > 5); // Should be longer
        assert_eq!(warped[0], series[0]); // First value should match
    }

    #[test]
    fn test_time_series_shift() {
        let series = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        let shifted = time_series_shift(&series, -2, 2, 5);

        assert_eq!(shifted.len(), 5);
        assert_eq!(shifted[0], series[2]); // Shifted by 2
        assert_eq!(shifted[4], series[4]); // Last value padded
    }

    #[test]
    fn test_mixup() {
        let X1 = vec![1.0, 2.0];
        let y1 = vec![0.0];
        let X2 = vec![3.0, 4.0];
        let y2 = vec![1.0];

        let result = mixup(&X1, &y1, &X2, &y2, 0.5, 1, 1, 2).unwrap();

        assert_eq!(result.length(), 2);

        let x_array = result.get(0);
        let y_array = result.get(1);

        assert!(x_array.is_array());
        assert!(y_array.is_array());
    }
}
