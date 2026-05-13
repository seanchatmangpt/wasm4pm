use wasm_bindgen::prelude::*;
use crate::error::MlError;
use crate::matrix::{euclidean_dist_sq, mat_get};

/// Davies-Bouldin Index - lower is better (cluster separation vs compactness)
#[wasm_bindgen(js_name = "daviesBouldinScore")]
pub fn davies_bouldin_score(
    data: &[f64],
    n_features: usize,
    labels: &[f64],
) -> Result<f64, JsError> {
    davies_bouldin_impl(data, n_features, labels)
        .map_err(|e| JsError::new(&e.message))
}

pub fn davies_bouldin_impl(
    data: &[f64],
    n_features: usize,
    labels: &[f64],
) -> Result<f64, MlError> {
    let n = data.len() / n_features;
    if labels.len() != n {
        return Err(MlError::new("labels length must match number of samples"));
    }

    // Find unique clusters
    let mut cluster_ids: Vec<f64> = labels.to_vec();
    cluster_ids.sort_unstable_by(|a, b| a.partial_cmp(b).unwrap());
    cluster_ids.dedup();
    let n_clusters = cluster_ids.len();

    if n_clusters < 2 {
        return Ok(0.0);  // Single cluster has DB = 0
    }

    // Compute cluster centroids and average distances
    let mut centroids = Vec::with_capacity(n_clusters);
    let mut avg_distances = Vec::with_capacity(n_clusters);

    for &cluster_id in &cluster_ids {
        let mut cluster_points: Vec<usize> = Vec::new();
        for (i, &label) in labels.iter().enumerate() {
            if (label - cluster_id).abs() < 1e-10 {
                cluster_points.push(i);
            }
        }

        if cluster_points.is_empty() {
            return Err(MlError::new("empty cluster found"));
        }

        // Compute centroid
        let mut centroid = vec![0.0f64; n_features];
        for &idx in &cluster_points {
            for f in 0..n_features {
                centroid[f] += mat_get(data, n_features, idx, f);
            }
        }
        for f in 0..n_features {
            centroid[f] /= cluster_points.len() as f64;
        }

        // Compute average distance to centroid
        let mut avg_dist = 0.0;
        for &idx in &cluster_points {
            let mut dist_sq = 0.0;
            for f in 0..n_features {
                let diff = mat_get(data, n_features, idx, f) - centroid[f];
                dist_sq += diff * diff;
            }
            avg_dist += dist_sq.sqrt();
        }
        avg_dist /= cluster_points.len() as f64;

        centroids.push(centroid);
        avg_distances.push(avg_dist);
    }

    // Compute Davies-Bouldin index
    let mut db_sum = 0.0;
    for i in 0..n_clusters {
        let mut max_ratio = 0.0;
        for j in 0..n_clusters {
            if i == j {
                continue;
            }

            // Distance between centroids
            let mut dist_sq = 0.0;
            for f in 0..n_features {
                let diff = centroids[i][f] - centroids[j][f];
                dist_sq += diff * diff;
            }

            let sep_dist = dist_sq.sqrt();
            if sep_dist > 1e-12 {
                let ratio = (avg_distances[i] + avg_distances[j]) / sep_dist;
                if ratio > max_ratio {
                    max_ratio = ratio;
                }
            }
        }
        db_sum += max_ratio;
    }

    Ok(db_sum / n_clusters as f64)
}

/// Calinski-Harabasz Index (Variance Ratio Criterion) - higher is better
#[wasm_bindgen(js_name = "calinskiHarabaszScore")]
pub fn calinski_harabasz_score(
    data: &[f64],
    n_features: usize,
    labels: &[f64],
) -> Result<f64, JsError> {
    calinski_harabasz_impl(data, n_features, labels)
        .map_err(|e| JsError::new(&e.message))
}

