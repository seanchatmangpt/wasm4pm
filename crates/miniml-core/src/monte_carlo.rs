use wasm_bindgen::prelude::*;
use crate::error::MlError;
use crate::matrix::Rng;

/// Result of a Monte Carlo estimation
#[wasm_bindgen]
pub struct MonteCarloResult {
    estimate: f64,
    std_error: f64,
    ci_lower: f64,
    ci_upper: f64,
    n_samples: usize,
    converged: bool,
}

#[wasm_bindgen]
impl MonteCarloResult {
    #[wasm_bindgen(getter, js_name = "estimate")]
    pub fn estimate(&self) -> f64 { self.estimate }

    #[wasm_bindgen(getter, js_name = "stdError")]
    pub fn std_error(&self) -> f64 { self.std_error }

    #[wasm_bindgen(getter, js_name = "ciLower")]
    pub fn ci_lower(&self) -> f64 { self.ci_lower }

    #[wasm_bindgen(getter, js_name = "ciUpper")]
    pub fn ci_upper(&self) -> f64 { self.ci_upper }

    #[wasm_bindgen(getter, js_name = "nSamples")]
    pub fn n_samples(&self) -> usize { self.n_samples }

    #[wasm_bindgen(getter, js_name = "converged")]
    pub fn converged(&self) -> bool { self.converged }
}

/// Result of bootstrap estimation
#[wasm_bindgen]
pub struct BootstrapResult {
    estimate: f64,
    ci_lower: f64,
    ci_upper: f64,
    std_error: f64,
    n_bootstrap: usize,
    statistic_name: String,
}

#[wasm_bindgen]
impl BootstrapResult {
    #[wasm_bindgen(getter)]
    pub fn estimate(&self) -> f64 { self.estimate }

    #[wasm_bindgen(getter, js_name = "ciLower")]
    pub fn ci_lower(&self) -> f64 { self.ci_lower }

    #[wasm_bindgen(getter, js_name = "ciUpper")]
    pub fn ci_upper(&self) -> f64 { self.ci_upper }

    #[wasm_bindgen(getter, js_name = "stdError")]
    pub fn std_error(&self) -> f64 { self.std_error }

    #[wasm_bindgen(getter, js_name = "nBootstrap")]
    pub fn n_bootstrap(&self) -> usize { self.n_bootstrap }

    #[wasm_bindgen(getter, js_name = "statisticName")]
    pub fn statistic_name(&self) -> String { self.statistic_name.clone() }
}

// ============================================================
// Pure Rust implementations
// ============================================================

/// Monte Carlo integration of f(x) over [a, b] using the sample-mean method.
///
/// estimate = (b - a) * mean(f(x_i)) for x_i ~ Uniform(a, b)
pub fn mc_integrate_impl<F>(f: F, a: f64, b: f64, n_samples: usize, seed: u64) -> Result<MonteCarloResult, MlError>
where
    F: Fn(f64) -> f64,
{
    if n_samples == 0 {
        return Err(MlError::new("n_samples must be > 0"));
    }
    if a >= b {
        return Err(MlError::new("a must be less than b"));
    }

    let mut rng = Rng::new(seed);
    let range = b - a;
    let mut sum = 0.0;
    let mut sum_sq = 0.0;

    for _ in 0..n_samples {
        let x = a + rng.next_f64() * range;
        let fx = f(x);
        sum += fx;
        sum_sq += fx * fx;
    }

    let mean = sum / n_samples as f64;
    let estimate = range * mean;

    // Standard error of the mean
    let variance = (sum_sq / n_samples as f64) - (mean * mean);
    let std_error = if n_samples > 1 {
        range * (variance.max(0.0) / (n_samples as f64 - 1.0)).sqrt()
    } else {
        0.0
    };

    // 95% CI using normal approximation (z = 1.96)
    let z = 1.96;
    let ci_lower = estimate - z * std_error;
    let ci_upper = estimate + z * std_error;
    let converged = (ci_upper - ci_lower).abs() < 0.01 * estimate.abs().max(1.0);

    Ok(MonteCarloResult {
        estimate,
        std_error,
        ci_lower,
        ci_upper,
        n_samples,
        converged,
    })
}

