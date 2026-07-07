//! Nanosecond Dimensionality Reduction Family — deterministic N-dim PCA
//! (power iteration with deflation) for process mining.

use crate::ml::classification::extract_features;
use crate::state::{get_or_init_state, StoredObject};
use serde_json::json;
use wasm_bindgen::prelude::*;

const MIN_PCA_SAMPLES: usize = 2;
const MAX_COMPONENTS: usize = 3;
const POWER_MAX_ITER: usize = 100;
const POWER_TOL: f64 = 1e-12;

/// PCA result: top-k eigenpairs of the sample covariance matrix,
/// k = min(3, input dimensionality). Components are sorted descending
/// by eigenvalue (power iteration extracts the dominant pair first).
pub struct PcaResult {
    pub eigenvalues: Vec<f64>,
    /// Explained variance ratio per component: eigenvalue / trace(cov).
    pub explained_variance: Vec<f64>,
    /// Cumulative explained variance ratio over the retained components.
    pub cumulative_variance: Vec<f64>,
    /// Principal directions (unit eigenvectors), one Vec<f64> of length D per component.
    pub components: Vec<Vec<f64>>,
    /// Total covariance trace = sum of ALL feature variances (not just retained).
    /// Surfaces the absolute scale; explained_variance is normalized, total is not.
    pub total_variance: f64,
}

#[wasm_bindgen]
pub fn discover_ml_pca(eventlog_handle: &str, activity_key: &str) -> Result<JsValue, JsValue> {
    let state = get_or_init_state();

    let features = state.with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => Ok(extract_features(log, activity_key).0),
        _ => Err(crate::error::js_val("not_found")),
    })?;

    let result = pca_internal(&features);

    to_js_val(&json!({
        "algorithm": "ml_pca",
        "components": result.eigenvalues.len(),
        "eigenvectors": result.components,
        "explained_variance": result.explained_variance,
        "cumulative_variance": result.cumulative_variance,
        "total_variance": result.total_variance,
        "eigenvalues": result.eigenvalues
    }))
}

/// Core PCA over N-dimensional feature vectors. Deterministic: fixed start
/// vectors, fixed iteration counts, no RNG.
pub fn pca_internal<const D: usize>(features: &[[f64; D]]) -> PcaResult {
    let k = MAX_COMPONENTS.min(D);
    let n = features.len();
    if n < MIN_PCA_SAMPLES || D == 0 {
        return PcaResult {
            eigenvalues: vec![0.0; k],
            explained_variance: vec![0.0; k],
            cumulative_variance: vec![0.0; k],
            components: vec![vec![0.0; D]; k],
            total_variance: 0.0,
        };
    }

    let nf = n as f64;
    let mut mean = [0.0f64; D];
    for f in features {
        for d in 0..D {
            mean[d] += f[d];
        }
    }
    for m in mean.iter_mut() {
        *m /= nf;
    }

    // Sample covariance (n-1 denominator, matching the legacy 2x2 path).
    let divisor = (nf - 1.0).max(1.0);
    let mut cov = [[0.0f64; D]; D];
    for f in features {
        for r in 0..D {
            let xr = f[r] - mean[r];
            for c in r..D {
                cov[r][c] += xr * (f[c] - mean[c]);
            }
        }
    }
    for r in 0..D {
        for c in r..D {
            cov[r][c] /= divisor;
            cov[c][r] = cov[r][c];
        }
    }

    let total_variance: f64 = (0..D).map(|d| cov[d][d]).sum();

    let mut eigenvalues = Vec::with_capacity(k);
    let mut components = Vec::with_capacity(k);
    let mut work = cov;
    for _ in 0..k {
        let (lambda, vec) = dominant_eigenpair(&work);
        // Deflate: work -= lambda * v v^T so the next pass finds the next pair.
        for r in 0..D {
            for c in 0..D {
                work[r][c] -= lambda * vec[r] * vec[c];
            }
        }
        eigenvalues.push(lambda.max(0.0));
        components.push(vec.to_vec());
    }

    let explained_variance: Vec<f64> = if total_variance > 0.0 {
        eigenvalues.iter().map(|&e| e / total_variance).collect()
    } else {
        vec![0.0; k]
    };
    let mut cumulative_variance = Vec::with_capacity(k);
    let mut acc = 0.0;
    for &ev in &explained_variance {
        acc += ev;
        cumulative_variance.push(acc);
    }

    PcaResult {
        eigenvalues,
        explained_variance,
        cumulative_variance,
        components,
        total_variance,
    }
}