pub fn calinski_harabasz_impl(
    data: &[f64],
    n_features: usize,
    labels: &[f64],
) -> Result<f64, MlError> {
    let n = data.len() / n_features;
    if labels.len() != n {
        return Err(MlError::new("labels length must match number of samples"));
    }

    // Find unique clusters
    let mut cluster_ids: Vec<f64> = labels.to_vec();
    cluster_ids.sort_unstable_by(|a, b| a.partial_cmp(b).unwrap());
    cluster_ids.dedup();
    let n_clusters = cluster_ids.len();

    if n_clusters < 2 {
        return Ok(0.0);
    }

    // Compute global centroid
    let mut global_centroid = vec![0.0f64; n_features];
    for i in 0..n {
        for f in 0..n_features {
            global_centroid[f] += mat_get(data, n_features, i, f);
        }
    }
    for f in 0..n_features {
        global_centroid[f] /= n as f64;
    }

    // Compute between-cluster dispersion (BGSS) and within-cluster dispersion (WGSS)
    let mut bgss = 0.0;
    let mut wgss = 0.0;

    for &cluster_id in &cluster_ids {
        let mut cluster_points: Vec<usize> = Vec::new();
        for (i, &label) in labels.iter().enumerate() {
            if (label - cluster_id).abs() < 1e-10 {
                cluster_points.push(i);
            }
        }

        if cluster_points.is_empty() {
            continue;
        }

        // Cluster centroid
        let mut cluster_centroid = vec![0.0f64; n_features];
        for &idx in &cluster_points {
            for f in 0..n_features {
                cluster_centroid[f] += mat_get(data, n_features, idx, f);
            }
        }
        for f in 0..n_features {
            cluster_centroid[f] /= cluster_points.len() as f64;
        }

        // Between-cluster: cluster size * distance from cluster centroid to global centroid
        let mut dist_to_global_sq = 0.0;
        for f in 0..n_features {
            let diff = cluster_centroid[f] - global_centroid[f];
            dist_to_global_sq += diff * diff;
        }
        bgss += cluster_points.len() as f64 * dist_to_global_sq;

        // Within-cluster: sum of squared distances to cluster centroid
        for &idx in &cluster_points {
            let mut dist_sq = 0.0;
            for f in 0..n_features {
                let diff = mat_get(data, n_features, idx, f) - cluster_centroid[f];
                dist_sq += diff * diff;
            }
            wgss += dist_sq;
        }
    }

    if wgss < 1e-12 {
        return Ok(f64::INFINITY);  // Perfect clustering
    }

    let ch_index = (bgss / (n_clusters - 1) as f64) / (wgss / (n - n_clusters) as f64);
    Ok(ch_index)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_davies_bouldin_well_separated() {
        let data = vec![
            0.0, 0.0,  // Cluster 0
            0.1, 0.1,
            10.0, 10.0,  // Cluster 1
            10.1, 10.1,
        ];
        let labels = vec![0.0, 0.0, 1.0, 1.0];

        let db = davies_bouldin_impl(&data, 2, &labels).unwrap();

        // Well-separated clusters should have low DB
        assert!(db < 1.0);
    }

    #[test]
    fn test_calinski_harabasz_well_separated() {
        let data = vec![
            0.0, 0.0,  // Cluster 0
            0.1, 0.1,
            10.0, 10.0,  // Cluster 1
            10.1, 10.1,
        ];
        let labels = vec![0.0, 0.0, 1.0, 1.0];

        let ch = calinski_harabasz_impl(&data, 2, &labels).unwrap();

        // Well-separated clusters should have high CH
        assert!(ch > 10.0);
    }

    #[test]
    fn test_single_cluster() {
        let data = vec![1.0, 2.0, 3.0];
        let labels = vec![0.0, 0.0, 0.0];

        let db = davies_bouldin_impl(&data, 1, &labels).unwrap();
        assert_eq!(db, 0.0);

        let ch = calinski_harabasz_impl(&data, 1, &labels).unwrap();
        assert_eq!(ch, 0.0);
    }
}
