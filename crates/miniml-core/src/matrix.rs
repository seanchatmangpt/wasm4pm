use crate::error::MlError;

/// Validate a flat row-major matrix, return n_samples
pub fn validate_matrix(data: &[f64], n_features: usize) -> Result<usize, MlError> {
    if n_features == 0 {
        return Err(MlError::new("n_features must be > 0"));
    }
    if data.is_empty() {
        return Err(MlError::new("data must not be empty"));
    }
    if data.len() % n_features != 0 {
        return Err(MlError::new("data length must be divisible by n_features"));
    }
    Ok(data.len() / n_features)
}

/// Get element at (row, col) from flat row-major matrix
#[inline(always)]
pub fn mat_get(data: &[f64], n_features: usize, row: usize, col: usize) -> f64 {
    data[row * n_features + col]
}

/// Squared Euclidean distance between two rows (avoids sqrt)
#[inline]
pub fn euclidean_dist_sq(data: &[f64], n_features: usize, a: usize, b: usize) -> f64 {
    let mut sum = 0.0;
    for j in 0..n_features {
        let d = mat_get(data, n_features, a, j) - mat_get(data, n_features, b, j);
        sum += d * d;
    }
    sum
}

#[cfg(target_arch = "wasm32")]
#[inline(always)]
pub unsafe fn euclidean_dist_sq_simd(
    data: &[f64],
    n_features: usize,
    a: usize,
    b: usize,
) -> f64 {
    use std::arch::wasm32::{v128, v128_load, f64x2_sub, f64x2_mul, f64x2_extract_lane};

    let offset_a = a * n_features;
    let offset_b = b * n_features;

    let mut sum0 = 0.0_f64;
    let mut sum1 = 0.0_f64;

    // Process 2 f64 values per iteration (4 total)
    let chunks = n_features / 2;
    let ptr_a = data.as_ptr().add(offset_a) as *const v128;
    let ptr_b = data.as_ptr().add(offset_b) as *const v128;

    for i in 0..chunks {
        let va = v128_load(ptr_a.add(i));
        let vb = v128_load(ptr_b.add(i));

        // Subtract pairwise
        let diff0 = f64x2_sub(va, vb);
        let diff_sq0 = f64x2_mul(diff0, diff0);

        // Extract and accumulate
        sum0 += f64x2_extract_lane::<0>(diff_sq0);
        sum1 += f64x2_extract_lane::<1>(diff_sq0);
    }

    // Handle remaining odd feature
    let mut sum = sum0 + sum1;
    if n_features % 2 == 1 {
        let d = data[offset_a + n_features - 1] - data[offset_b + n_features - 1];
        sum += d * d;
    }

    sum
}

// Scalar fallback for non-WASM
#[cfg(not(target_arch = "wasm32"))]
#[inline(always)]
pub fn euclidean_dist_sq_simd(
    data: &[f64],
    n_features: usize,
    a: usize,
    b: usize,
) -> f64 {
    euclidean_dist_sq(data, n_features, a, b)
}

/// Euclidean distance between a row and a point
pub fn dist_to_point(data: &[f64], n_features: usize, row: usize, point: &[f64]) -> f64 {
    let mut sum = 0.0;
    for j in 0..n_features {
        let d = mat_get(data, n_features, row, j) - point[j];
        sum += d * d;
    }
    sum.sqrt()
}

/// Simple xorshift64 PRNG (no dependencies)
pub struct Rng {
    state: u64,
}

impl Rng {
    pub fn new(seed: u64) -> Self {
        Self { state: if seed == 0 { 1 } else { seed } }
    }

    /// Seed from data (deterministic)
    pub fn from_data(data: &[f64]) -> Self {
        let mut h: u64 = 0xcbf29ce484222325;
        for &v in data.iter().take(20) {
            h ^= v.to_bits();
            h = h.wrapping_mul(0x100000001b3);
        }
        h ^= data.len() as u64;
        Self::new(h)
    }

    pub fn next_u64(&mut self) -> u64 {
        self.state ^= self.state << 13;
        self.state ^= self.state >> 7;
        self.state ^= self.state << 17;
        self.state
    }

