use wasm_bindgen::prelude::*;
use crate::error::MlError;

/// Label Encoder - Encode categorical labels as integers
#[wasm_bindgen]
pub struct LabelEncoder {
    classes: Vec<f64>,
    fitted: bool,
}

#[wasm_bindgen]
impl LabelEncoder {
    #[wasm_bindgen(getter, js_name = "nClasses")]
    pub fn n_classes(&self) -> usize { self.classes.len() }

    #[wasm_bindgen(getter, js_name = "classes")]
    pub fn classes_js(&self) -> Vec<f64> { self.classes.clone() }

    /// Fit encoder to labels (discover unique classes)
    #[wasm_bindgen]
    pub fn fit(&mut self, labels: &[f64]) -> Result<(), JsError> {
        if labels.is_empty() {
            return Err(JsError::new("labels cannot be empty"));
        }

        let mut unique: Vec<f64> = labels.to_vec();
        unique.sort_unstable_by(|a, b| a.partial_cmp(b).unwrap());
        unique.dedup();

        self.classes = unique;
        self.fitted = true;
        Ok(())
    }

    /// Transform labels to encoded integers
    #[wasm_bindgen]
    pub fn transform(&self, labels: &[f64]) -> Result<Vec<f64>, JsError> {
        if !self.fitted {
            return Err(JsError::new("encoder not fitted"));
        }

        let mut result = Vec::with_capacity(labels.len());
        for &label in labels {
            let pos = self.classes.iter().position(|&c| (c - label).abs() < 1e-10);
            match pos {
                Some(idx) => result.push(idx as f64),
                None => return Err(JsError::new(&format!("unseen label: {}", label))),
            }
        }
        Ok(result)
    }

    /// Fit and transform in one operation
    #[wasm_bindgen(js_name = "fitTransform")]
    pub fn fit_transform(&mut self, labels: &[f64]) -> Result<Vec<f64>, JsError> {
        self.fit(labels)?;
        self.transform(labels)
    }

    /// Inverse transform encoded integers back to labels
    #[wasm_bindgen(js_name = "inverseTransform")]
    pub fn inverse_transform(&self, encoded: &[f64]) -> Result<Vec<f64>, JsError> {
        if !self.fitted {
            return Err(JsError::new("encoder not fitted"));
        }

        let mut result = Vec::with_capacity(encoded.len());
        for &enc in encoded {
            let idx = enc as usize;
            if idx < self.classes.len() {
                result.push(self.classes[idx]);
            } else {
                return Err(JsError::new(&format!("invalid encoded value: {}", enc)));
            }
        }
        Ok(result)
    }

    #[wasm_bindgen(js_name = "toString")]
    pub fn to_string_js(&self) -> String {
        format!("LabelEncoder(n_classes={}, fitted={})", self.classes.len(), self.fitted)
    }
}

#[wasm_bindgen(js_name = "labelEncoder")]
pub fn label_encoder() -> LabelEncoder {
    LabelEncoder {
        classes: Vec::new(),
        fitted: false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_label_encoding() {
        let labels = vec![2.0, 1.0, 2.0, 0.0];
        let mut encoder = label_encoder();
        encoder.fit(&labels).unwrap();

        assert_eq!(encoder.classes, vec![0.0, 1.0, 2.0]);
        assert_eq!(encoder.n_classes(), 3);
    }

    #[test]
    fn test_transform() {
        let labels = vec!["a".to_string(), "b".to_string(), "a".to_string()];
        // For this test, we'll use numeric labels
        let labels_numeric = vec![10.0, 20.0, 10.0];
        let mut encoder = label_encoder();
        encoder.fit(&labels_numeric).unwrap();

        let transformed = encoder.transform(&labels_numeric).unwrap();
        assert_eq!(transformed, vec![0.0, 1.0, 0.0]);  // 10 -> 0, 20 -> 1
    }

    #[test]
    fn test_inverse_transform() {
        let labels = vec![5.0, 10.0, 15.0];
        let mut encoder = label_encoder();
        encoder.fit(&labels).unwrap();

        let encoded = encoder.transform(&labels).unwrap();
        let decoded = encoder.inverse_transform(&encoded).unwrap();

        assert_eq!(decoded, labels);
    }

    #[test]
    fn test_unseen_label() {
        let labels = vec![1.0, 2.0];
        let mut encoder = label_encoder();
        encoder.fit(&labels).unwrap();

        let result = encoder.transform(&vec![3.0]);
        assert!(result.is_err());
    }

    #[test]
    fn test_fit_transform() {
        let labels = vec![2.0, 1.0, 2.0, 0.0];
        let mut encoder = label_encoder();
        let transformed = encoder.fit_transform(&labels).unwrap();

        // Sorted unique: [0, 1, 2] -> [0, 1, 2] encodes to [2, 1, 2, 0]
        assert_eq!(transformed, vec![2.0, 1.0, 2.0, 0.0]);
    }
}
