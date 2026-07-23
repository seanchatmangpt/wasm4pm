//! Nanosecond Clustering Family — branchless K-Means for process mining.
#![allow(clippy::needless_range_loop)] // branchless argmin: index carries centroid identity

use crate::ml::classification::{extract_features, normalize_features};
use crate::state::{get_or_init_state, StoredObject};
use serde_json::json;
use wasm_bindgen::prelude::*;

const MAX_ITERATIONS: usize = 10;
const K_CLUSTERS: usize = 3;

#[wasm_bindgen]
pub fn discover_ml_cluster(eventlog_handle: &str, activity_key: &str) -> Result<JsValue, JsValue> {
    let state = get_or_init_state();

    let features = state.with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let (f, _) = extract_features(log, activity_key);
            Ok(f)
        }
        _ => Err(crate::error::js_val("not_found")),
    })?;

    if features.is_empty() {
        // SAFETY: to_js_str required here; to_js(&json!()) silently returns {} on wasm32.
        return crate::utilities::to_js_str(&json!({
            "algorithm": "ml_cluster",
            "error": "Insufficient data",
            "clusters": [],
            "k": 0,
            "centroids": [],
            "assignments": [],
            "inertia": 0.0,
            "silhouette": 0.0,
            "iterations": 0
        }));
    }

    // Mixed magnitudes (seconds vs counts) — min-max normalize before distances.
    let normalized = normalize_features(&features, &features);
    let result = kmeans_internal(&normalized, K_CLUSTERS);

    // SAFETY: to_js_str required here; to_js(&json!()) silently returns {} on wasm32.
    crate::utilities::to_js_str(&json!({
        "algorithm": "ml_cluster",
        "k": result.k,
        "centroids": result.centroids,
        "assignments": result.assignments,
        "inertia": result.inertia,
        "silhouette": result.silhouette,
        "iterations": result.iterations
    }))
}

/// Output of the K-Means clustering algorithm.
///
/// Contains the discovered centroids, cluster assignments for each input feature,
/// and performance metrics like inertia and silhouette score.
pub struct KmeansResult<const D: usize> {
    /// The number of clusters discovered.
    pub k: usize,
    /// The centroids of the discovered clusters.
    pub centroids: Vec<[f64; D]>,
    /// Cluster index assigned to each input feature.
    pub assignments: Vec<usize>,
    /// Within-cluster sum of squares (WCSS / inertia). A measure of cluster tightness.
    pub inertia: f64,
    /// Mean silhouette score in `[-1, 1]`. Measures how similar an object is to its own cluster compared to others.
    pub silhouette: f64,
    /// The number of iterations until convergence.
    pub iterations: usize,
}

/// Branchless K-Means implementation on `D`-dimensional points.
///
/// Convergence is deterministic for identical input. `k` is clamped to `min(k, n)`.
/// This implementation uses branchless arithmetic for the assignment step to ensure
/// high performance.
pub fn kmeans_internal<const D: usize>(features: &[[f64; D]], k_request: usize) -> KmeansResult<D> {
    let n = features.len();
    let k = k_request.clamp(1, n);

    // Initialize centroids evenly spaced across the input
    let mut centroids = vec![[0.0; D]; k];
    for i in 0..k {
        centroids[i] = features[i * (n / k)];
    }

    let mut assignments = vec![0usize; n];
    let mut iterations = 0usize;

    for iter in 0..MAX_ITERATIONS {
        iterations = iter + 1;
        let mut changed = false;

        // Assignment step
        for i in 0..n {
            let f = features[i];
            let mut best_dist = f64::MAX;
            let mut best_c = 0;

            for j in 0..k {
                let c = centroids[j];
                let mut dist = 0.0;
                for d in 0..D {
                    let diff = f[d] - c[d];
                    dist += diff * diff;
                }
                // Branchless argmin: select j when dist < best_dist, else keep best_c.
                let is_better = (dist < best_dist) as usize;
                best_c = j * is_better + best_c * (1 - is_better);
                best_dist = best_dist.min(dist); // maps to fmin — no branch
            }

            if assignments[i] != best_c {
                assignments[i] = best_c;
                changed = true;
            }
        }

        if !changed && iter > 0 {
            break;
        }

        // Update step — accumulate per-cluster sums then divide.
        // BUGFIX: previously `centroids` was divided by counts without ever
        // receiving the new sums, so centroids never moved past the seed values.
        let mut sums = vec![[0.0f64; D]; k];
        let mut counts = vec![0usize; k];

        for i in 0..n {
            let c = assignments[i];
            for d in 0..D {
                sums[c][d] += features[i][d];
            }
            counts[c] += 1;
        }

        for j in 0..k {
            if counts[j] > 0 {
                let cnt = counts[j] as f64;
                for d in 0..D {
                    centroids[j][d] = sums[j][d] / cnt;
                }
            }
            // Empty cluster: keep prior centroid (avoids collapse to origin).
        }
    }

    // Inertia (within-cluster sum of squared distances).
    let mut inertia = 0.0f64;
    for i in 0..n {
        let c = centroids[assignments[i]];
        for d in 0..D {
            let diff = features[i][d] - c[d];
            inertia += diff * diff;
        }
    }

    let silhouette = silhouette_score(features, &assignments, k);

    KmeansResult {
        k,
        centroids,
        assignments,
        inertia,
        silhouette,
        iterations,
    }
}

