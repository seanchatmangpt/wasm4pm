use wasm_bindgen::prelude::*;
use crate::error::MlError;
use crate::matrix::{validate_matrix, euclidean_dist_sq, Rng};

/// K-Means++ Clustering (improved initialization)
/// Returns cluster assignments and final centroids
#[wasm_bindgen(js_name = "kmeansPlus")]
pub fn kmeans_plus(
    data: &[f64],
    n_features: usize,
    n_clusters: usize,
    max_iter: usize,
) -> Result<Vec<f64>, JsError> {
    kmeans_plus_impl(data, n_features, n_clusters, max_iter)
        .map_err(|e| JsError::new(&e.message))
}

/// K-Means++ implementation with smart initialization
pub fn kmeans_plus_impl(
    data: &[f64],
    n_features: usize,
    n_clusters: usize,
    max_iter: usize,
) -> Result<Vec<f64>, MlError> {
    let n = validate_matrix(data, n_features)?;
    if n_clusters == 0 || n_clusters > n {
        return Err(MlError::new("n_clusters must be between 1 and n_samples"));
    }

    // K-Means++ initialization
    let mut centroids = initialize_centroids_plus_plus(data, n_features, n_clusters, n)?;

    // Assign samples to nearest centroid
    let mut assignments = vec![0usize; n];

    // Standard K-Means iterations
    for _iter in 0..max_iter {
        let mut changed = false;

        for i in 0..n {
            let mut best_cluster = 0;
            let mut best_dist = f64::INFINITY;

            for (c, centroid) in centroids.iter().enumerate() {
                let dist_sq = euclidean_dist_sq_to_centroid(data, n_features, i, centroid);
                if dist_sq < best_dist {
                    best_dist = dist_sq;
                    best_cluster = c;
                }
            }

            if assignments[i] != best_cluster {
                changed = true;
            }
            assignments[i] = best_cluster;
        }

        // Update centroids
        let mut new_centroids = vec![vec![0.0f64; n_features]; n_clusters];
        let mut counts = vec![0usize; n_clusters];

        for (i, &cluster) in assignments.iter().enumerate() {
            for f in 0..n_features {
                new_centroids[cluster][f] += data[i * n_features + f];
            }
            counts[cluster] += 1;
        }

        for c in 0..n_clusters {
            if counts[c] > 0 {
                for f in 0..n_features {
                    new_centroids[c][f] /= counts[c] as f64;
                }
            }
        }

        centroids = new_centroids;

        if !changed {
            break;  // Converged
        }
    }

    // Return: [n_clusters, assignments..., centroids_flat...]
    let mut result = Vec::with_capacity(1 + n + n_clusters * n_features);
    result.push(n_clusters as f64);

    for &a in &assignments {
        result.push(a as f64);
    }

    for centroid in &centroids {
        result.extend_from_slice(centroid);
    }

    Ok(result)
}

/// K-Means++ initialization: choose first centroid randomly, then iteratively
/// select centroids with probability proportional to squared distance
fn initialize_centroids_plus_plus(
    data: &[f64],
    n_features: usize,
    n_clusters: usize,
    n_samples: usize,
) -> Result<Vec<Vec<f64>>, MlError> {
    let mut centroids = Vec::new();
    let mut rng = Rng::from_data(data);

    // Choose first centroid randomly
    let first_idx = (rng.next_f64() * n_samples as f64) as usize % n_samples;
    let first_centroid: Vec<f64> = (0..n_features)
        .map(|f| data[first_idx * n_features + f])
        .collect();
    centroids.push(first_centroid);

    // Choose remaining centroids
    while centroids.len() < n_clusters {
        // Compute squared distances to nearest centroid
        let mut min_distances = vec![0.0f64; n_samples];
        let mut total_dist = 0.0;

        for i in 0..n_samples {
            let mut min_dist_sq = f64::INFINITY;

            for centroid in &centroids {
                let dist_sq = euclidean_dist_sq_to_centroid(data, n_features, i, centroid);
                if dist_sq < min_dist_sq {
                    min_dist_sq = dist_sq;
                }
            }

            min_distances[i] = min_dist_sq;
            total_dist += min_dist_sq;
        }

        // Select next centroid with probability proportional to distance
        let mut select = rng.next_f64() * total_dist;
        let mut selected_idx = 0;

        for (i, &dist) in min_distances.iter().enumerate() {
            select -= dist;
            if select <= 0.0 {
                selected_idx = i;
                break;
            }
        }

        let new_centroid: Vec<f64> = (0..n_features)
            .map(|f| data[selected_idx * n_features + f])
            .collect();
        centroids.push(new_centroid);
    }

    Ok(centroids)
}

fn euclidean_dist_sq_to_centroid(
    data: &[f64],
    n_features: usize,
    sample_idx: usize,
    centroid: &[f64],
) -> f64 {
    let mut dist_sq = 0.0;
    for f in 0..n_features {
        let diff = data[sample_idx * n_features + f] - centroid[f];
        dist_sq += diff * diff;
    }
    dist_sq
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_kmeans_plus_two_clusters() {
        let data = vec![
            0.0, 0.0,  // Cluster 0
            0.1, 0.1,
            10.0, 10.0,  // Cluster 1
            10.1, 10.1,
        ];

        let result = kmeans_plus_impl(&data, 2, 2, 100).unwrap();

        // First element is n_clusters
        assert_eq!(result[0] as usize, 2);

        // Next 4 elements are assignments
        let assignments = &result[1..5];
        assert_eq!(assignments[0], assignments[1]);  // First two same cluster
        assert_eq!(assignments[2], assignments[3]);  // Last two same cluster
    }

    #[test]
    fn test_kmeans_plus_centroids() {
        let data = vec![
            0.0, 0.0,
            10.0, 10.0,
        ];

        let result = kmeans_plus_impl(&data, 2, 2, 50).unwrap();

        // After n_clusters (1) and assignments (2), we have centroids
        let centroids_start = 1 + 2;  // n_clusters + n_samples
        let centroid0_x = result[centroids_start];
        let centroid0_y = result[centroids_start + 1];
        let centroid1_x = result[centroids_start + 2];
        let centroid1_y = result[centroids_start + 3];

        // Centroids should be near the data points
        assert!((centroid0_x - 0.0).abs() < 1.0);
        assert!((centroid0_y - 0.0).abs() < 1.0);
        assert!((centroid1_x - 10.0).abs() < 1.0);
        assert!((centroid1_y - 10.0).abs() < 1.0);
    }

    #[test]
    fn test_invalid_n_clusters() {
        let data = vec![1.0, 2.0, 3.0];
        let result = kmeans_plus_impl(&data, 1, 5, 100);
        assert!(result.is_err());
    }
}
