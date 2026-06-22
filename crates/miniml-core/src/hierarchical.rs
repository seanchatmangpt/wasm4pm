use crate::error::MlError;
use crate::matrix::{euclidean_dist_sq_raw, validate_matrix};
use std::cmp::Ordering;
use std::collections::BinaryHeap;
use wasm_bindgen::prelude::*;

#[derive(Clone, Debug)]
struct MergeCandidate {
    dist_sq: f64,
    cluster_i: usize,
    cluster_j: usize,
}

impl PartialEq for MergeCandidate {
    fn eq(&self, other: &Self) -> bool {
        self.dist_sq == other.dist_sq
    }
}

impl Eq for MergeCandidate {}

impl PartialOrd for MergeCandidate {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for MergeCandidate {
    fn cmp(&self, other: &Self) -> Ordering {
        // Reverse for min-heap behavior
        other
            .dist_sq
            .partial_cmp(&self.dist_sq)
            .unwrap_or(Ordering::Equal)
    }
}

/// Hierarchical Clustering (Agglomerative)
/// Returns cluster assignments for specified number of clusters
#[wasm_bindgen(js_name = "hierarchicalClustering")]
pub fn hierarchical_clustering(
    data: &[f64],
    n_features: usize,
    n_clusters: usize,
) -> Result<Vec<f64>, JsError> {
    hierarchical_impl(data, n_features, n_clusters).map_err(|e| JsError::new(&e.message))
}

/// Agglomerative hierarchical clustering with single linkage
pub fn hierarchical_impl(
    data: &[f64],
    n_features: usize,
    n_clusters: usize,
) -> Result<Vec<f64>, MlError> {
    let n = validate_matrix(data, n_features)?;
    if n_clusters == 0 || n_clusters > n {
        return Err(MlError::new("n_clusters must be between 1 and n_samples"));
    }

    // Each point starts as its own cluster
    let mut clusters: Vec<Vec<usize>> = (0..n).map(|i| vec![i]).collect();

    // Merge until we have n_clusters
    while clusters.len() > n_clusters {
        // Build heap of all pair distances
        let mut heap = BinaryHeap::new();
        for i in 0..clusters.len() {
            for j in (i + 1)..clusters.len() {
                let dist_sq = cluster_distance_sq(data, n_features, &clusters[i], &clusters[j]);
                heap.push(MergeCandidate {
                    dist_sq,
                    cluster_i: i,
                    cluster_j: j,
                });
            }
        }

        // Extract closest pair
        let best = heap
            .pop()
            .expect("heap is non-empty while clusters.len() > n_clusters");
        let to_extend = clusters.remove(best.cluster_j);
        clusters[best.cluster_i].extend(to_extend);
    }

    // Assign labels
    let mut labels = vec![0.0f64; n];
    for (cluster_id, cluster) in clusters.iter().enumerate() {
        for &idx in cluster {
            labels[idx] = cluster_id as f64;
        }
    }

    Ok(labels)
}

fn cluster_distance_sq(data: &[f64], n_features: usize, c1: &[usize], c2: &[usize]) -> f64 {
    let mut min_dist_sq = f64::INFINITY;
    for &i in c1 {
        for &j in c2 {
            let d_sq = euclidean_dist_sq_raw(
                &data[i * n_features..(i + 1) * n_features],
                &data[j * n_features..(j + 1) * n_features],
            );

            if d_sq < min_dist_sq {
                min_dist_sq = d_sq;
            }
        }
    }
    min_dist_sq
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hierarchical_two_clusters() {
        let data = vec![
            0.0, 0.0, // Cluster 0
            0.1, 0.1, 10.0, 10.0, // Cluster 1
            10.1, 10.1,
        ];
        let labels = hierarchical_impl(&data, 2, 2).unwrap();

        // First two should be same cluster, last two same cluster
        assert_eq!(labels[0], labels[1]);
        assert_eq!(labels[2], labels[3]);
        assert_ne!(labels[0], labels[2]);
    }

    #[test]
    fn test_hierarchical_n_equals_samples() {
        let data = vec![1.0, 2.0, 3.0, 4.0];
        let labels = hierarchical_impl(&data, 1, 4).unwrap();

        // Each point is its own cluster
        for i in 0..4 {
            assert_eq!(labels[i] as usize, i);
        }
    }

    #[test]
    fn test_hierarchical_single_cluster() {
        let data = vec![1.0, 2.0, 3.0, 4.0];
        let labels = hierarchical_impl(&data, 1, 1).unwrap();

        // All points in same cluster
        for i in 1..4 {
            assert_eq!(labels[i], labels[0]);
        }
    }

    #[test]
    fn test_invalid_n_clusters() {
        let data = vec![1.0, 2.0, 3.0];
        let result = hierarchical_impl(&data, 1, 5);
        assert!(result.is_err());
    }
}