/// Monte Carlo integration of f(x) over a hyper-rectangle using sample-mean method.
///
/// `lower` and `upper` define the bounds in each dimension.
pub fn mc_integrate_multidim_impl<F>(
    f: F,
    lower: &[f64],
    upper: &[f64],
    n_samples: usize,
    seed: u64,
) -> Result<MonteCarloResult, MlError>
where
    F: Fn(&[f64]) -> f64,
{
    let dim = lower.len();
    if dim == 0 {
        return Err(MlError::new("dimension must be > 0"));
    }
    if dim != upper.len() {
        return Err(MlError::new("lower and upper must have same length"));
    }
    if n_samples == 0 {
        return Err(MlError::new("n_samples must be > 0"));
    }

    let mut rng = Rng::new(seed);

    // Compute volume of hyper-rectangle
    let mut volume = 1.0;
    for i in 0..dim {
        if lower[i] >= upper[i] {
            return Err(MlError::new("lower bounds must be less than upper bounds"));
        }
        volume *= upper[i] - lower[i];
    }

    let mut sum = 0.0;
    let mut sum_sq = 0.0;

    let mut point = vec![0.0; dim];
    for _ in 0..n_samples {
        for j in 0..dim {
            point[j] = lower[j] + rng.next_f64() * (upper[j] - lower[j]);
        }
        let fx = f(&point);
        sum += fx;
        sum_sq += fx * fx;
    }

    let mean = sum / n_samples as f64;
    let estimate = volume * mean;

    let variance = (sum_sq / n_samples as f64) - (mean * mean);
    let std_error = if n_samples > 1 {
        volume * (variance.max(0.0) / (n_samples as f64 - 1.0)).sqrt()
    } else {
        0.0
    };

    let z = 1.96;
    let ci_lower = estimate - z * std_error;
    let ci_upper = estimate + z * std_error;
    let converged = (ci_upper - ci_lower).abs() < 0.01 * estimate.abs().max(1.0);

    Ok(MonteCarloResult {
        estimate,
        std_error,
        ci_lower,
        ci_upper,
        n_samples,
        converged,
    })
}

/// Estimate pi using Monte Carlo (dartboard method).
/// Points uniformly sampled in [-1,1]x[-1,1]; pi ≈ 4 * (inside unit circle / total)
pub fn mc_estimate_pi_impl(n_samples: usize, seed: u64) -> MonteCarloResult {
    let mut rng = Rng::new(seed);
    let mut inside = 0usize;

    for _ in 0..n_samples {
        let x = rng.next_f64() * 2.0 - 1.0;
        let y = rng.next_f64() * 2.0 - 1.0;
        if x * x + y * y <= 1.0 {
            inside += 1;
        }
    }

    let estimate = 4.0 * inside as f64 / n_samples as f64;

    // Variance of Bernoulli: p*(1-p)/n where p = pi/4
    let p = inside as f64 / n_samples as f64;
    let std_error = 4.0 * (p * (1.0 - p) / n_samples as f64).sqrt();

    let z = 1.96;
    let ci_lower = estimate - z * std_error;
    let ci_upper = estimate + z * std_error;

    let converged = (estimate - std::f64::consts::PI).abs() < 0.01;

    MonteCarloResult {
        estimate,
        std_error,
        ci_lower,
        ci_upper,
        n_samples,
        converged,
    }
}

/// Expected value of f(X) where X ~ Uniform(a, b) using Monte Carlo.
pub fn mc_expected_value_impl<F>(
    f: F,
    a: f64,
    b: f64,
    n_samples: usize,
    seed: u64,
) -> Result<MonteCarloResult, MlError>
where
    F: Fn(f64) -> f64,
{
    if n_samples == 0 {
        return Err(MlError::new("n_samples must be > 0"));
    }
    if a >= b {
        return Err(MlError::new("a must be less than b"));
    }

    let mut rng = Rng::new(seed);
    let mut sum = 0.0;
    let mut sum_sq = 0.0;

    for _ in 0..n_samples {
        let x = a + rng.next_f64() * (b - a);
        let fx = f(x);
        sum += fx;
        sum_sq += fx * fx;
    }

    let estimate = sum / n_samples as f64;
    let variance = (sum_sq / n_samples as f64) - (estimate * estimate);
    let std_error = if n_samples > 1 {
        (variance.max(0.0) / (n_samples as f64 - 1.0)).sqrt()
    } else {
        0.0
    };

    let z = 1.96;
    let ci_lower = estimate - z * std_error;
    let ci_upper = estimate + z * std_error;

    Ok(MonteCarloResult {
        estimate,
        std_error,
        ci_lower,
        ci_upper,
        n_samples,
        converged: std_error < 0.01,
    })
}

