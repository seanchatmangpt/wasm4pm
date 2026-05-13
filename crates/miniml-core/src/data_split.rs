use wasm_bindgen::prelude::*;
use crate::error::MlError;
use crate::matrix::{validate_matrix, Rng};

/// Split data into training and testing sets using Fisher-Yates shuffle.
/// Returns: [n_train, n_test, n_features, X_train..., X_test..., y_train..., y_test...]
pub fn train_test_split_impl(
    data: &[f64],
    n_features: usize,
    labels: &[f64],
    train_ratio: f64,
    seed: Option<u64>,
) -> Result<Vec<f64>, MlError> {
    let n = validate_matrix(data, n_features)?;
    if labels.len() != n {
        return Err(MlError::new("labels length must match number of samples"));
    }
    if !(0.0..=1.0).contains(&train_ratio) {
        return Err(MlError::new("train_ratio must be in [0, 1]"));
    }
    if n < 2 {
        return Err(MlError::new("Need at least 2 samples to split"));
    }

    let n_train = ((n as f64) * train_ratio).round() as usize;
    let n_train = n_train.max(1).min(n - 1);
    let n_test = n - n_train;

    // Create and shuffle indices
    let mut rng = match seed {
        Some(s) => Rng::new(s),
        None => Rng::from_data(data),
    };
    let mut indices: Vec<usize> = (0..n).collect();
    for i in (1..n).rev() {
        let j = rng.next_usize(i + 1);
        indices.swap(i, j);
    }

    // Build output: metadata + X_train + X_test + y_train + y_test
    let mut result = Vec::with_capacity(3 + n * n_features + n);
    result.push(n_train as f64);
    result.push(n_test as f64);
    result.push(n_features as f64);

    // X_train
    for i in 0..n_train {
        let row = indices[i];
        for j in 0..n_features {
            result.push(data[row * n_features + j]);
        }
    }

    // X_test
    for i in n_train..n {
        let row = indices[i];
        for j in 0..n_features {
            result.push(data[row * n_features + j]);
        }
    }

    // y_train
    for i in 0..n_train {
        result.push(labels[indices[i]]);
    }

    // y_test
    for i in n_train..n {
        result.push(labels[indices[i]]);
    }

    Ok(result)
}

#[wasm_bindgen(js_name = "trainTestSplit")]
pub fn train_test_split(
    data: &[f64],
    n_features: usize,
    labels: &[f64],
    train_ratio: f64,
    seed: Option<u64>,
) -> Result<Vec<f64>, JsError> {
    train_test_split_impl(data, n_features, labels, train_ratio, seed)
        .map_err(|e| JsError::new(&e.message))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_split_ratio() {
        let data = vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0];
        let labels = vec![0.0, 0.0, 0.0, 1.0, 1.0]; // 5 samples, matches data
        let result = train_test_split_impl(&data, 2, &labels, 0.8, Some(42)).unwrap();

        let n_train = result[0] as usize;
        let n_test = result[1] as usize;
        let n_features = result[2] as usize;

        assert_eq!(n_train, 4);
        assert_eq!(n_test, 1);
        assert_eq!(n_features, 2);
        assert_eq!(result.len(), 3 + 5 * 2 + 5);
    }

    #[test]
    fn test_split_deterministic() {
        let data = vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0];
        let labels = vec![0.0, 0.0, 0.0, 1.0, 1.0]; // 5 samples, matches data

        let r1 = train_test_split_impl(&data, 2, &labels, 0.8, Some(42)).unwrap();
        let r2 = train_test_split_impl(&data, 2, &labels, 0.8, Some(42)).unwrap();

        assert_eq!(r1, r2);
    }

    #[test]
    fn test_split_all_train() {
        let data = vec![1.0, 2.0, 3.0, 4.0];
        let labels = vec![0.0, 1.0];
        let result = train_test_split_impl(&data, 2, &labels, 1.0, Some(42)).unwrap();

        let n_train = result[0] as usize;
        let n_test = result[1] as usize;

        assert_eq!(n_train, 1); // Clamped to n-1
        assert_eq!(n_test, 1);
    }

    #[test]
    fn test_split_invalid_ratio() {
        let data = vec![1.0, 2.0, 3.0, 4.0];
        let labels = vec![0.0, 1.0];
        assert!(train_test_split_impl(&data, 2, &labels, 1.5, Some(42)).is_err());
    }
}
