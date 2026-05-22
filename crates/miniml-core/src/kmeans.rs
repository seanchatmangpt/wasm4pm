use wasm_bindgen::prelude::*;
use crate::error::MlError;
use crate::matrix::{validate_matrix, dist_to_point, Rng};

/// Model for K-Means clustering.
#[wasm_bindgen]
pub struct KMeansModel {
    k: usize,
    n_features: usize,
    centroids: Vec<f64>,
    assignments: Vec<u32>,
    iterations: usize,
    inertia: f64,
}

#[wasm_bindgen]
impl KMeansModel {
    /// Get the number of clusters
    #[wasm_bindgen(getter)]
    pub fn k(&self) -> usize { self.k }

    /// Get the number of iterations performed
    #[wasm_bindgen(getter)]
    pub fn iterations(&self) -> usize { self.iterations }

    /// Get the final inertia (sum of squared distances to nearest centroid)
    #[wasm_bindgen(getter)]
    pub fn inertia(&self) -> f64 { self.inertia }

    /// Get the centroids as a flat array
    #[wasm_bindgen(js_name = "getCentroids")]
    pub fn get_centroids(&self) -> Vec<f64> { self.centroids.clone() }

    /// Get the cluster assignments for each training sample
    #[wasm_bindgen(js_name = "getAssignments")]
    pub fn get_assignments(&self) -> Vec<u32> { self.assignments.clone() }

    /// Get the number of features
    #[wasm_bindgen(js_name = "getNFeatures")]
    pub fn get_n_features(&self) -> usize { self.n_features }

    /// Assign new data points to nearest centroid
    #[wasm_bindgen]
    pub fn predict(&self, data: &[f64]) -> Vec<u32> {
        let n = data.len() / self.n_features;
        let mut result = Vec::with_capacity(n);
        for i in 0..n {
            let point = &data[i * self.n_features..(i + 1) * self.n_features];
            let mut best = 0u32;
            let mut best_dist = f64::INFINITY;
            for c in 0..self.k {
                let centroid = &self.centroids[c * self.n_features..(c + 1) * self.n_features];
                let mut d = 0.0;
                for j in 0..self.n_features {
                    let diff = point[j] - centroid[j];
                    d += diff * diff;
                }
                if d < best_dist {
                    best_dist = d;
                    best = c as u32;
                }
            }
            result.push(best);
        }
        result
    }

    /// Return a string representation of the model
    #[wasm_bindgen(js_name = "toString")]
    pub fn to_string_js(&self) -> String {
        format!("KMeans(k={}, iterations={}, inertia={:.4})", self.k, self.iterations, self.inertia)
    }
}

/// Implementation of K-Means clustering
pub fn kmeans_impl(data: &[f64], n_features: usize, k: usize, max_iter: usize) -> Result<KMeansModel, MlError> {
    let n = validate_matrix(data, n_features)?;
    if k == 0 || k > n {
        return Err(MlError::new("k must be between 1 and number of samples"));
    }

    let mut rng = Rng::from_data(data);
    let mut centroids = vec![0.0; k * n_features];

    // k-means++ initialization
    let first = rng.next_usize(n);
    centroids[..n_features].copy_from_slice(&data[first * n_features..(first + 1) * n_features]);

    let mut dists = vec![f64::INFINITY; n];
    for c in 1..k {
        // Update distances to nearest centroid
        for (i, dist) in dists.iter_mut().enumerate().take(n) {
            let d = dist_to_point(data, n_features, i, &centroids[(c - 1) * n_features..c * n_features]);
            if d < *dist { *dist = d; }
        }
        // Weighted random selection
        let total: f64 = dists.iter().map(|&d| d * d).sum();
        let mut target = rng.next_f64() * total;
        let mut chosen = 0;
        for (i, &dist) in dists.iter().enumerate().take(n) {
            target -= dist * dist;
            if target <= 0.0 { chosen = i; break; }
        }
        centroids[c * n_features..(c + 1) * n_features]
            .copy_from_slice(&data[chosen * n_features..(chosen + 1) * n_features]);
    }

    let mut assignments = vec![0u32; n];
    let mut iterations = 0;

    for iter in 0..max_iter {
        iterations = iter + 1;
        let mut changed = false;

        // Assign each point to nearest centroid
        for (i, assign) in assignments.iter_mut().enumerate().take(n) {
            let mut best = 0u32;
            let mut best_dist = f64::INFINITY;
            for c in 0..k {
                let d = dist_to_point(data, n_features, i, &centroids[c * n_features..(c + 1) * n_features]);
                if d < best_dist { best_dist = d; best = c as u32; }
            }
            if *assign != best { changed = true; *assign = best; }
        }

        if !changed { break; }

        // Recalculate centroids
        let mut counts = vec![0usize; k];
        centroids.fill(0.0);
        for (i, &assign) in assignments.iter().enumerate().take(n) {
            let c = assign as usize;
            counts[c] += 1;
            let start = i * n_features;
            for j in 0..n_features {
                centroids[c * n_features + j] += data[start + j];
            }
        }
        for (c, &count) in counts.iter().enumerate().take(k) {
            if count > 0 {
                let start = c * n_features;
                for j in 0..n_features {
                    centroids[start + j] /= count as f64;
                }
            }
        }
    }

    // Calculate inertia
    let mut inertia = 0.0;
    for (i, &assign) in assignments.iter().enumerate().take(n) {
        let c = assign as usize;
        let d = dist_to_point(data, n_features, i, &centroids[c * n_features..(c + 1) * n_features]);
        inertia += d * d;
    }

    Ok(KMeansModel { k, n_features, centroids, assignments, iterations, inertia })
}

/// K-Means clustering algorithm
#[wasm_bindgen(js_name = "kmeans")]
pub fn kmeans(data: &[f64], n_features: usize, k: usize, max_iter: usize) -> Result<KMeansModel, JsError> {
    kmeans_impl(data, n_features, k, max_iter).map_err(|e| JsError::new(&e.message))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_two_clusters() {
        let data = vec![
            0.0, 0.0,  0.1, 0.1,  0.2, 0.0,
            5.0, 5.0,  5.1, 5.1,  4.9, 5.0,
        ];
        let model = kmeans_impl(&data, 2, 2, 100).unwrap();
        assert_eq!(model.k, 2);
        assert_eq!(model.assignments.len(), 6);
        // First 3 and last 3 should be in different clusters
        assert_eq!(model.assignments[0], model.assignments[1]);
        assert_eq!(model.assignments[0], model.assignments[2]);
        assert_eq!(model.assignments[3], model.assignments[4]);
        assert_ne!(model.assignments[0], model.assignments[3]);
    }

    #[test]
    fn test_single_cluster() {
        let data = vec![1.0, 2.0, 3.0, 4.0];
        let model = kmeans_impl(&data, 2, 1, 100).unwrap();
        assert_eq!(model.k, 1);
        assert!(model.assignments.iter().all(|&a| a == 0));
    }

    #[test]
    fn test_k_too_large() {
        let data = vec![1.0, 2.0];
        assert!(kmeans_impl(&data, 2, 2, 100).is_err());
    }
}
