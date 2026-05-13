use wasm_bindgen::prelude::*;
use crate::error::MlError;
use crate::matrix::{validate_matrix, mat_get};

#[wasm_bindgen]
pub struct StandardScaler {
    means: Vec<f64>,
    scales: Vec<f64>,
    n_features: usize,
    n_samples: usize,
}

#[wasm_bindgen]
impl StandardScaler {
    #[wasm_bindgen(getter, js_name = "nFeatures")]
    pub fn n_features(&self) -> usize { self.n_features }

    #[wasm_bindgen(getter, js_name = "nSamples")]
    pub fn n_samples(&self) -> usize { self.n_samples }

    /// Compute mean and std per feature from data
    #[wasm_bindgen]
    pub fn fit(&mut self, data: &[f64]) -> Result<(), JsError> {
        standard_scaler_fit_impl(self, data).map_err(|e| JsError::new(&e.message))
    }

    /// Apply z-score normalization: (x - mean) / std
    #[wasm_bindgen]
    pub fn transform(&self, data: &[f64]) -> Vec<f64> {
        let n = data.len() / self.n_features;
        let mut result = Vec::with_capacity(data.len());

        for i in 0..n {
            for j in 0..self.n_features {
                let val = mat_get(data, self.n_features, i, j);
                let normalized = (val - self.means[j]) / self.scales[j];
                result.push(normalized);
            }
        }

        result
    }

    /// Inverse transform: x * std + mean
    #[wasm_bindgen(js_name = "inverseTransform")]
    pub fn inverse_transform(&self, data: &[f64]) -> Vec<f64> {
        let n = data.len() / self.n_features;
        let mut result = Vec::with_capacity(data.len());

        for i in 0..n {
            for j in 0..self.n_features {
                let val = mat_get(data, self.n_features, i, j);
                let original = val * self.scales[j] + self.means[j];
                result.push(original);
            }
        }

        result
    }

    /// Fit and transform in one step
    #[wasm_bindgen(js_name = "fitTransform")]
    pub fn fit_transform(&mut self, data: &[f64]) -> Result<Vec<f64>, JsError> {
        self.fit(data)?;
        Ok(self.transform(data))
    }

    #[wasm_bindgen(js_name = "toString")]
    pub fn to_string_js(&self) -> String {
        format!("StandardScaler(features={}, samples={})", self.n_features, self.n_samples)
    }
}

fn standard_scaler_fit_impl(scaler: &mut StandardScaler, data: &[f64]) -> Result<(), MlError> {
    let n = validate_matrix(data, scaler.n_features)?;
    scaler.n_samples = n;

    for j in 0..scaler.n_features {
        // Compute mean
        let mut sum = 0.0;
        for i in 0..n {
            sum += mat_get(data, scaler.n_features, i, j);
        }
        let mean = sum / n as f64;

        // Compute std (population)
        let mut var_sum = 0.0;
        for i in 0..n {
            let diff = mat_get(data, scaler.n_features, i, j) - mean;
            var_sum += diff * diff;
        }
        let std = (var_sum / n as f64).sqrt();

        scaler.means[j] = mean;
        // Use max(std, epsilon) to avoid division by zero
        scaler.scales[j] = std.max(1e-8);
    }

    Ok(())
}

/// Create a new StandardScaler for the given number of features
#[wasm_bindgen(js_name = "standardScaler")]
pub fn standard_scaler(n_features: usize) -> StandardScaler {
    StandardScaler {
        means: vec![0.0; n_features],
        scales: vec![1.0; n_features],
        n_features,
        n_samples: 0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_zero_mean_unit_variance() {
        let data = vec![1.0, 10.0, 2.0, 20.0, 3.0, 30.0, 4.0, 40.0, 5.0, 50.0];
        let mut scaler = standard_scaler(2);
        let transformed = scaler.fit_transform(&data).unwrap();

        // Check mean ≈ 0 for each feature
        for j in 0..2 {
            let mut sum = 0.0;
            for i in 0..5 {
                sum += transformed[i * 2 + j];
            }
            assert!((sum / 5.0).abs() < 1e-10, "Feature {} mean should be ~0", j);
        }

        // Check std ≈ 1 for each feature
        for j in 0..2 {
            let _mean = (j as f64 + 1.0) * 3.0; // 3.0, 6.0
            let mut var_sum = 0.0;
            for i in 0..5 {
                let val = transformed[i * 2 + j];
                var_sum += val * val;
            }
            let std = (var_sum / 5.0).sqrt();
            assert!((std - 1.0).abs() < 1e-10, "Feature {} std should be ~1", j);
        }
    }

    #[test]
    fn test_inverse_transform() {
        let data = vec![1.0, 10.0, 2.0, 20.0, 3.0, 30.0];
        let mut scaler = standard_scaler(2);
        let transformed = scaler.fit_transform(&data).unwrap();
        let restored = scaler.inverse_transform(&transformed);

        for i in 0..data.len() {
            assert!((data[i] - restored[i]).abs() < 1e-10);
        }
    }

    #[test]
    fn test_constant_feature() {
        // Feature 1 is constant — should not panic
        let data = vec![5.0, 1.0, 5.0, 2.0, 5.0, 3.0];
        let mut scaler = standard_scaler(2);
        let transformed = scaler.fit_transform(&data).unwrap();

        // Feature 0: constant, scaled to 0
        for i in 0..3 {
            assert!(transformed[i * 2].abs() < 1e-10);
        }
    }

    #[test]
    fn test_scaler_getters() {
        let scaler = standard_scaler(3);
        assert_eq!(scaler.n_features(), 3);
        assert_eq!(scaler.n_samples(), 0);
    }
}
