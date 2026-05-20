use wasm_bindgen::prelude::*;

/// Normalizer - Scale samples to unit norm (L1, L2, or Max)
#[wasm_bindgen]
pub struct Normalizer {
    norm: String,  // "l1", "l2", or "max"
    n_features: usize,
}

#[wasm_bindgen]
impl Normalizer {
    #[wasm_bindgen(getter, js_name = "nFeatures")]
    pub fn n_features(&self) -> usize { self.n_features }

    #[wasm_bindgen(getter, js_name = "norm")]
    pub fn norm_type(&self) -> String { self.norm.clone() }

    /// Transform data to unit norm
    #[wasm_bindgen]
    pub fn transform(&self, data: &[f64]) -> Vec<f64> {
        let n = data.len() / self.n_features;
        let mut result = Vec::with_capacity(data.len());

        for i in 0..n {
            let row = &data[i * self.n_features..(i + 1) * self.n_features];
            let norm_value = self.compute_norm(row);

            if norm_value > 1e-12 {
                for &val in row {
                    result.push(val / norm_value);
                }
            } else {
                // All zeros, keep as is
                result.extend_from_slice(row);
            }
        }

        result
    }

    /// Fit and transform (normalizer is stateless, so fit does nothing)
    #[wasm_bindgen(js_name = "fitTransform")]
    pub fn fit_transform(&self, data: &[f64]) -> Vec<f64> {
        self.transform(data)
    }

    fn compute_norm(&self, row: &[f64]) -> f64 {
        match self.norm.as_str() {
            "l1" => row.iter().map(|&v| v.abs()).sum::<f64>(),
            "l2" => row.iter().map(|&v| v * v).sum::<f64>().sqrt(),
            "max" => row.iter().map(|&v| v.abs()).fold(0.0f64, f64::max),
            _ => row.iter().map(|&v| v * v).sum::<f64>().sqrt(),  // Default to L2
        }
    }

    #[wasm_bindgen(js_name = "toString")]
    pub fn to_string_js(&self) -> String {
        format!("Normalizer(norm={})", self.norm)
    }
}

#[wasm_bindgen(js_name = "normalizer")]
pub fn normalizer(n_features: usize, norm: String) -> Normalizer {
    let norm_lower = norm.to_lowercase();
    let norm_valid = if norm_lower == "l1" || norm_lower == "l2" || norm_lower == "max" {
        norm_lower
    } else {
        "l2".to_string()  // Default
    };

    Normalizer {
        norm: norm_valid,
        n_features,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_l2_norm() {
        let data = vec![
            3.0, 4.0,  // L2 norm = 5
            1.0, 0.0,  // L2 norm = 1
        ];
        let norm = normalizer(2, "l2".to_string());
        let transformed = norm.transform(&data);

        // First row: [3, 4] -> [3/5, 4/5]
        assert!((transformed[0] - 0.6).abs() < 1e-10);
        assert!((transformed[1] - 0.8).abs() < 1e-10);
        // Second row: [1, 0] -> [1, 0]
        assert!((transformed[2] - 1.0).abs() < 1e-10);
        assert!((transformed[3] - 0.0).abs() < 1e-10);
    }

    #[test]
    fn test_l1_norm() {
        let data = vec![
            1.0, 2.0, 3.0,  // L1 norm = 6
        ];
        let norm = normalizer(3, "l1".to_string());
        let transformed = norm.transform(&data);

        // [1, 2, 3] -> [1/6, 2/6, 3/6]
        assert!((transformed[0] - 1.0/6.0).abs() < 1e-10);
        assert!((transformed[1] - 2.0/6.0).abs() < 1e-10);
        assert!((transformed[2] - 3.0/6.0).abs() < 1e-10);
    }

    #[test]
    fn test_max_norm() {
        let data = vec![
            2.0, 4.0, 1.0,  // Max norm = 4
        ];
        let norm = normalizer(3, "max".to_string());
        let transformed = norm.transform(&data);

        // [2, 4, 1] -> [2/4, 4/4, 1/4] = [0.5, 1.0, 0.25]
        assert!((transformed[0] - 0.5).abs() < 1e-10);
        assert!((transformed[1] - 1.0).abs() < 1e-10);
        assert!((transformed[2] - 0.25).abs() < 1e-10);
    }

    #[test]
    fn test_zero_row() {
        let data = vec![0.0, 0.0, 0.0];
        let norm = normalizer(3, "l2".to_string());
        let transformed = norm.transform(&data);

        // All zeros stay zeros
        assert_eq!(transformed, vec![0.0, 0.0, 0.0]);
    }

    #[test]
    fn test_negative_values() {
        let data = vec![-3.0, 4.0];
        let norm = normalizer(2, "l2".to_string());
        let transformed = norm.transform(&data);

        // [-3, 4] L2 norm = 5
        assert!((transformed[0] - (-0.6)).abs() < 1e-10);
        assert!((transformed[1] - 0.8).abs() < 1e-10);
    }
}
