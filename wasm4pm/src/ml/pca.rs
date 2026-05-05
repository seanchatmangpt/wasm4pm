//! Nanosecond Dimensionality Reduction Family — branchless PCA for process mining.

use crate::state::{get_or_init_state, StoredObject};
use serde_json::json;
use wasm_bindgen::prelude::*;

const MIN_PCA_SAMPLES: usize = 2;
const FALLBACK_VARIANCE: f64 = 0.5;

/// PCA result structure for zero-allocation path.
pub struct PcaResult {
    pub eigenvalues: [f64; 2],
    pub explained_variance: [f64; 2],
}

#[wasm_bindgen]
pub fn discover_ml_pca(eventlog_handle: &str, activity_key: &str) -> Result<JsValue, JsValue> {
    let state = get_or_init_state();
    
    let features = state.with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let col = log.to_columnar_owned(activity_key);
            let num_traces = col.trace_offsets.len() - 1;
            let mut features = Vec::with_capacity(num_traces);
            
            for i in 0..num_traces {
                let start = col.trace_offsets[i];
                let end = col.trace_offsets[i+1];
                let len = (end - start) as f64;
                
                let mut unique = 0;
                let mut seen = std::collections::HashSet::new();
                for &ev in &col.events[start..end] {
                    if seen.insert(ev) { unique += 1; }
                }
                features.push([len, unique as f64]);
            }
            Ok(features)
        }
        _ => Err(crate::error::js_val("not_found")),
    })?;

    let result = pca_internal(&features);

    to_js_val(&json!({
        "algorithm": "ml_pca",
        "components": 2,
        "explained_variance": result.explained_variance,
        "eigenvalues": result.eigenvalues
    }))
}

/// Core PCA implementation with manual loop unrolling and zero heap allocation.
pub fn pca_internal(features: &[[f64; 2]]) -> PcaResult {
    let n = features.len();
    if n < MIN_PCA_SAMPLES {
        return PcaResult {
            eigenvalues: [0.0, 0.0],
            explained_variance: [0.0, 0.0],
        };
    }

    let nf = n as f64;
    let mut sum_x = 0.0;
    let mut sum_y = 0.0;
    
    // Mean calculation with manual loop unrolling
    let chunks = features.chunks_exact(4);
    let remainder = chunks.remainder();
    
    for chunk in chunks {
        sum_x += chunk[0][0] + chunk[1][0] + chunk[2][0] + chunk[3][0];
        sum_y += chunk[0][1] + chunk[1][1] + chunk[2][1] + chunk[3][1];
    }
    for f in remainder {
        sum_x += f[0];
        sum_y += f[1];
    }
    
    let mean_x = sum_x / nf;
    let mean_y = sum_y / nf;

    let mut cov_00 = 0.0;
    let mut cov_01 = 0.0;
    let mut cov_11 = 0.0;
    
    // Covariance calculation with manual loop unrolling
    let chunks = features.chunks_exact(4);
    let remainder = chunks.remainder();
    
    for chunk in chunks {
        let x0 = chunk[0][0] - mean_x;
        let y0 = chunk[0][1] - mean_y;
        let x1 = chunk[1][0] - mean_x;
        let y1 = chunk[1][1] - mean_y;
        let x2 = chunk[2][0] - mean_x;
        let y2 = chunk[2][1] - mean_y;
        let x3 = chunk[3][0] - mean_x;
        let y3 = chunk[3][1] - mean_y;
        
        cov_00 += x0 * x0 + x1 * x1 + x2 * x2 + x3 * x3;
        cov_01 += x0 * y0 + x1 * y1 + x2 * y2 + x3 * y3;
        cov_11 += y0 * y0 + y1 * y1 + y2 * y2 + y3 * y3;
    }
    
    for f in remainder {
        let x = f[0] - mean_x;
        let y = f[1] - mean_y;
        cov_00 += x * x;
        cov_01 += x * y;
        cov_11 += y * y;
    }

    let divisor = (nf - 1.0).max(1.0);
    cov_00 /= divisor;
    cov_01 /= divisor;
    cov_11 /= divisor;

    let eigenvalues = eigen_decomposition_2x2(cov_00, cov_01, cov_11);
    let total_var = eigenvalues[0] + eigenvalues[1];
    
    let explained_variance = if total_var > 0.0 {
        [eigenvalues[0] / total_var, eigenvalues[1] / total_var]
    } else {
        [FALLBACK_VARIANCE, FALLBACK_VARIANCE]
    };

    PcaResult {
        eigenvalues,
        explained_variance,
    }
}

/// Closed-form Eigenvalue decomposition for 2x2 symmetric matrices.
#[inline(always)]
fn eigen_decomposition_2x2(cov_00: f64, cov_01: f64, cov_11: f64) -> [f64; 2] {
    let tr = cov_00 + cov_11;
    let det = cov_00 * cov_11 - cov_01 * cov_01;
    
    // Characteristic equation: λ^2 - tr(A)λ + det(A) = 0
    // λ = [tr(A) ± sqrt(tr(A)^2 - 4*det(A))] / 2
    let discriminant = (tr * tr / 4.0 - det).max(0.0);
    let sqrt_disc = discriminant.sqrt();
    
    let lambda1 = tr / 2.0 + sqrt_disc;
    let lambda2 = tr / 2.0 - sqrt_disc;
    
    [lambda1, lambda2]
}

fn to_js_val(value: &serde_json::Value) -> Result<JsValue, JsValue> {
    serde_json::to_string(value)
        .map(|s| crate::error::js_val(&s))
        .map_err(|e| crate::error::wasm_err(crate::error::codes::INTERNAL_ERROR, e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pca_internal_basic() {
        let features = vec![
            [1.0, 1.0],
            [2.0, 2.0],
            [3.0, 3.0],
            [4.0, 4.0],
            [5.0, 5.0],
        ];
        let result = pca_internal(&features);
        
        // In this case, y = x, so one eigenvalue should be total variance and the other 0.
        assert!(result.eigenvalues[0] > 0.0);
        assert!(result.eigenvalues[1].abs() < 1e-10);
        assert!((result.explained_variance[0] - 1.0).abs() < 1e-10);
        assert!(result.explained_variance[1].abs() < 1e-10);
    }

    #[test]
    fn test_pca_internal_orthogonal() {
        let features = vec![
            [1.0, 0.0],
            [-1.0, 0.0],
            [0.0, 1.0],
            [0.0, -1.0],
        ];
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
    }
}
