use crate::error::MlError;
use crate::matrix::{dist_to_point, validate_matrix};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct KnnModel {
    n_features: usize,
    training_data: Vec<f64>,
    labels: Vec<u32>,
    k: usize,
    n_samples: usize,
}

#[wasm_bindgen]
impl KnnModel {
    #[wasm_bindgen(getter)]
    pub fn k(&self) -> usize {
        self.k
    }

    #[wasm_bindgen(getter, js_name = "nSamples")]
    pub fn n_samples(&self) -> usize {
        self.n_samples
    }

    #[wasm_bindgen(getter, js_name = "nFeatures")]
    pub fn n_features(&self) -> usize {
        self.n_features
    }

    #[wasm_bindgen]
    pub fn predict(&self, data: &[f64]) -> Vec<u32> {
        let n_test = data.len() / self.n_features;
        let mut result = Vec::with_capacity(n_test);

        for i in 0..n_test {
            let point = &data[i * self.n_features..(i + 1) * self.n_features];
            // Compute distances to all training points
            let mut dists: Vec<(f64, u32)> = (0..self.n_samples)
                .map(|j| {
                    let d = dist_to_point(&self.training_data, self.n_features, j, point);
                    (d, self.labels[j])
                })
                .collect();

            // Partial sort: find k smallest
            // Use select_nth_unstable_by for O(n) partial sort
            if self.k < dists.len() {
                dists.select_nth_unstable_by(self.k, |a, b| a.0.total_cmp(&b.0));
                let (_, rest) = dists.split_at_mut(self.k);
                rest.sort_unstable_by(|a, b| a.0.total_cmp(&b.0));
            } else {
                dists.sort_unstable_by(|a, b| a.0.total_cmp(&b.0));
            }

            // Majority vote
            let max_label = *self.labels.iter().max().unwrap_or(&0);
            let mut votes = vec![0u32; max_label as usize + 1];
            for j in 0..self.k.min(dists.len()) {
                votes[dists[j].1 as usize] += 1;
            }
            let predicted = votes
                .iter()
                .enumerate()
                .max_by_key(|(_, &v)| v)
                .map(|(i, _)| i as u32)
                .unwrap_or(0);
            result.push(predicted);
        }
        result
    }

    #[wasm_bindgen(js_name = "predictProba")]
    pub fn predict_proba(&self, data: &[f64]) -> Vec<f64> {
        let n_test = data.len() / self.n_features;
        let mut result = Vec::with_capacity(n_test);

        for i in 0..n_test {
            let point = &data[i * self.n_features..(i + 1) * self.n_features];
            let mut dists: Vec<(f64, u32)> = (0..self.n_samples)
                .map(|j| {
                    let d = dist_to_point(&self.training_data, self.n_features, j, point);
                    (d, self.labels[j])
                })
                .collect();
            // Use select_nth_unstable_by for O(n) partial sort
            if self.k < dists.len() {
                dists.select_nth_unstable_by(self.k, |a, b| a.0.total_cmp(&b.0));
                let (_, rest) = dists.split_at_mut(self.k);
                rest.sort_unstable_by(|a, b| a.0.total_cmp(&b.0));
            } else {
                dists.sort_unstable_by(|a, b| a.0.total_cmp(&b.0));
            }

            let k = self.k.min(dists.len());
            let count_1 = dists[..k].iter().filter(|(_, l)| *l == 1).count();
            result.push(count_1 as f64 / k as f64);
        }
        result
    }

    #[wasm_bindgen(js_name = "toString")]
    pub fn to_string_js(&self) -> String {
        format!("KNN(k={}, n_samples={})", self.k, self.n_samples)
    }
}

pub fn knn_fit_impl(
    data: &[f64],
    n_features: usize,
    labels: &[f64],
    k: usize,
) -> Result<KnnModel, MlError> {
    let n = validate_matrix(data, n_features)?;
    if labels.len() != n {
        return Err(MlError::new("labels length must match number of samples"));
    }
    if k == 0 {
        return Err(MlError::new("k must be > 0"));
    }

    let int_labels: Vec<u32> = labels.iter().map(|&v| v as u32).collect();

    Ok(KnnModel {
        n_features,
        training_data: data.to_vec(),
        labels: int_labels,
        k,
        n_samples: n,
    })
}

#[wasm_bindgen(js_name = "knnFit")]
pub fn knn_fit(
    data: &[f64],
    n_features: usize,
    labels: &[f64],
    k: usize,
) -> Result<KnnModel, JsError> {
    knn_fit_impl(data, n_features, labels, k).map_err(|e| JsError::new(&e.message))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_perfect_classification() {
        // Two clear clusters
        let data = vec![
            0.0, 0.0, 0.1, 0.1, 0.2, 0.0, // class 0
            5.0, 5.0, 5.1, 5.1, 4.9, 5.0, // class 1
        ];
        let labels = vec![0.0, 0.0, 0.0, 1.0, 1.0, 1.0];
        let model = knn_fit_impl(&data, 2, &labels, 3).unwrap();

        let test = vec![0.05, 0.05, 4.95, 4.95];
        let preds = model.predict(&test);
        assert_eq!(preds, vec![0, 1]);
    }

    #[test]
    fn test_k1_memorizes() {
        let data = vec![1.0, 2.0, 3.0, 4.0];
        let labels = vec![0.0, 1.0];
        let model = knn_fit_impl(&data, 2, &labels, 1).unwrap();

        let preds = model.predict(&data);
        assert_eq!(preds, vec![0, 1]);
    }

    #[test]
    fn test_predict_proba() {
        let data = vec![0.0, 0.0, 1.0, 1.0, 2.0, 2.0];
        let labels = vec![0.0, 1.0, 1.0];
        let model = knn_fit_impl(&data, 2, &labels, 3).unwrap();
        let proba = model.predict_proba(&vec![1.0, 1.0]);
        assert!((proba[0] - 2.0 / 3.0).abs() < 1e-10);
    }

    /// Rank-1 (Mathematical Theorem): KNN with k=1 on an identical input
    /// point must return the exact training label.
    ///
    /// Proof: d(x, x) = sqrt(Σ(xᵢ - xᵢ)²) = 0 by the identity property of
    /// Euclidean distance. With k=1, the single nearest neighbor is the
    /// identical point itself (distance=0 ≤ any positive distance), so the
    /// returned class must equal the training label for that point. No
    /// implementation can produce a different result without violating the
    /// triangle inequality d(x,x) = 0.
    #[test]
    fn rank1_knn_k1_identical_input_returns_exact_label() {
        // 3 distinct training points in 2D, each with a unique label.
        let train = vec![1.0, 2.0, 5.0, 6.0, 9.0, 3.0];
        let labels = vec![0.0, 1.0, 2.0];
        let model = knn_fit_impl(&train, 2, &labels, 1).unwrap();

        // Query with each training point verbatim.
        // d(point, itself) = 0, so k=1 MUST return the same label.
        let query = train.clone();
        let preds = model.predict(&query);
        assert_eq!(
            preds,
            vec![0, 1, 2],
            "k=1 on identical input must return exact training label (distance=0)"
        );
    }
}
