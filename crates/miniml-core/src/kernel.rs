use wasm_bindgen::prelude::*;
use crate::matrix::mat_get;

/// Compute dot product between two vectors.
#[inline]
fn dot_product(x: &[f64], y: &[f64]) -> f64 {
    assert_eq!(x.len(), y.len(), "vectors must have same length");
    let mut sum = 0.0;
    for i in 0..x.len() {
        sum += x[i] * y[i];
    }
    sum
}

// ---------------------------------------------------------------------------
// RBF (Gaussian) Kernel
// ---------------------------------------------------------------------------

/// RBF (Radial Basis Function / Gaussian) kernel between two vectors.
/// K(x, y) = exp(-gamma * ||x - y||^2)
pub fn rbf_kernel_impl(x: &[f64], y: &[f64], gamma: f64) -> f64 {
    assert_eq!(x.len(), y.len(), "vectors must have same length");
    let mut dist_sq = 0.0;
    for i in 0..x.len() {
        let d = x[i] - y[i];
        dist_sq += d * d;
    }
    (-gamma * dist_sq).exp()
}

#[wasm_bindgen(js_name = "rbfKernel")]
pub fn rbf_kernel(x: &[f64], y: &[f64], gamma: f64) -> f64 {
    rbf_kernel_impl(x, y, gamma)
}

/// RBF kernel matrix for a dataset (n_samples x n_samples symmetric matrix).
/// Default gamma = 1.0 / n_features if gamma <= 0.
pub fn rbf_kernel_matrix_impl(
    data: &[f64],
    n_samples: usize,
    n_features: usize,
    gamma: f64,
) -> Vec<f64> {
    let gamma = if gamma <= 0.0 {
        1.0 / n_features as f64
    } else {
        gamma
    };

    let mut kernel = vec![0.0f64; n_samples * n_samples];

    for i in 0..n_samples {
        // Diagonal: K(x_i, x_i) = exp(0) = 1.0
        kernel[i * n_samples + i] = 1.0;

        for j in (i + 1)..n_samples {
            let mut dist_sq = 0.0;
            for f in 0..n_features {
                let d = mat_get(data, n_features, i, f) - mat_get(data, n_features, j, f);
                dist_sq += d * d;
            }
            let val = (-gamma * dist_sq).exp();
            kernel[i * n_samples + j] = val;
            kernel[j * n_samples + i] = val; // Symmetric
        }
    }

    kernel
}

#[wasm_bindgen(js_name = "rbfKernelMatrix")]
pub fn rbf_kernel_matrix(
    data: &[f64],
    n_samples: usize,
    n_features: usize,
    gamma: f64,
) -> Vec<f64> {
    rbf_kernel_matrix_impl(data, n_samples, n_features, gamma)
}

// ---------------------------------------------------------------------------
// Polynomial Kernel
// ---------------------------------------------------------------------------

/// Polynomial kernel between two vectors.
/// K(x, y) = (gamma * <x, y> + coef0)^degree
/// Default gamma = 1.0 / n_features.
pub fn polynomial_kernel_impl(x: &[f64], y: &[f64], degree: f64, coef0: f64) -> f64 {
    let gamma = 1.0 / x.len().max(1) as f64;
    let dot = dot_product(x, y);
    (gamma * dot + coef0).powf(degree)
}

/// Polynomial kernel with explicit gamma.
pub fn polynomial_kernel_with_gamma_impl(
    x: &[f64],
    y: &[f64],
    degree: f64,
    gamma: f64,
    coef0: f64,
) -> f64 {
    let dot = dot_product(x, y);
    (gamma * dot + coef0).powf(degree)
}

#[wasm_bindgen(js_name = "polynomialKernel")]
pub fn polynomial_kernel(x: &[f64], y: &[f64], degree: f64, coef0: f64) -> f64 {
    polynomial_kernel_impl(x, y, degree, coef0)
}

/// Polynomial kernel matrix for a dataset (n_samples x n_samples symmetric matrix).
/// Default gamma = 1.0 / n_features if gamma <= 0.
pub fn polynomial_kernel_matrix_impl(
    data: &[f64],
    n_samples: usize,
    n_features: usize,
    degree: f64,
    gamma: f64,
    coef0: f64,
) -> Vec<f64> {
    let gamma = if gamma <= 0.0 {
        1.0 / n_features as f64
    } else {
        gamma
    };

    let mut kernel = vec![0.0f64; n_samples * n_samples];

    for i in 0..n_samples {
        for j in i..n_samples {
            let mut dot = 0.0;
            for f in 0..n_features {
                dot += mat_get(data, n_features, i, f) * mat_get(data, n_features, j, f);
            }
            let val = (gamma * dot + coef0).powf(degree);
            kernel[i * n_samples + j] = val;
            kernel[j * n_samples + i] = val; // Symmetric
        }
    }

    kernel
}

#[wasm_bindgen(js_name = "polynomialKernelMatrix")]
pub fn polynomial_kernel_matrix(
    data: &[f64],
    n_samples: usize,
    n_features: usize,
    degree: f64,
    gamma: f64,
    coef0: f64,
) -> Vec<f64> {
    polynomial_kernel_matrix_impl(data, n_samples, n_features, degree, gamma, coef0)
}

