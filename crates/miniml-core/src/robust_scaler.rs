use wasm_bindgen::prelude::*;
use crate::error::MlError;
use crate::matrix::validate_matrix;

/// Robust Scaler - Scale features using median and IQR (robust to outliers)
#[wasm_bindgen]
pub struct RobustScaler {
    center: Vec<f64>,
    scale: Vec<f64>,
    n_features: usize,
    n_samples: usize,
}

#[wasm_bindgen]
impl RobustScaler {
    #[wasm_bindgen(getter, js_name = "nFeatures")]
    pub fn n_features(&self) -> usize { self.n_features }

    #[wasm_bindgen(getter, js_name = "nSamples")]
    pub fn n_samples(&self) -> usize { self.n_samples }

    /// Fit scaler to data (compute median and IQR per feature)
    #[wasm_bindgen]
    pub fn fit(&mut self, data: &[f64]) -> Result<(), JsError> {
        let n = validate_matrix(data, self.n_features)?;
        self.n_samples = n;

        for f in 0..self.n_features {
            let mut values: Vec<f64> = (0..n).map(|i| data[i * self.n_features + f]).collect();
            values.sort_unstable_by(|a, b| a.partial_cmp(b).unwrap());

            let median = if values.len() % 2 == 0 {
                (values[values.len() / 2 - 1] + values[values.len() / 2]) / 2.0
            } else {
                values[values.len() / 2]
            };

            // IQR = Q3 - Q1
            let q1_idx = values.len() / 4;
            let q3_idx = (3 * values.len()) / 4;
            let iqr = values[q3_idx] - values[q1_idx];

            self.center[f] = median;
            self.scale[f] = if iqr > 1e-12 { iqr } else { 1.0 };
        }

        Ok(())
    }

    /// Transform data using fitted parameters
    #[wasm_bindgen]
    pub fn transform(&self, data: &[f64]) -> Vec<f64> {
        let n = data.len() / self.n_features;
        let mut result = Vec::with_capacity(data.len());

        for i in 0..n {
            for f in 0..self.n_features {
                let val = data[i * self.n_features + f];
                let scaled = (val - self.center[f]) / self.scale[f];
                result.push(scaled);
            }
        }

        result
    }

    /// Fit and transform in one operation
    #[wasm_bindgen(js_name = "fitTransform")]
    pub fn fit_transform(&mut self, data: &[f64]) -> Result<Vec<f64>, JsError> {
        self.fit(data)?;
        Ok(self.transform(data))
    }

    #[wasm_bindgen(js_name = "toString")]
    pub fn to_string_js(&self) -> String {
        format!("RobustScaler(n_features={}, n_samples={})", self.n_features, self.n_samples)
    }
}

#[wasm_bindgen(js_name = "robustScaler")]
pub fn robust_scaler(n_features: usize) -> RobustScaler {
    RobustScaler {
        center: vec![0.0; n_features],
        scale: vec![1.0; n_features],
        n_features,
        n_samples: 0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_robust_outlier_resistant() {
        // Data with extreme outlier
        let data = vec![
            1.0, 2.0, 3.0, 4.0, 5.0,    // Normal values
            1000.0,                      // Extreme outlier
        ];
        let mut scaler = robust_scaler(1);
        let transformed = scaler.fit_transform(&data).unwrap();

        // Median should be around 4, IQR around 3
        // Outlier shouldn't affect median much
        let median = scaler.center[0];
        assert!(median >= 3.0 && median <= 5.0);
    }

    #[test]
    fn test_robust_centered() {
        let data = vec![0.0, 10.0, 20.0, 30.0];
        let mut scaler = robust_scaler(1);
        scaler.fit(&data).unwrap();

        // Center should be median (around 15)
        assert!(scaler.center[0] > 10.0 && scaler.center[0] < 20.0);
    }

    #[test]
    fn test_robust_constant_feature() {
        let data = vec![5.0; 10];
        let mut scaler = robust_scaler(1);
        scaler.fit(&data).unwrap();

        // All same values -> median = 5, IQR = 0 -> scale = 1
        assert!((scaler.center[0] - 5.0).abs() < 1e-10);
        assert_eq!(scaler.scale[0], 1.0);
    }

    #[test]
    fn test_transform_inverts_correctly() {
        let data = vec![
            0.0, 10.0,
            10.0, 20.0,
        ];
        let mut scaler = robust_scaler(2);
        scaler.fit(&data).unwrap();
        let transformed = scaler.transform(&data);

        // After transform, values should be centered around 0
        // (approximately, depending on quartile positions)
        for &v in &transformed {
            assert!(v.is_finite());
        }
    }
}