/// Power iteration for the dominant eigenpair of a symmetric PSD matrix.
///
/// Deterministic start vectors: normalized ones vector, then each basis
/// vector in index order — needed because after deflation the ones vector
/// may already lie in the extracted eigenspace (mat*v ≈ 0).
fn dominant_eigenpair<const D: usize>(mat: &[[f64; D]; D]) -> (f64, [f64; D]) {
    let ones_norm = 1.0 / (D as f64).sqrt();
    let mut starts: Vec<[f64; D]> = Vec::with_capacity(D + 1);
    starts.push([ones_norm; D]);
    for d in 0..D {
        let mut e = [0.0f64; D];
        e[d] = 1.0;
        starts.push(e);
    }

    for start in starts {
        let mut v = start;
        let mut converged_v: Option<[f64; D]> = None;
        for _ in 0..POWER_MAX_ITER {
            let w = mat_vec(mat, &v);
            let norm = w.iter().map(|x| x * x).sum::<f64>().sqrt();
            if norm < POWER_TOL {
                // This start vector is (numerically) in the null space — try next.
                break;
            }
            let mut next = [0.0f64; D];
            for d in 0..D {
                next[d] = w[d] / norm;
            }
            // Convergence up to sign flip (eigenvectors are sign-ambiguous).
            let diff_plus: f64 = (0..D).map(|d| (next[d] - v[d]).abs()).sum();
            let diff_minus: f64 = (0..D).map(|d| (next[d] + v[d]).abs()).sum();
            v = next;
            if diff_plus.min(diff_minus) < POWER_TOL {
                converged_v = Some(v);
                break;
            }
            converged_v = Some(v);
        }
        if let Some(v) = converged_v {
            // Rayleigh quotient: v is unit-norm.
            let w = mat_vec(mat, &v);
            let lambda: f64 = (0..D).map(|d| v[d] * w[d]).sum();
            if lambda.abs() >= POWER_TOL {
                return (lambda, v);
            }
        }
    }
    (0.0, [0.0; D])
}

#[inline]
fn mat_vec<const D: usize>(mat: &[[f64; D]; D], v: &[f64; D]) -> [f64; D] {
    let mut out = [0.0f64; D];
    for r in 0..D {
        let mut acc = 0.0;
        for c in 0..D {
            acc += mat[r][c] * v[c];
        }
        out[r] = acc;
    }
    out
}