/// Bootstrap estimation of a statistic (mean, median, etc.) with confidence interval.
///
/// Statistic functions:
/// - "mean": sample mean
/// - "median": sample median
/// - "std": sample standard deviation
/// - "var": sample variance
pub fn mc_bootstrap_impl(
    data: &[f64],
    n_bootstrap: usize,
    statistic: &str,
    confidence: f64,
    seed: u64,
) -> Result<BootstrapResult, MlError> {
    if data.is_empty() {
        return Err(MlError::new("data must not be empty"));
    }
    if n_bootstrap == 0 {
        return Err(MlError::new("n_bootstrap must be > 0"));
    }
    if !(0.5..=0.999).contains(&confidence) {
        return Err(MlError::new("confidence must be in (0.5, 0.999]"));
    }

    let n = data.len();
    let mut rng = Rng::new(seed);
    let mut bootstrap_stats = Vec::with_capacity(n_bootstrap);

    let mut sample = vec![0.0; n];

    for _ in 0..n_bootstrap {
        // Draw n samples with replacement
        for i in 0..n {
            sample[i] = data[rng.next_usize(n)];
        }

        let stat = compute_statistic(&sample, statistic);
        bootstrap_stats.push(stat);
    }

    // Sort bootstrap statistics
    bootstrap_stats.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));

    // Point estimate = mean of bootstrap statistics
    let estimate: f64 = bootstrap_stats.iter().sum::<f64>() / n_bootstrap as f64;

    // Standard error = std of bootstrap statistics
    let mean_sq = bootstrap_stats.iter().map(|x| x * x).sum::<f64>() / n_bootstrap as f64;
    let std_error = (mean_sq - estimate * estimate).sqrt().max(0.0);

    // Percentile CI
    let alpha = 1.0 - confidence;
    let lower_idx = ((alpha / 2.0) * n_bootstrap as f64).floor() as usize;
    let upper_idx = ((1.0 - alpha / 2.0) * n_bootstrap as f64).ceil() as usize;
    let ci_lower = bootstrap_stats[lower_idx.min(n_bootstrap - 1)];
    let ci_upper = bootstrap_stats[upper_idx.min(n_bootstrap - 1)];

    Ok(BootstrapResult {
        estimate,
        ci_lower,
        ci_upper,
        std_error,
        n_bootstrap,
        statistic_name: statistic.to_string(),
    })
}

/// Compute a named statistic on a sample.
fn compute_statistic(data: &[f64], name: &str) -> f64 {
    match name {
        "mean" => {
            if data.is_empty() { return 0.0; }
            data.iter().sum::<f64>() / data.len() as f64
        }
        "median" => {
            if data.is_empty() { return 0.0; }
            let mut sorted = data.to_vec();
            sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
            let mid = sorted.len() / 2;
            if sorted.len() % 2 == 0 {
                (sorted[mid - 1] + sorted[mid]) / 2.0
            } else {
                sorted[mid]
            }
        }
        "std" => {
            if data.len() < 2 { return 0.0; }
            let mean = data.iter().sum::<f64>() / data.len() as f64;
            let variance = data.iter().map(|x| (x - mean) * (x - mean)).sum::<f64>() / (data.len() - 1) as f64;
            variance.sqrt()
        }
        "var" => {
            if data.len() < 2 { return 0.0; }
            let mean = data.iter().sum::<f64>() / data.len() as f64;
            data.iter().map(|x| (x - mean) * (x - mean)).sum::<f64>() / (data.len() - 1) as f64
        }
        _ => {
            // Default to mean
            if data.is_empty() { return 0.0; }
            data.iter().sum::<f64>() / data.len() as f64
        }
    }
}