// ---------------------------------------------------------------------------
// Sigmoid (Hyperbolic Tangent) Kernel
// ---------------------------------------------------------------------------

/// Sigmoid (hyperbolic tangent) kernel between two vectors.
/// K(x, y) = tanh(gamma * <x, y> + coef0)
pub fn sigmoid_kernel_impl(x: &[f64], y: &[f64], gamma: f64, coef0: f64) -> f64 {
    let dot = dot_product(x, y);
    (gamma * dot + coef0).tanh()
}

#[wasm_bindgen(js_name = "sigmoidKernel")]
pub fn sigmoid_kernel(x: &[f64], y: &[f64], gamma: f64, coef0: f64) -> f64 {
    sigmoid_kernel_impl(x, y, gamma, coef0)
}

/// Sigmoid kernel matrix for a dataset (n_samples x n_samples symmetric matrix).
pub fn sigmoid_kernel_matrix_impl(
    data: &[f64],
    n_samples: usize,
    n_features: usize,
    gamma: f64,
    coef0: f64,
) -> Vec<f64> {
    let mut kernel = vec![0.0f64; n_samples * n_samples];

    for i in 0..n_samples {
        for j in i..n_samples {
            let mut dot = 0.0;
            for f in 0..n_features {
                dot += mat_get(data, n_features, i, f) * mat_get(data, n_features, j, f);
            }
            let val = (gamma * dot + coef0).tanh();
            kernel[i * n_samples + j] = val;
            kernel[j * n_samples + i] = val; // Symmetric
        }
    }

    kernel
}

#[wasm_bindgen(js_name = "sigmoidKernelMatrix")]
pub fn sigmoid_kernel_matrix(
    data: &[f64],
    n_samples: usize,
    n_features: usize,
    gamma: f64,
    coef0: f64,
) -> Vec<f64> {
    sigmoid_kernel_matrix_impl(data, n_samples, n_features, gamma, coef0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rbf_kernel_identical() {
        // rbf(x, x) = exp(0) = 1.0
        let x = vec![1.0, 2.0, 3.0];
        let result = rbf_kernel_impl(&x, &x, 1.0);
        assert!(
            (result - 1.0).abs() < 1e-10,
            "RBF kernel of x with itself should be 1.0, got {}",
            result
        );
    }

    #[test]
    fn test_rbf_kernel_different() {
        // rbf(x, y) < 1.0 for x != y
        let x = vec![0.0, 0.0];
        let y = vec![1.0, 0.0];
        let result = rbf_kernel_impl(&x, &y, 1.0);
        // exp(-1 * 1) = exp(-1) ~ 0.3679
        let expected = (-1.0_f64).exp();
        assert!(
            result < 1.0,
            "RBF kernel of different points should be < 1.0, got {}",
            result
        );
        assert!(
            (result - expected).abs() < 1e-10,
            "expected {}, got {}",
            expected, result
        );
    }

    #[test]
    fn test_rbf_kernel_matrix_symmetric() {
        let data = vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0]; // 3 samples, 2 features
        let n_samples = 3;
        let kernel = rbf_kernel_matrix_impl(&data, n_samples, 2, 1.0);

        // Check symmetry: K[i][j] == K[j][i]
        for i in 0..n_samples {
            for j in 0..n_samples {
                assert!(
                    (kernel[i * n_samples + j] - kernel[j * n_samples + i]).abs() < 1e-10,
                    "kernel[{}][{}] = {} != kernel[{}][{}] = {}",
                    i, j, kernel[i * n_samples + j],
                    j, i, kernel[j * n_samples + i]
                );
            }
        }
    }

    #[test]
    fn test_polynomial_kernel_degree_2() {
        // (x.y + 1)^2 with gamma=1.0
        let x = vec![1.0, 2.0];
        let y = vec![3.0, 4.0];

        let dot = dot_product(&x, &y); // 3 + 8 = 11
        let gamma = 1.0 / x.len() as f64; // 0.5
        let expected = (gamma * dot + 1.0).powi(2); // (5.5 + 1)^2 = 42.25
        let result = polynomial_kernel_impl(&x, &y, 2.0, 1.0);

        assert!(
            (result - expected).abs() < 1e-10,
            "polynomial kernel degree 2: expected {}, got {}",
            expected, result
        );
    }

    #[test]
    fn test_sigmoid_kernel_range() {
        // tanh output in [-1, 1]
        let x = vec![1.0, 2.0, 3.0];
        let y = vec![4.0, 5.0, 6.0];

        let result = sigmoid_kernel_impl(&x, &y, 0.1, 0.0);
        assert!(
            result >= -1.0 && result <= 1.0,
            "sigmoid kernel output should be in [-1, 1], got {}",
            result
        );

        // Also check with coef0
        let result2 = sigmoid_kernel_impl(&x, &y, 0.5, 1.0);
        assert!(
            result2 >= -1.0 && result2 <= 1.0,
            "sigmoid kernel output should be in [-1, 1], got {}",
            result2
        );
    }
}
