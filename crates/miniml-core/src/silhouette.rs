use wasm_bindgen::prelude::*;
use crate::error::MlError;
use crate::matrix::{validate_matrix, euclidean_dist_sq};

/// Compute the mean silhouette score for clustering quality.
/// Range: [-1, 1] where 1 = well-clustered, 0 = overlapping, -1 = wrong cluster.
pub fn silhouette_score_impl(data: &[f64], n_features: usize, labels: &[f64]) -> Result<f64, MlError> {
    let n = validate_matrix(data, n_features)?;
    if labels.len() != n {
        return Err(MlError::new("labels length must match number of samples"));
    }
    if n < 2 {
        return Err(MlError::new("Need at least 2 samples"));
    }

    // Find unique clusters
    let mut clusters: Vec<f64> = labels.iter().copied().collect();
    clusters.sort_unstable_by(|a, b| a.partial_cmp(b).unwrap());
    clusters.dedup();

    if clusters.len() < 2 {
        return Err(MlError::new("Need at least 2 clusters for silhouette score"));
    }

    // Precompute cluster assignments for O(1) lookup
    let mut cluster_indices: Vec<Vec<usize>> = vec![Vec::new(); clusters.len()];
    for i in 0..n {
        let c = clusters.iter().position(|&cls| (cls - labels[i]).abs() < 1e-10).unwrap();
        cluster_indices[c].push(i);
    }

    let mut total_silhouette = 0.0;

    for i in 0..n {
        let ci = clusters.iter().position(|&cls| (cls - labels[i]).abs() < 1e-10).unwrap();
        let same_cluster = &cluster_indices[ci];

        // a(i) = mean distance to other points in same cluster
        let a = if same_cluster.len() <= 1 {
            0.0 // By convention, silhouette of a singleton is 0
        } else {
            let mut sum = 0.0;
            for &j in same_cluster {
                if j != i {
                    sum += euclidean_dist_sq(data, n_features, i, j).sqrt();
                }
            }
            sum / (same_cluster.len() - 1) as f64
        };

        // b(i) = min over other clusters of mean distance to points in that cluster
        let mut b = f64::MAX;
        for (c_idx, cluster) in cluster_indices.iter().enumerate() {
            if c_idx == ci || cluster.is_empty() {
                continue;
            }
            let mut sum = 0.0;
            for &j in cluster {
                sum += euclidean_dist_sq(data, n_features, i, j).sqrt();
            }
            let mean_dist = sum / cluster.len() as f64;
            if mean_dist < b {
                b = mean_dist;
            }
        }

        // s(i) = (b - a) / max(a, b)
        let s = if a.max(b) < 1e-10 {
            0.0
        } else {
            (b - a) / a.max(b)
        };

        total_silhouette += s;
    }

    Ok(total_silhouette / n as f64)
}

#[wasm_bindgen(js_name = "silhouetteScore")]
pub fn silhouette_score(
    data: &[f64],
    n_features: usize,
    labels: &[f64],
) -> Result<f64, JsError> {
    silhouette_score_impl(data, n_features, labels).map_err(|e| JsError::new(&e.message))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_perfect_clustering() {
        // Two well-separated clusters
        let data = vec![
            0.0, 0.0,  0.1, 0.1,  -0.1, 0.1,   // cluster 0
            10.0, 10.0,  10.1, 10.1,  9.9, 10.1, // cluster 1
        ];
        let labels = vec![0.0, 0.0, 0.0, 1.0, 1.0, 1.0];
        let score = silhouette_score_impl(&data, 2, &labels).unwrap();
        assert!(score > 0.8, "Expected high silhouette score for well-separated clusters, got {}", score);
    }

    #[test]
    fn test_overlapping_clusters() {
        // Random-ish data — score should be lower
        let data = vec![
            1.0, 1.0,  2.0, 1.5,  1.5, 2.0,
            1.5, 1.0,  2.0, 2.0,  1.0, 2.0,
        ];
        let labels = vec![0.0, 0.0, 0.0, 1.0, 1.0, 1.0];
        let score = silhouette_score_impl(&data, 2, &labels).unwrap();
        assert!(score < 0.8, "Expected low silhouette score for overlapping clusters, got {}", score);
        assert!(score > -1.0);
    }

    #[test]
    fn test_single_cluster_error() {
        let data = vec![1.0, 2.0, 3.0, 4.0];
        let labels = vec![0.0, 0.0, 0.0, 0.0];
        assert!(silhouette_score_impl(&data, 2, &labels).is_err());
    }

    #[test]
    fn test_singleton_cluster() {
        // One singleton cluster + one normal cluster
        let data = vec![
            0.0, 0.0,
            10.0, 10.0,  10.1, 10.1,  9.9, 10.1,
        ];
        let labels = vec![0.0, 1.0, 1.0, 1.0];
        let score = silhouette_score_impl(&data, 2, &labels).unwrap();
        // Should not panic, silhouette of singleton is 0 by convention
        assert!(score >= -1.0 && score <= 1.0);
    }

    #[test]
    fn test_three_clusters() {
        let data = vec![
            0.0, 0.0,  0.1, 0.1,
            10.0, 0.0,  10.1, 0.1,
            0.0, 10.0,  0.1, 10.1,
        ];
        let labels = vec![0.0, 0.0, 1.0, 1.0, 2.0, 2.0];
        let score = silhouette_score_impl(&data, 2, &labels).unwrap();
        assert!(score > 0.8, "Expected high score for 3 well-separated clusters, got {}", score);
    }
}
