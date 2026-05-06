use wasm_bindgen::prelude::*;
use crate::error::MlError;

/// Ordinal Encoder - Encode categorical features as ordered integers
#[wasm_bindgen]
pub struct OrdinalEncoder {
    categories: Vec<Vec<f64>>,
    n_features: usize,
    fitted: bool,
}

#[wasm_bindgen]
impl OrdinalEncoder {
    #[wasm_bindgen(getter, js_name = "nFeatures")]
    pub fn n_features(&self) -> usize { self.n_features }

    /// Fit encoder to data (discover unique categories per feature)
    #[wasm_bindgen]
    pub fn fit(&mut self, data: &[f64]) -> Result<(), JsError> {
        if data.is_empty() {
            return Err(JsError::new("data cannot be empty"));
        }

        self.categories = Vec::with_capacity(self.n_features);

        for f in 0..self.n_features {
            let mut feature_values: Vec<f64> = data.iter()
                .enumerate()
                .filter(|(i, _)| i % self.n_features == f)
                .map(|(_, &v)| v)
                .collect();

            feature_values.sort_unstable_by(|a, b| a.partial_cmp(b).unwrap());
            feature_values.dedup();

            self.categories.push(feature_values);
        }

        self.fitted = true;
        Ok(())
    }

    /// Transform data to ordinal encoding
    #[wasm_bindgen]
    pub fn transform(&self, data: &[f64]) -> Result<Vec<f64>, JsError> {
        if !self.fitted {
            return Err(JsError::new("encoder not fitted"));
        }

        let n_samples = data.len() / self.n_features;
        let mut result = Vec::with_capacity(data.len());

        for i in 0..n_samples {
            for f in 0..self.n_features {
                let val = data[i * self.n_features + f];
                let categories = &self.categories[f];

                let pos = categories.iter().position(|&c| (c - val).abs() < 1e-10);
                match pos {
                    Some(idx) => result.push(idx as f64),
                    None => return Err(JsError::new(&format!("unseen value in feature {}: {}", f, val))),
                }
            }
        }

        Ok(result)
    }

    /// Fit and transform in one operation
    #[wasm_bindgen(js_name = "fitTransform")]
    pub fn fit_transform(&mut self, data: &[f64]) -> Result<Vec<f64>, JsError> {
        self.fit(data)?;
        self.transform(data)
    }

    #[wasm_bindgen(js_name = "toString")]
    pub fn to_string_js(&self) -> String {
        format!("OrdinalEncoder(n_features={}, fitted={})", self.n_features, self.fitted)
    }
}

#[wasm_bindgen(js_name = "ordinalEncoder")]
pub fn ordinal_encoder(n_features: usize) -> OrdinalEncoder {
    OrdinalEncoder {
        categories: Vec::new(),
        n_features,
        fitted: false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ordinal_encoding() {
        let data = vec![
            2.0, 10.0,  // Feature 0: [1,2,3], Feature 1: [10,20,30]
            1.0, 20.0,
            3.0, 30.0,
        ];
        let mut encoder = ordinal_encoder(2);
        encoder.fit(&data).unwrap();

        // Feature 0 sorted: [1,2,3], Feature 1 sorted: [10,20,30]
        assert_eq!(encoder.categories[0], vec![1.0, 2.0, 3.0]);
        assert_eq!(encoder.categories[1], vec![10.0, 20.0, 30.0]);
    }

    #[test]
    fn test_transform() {
        let data = vec![
            1.0, 30.0,  // [1,2,3] -> 0, [10,20,30] -> 2
            2.0, 20.0,  // [1,2,3] -> 1, [10,20,30] -> 1
        ];
        let mut encoder = ordinal_encoder(2);
        let transformed = encoder.fit_transform(&data).unwrap();

        // First row: 1 -> 0, 30 -> 2
        assert_eq!(transformed[0], 0.0);
        assert_eq!(transformed[1], 2.0);
        // Second row: 2 -> 1, 20 -> 1
        assert_eq!(transformed[2], 1.0);
        assert_eq!(transformed[3], 1.0);
    }

    #[test]
    fn test_preserves_order() {
        let data = vec![3.0, 1.0, 2.0];
        let mut encoder = ordinal_encoder(1);
        let transformed = encoder.fit_transform(&data).unwrap();

        // Sorted: [1,2,3] -> [2,0,1]
        assert_eq!(transformed, vec![2.0, 0.0, 1.0]);
    }

    #[test]
    fn test_unseen_value() {
        let data = vec![1.0, 2.0];
        let mut encoder = ordinal_encoder(1);
        encoder.fit(&data).unwrap();

        let result = encoder.transform(&vec![3.0]);
        assert!(result.is_err());
    }
}