fn to_js_val(value: &serde_json::Value) -> Result<JsValue, JsValue> {
    serde_json::to_string(value)
        .map(|s| crate::error::js_val(&s))
        .map_err(|e| crate::error::wasm_err(crate::error::codes::INTERNAL_ERROR, e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Closed-form eigenvalues for 2x2 symmetric matrices — kept as a
    /// cross-check oracle for the power-iteration path.
    fn eigen_decomposition_2x2(cov_00: f64, cov_01: f64, cov_11: f64) -> [f64; 2] {
        let tr = cov_00 + cov_11;
        let det = cov_00 * cov_11 - cov_01 * cov_01;
        let discriminant = (tr * tr / 4.0 - det).max(0.0);
        let sqrt_disc = discriminant.sqrt();
        [tr / 2.0 + sqrt_disc, tr / 2.0 - sqrt_disc]
    }

    #[test]
    fn test_pca_internal_basic() {
        let features = vec![[1.0, 1.0], [2.0, 2.0], [3.0, 3.0], [4.0, 4.0], [5.0, 5.0]];
        let result = pca_internal(&features);

        // In this case, y = x, so one eigenvalue should be total variance and the other 0.
        assert!(result.eigenvalues[0] > 0.0);
        assert!(result.eigenvalues[1].abs() < 1e-10);
        assert!((result.explained_variance[0] - 1.0).abs() < 1e-10);
        assert!(result.explained_variance[1].abs() < 1e-10);
    }

    #[test]
    fn test_pca_internal_orthogonal() {
        let features = vec![[1.0, 0.0], [-1.0, 0.0], [0.0, 1.0], [0.0, -1.0]];
        let result = pca_internal(&features);

        // Variance is equal in both directions
        assert!((result.eigenvalues[0] - result.eigenvalues[1]).abs() < 1e-10);
        assert!((result.explained_variance[0] - 0.5).abs() < 1e-10);
        assert!((result.explained_variance[1] - 0.5).abs() < 1e-10);
    }

    #[test]
    fn test_pca_internal_insufficient_samples() {
        let features = vec![[1.0, 1.0]];
        let result = pca_internal(&features);
        assert_eq!(result.eigenvalues, [0.0, 0.0]);
        assert_eq!(result.cumulative_variance, [0.0, 0.0]);
        assert_eq!(result.total_variance, 0.0);
    }

    /// Power-iteration eigenvalues must match the closed-form 2x2 oracle
    /// on a generic (non-degenerate) 2-D dataset.
    #[test]
    fn power_iteration_matches_closed_form_2x2() {
        let features = vec![[1.0, 0.5], [2.0, 1.9], [3.0, 2.1], [4.0, 4.2], [5.0, 4.4]];
        let n = features.len() as f64;
        let mean_x = features.iter().map(|f| f[0]).sum::<f64>() / n;
        let mean_y = features.iter().map(|f| f[1]).sum::<f64>() / n;
        let mut c00 = 0.0;
        let mut c01 = 0.0;
        let mut c11 = 0.0;
        for f in &features {
            let x = f[0] - mean_x;
            let y = f[1] - mean_y;
            c00 += x * x;
            c01 += x * y;
            c11 += y * y;
        }
        c00 /= n - 1.0;
        c01 /= n - 1.0;
        c11 /= n - 1.0;
        let expected = eigen_decomposition_2x2(c00, c01, c11);

        let result = pca_internal(&features);
        assert!(
            (result.eigenvalues[0] - expected[0]).abs() < 1e-6,
            "dominant eigenvalue: power iteration {} vs closed form {}",
            result.eigenvalues[0],
            expected[0]
        );
        assert!(
            (result.eigenvalues[1] - expected[1]).abs() < 1e-6,
            "second eigenvalue: power iteration {} vs closed form {}",
            result.eigenvalues[1],
            expected[1]
        );
    }

    /// Hand-computable 5-D case: all variance on axis 0.
    /// Sample variance of [1,2,3] with n-1 denominator is exactly 1.0.
    #[test]
    fn pca_5d_axis_aligned_hand_computed() {
        let features: Vec<[f64; 5]> = vec![
            [1.0, 0.0, 0.0, 0.0, 0.0],
            [2.0, 0.0, 0.0, 0.0, 0.0],
            [3.0, 0.0, 0.0, 0.0, 0.0],
        ];
        let result = pca_internal(&features);
        assert_eq!(result.eigenvalues.len(), 3, "k = min(3, 5) components");
        assert!(
            (result.eigenvalues[0] - 1.0).abs() < 1e-12,
            "first eigenvalue must equal sample variance 1.0 exactly, got {}",
            result.eigenvalues[0]
        );
        assert!(
            (result.explained_variance[0] - 1.0).abs() < 1e-12,
            "single informative axis must explain 100% of variance"
        );
        assert!((result.total_variance - 1.0).abs() < 1e-12);
        // First eigenvector = ±e0.
        let v = &result.components[0];
        assert!(
            (v[0].abs() - 1.0).abs() < 1e-9,
            "first eigenvector must be ±e0, got {:?}",
            v
        );
        for d in 1..5 {
            assert!(v[d].abs() < 1e-9, "eigenvector must vanish off-axis: {:?}", v);
        }
        // Remaining eigenvalues are zero.
        assert!(result.eigenvalues[1].abs() < 1e-12);
        assert!(result.eigenvalues[2].abs() < 1e-12);
    }

    // Rank-2 domain-contract tests for cumulative_variance + total_variance.

    /// Domain contract: components are sorted descending, so cumulative_variance
    /// is monotonically non-decreasing and reaches 1.0 over all components.
    #[test]
    fn cumulative_variance_is_monotonic_and_reaches_one() {
        let features = vec![[1.0, 0.5], [2.0, 1.2], [3.0, 1.8], [4.0, 2.7], [5.0, 3.1]];
        let r = pca_internal(&features);
        assert!(
            r.cumulative_variance[1] >= r.cumulative_variance[0],
            "cumulative variance must be non-decreasing"
        );
        assert!(
            (r.cumulative_variance[1] - 1.0).abs() < 1e-9,
            "cumulative variance over all components must equal 1.0, got {}",
            r.cumulative_variance[1]
        );
        assert!((r.cumulative_variance[0] - r.explained_variance[0]).abs() < 1e-12);
    }

    /// Domain contract: total_variance equals trace(cov). For y=x on (1..5),
    /// each variable has sample variance 2.5 (n-1 divisor), so trace = 5.0.
    #[test]
    fn total_variance_equals_covariance_trace() {
        let r = pca_internal(&[[1.0, 1.0], [2.0, 2.0], [3.0, 3.0], [4.0, 4.0], [5.0, 5.0]]);
        assert!(
            (r.total_variance - 5.0).abs() < 1e-9,
            "got {}",
            r.total_variance
        );
        assert!((r.cumulative_variance[0] - 1.0).abs() < 1e-9);
    }
}
