use wasm_bindgen::prelude::*;
use crate::error::MlError;

/// One-Hot Encoder - Encode categorical features as binary vectors
#[wasm_bindgen]
pub struct OneHotEncoder {
    categories: Vec<Vec<f64>>,
    n_features: usize,
    fitted: bool,
}

#[wasm_bindgen]
impl OneHotEncoder {
    #[wasm_bindgen(getter, js_name = "nFeatures")]
    pub fn n_features(&self) -> usize { self.n_features }

    #[wasm_bindgen(getter, js_name = "nCategories")]
    pub fn n_categories(&self) -> usize {
        self.categories.iter().map(|c| c.len()).sum()
    }

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

    /// Transform data to one-hot encoding
    #[wasm_bindgen]
    pub fn transform(&self, data: &[f64]) -> Result<Vec<f64>, JsError> {
        if !self.fitted {
            return Err(JsError::new("encoder not fitted"));
        }

        let n_samples = data.len() / self.n_features;
        let total_categories: usize = self.categories.iter().map(|c| c.len()).sum();
        let mut result = Vec::with_capacity(n_samples * total_categories);

        for i in 0..n_samples {
            for f in 0..self.n_features {
                let val = data[i * self.n_features + f];
                let categories = &self.categories[f];

                for &cat in categories {
                    result.push(if (val - cat).abs() < 1e-10 { 1.0 } else { 0.0 });
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
        let cats: Vec<usize> = self.categories.iter().map(|c| c.len()).collect();
        format!("OneHotEncoder(n_features={}, categories_per_feature={:?})",
                self.n_features, cats)
    }
}

#[wasm_bindgen(js_name = "oneHotEncoder")]
pub fn one_hot_encoder(n_features: usize) -> OneHotEncoder {
    OneHotEncoder {
        categories: Vec::new(),
        n_features,
        fitted: false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_one_hot_binary() {
        // Single feature with 2 categories
        let data = vec![0.0, 1.0, 0.0, 1.0];
        let mut encoder = one_hot_encoder(1);
        encoder.fit(&data).unwrap();

        assert_eq!(encoder.categories[0], vec![0.0, 1.0]);
    }

    #[test]
    fn test_one_hot_transform() {
        let data = vec![0.0, 1.0, 0.0];
        let mut encoder = one_hot_encoder(1);
        let transformed = encoder.fit_transform(&data).unwrap();

        // [0, 1, 0] -> [[1,0], [0,1], [1,0]]
        assert_eq!(transformed, vec![1.0, 0.0, 0.0, 1.0, 1.0, 0.0]);
    }

    #[test]
    fn test_one_hot_multi_feature() {
        // 2 features: feature 0 has [0,1], feature 1 has [10,20,30]
        let data = vec![
            0.0, 10.0,
            1.0, 20.0,
            0.0, 30.0,
        ];
        let mut encoder = one_hot_encoder(2);
        let transformed = encoder.fit_transform(&data).unwrap();

        // First row: [0, 10] -> [1,0, 1,0,0]
        assert_eq!(transformed[0..6].to_vec(), vec![1.0, 0.0, 1.0, 0.0, 0.0]);
        // Second row: [1, 20] -> [0,1, 0,1,0]
        assert_eq!(transformed[6..12].to_vec(), vec![0.0, 1.0, 0.0, 1.0, 0.0]);
    }

    #[test]
    fn test_n_categories() {
        let data = vec![
            0.0, 10.0,  // Feature 0: [0,1], Feature 1: [10,20]
            1.0, 20.0,
        ];
        let mut encoder = one_hot_encoder(2);
        encoder.fit(&data).unwrap();

        // 2 + 2 = 4 total categories
        assert_eq!(encoder.n_categories(), 4);
    }
}