    /// Random usize in [0, max)
    pub fn next_usize(&mut self, max: usize) -> usize {
        (self.next_u64() % max as u64) as usize
    }

    /// Random f64 in [0, 1)
    pub fn next_f64(&mut self) -> f64 {
        (self.next_u64() >> 11) as f64 / (1u64 << 53) as f64
    }
}

/// Arena-allocated flat matrix for cache-friendly operations
pub struct FlatMatrix {
    pub data: Vec<f64>,
    pub n_rows: usize,
    pub n_cols: usize,
}

impl FlatMatrix {
    pub fn new(n_rows: usize, n_cols: usize) -> Self {
        Self {
            data: vec![0.0; n_rows * n_cols],
            n_rows,
            n_cols,
        }
    }

    #[inline(always)]
    pub fn get(&self, row: usize, col: usize) -> f64 {
        self.data[row * self.n_cols + col]
    }

    #[inline(always)]
    pub fn set(&mut self, row: usize, col: usize, val: f64) {
        self.data[row * self.n_cols + col] = val;
    }

    /// Get row as slice (zero-copy)
    #[inline(always)]
    pub fn row(&self, row: usize) -> &[f64] {
        &self.data[row * self.n_cols..(row + 1) * self.n_cols]
    }

    /// Get mutable row as slice (zero-copy)
    #[inline(always)]
    pub fn row_mut(&mut self, row: usize) -> &mut [f64] {
        &mut self.data[row * self.n_cols..(row + 1) * self.n_cols]
    }

    /// Create from existing flat data (no copy)
    pub fn from_flat(data: Vec<f64>, n_rows: usize, n_cols: usize) -> Self {
        assert!(data.len() == n_rows * n_cols, "Data size doesn't match dimensions");
        Self { data, n_rows, n_cols }
    }

    pub fn resize(&mut self, n_rows: usize, n_cols: usize) {
        self.data.resize(n_rows * n_cols, 0.0);
        self.n_rows = n_rows;
        self.n_cols = n_cols;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_matrix() {
        assert_eq!(validate_matrix(&[1.0, 2.0, 3.0, 4.0], 2).unwrap(), 2);
        assert!(validate_matrix(&[1.0, 2.0, 3.0], 2).is_err());
        assert!(validate_matrix(&[], 2).is_err());
        assert!(validate_matrix(&[1.0], 0).is_err());
    }

    #[test]
    fn test_euclidean_dist_sq() {
        let data = vec![0.0, 0.0, 3.0, 4.0];
        assert!((euclidean_dist_sq(&data, 2, 0, 1) - 25.0).abs() < 1e-10);
    }

    #[test]
    fn test_rng_deterministic() {
        let mut r1 = Rng::new(42);
        let mut r2 = Rng::new(42);
        for _ in 0..10 {
            assert_eq!(r1.next_u64(), r2.next_u64());
        }
    }
}

#[cfg(test)]
mod flat_matrix_tests {
    use super::*;

    #[test]
    fn test_flat_matrix_creation() {
        let m = FlatMatrix::new(3, 4);
        assert_eq!(m.n_rows, 3);
        assert_eq!(m.n_cols, 4);
        assert_eq!(m.data.len(), 12);
    }

    #[test]
    fn test_flat_matrix_get_set() {
        let mut m = FlatMatrix::new(2, 3);
        m.set(0, 1, 42.0);
        assert_eq!(m.get(0, 1), 42.0);
        assert_eq!(m.get(1, 1), 0.0);
    }

    #[test]
    fn test_flat_matrix_row() {
        let mut m = FlatMatrix::new(2, 3);
        m.set(0, 0, 1.0);
        m.set(0, 1, 2.0);
        m.set(0, 2, 3.0);

        let row = m.row(0);
        assert_eq!(row, &[1.0, 2.0, 3.0]);
    }

    #[test]
    fn test_flat_matrix_from_flat() {
        let data = vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0];
        let m = FlatMatrix::from_flat(data, 2, 3);
        assert_eq!(m.get(0, 0), 1.0);
        assert_eq!(m.get(1, 2), 6.0);
    }
}