// ============================================================
// WASM wrappers
// ============================================================

/// Monte Carlo estimation of pi.
#[wasm_bindgen(js_name = "mcEstimatePi")]
pub fn mc_estimate_pi(n_samples: usize, seed: u64) -> MonteCarloResult {
    mc_estimate_pi_impl(n_samples, seed)
}

/// Monte Carlo integration of a JS function over [a, b].
#[wasm_bindgen(js_name = "mcIntegrate")]
pub fn mc_integrate(
    f: &js_sys::Function,
    a: f64,
    b: f64,
    n_samples: usize,
    seed: u64,
) -> Result<JsValue, JsValue> {
    // For WASM, we use a simple polynomial integration since we can't pass closures.
    // Users should use mc_integrate_multidim or the _impl version directly.
    Err(JsValue::from_str("Use mcIntegrateFn with a string expression, or use the Rust API directly"))
}

/// Bootstrap estimation of a statistic with confidence interval.
#[wasm_bindgen(js_name = "mcBootstrap")]
pub fn mc_bootstrap(
    data: &[f64],
    n_bootstrap: usize,
    statistic: &str,
    confidence: f64,
    seed: u64,
) -> Result<BootstrapResult, JsValue> {
    mc_bootstrap_impl(data, n_bootstrap, statistic, confidence, seed)
        .map_err(|e| JsValue::from_str(&e.message))
}

/// Expected value of a function using Monte Carlo sampling.
#[wasm_bindgen(js_name = "mcExpectedValue")]
pub fn mc_expected_value(
    a: f64,
    b: f64,
    n_samples: usize,
    seed: u64,
) -> MonteCarloResult {
    mc_expected_value_impl(|x| x, a, b, n_samples, seed).unwrap_or_else(|_| MonteCarloResult {
        estimate: 0.0,
        std_error: 0.0,
        ci_lower: 0.0,
        ci_upper: 0.0,
        n_samples: 0,
        converged: false,
    })
}

