//! ML Utilities — branchless mathematical primitives and feature extraction.

use crate::cache::OwnedColumnarLog;

/// Extract trace lengths as f64 for regression/PCA.
pub fn extract_trace_lengths(col: &OwnedColumnarLog) -> Vec<f64> {
    let mut lengths = Vec::with_capacity(col.trace_offsets.len() - 1);
    for i in 0..col.trace_offsets.len() - 1 {
        lengths.push((col.trace_offsets[i + 1] - col.trace_offsets[i]) as f64);
    }
    lengths
}

/// Compute mean of a slice (branchless sum).
pub fn mean(data: &[f64]) -> f64 {
    if data.is_empty() {
        return 0.0;
    }
    let sum: f64 = data.iter().sum();
    sum / data.len() as f64
}

/// Dot product of two vectors (SIMD-friendly).
pub fn dot_product(a: &[f64], b: &[f64]) -> f64 {
    let n = a.len().min(b.len());
    let a = &a[..n];
    let b = &b[..n];

    let mut sum0 = 0.0;
    let mut sum1 = 0.0;
    let mut sum2 = 0.0;
    let mut sum3 = 0.0;

    let a_chunks = a.chunks_exact(4);
    let b_chunks = b.chunks_exact(4);
    let rem_a = a_chunks.remainder();
    let rem_b = b_chunks.remainder();

    for (ac, bc) in a_chunks.zip(b_chunks) {
        sum0 += ac[0] * bc[0];
        sum1 += ac[1] * bc[1];
        sum2 += ac[2] * bc[2];
        sum3 += ac[3] * bc[3];
    }

    let mut total = sum0 + sum1 + sum2 + sum3;
    for (&x, &y) in rem_a.iter().zip(rem_b.iter()) {
        total += x * y;
    }
    total
}

/// Euclidean distance between two feature vectors (branchless).
pub fn euclidean_distance(a: &[f64], b: &[f64]) -> f64 {
    let n = a.len().min(b.len());
    let a = &a[..n];
    let b = &b[..n];

    let mut sum0 = 0.0;
    let mut sum1 = 0.0;
    let mut sum2 = 0.0;
    let mut sum3 = 0.0;

    let a_chunks = a.chunks_exact(4);
    let b_chunks = b.chunks_exact(4);
    let rem_a = a_chunks.remainder();
    let rem_b = b_chunks.remainder();

    for (ac, bc) in a_chunks.zip(b_chunks) {
        let d0 = ac[0] - bc[0];
        let d1 = ac[1] - bc[1];
        let d2 = ac[2] - bc[2];
        let d3 = ac[3] - bc[3];
        sum0 += d0 * d0;
        sum1 += d1 * d1;
        sum2 += d2 * d2;
        sum3 += d3 * d3;
    }

    let mut total = sum0 + sum1 + sum2 + sum3;
    for (&x, &y) in rem_a.iter().zip(rem_b.iter()) {
        let diff = x - y;
        total += diff * diff;
    }
    total.sqrt()
}

/// Standardizes features (zero mean, unit variance).
pub fn standardize(data: &mut [Vec<f64>]) {
    if data.is_empty() {
        return;
    }
    let num_features = data[0].len();
    let n = data.len() as f64;
    let inv_n = 1.0 / n;

    for j in 0..num_features {
        let mut sum0 = 0.0;
        let mut sum1 = 0.0;
        let mut sum_sq0 = 0.0;
        let mut sum_sq1 = 0.0;

        // Process in chunks of 2 for better pipeline saturation
        let chunks = data.chunks_exact(2);
        let rem = chunks.remainder();

        for c in chunks {
            let v0 = c[0][j];
            let v1 = c[1][j];
            sum0 += v0;
            sum1 += v1;
            sum_sq0 += v0 * v0;
            sum_sq1 += v1 * v1;
        }

        let mut sum = sum0 + sum1;
        let mut sum_sq = sum_sq0 + sum_sq1;

        for r in rem {
            let val = r[j];
            sum += val;
            sum_sq += val * val;
        }

        let mean = sum * inv_n;
        let variance = (sum_sq * inv_n) - (mean * mean);
        let std_dev = variance.sqrt().max(1e-10);
        let inv_std_dev = 1.0 / std_dev;

        for row in data.iter_mut() {
            row[j] = (row[j] - mean) * inv_std_dev;
        }
    }
}