/// Mean silhouette score over all samples. Returns `0.0` when `k < 2` or any
/// cluster has fewer than 2 members (silhouette is undefined for singletons).
fn silhouette_score<const D: usize>(features: &[[f64; D]], assignments: &[usize], k: usize) -> f64 {
    let n = features.len();
    if k < 2 || n <= k {
        return 0.0;
    }

    // Per-cluster counts for early bail.
    let mut counts = vec![0usize; k];
    for &c in assignments {
        counts[c] += 1;
    }
    // If every cluster is empty or singleton-only, silhouette is undefined → 0.
    if counts.iter().all(|&c| c <= 1) {
        return 0.0;
    }

    let mut total = 0.0f64;
    let mut counted = 0usize;

    for i in 0..n {
        let own = assignments[i];
        if counts[own] < 2 {
            // Silhouette of a singleton sample is defined as 0 (Rousseeuw 1987).
            counted += 1;
            continue;
        }

        // Mean intra-cluster distance (a) and best mean inter-cluster distance (b).
        let mut sum_intra = 0.0f64;
        let mut inter_sums = vec![0.0f64; k];
        let mut inter_counts = vec![0usize; k];

        for j in 0..n {
            if i == j {
                continue;
            }
            let mut sq = 0.0;
            for dim in 0..D {
                let diff = features[i][dim] - features[j][dim];
                sq += diff * diff;
            }
            let d = sq.sqrt();
            let c = assignments[j];
            if c == own {
                sum_intra += d;
            } else {
                inter_sums[c] += d;
                inter_counts[c] += 1;
            }
        }

        let a = sum_intra / (counts[own] - 1) as f64;
        let mut best_inter = f64::MAX;
        for c in 0..k {
            if c == own || inter_counts[c] == 0 {
                continue;
            }
            let mean_b = inter_sums[c] / inter_counts[c] as f64;
            if mean_b < best_inter {
                best_inter = mean_b;
            }
        }

        if best_inter == f64::MAX {
            // No other populated cluster: silhouette undefined for this sample.
            counted += 1;
            continue;
        }

        let s = (best_inter - a) / a.max(best_inter).max(f64::MIN_POSITIVE);
        total += s;
        counted += 1;
    }

    if counted == 0 {
        0.0
    } else {
        total / counted as f64
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kmeans_two_well_separated_clusters_resolved() {
        // Two tight blobs around (0,0) and (10,10).
        let features = vec![
            [0.0, 0.0],
            [0.1, 0.0],
            [0.0, 0.1],
            [0.1, 0.1],
            [10.0, 10.0],
            [10.1, 10.0],
            [10.0, 10.1],
            [10.1, 10.1],
        ];
        let result = kmeans_internal(&features, 2);
        assert_eq!(result.k, 2);
        assert_eq!(result.assignments.len(), 8);
        // All first 4 must share a label distinct from the last 4.
        let a = result.assignments[0];
        let b = result.assignments[4];
        assert_ne!(
            a, b,
            "two well-separated blobs must get different cluster labels"
        );
        for i in 0..4 {
            assert_eq!(
                result.assignments[i], a,
                "sample {i} in low blob has wrong label"
            );
        }
        for i in 4..8 {
            assert_eq!(
                result.assignments[i], b,
                "sample {i} in high blob has wrong label"
            );
        }
        // Centroids must converge near the true means (not still seeded at (0,0)/(10,10)).
        let low = result.centroids[a];
        let high = result.centroids[b];
        assert!(
            (low[0] - 0.05).abs() < 0.1 && (low[1] - 0.05).abs() < 0.1,
            "low-blob centroid should converge near (0.05, 0.05), got {:?}",
            low
        );
        assert!(
            (high[0] - 10.05).abs() < 0.1 && (high[1] - 10.05).abs() < 0.1,
            "high-blob centroid should converge near (10.05, 10.05), got {:?}",
            high
        );
    }

    #[test]
    fn kmeans_inertia_is_non_negative_and_decreases_with_more_clusters() {
        let features: Vec<[f64; 2]> = (0..30).map(|i| [(i % 6) as f64, (i / 6) as f64]).collect();
        let r1 = kmeans_internal(&features, 1);
        let r3 = kmeans_internal(&features, 3);
        assert!(r1.inertia >= 0.0, "inertia must be non-negative");
        assert!(r3.inertia >= 0.0, "inertia must be non-negative");
        assert!(
            r3.inertia <= r1.inertia + 1e-9,
            "inertia should not increase as k grows: k=1 -> {}, k=3 -> {}",
            r1.inertia,
            r3.inertia
        );
    }

    #[test]
    fn kmeans_silhouette_in_valid_range_for_separated_clusters() {
        let features = vec![
            [0.0, 0.0],
            [0.1, 0.0],
            [0.0, 0.1],
            [0.1, 0.1],
            [10.0, 10.0],
            [10.1, 10.0],
            [10.0, 10.1],
            [10.1, 10.1],
        ];
        let result = kmeans_internal(&features, 2);
        assert!(
            result.silhouette >= -1.0 && result.silhouette <= 1.0,
            "silhouette must lie in [-1, 1], got {}",
            result.silhouette
        );
        // Two tight, well-separated blobs should yield a strongly positive silhouette.
        assert!(
            result.silhouette > 0.9,
            "well-separated blobs should give silhouette > 0.9, got {}",
            result.silhouette
        );
    }

    #[test]
    fn kmeans_single_point_does_not_panic() {
        let features = vec![[1.0, 1.0]];
        let result = kmeans_internal(&features, 3);
        assert_eq!(result.k, 1, "k must be clamped to n");
        assert_eq!(result.assignments, vec![0]);
        assert_eq!(result.inertia, 0.0);
        assert_eq!(result.silhouette, 0.0, "silhouette undefined for k<2");
    }
}