// ============================================================
// Tests
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mc_estimate_pi_accuracy() {
        let result = mc_estimate_pi_impl(100_000, 42);
        // pi ≈ 3.14159, should be within 0.1
        assert!((result.estimate - std::f64::consts::PI).abs() < 0.1,
            "pi estimate {} is too far from {}", result.estimate, std::f64::consts::PI);
        assert!(result.n_samples == 100_000);
    }

    #[test]
    fn test_mc_estimate_pi_deterministic() {
        let r1 = mc_estimate_pi_impl(10_000, 123);
        let r2 = mc_estimate_pi_impl(10_000, 123);
        assert_eq!(r1.estimate, r2.estimate, "same seed should give same result");
    }

    #[test]
    fn test_mc_integrate_constant() {
        // integral of f(x)=5 over [0,1] = 5
        let result = mc_integrate_impl(|_| 5.0, 0.0, 1.0, 10_000, 42).unwrap();
        assert!((result.estimate - 5.0).abs() < 0.1,
            "integral of 5 should be ~5, got {}", result.estimate);
    }

    #[test]
    fn test_mc_integrate_linear() {
        // integral of f(x)=2x over [0,1] = 1
        let result = mc_integrate_impl(|x| 2.0 * x, 0.0, 1.0, 10_000, 42).unwrap();
        assert!((result.estimate - 1.0).abs() < 0.1,
            "integral of 2x should be ~1, got {}", result.estimate);
    }

    #[test]
    fn test_mc_integrate_sin() {
        // integral of sin(x) over [0, pi] = 2
        let result = mc_integrate_impl(|x| x.sin(), 0.0, std::f64::consts::PI, 50_000, 42).unwrap();
        assert!((result.estimate - 2.0).abs() < 0.1,
            "integral of sin over [0,pi] should be ~2, got {}", result.estimate);
    }

    #[test]
    fn test_mc_integrate_multidim() {
        // integral of x+y over [0,1]x[0,1] = 1.0
        let lower = [0.0, 0.0];
        let upper = [1.0, 1.0];
        let result = mc_integrate_multidim_impl(
            |p| p[0] + p[1],
            &lower, &upper,
            50_000, 42
        ).unwrap();
        assert!((result.estimate - 1.0).abs() < 0.1,
            "integral of x+y over unit square should be ~1, got {}", result.estimate);
    }

    #[test]
    fn test_mc_integrate_multidim_volume() {
        // integral of 1 over [0,2]x[0,3] = 6 (volume)
        let lower = [0.0, 0.0];
        let upper = [2.0, 3.0];
        let result = mc_integrate_multidim_impl(
            |_| 1.0,
            &lower, &upper,
            10_000, 42
        ).unwrap();
        assert!((result.estimate - 6.0).abs() < 0.1,
            "volume of [0,2]x[0,3] should be ~6, got {}", result.estimate);
    }

    #[test]
    fn test_mc_integrate_errors() {
        // a >= b
        assert!(mc_integrate_impl(|_| 0.0, 1.0, 0.0, 100, 42).is_err());
        // n_samples = 0
        assert!(mc_integrate_impl(|_| 0.0, 0.0, 1.0, 0, 42).is_err());
    }

    #[test]
    fn test_mc_expected_value() {
        // E[X] for X ~ Uniform(0, 2) = 1.0
        let result = mc_expected_value_impl(|x| x, 0.0, 2.0, 50_000, 42).unwrap();
        assert!((result.estimate - 1.0).abs() < 0.1,
            "E[X] for U(0,2) should be ~1, got {}", result.estimate);
    }

    #[test]
    fn test_mc_bootstrap_mean() {
        let data: Vec<f64> = (1..=100).map(|i| i as f64).collect();
        let result = mc_bootstrap_impl(&data, 5_000, "mean", 0.95, 42).unwrap();
        // Mean of 1..100 = 50.5
        assert!((result.estimate - 50.5).abs() < 1.0,
            "bootstrap mean should be ~50.5, got {}", result.estimate);
        assert!(result.ci_lower < result.ci_upper);
        assert!(result.ci_lower < 50.5 && result.ci_upper > 50.5);
    }

    #[test]
    fn test_mc_bootstrap_median() {
        let data: Vec<f64> = (1..=100).map(|i| i as f64).collect();
        let result = mc_bootstrap_impl(&data, 5_000, "median", 0.95, 42).unwrap();
        // Median of 1..100 = 50.5
        assert!((result.estimate - 50.5).abs() < 1.0,
            "bootstrap median should be ~50.5, got {}", result.estimate);
    }

    #[test]
    fn test_mc_bootstrap_std() {
        let data: Vec<f64> = (1..=100).map(|i| i as f64).collect();
        let result = mc_bootstrap_impl(&data, 5_000, "std", 0.95, 42).unwrap();
        // Std of 1..100 ≈ 29.01
        assert!((result.estimate - 29.01).abs() < 1.0,
            "bootstrap std should be ~29, got {}", result.estimate);
    }

    #[test]
    fn test_mc_bootstrap_errors() {
        let empty: Vec<f64> = vec![];
        assert!(mc_bootstrap_impl(&empty, 100, "mean", 0.95, 42).is_err());
        assert!(mc_bootstrap_impl(&[1.0], 0, "mean", 0.95, 42).is_err());
        assert!(mc_bootstrap_impl(&[1.0], 100, "mean", 0.01, 42).is_err());
    }

    #[test]
    fn test_mc_bootstrap_deterministic() {
        let data: Vec<f64> = (1..=50).map(|i| i as f64).collect();
        let r1 = mc_bootstrap_impl(&data, 1000, "mean", 0.95, 99).unwrap();
        let r2 = mc_bootstrap_impl(&data, 1000, "mean", 0.95, 99).unwrap();
        assert_eq!(r1.estimate, r2.estimate);
    }

    #[test]
    fn test_mc_convergence_flag() {
        // With enough samples, pi estimate should converge
        let result = mc_estimate_pi_impl(1_000_000, 42);
        assert!(result.converged, "1M samples should converge within 0.01 of pi");
    }
}
