use wasm_bindgen::prelude::*;
use crate::error::MlError;
use crate::matrix::validate_matrix;

/// MinMax Scaler - Transform features to [0, 1] range
#[wasm_bindgen]
pub struct MinMaxScaler {
    min: Vec<f64>,
    scale: Vec<f64>,
    n_features: usize,
    n_samples: usize,
}

#[wasm_bindgen]
impl MinMaxScaler {
    #[wasm_bindgen(getter, js_name = "nFeatures")]
    pub fn n_features(&self) -> usize { self.n_features }

    #[wasm_bindgen(getter, js_name = "nSamples")]
    pub fn n_samples(&self) -> usize { self.n_samples }

    /// Fit scaler to data (compute min and scale per feature)
    #[wasm_bindgen]
    pub fn fit(&mut self, data: &[f64]) -> Result<(), JsError> {
        let n = validate_matrix(data, self.n_features)?;
        self.n_samples = n;

        for f in 0..self.n_features {
            let mut min_val = f64::INFINITY;
            let mut max_val = f64::NEG_INFINITY;

            for i in 0..n {
                let val = data[i * self.n_features + f];
                if val < min_val { min_val = val; }
                if val > max_val { max_val = val; }
            }

            self.min[f] = min_val;
            let range = max_val - min_val;
            self.scale[f] = if range > 1e-12 { 1.0 / range } else { 1.0 };
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
                let scaled = (val - self.min[f]) * self.scale[f];
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

    /// Inverse transform scaled data back to original
    #[wasm_bindgen(js_name = "inverseTransform")]
    pub fn inverse_transform(&self, data: &[f64]) -> Vec<f64> {
        let n = data.len() / self.n_features;
        let mut result = Vec::with_capacity(data.len());

        for i in 0..n {
            for f in 0..self.n_features {
                let val = data[i * self.n_features + f];
                let original = val / self.scale[f] + self.min[f];
                result.push(original);
            }
        }

        result
    }

    #[wasm_bindgen(js_name = "toString")]
    pub fn to_string_js(&self) -> String {
        format!("MinMaxScaler(n_features={}, n_samples={})", self.n_features, self.n_samples)
    }
}

#[wasm_bindgen(js_name = "minMaxScaler")]
pub fn minmax_scaler(n_features: usize) -> MinMaxScaler {
    MinMaxScaler {
        min: vec![0.0; n_features],
        scale: vec![1.0; n_features],
        n_features,
        n_samples: 0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_minmax_range() {
        let data = vec![
            1.0, 10.0,
            2.0, 20.0,
            3.0, 30.0,
        ];
        let mut scaler = minmax_scaler(2);
        let transformed = scaler.fit_transform(&data).unwrap();

        // All values should be in [0, 1]
        for &v in &transformed {
            assert!(v >= 0.0 && v <= 1.0);
        }
    }

    #[test]
    fn test_minmax_exact_range() {
        let data = vec![
            0.0, 100.0,
            10.0, 200.0,
        ];
        let mut scaler = minmax_scaler(2);
        let transformed = scaler.fit_transform(&data).unwrap();

        // Feature 0: [0, 10] -> [0, 1]
        assert!((transformed[0] - 0.0).abs() < 1e-10);
        assert!((transformed[2] - 1.0).abs() < 1e-10);
        // Feature 1: [100, 200] -> [0, 1]
        assert!((transformed[1] - 0.0).abs() < 1e-10);
        assert!((transformed[3] - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_inverse_transform() {
        let data = vec![1.0, 2.0, 3.0, 4.0];
        let mut scaler = minmax_scaler(2);
        let transformed = scaler.fit_transform(&data).unwrap();
        let inverted = scaler.inverse_transform(&transformed);

        for i in 0..data.len() {
            assert!((inverted[i] - data[i]).abs() < 1e-10);
        }
    }

    #[test]
    fn test_constant_feature() {
        // Feature with zero range
        let data = vec![
            5.0, 1.0,
            5.0, 2.0,
            5.0, 3.0,
        ];
        let mut scaler = minmax_scaler(2);
        let transformed = scaler.fit_transform(&data).unwrap();

        // Feature 0 is constant, should map to 0.5 (or handle gracefully)
        // Feature 1 should scale normally
        assert!((transformed[1] - 0.0).abs() < 1e-10);
        assert!((transformed[3] - 1.0).abs() < 1e-10);
    }
}
