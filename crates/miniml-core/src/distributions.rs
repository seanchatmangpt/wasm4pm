use wasm_bindgen::prelude::*;
use crate::error::MlError;

// ---------------------------------------------------------------------------
// Xorshift64 PRNG
// ---------------------------------------------------------------------------

struct Rng {
    state: u64,
}

impl Rng {
    fn new(seed: u64) -> Self {
        Self { state: if seed == 0 { 1 } else { seed } }
    }

    fn next_f64(&mut self) -> f64 {
        (self.next_u64() >> 11) as f64 / (1u64 << 53) as f64
    }

    fn next_u64(&mut self) -> u64 {
        self.state ^= self.state << 13;
        self.state ^= self.state >> 7;
        self.state ^= self.state << 17;
        self.state
    }
}

// ---------------------------------------------------------------------------
// Special functions (private utilities)
// ---------------------------------------------------------------------------

const LANCZOS_P: [f64; 9] = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
];
const LANCZOS_G: f64 = 7.0;

/// Gamma function via Lanczos approximation (g=7, n=9 coefficients).
fn gamma_function_impl(x: f64) -> f64 {
    if x < 0.5 {
        std::f64::consts::PI / (std::f64::consts::PI * x).sin() / gamma_function_impl(1.0 - x)
    } else {
        let x = x - 1.0;
        let mut a = LANCZOS_P[0];
        for i in 1..9 {
            a += LANCZOS_P[i] / (x + i as f64);
        }
        let t = x + LANCZOS_G + 0.5;
        let sqrt_2pi = 2.5066282746310005024;
        sqrt_2pi * t.powf(x + 0.5) * (-t).exp() * a
    }
}

/// Log of the gamma function (numerically stable).
fn log_gamma_impl(x: f64) -> f64 {
    if x < 0.5 {
        let log_pi = std::f64::consts::PI.ln();
        let log_sin = (std::f64::consts::PI * x).abs().sin().ln();
        log_pi - log_sin - log_gamma_impl(1.0 - x)
    } else {
        let x = x - 1.0;
        let mut a = LANCZOS_P[0];
        for i in 1..9 {
            a += LANCZOS_P[i] / (x + i as f64);
        }
        let t = x + LANCZOS_G + 0.5;
        0.5 * (2.0 * std::f64::consts::PI).ln() + (x + 0.5) * t.ln() - t + a.ln()
    }
}

/// Beta function: B(a,b) = gamma(a)*gamma(b) / gamma(a+b).
fn beta_function_impl(a: f64, b: f64) -> f64 {
    (log_gamma_impl(a) + log_gamma_impl(b) - log_gamma_impl(a + b)).exp()
}

/// Continued fraction for incomplete beta (Lentz's method).
fn beta_cf(a: f64, b: f64, x: f64) -> f64 {
    const MAX_ITER: usize = 200;
    const EPS: f64 = 3.0e-12;

    let qab = a + b;
    let qap = a + 1.0;
    let qam = a - 1.0;
    let mut c = 1.0;
    let d_init = 1.0 - qab * x / qap;
    let mut d = if d_init.abs() < f64::EPSILON { f64::EPSILON } else { d_init };
    if d.abs() < f64::EPSILON {
        d = f64::EPSILON;
    }
    d = 1.0 / d;
    let mut h = d;

    for m in 1..=MAX_ITER {
        let m = m as f64;
        // Even step
        let m2 = 2.0 * m;
        let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
        d = 1.0 + aa * d;
        if d.abs() < f64::EPSILON { d = f64::EPSILON; }
        c = 1.0 + aa / c;
        if c.abs() < f64::EPSILON { c = f64::EPSILON; }
        d = 1.0 / d;
        let del = d * c;
        h *= del;

        // Odd step
        let aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
        d = 1.0 + aa * d;
        if d.abs() < f64::EPSILON { d = f64::EPSILON; }
        c = 1.0 + aa / c;
        if c.abs() < f64::EPSILON { c = f64::EPSILON; }
        d = 1.0 / d;
        let del = d * c;
        h *= del;

        if (del - 1.0).abs() < EPS {
            return h;
        }
    }
    h
}

/// Regularized incomplete beta function I_x(a,b) using continued fraction expansion.
fn incomplete_beta_impl(x: f64, a: f64, b: f64, max_iter: usize) -> f64 {
    let _ = max_iter; // used internally by beta_cf
    if x < 0.0 || x > 1.0 {
        return if x <= 0.0 { 0.0 } else { 1.0 };
    }
    if x == 0.0 || x == 1.0 {
        return x;
    }

    // I_x(a,b) = x^a * (1-x)^b / (a * B(a,b)) * betacf(a,b,x)
    let log_prefix =
        log_gamma_impl(a + b) - log_gamma_impl(a) - log_gamma_impl(b)
        + a * x.ln() + b * (1.0 - x).ln() - a.ln();

    if x < (a + 1.0) / (a + b + 2.0) {
        let f = beta_cf(a, b, x);
        (log_prefix + f.ln()).exp()
    } else {
        // Symmetry: I_x(a,b) = 1 - I_{1-x}(b,a)
        let x2 = 1.0 - x;
        let log_prefix2 =
            log_gamma_impl(a + b) - log_gamma_impl(b) - log_gamma_impl(a)
            + b * x2.ln() + a * (1.0 - x2).ln() - b.ln();
        let f = beta_cf(b, a, x2);
        1.0 - (log_prefix2 + f.ln()).exp()
    }
}

/// Regularized incomplete beta function I_x(a,b).
fn regularized_incomplete_beta_impl(x: f64, a: f64, b: f64) -> f64 {
    incomplete_beta_impl(x, a, b, 200)
}

/// Series expansion for the (unregularized) lower incomplete gamma.
fn gamma_series(s: f64, x: f64) -> f64 {
    const MAX_ITER: usize = 200;
    const EPS: f64 = 3.0e-12;

    let mut sum = 1.0 / s;
    let mut term = 1.0 / s;
    for n in 1..=MAX_ITER {
        term *= x / (s + n as f64);
        sum += term;
        if term.abs() < sum.abs() * EPS {
            break;
        }
    }
    sum
}

/// Continued fraction for the upper incomplete gamma (Lentz's method).
fn gamma_cf(s: f64, x: f64) -> f64 {
    const MAX_ITER: usize = 200;
    const EPS: f64 = 3.0e-12;

    let mut b = x + 1.0 - s;
    let mut c = 1.0_f64 / f64::EPSILON;
    let mut d = 1.0 / b;
    let mut h = d;

    for i in 1..=MAX_ITER {
        let an = -(i as f64) * ((i as f64) - s);
        b += 2.0;
        d = an * d + b;
        if d.abs() < f64::EPSILON { d = f64::EPSILON; }
        c = b + an / c;
        if c.abs() < f64::EPSILON { c = f64::EPSILON; }
        d = 1.0 / d;
        let del = d * c;
        h *= del;
        if (del - 1.0).abs() < EPS {
            break;
        }
    }
    h
}

/// Lower incomplete gamma function gamma(a, x).
fn incomplete_gamma_lower_impl(a: f64, x: f64) -> f64 {
    if x <= 0.0 { return 0.0; }
    let log_prefix = a * x.ln() - x - log_gamma_impl(a);
    if x < a + 1.0 {
        let sum = gamma_series(a, x);
        (log_prefix + sum.ln()).exp()
    } else {
        let q = gamma_cf(a, x);
        1.0 - (log_prefix + q.ln()).exp()
    }
}

/// Upper incomplete gamma function Gamma(a, x).
fn incomplete_gamma_upper_impl(a: f64, x: f64) -> f64 {
    if x <= 0.0 {
        return gamma_function_impl(a);
    }
    let log_prefix = a * x.ln() - x - log_gamma_impl(a);
    if x < a + 1.0 {
        let sum = gamma_series(a, x);
        gamma_function_impl(a) - (log_prefix + sum.ln()).exp()
    } else {
        let q = gamma_cf(a, x);
        (log_prefix + q.ln()).exp()
    }
}

/// Regularized lower incomplete gamma function P(a,x) = gamma(a,x)/Gamma(a).
fn regularized_gamma_lower_impl(a: f64, x: f64) -> f64 {
    if x <= 0.0 { return 0.0; }
    let log_prefix = a * x.ln() - x - log_gamma_impl(a);
    if x < a + 1.0 {
        let sum = gamma_series(a, x);
        (log_prefix + sum.ln()).exp()
    } else {
        let q = gamma_cf(a, x);
        1.0 - (log_prefix + q.ln()).exp()
    }
}

/// Regularized upper incomplete gamma function Q(a,x) = 1 - P(a,x).
fn regularized_gamma_upper_impl(a: f64, x: f64) -> f64 {
    1.0 - regularized_gamma_lower_impl(a, x)
}

/// Error function via Abramowitz & Stegun approximation 7.1.26 (max error 1.5e-7).
fn erf_impl(x: f64) -> f64 {
    if x == 0.0 { return 0.0; }
    let sign: f64 = if x >= 0.0 { 1.0 } else { -1.0 };
    let x = x.abs();
    const A1: f64 = 0.254829592;
    const A2: f64 = -0.284496736;
    const A3: f64 = 1.421413741;
    const A4: f64 = -1.453152027;
    const A5: f64 = 1.061405429;
    const P: f64 = 0.3275911;

    let t = 1.0 / (1.0 + P * x);
    let y = 1.0 - (((((A5 * t + A4) * t) + A3) * t + A2) * t + A1) * t * (-x * x).exp();
    sign * y
}

/// Box-Muller transform: returns a standard normal sample.
fn box_muller(rng: &mut Rng) -> f64 {
    let u1 = rng.next_f64();
    let u2 = rng.next_f64();
    let u1 = if u1 == 0.0 { f64::EPSILON } else { u1 };
    let mag = (-2.0 * u1.ln()).sqrt();
    mag * (2.0 * std::f64::consts::PI * u2).cos()
}

/// Log of binomial coefficient C(n, k) = n! / (k! * (n-k)!).
fn log_binomial_coeff(n: i64, k: i64) -> f64 {
    if k < 0 || k > n {
        return f64::NEG_INFINITY;
    }
    if k == 0 || k == n {
        return 0.0;
    }
    let k = if k > n - k { n - k } else { k };
    let mut log_c = 0.0;
    for i in 0..k {
        log_c += ((n - i) as f64).ln();
    }
    for i in 1..=k {
        log_c -= (i as f64).ln();
    }
    log_c
}

// ---------------------------------------------------------------------------
// Normal Distribution
// ---------------------------------------------------------------------------

/// PDF of the normal distribution.
fn normal_pdf_impl(x: f64, mean: f64, std: f64) -> f64 {
    let z = (x - mean) / std;
    (-0.5 * z * z).exp() / (std * (2.0 * std::f64::consts::PI).sqrt())
}

/// CDF of the normal distribution using the error function.
fn normal_cdf_impl(x: f64, mean: f64, std: f64) -> f64 {
    0.5 * (1.0 + erf_impl((x - mean) / (std * 2.0_f64.sqrt())))
}

/// Inverse CDF (quantile function) of the normal distribution.
/// Uses rational approximation from Peter Acklam (2001) with Newton refinement.
fn normal_ppf_impl(p: f64, mean: f64, std: f64) -> f64 {
    if p <= 0.0 { return f64::NEG_INFINITY; }
    if p >= 1.0 { return f64::INFINITY; }
    if p == 0.5 { return mean; }

    // Rational approximation coefficients (Beasley-Springer-Moro / Acklam)
    const A: [f64; 6] = [
        -3.969683028665376e+01,
        2.209460984245205e+02,
        -2.759285104469687e+02,
        1.383577518672690e+02,
        -3.066479806614716e+01,
        2.506628277459239e+00,
    ];
    const B: [f64; 5] = [
        -5.447609879822406e+01,
        1.615858368580409e+02,
        -1.556989798598866e+02,
        6.680131188771972e+01,
        -1.328068155288572e+01,
    ];
    const C: [f64; 6] = [
        -7.784894002430293e-03,
        -3.223964580411365e-01,
        -2.400758277161838e+00,
        -2.549732539343734e+00,
        4.374664141464968e+00,
        2.938163982698783e+00,
    ];
    const D: [f64; 4] = [
        7.784695709041462e-03,
        3.224671290700398e-01,
        2.445134137142996e+00,
        3.754408661907416e+00,
    ];

    let p_low = 0.02425;
    let p_high = 1.0 - p_low;

    let q = if p < p_low {
        let q = ((-((p * C[5] + C[4]) * p + C[3]) * p + C[2]) * p + C[1]) * p + C[0];
        let r = ((((p * D[3] + D[2]) * p + D[1]) * p + D[0]) * p + 1.0) * p;
        q / r
    } else if p <= p_high {
        let q = p - 0.5;
        let r = q * q;
        let num = ((A[0] * r + A[1]) * r + A[2]) * r + A[3];
        let num = (num * r + A[4]) * r + A[5];
        let den = ((B[0] * r + B[1]) * r + B[2]) * r + B[3];
        let den = (den * r + B[4]) * r + 1.0;
        q * num / den
    } else {
        let q = 1.0 - p;
        let q = (((-((q * C[5] + C[4]) * q + C[3]) * q + C[2]) * q + C[1]) * q + C[0])
            / ((((q * D[3] + D[2]) * q + D[1]) * q + D[0]) * q + 1.0);
        -q
    };

    // Refinement via Newton's method
    let e = 0.5 * (1.0 + erf_impl(q / 2.0_f64.sqrt())) - p;
    let u = e * (2.0 * std::f64::consts::PI).sqrt() * (-0.5 * q * q).exp();
    mean + std * (q - u)
}

/// Generate n samples from a normal distribution using Box-Muller transform.
fn normal_sample_impl(n: usize, mean: f64, std: f64, seed: u64) -> Result<Vec<f64>, MlError> {
    if n == 0 { return Ok(vec![]); }
    let mut rng = Rng::new(seed);
    let mut result = Vec::with_capacity(n);
    let pairs = (n + 1) / 2;
    for _ in 0..pairs {
        let u1 = rng.next_f64();
        let u2 = rng.next_f64();
        let u1 = if u1 == 0.0 { f64::EPSILON } else { u1 };
        let mag = std * (-2.0 * u1.ln()).sqrt();
        let z0 = mag * (2.0 * std::f64::consts::PI * u2).cos();
        let z1 = mag * (2.0 * std::f64::consts::PI * u2).sin();
        result.push(mean + z0);
        if result.len() < n {
            result.push(mean + z1);
        }
    }
    Ok(result)
}

// ---------------------------------------------------------------------------
// Binomial Distribution
// ---------------------------------------------------------------------------

/// PMF of the binomial distribution: C(n,k) * p^k * (1-p)^(n-k).
fn binomial_pmf_impl(k: i64, n: i64, p: f64) -> f64 {
    if k < 0 || k > n { return 0.0; }
    let log_pmf = log_binomial_coeff(n, k) + k as f64 * p.ln() + (n - k) as f64 * (1.0 - p).ln();
    log_pmf.exp()
}

/// CDF of the binomial distribution: sum of PMF from 0 to k.
fn binomial_cdf_impl(k: i64, n: i64, p: f64) -> f64 {
    let k = if k > n { n } else { k };
    let mut sum = 0.0;
    for i in 0..=k {
        sum += binomial_pmf_impl(i, n, p);
    }
    sum
}

/// Generate binomial samples via inverse CDF method.
fn binomial_sample_impl(n_samples: usize, n_trials: i64, p: f64, seed: u64) -> Result<Vec<f64>, MlError> {
    if n_trials < 0 { return Err(MlError::new("n_trials must be non-negative")); }
    if p < 0.0 || p > 1.0 { return Err(MlError::new("p must be in [0, 1]")); }
    let mut rng = Rng::new(seed);
    let mut result = Vec::with_capacity(n_samples);
    for _ in 0..n_samples {
        let mut count = 0i64;
        for _ in 0..n_trials {
            if rng.next_f64() < p {
                count += 1;
            }
        }
        result.push(count as f64);
    }
    Ok(result)
}

// ---------------------------------------------------------------------------
// Poisson Distribution
// ---------------------------------------------------------------------------

/// PMF of the Poisson distribution: lambda^k * e^(-lambda) / k!.
fn poisson_pmf_impl(k: i64, lambda: f64) -> f64 {
    if k < 0 { return 0.0; }
    let log_pmf = k as f64 * lambda.ln() - lambda - log_gamma_impl(k as f64 + 1.0);
    log_pmf.exp()
}

/// CDF of the Poisson distribution: sum of PMF from 0 to k.
fn poisson_cdf_impl(k: i64, lambda: f64) -> f64 {
    let mut sum = 0.0;
    for i in 0..=k {
        sum += poisson_pmf_impl(i, lambda);
    }
    sum
}

/// Generate Poisson samples using Knuth's algorithm.
fn poisson_sample_impl(n_samples: usize, lambda: f64, seed: u64) -> Result<Vec<f64>, MlError> {
    if lambda <= 0.0 { return Err(MlError::new("lambda must be positive")); }
    let mut rng = Rng::new(seed);
    let mut result = Vec::with_capacity(n_samples);
    let l = (-lambda).exp();
    for _ in 0..n_samples {
        let mut k = 0i64;
        let mut p = 1.0;
        loop {
            p *= rng.next_f64();
            if p < l { break; }
            k += 1;
            if k > 10000 { break; }
        }
        result.push(k as f64);
    }
    Ok(result)
}

// ---------------------------------------------------------------------------
// Exponential Distribution
// ---------------------------------------------------------------------------

/// PDF of the exponential distribution.
fn exponential_pdf_impl(x: f64, lambda: f64) -> f64 {
    if x < 0.0 { return 0.0; }
    lambda * (-lambda * x).exp()
}

/// CDF of the exponential distribution: 1 - e^(-lambda*x).
fn exponential_cdf_impl(x: f64, lambda: f64) -> f64 {
    if x < 0.0 { return 0.0; }
    1.0 - (-lambda * x).exp()
}

/// Generate exponential samples using inverse CDF: -ln(U)/lambda.
fn exponential_sample_impl(n: usize, lambda: f64, seed: u64) -> Result<Vec<f64>, MlError> {
    if lambda <= 0.0 { return Err(MlError::new("lambda must be positive")); }
    let mut rng = Rng::new(seed);
    let mut result = Vec::with_capacity(n);
    for _ in 0..n {
        let u = rng.next_f64();
        let u = if u == 0.0 { f64::EPSILON } else { u };
        result.push(-u.ln() / lambda);
    }
    Ok(result)
}

// ---------------------------------------------------------------------------
// Chi-Squared Distribution
// ---------------------------------------------------------------------------

/// PDF of the chi-squared distribution (k = degrees of freedom).
fn chi_squared_pdf_impl(x: f64, k: f64) -> f64 {
    if x <= 0.0 { return 0.0; }
    let half_k = k / 2.0;
    let log_pdf = (half_k - 1.0) * x.ln() - half_k * x - half_k * 2.0_f64.ln() - log_gamma_impl(half_k);
    log_pdf.exp()
}

/// CDF of the chi-squared distribution via regularized lower incomplete gamma.
fn chi_squared_cdf_impl(x: f64, k: f64) -> f64 {
    if x <= 0.0 { return 0.0; }
    regularized_gamma_lower_impl(k / 2.0, x / 2.0)
}

/// Generate chi-squared samples via sum of squared normal samples.
fn chi_squared_sample_impl(n: usize, k: f64, seed: u64) -> Result<Vec<f64>, MlError> {
    if k <= 0.0 { return Err(MlError::new("degrees of freedom must be positive")); }
    let mut rng = Rng::new(seed);
    let mut result = Vec::with_capacity(n);
    let k_int = k as usize;
    for _ in 0..n {
        let mut sum = 0.0;
        for _ in 0..k_int {
            let z = box_muller(&mut rng);
            sum += z * z;
        }
        result.push(sum);
    }
    Ok(result)
}

// ---------------------------------------------------------------------------
// Student's t Distribution
// ---------------------------------------------------------------------------

/// PDF of Student's t distribution.
fn t_pdf_impl(x: f64, df: f64) -> f64 {
    let half_df = df / 2.0;
    let log_num = log_gamma_impl((df + 1.0) / 2.0);
    let log_den = 0.5 * (df * std::f64::consts::PI).ln() + log_gamma_impl(half_df);
    let log_base = log_num - log_den;
    let log_kernel = -((df + 1.0) / 2.0) * (1.0 + x * x / df).ln();
    (log_base + log_kernel).exp()
}

/// CDF of Student's t distribution via the regularized incomplete beta function.
fn t_cdf_impl(x: f64, df: f64) -> f64 {
    let xx = df / (df + x * x);
    let ib = regularized_incomplete_beta_impl(xx, df / 2.0, 0.5);
    if x >= 0.0 {
        1.0 - 0.5 * ib
    } else {
        0.5 * ib
    }
}

/// Inverse CDF (quantile function) of Student's t distribution via bisection.
fn t_ppf_impl(p: f64, df: f64) -> f64 {
    if p <= 0.0 { return f64::NEG_INFINITY; }
    if p >= 1.0 { return f64::INFINITY; }
    if (p - 0.5).abs() < 1e-15 { return 0.0; }

    // Bisection method
    let mut lo = -100.0;
    let mut hi = 100.0;
    // Expand range if needed
    while t_cdf_impl(lo, df) > p { lo *= 2.0; }
    while t_cdf_impl(hi, df) < p { hi *= 2.0; }

    for _ in 0..200 {
        let mid = 0.5 * (lo + hi);
        if (hi - lo).abs() < 1e-12 { return mid; }
        if t_cdf_impl(mid, df) < p {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    0.5 * (lo + hi)
}

// ---------------------------------------------------------------------------
// F Distribution
// ---------------------------------------------------------------------------

/// PDF of the F distribution.
fn f_pdf_impl(x: f64, d1: f64, d2: f64) -> f64 {
    if x <= 0.0 { return 0.0; }
    let half_d1 = d1 / 2.0;
    let half_d2 = d2 / 2.0;
    let log_num = log_gamma_impl(half_d1 + half_d2);
    let log_den = log_gamma_impl(half_d1) + log_gamma_impl(half_d2);
    let log_base = log_num - log_den + half_d1 * d1.ln() + half_d2 * d2.ln();
    let log_kernel = (half_d1 - 1.0) * x.ln() - (half_d1 + half_d2) * (d1 * x + d2).ln();
    (log_base + log_kernel).exp()
}

/// CDF of the F distribution via the regularized incomplete beta function.
fn f_cdf_impl(x: f64, d1: f64, d2: f64) -> f64 {
    if x <= 0.0 { return 0.0; }
    let xx = d1 * x / (d1 * x + d2);
    regularized_incomplete_beta_impl(xx, d1 / 2.0, d2 / 2.0)
}

// ---------------------------------------------------------------------------
// WASM Wrappers — Special Functions
// ---------------------------------------------------------------------------

#[wasm_bindgen(js_name = "gammaFunction")]
pub fn gamma_function(x: f64) -> f64 {
    gamma_function_impl(x)
}

#[wasm_bindgen(js_name = "logGamma")]
pub fn log_gamma(x: f64) -> f64 {
    log_gamma_impl(x)
}

#[wasm_bindgen(js_name = "betaFunction")]
pub fn beta_function(a: f64, b: f64) -> f64 {
    beta_function_impl(a, b)
}

#[wasm_bindgen(js_name = "erf")]
pub fn erf(x: f64) -> f64 {
    erf_impl(x)
}

// ---------------------------------------------------------------------------
// WASM Wrappers — Normal Distribution
// ---------------------------------------------------------------------------

#[wasm_bindgen(js_name = "normalPdf")]
pub fn normal_pdf(x: f64, mean: f64, std: f64) -> f64 {
    normal_pdf_impl(x, mean, std)
}

#[wasm_bindgen(js_name = "normalCdf")]
pub fn normal_cdf(x: f64, mean: f64, std: f64) -> f64 {
    normal_cdf_impl(x, mean, std)
}

#[wasm_bindgen(js_name = "normalPpf")]
pub fn normal_ppf(p: f64, mean: f64, std: f64) -> f64 {
    normal_ppf_impl(p, mean, std)
}

#[wasm_bindgen(js_name = "normalSample")]
pub fn normal_sample(n: usize, mean: f64, std: f64, seed: u64) -> Result<Vec<f64>, JsValue> {
    normal_sample_impl(n, mean, std, seed).map_err(|e| JsValue::from_str(&e.message))
}

// ---------------------------------------------------------------------------
// WASM Wrappers — Binomial Distribution
// ---------------------------------------------------------------------------

#[wasm_bindgen(js_name = "binomialPmf")]
pub fn binomial_pmf(k: i64, n: i64, p: f64) -> f64 {
    binomial_pmf_impl(k, n, p)
}

#[wasm_bindgen(js_name = "binomialCdf")]
pub fn binomial_cdf(k: i64, n: i64, p: f64) -> f64 {
    binomial_cdf_impl(k, n, p)
}

#[wasm_bindgen(js_name = "binomialSample")]
pub fn binomial_sample(n_samples: usize, n_trials: i64, p: f64, seed: u64) -> Result<Vec<f64>, JsValue> {
    binomial_sample_impl(n_samples, n_trials, p, seed).map_err(|e| JsValue::from_str(&e.message))
}

// ---------------------------------------------------------------------------
// WASM Wrappers — Poisson Distribution
// ---------------------------------------------------------------------------

#[wasm_bindgen(js_name = "poissonPmf")]
pub fn poisson_pmf(k: i64, lambda: f64) -> f64 {
    poisson_pmf_impl(k, lambda)
}

#[wasm_bindgen(js_name = "poissonCdf")]
pub fn poisson_cdf(k: i64, lambda: f64) -> f64 {
    poisson_cdf_impl(k, lambda)
}

#[wasm_bindgen(js_name = "poissonSample")]
pub fn poisson_sample(n_samples: usize, lambda: f64, seed: u64) -> Result<Vec<f64>, JsValue> {
    poisson_sample_impl(n_samples, lambda, seed).map_err(|e| JsValue::from_str(&e.message))
}

// ---------------------------------------------------------------------------
// WASM Wrappers — Exponential Distribution
// ---------------------------------------------------------------------------

#[wasm_bindgen(js_name = "exponentialPdf")]
pub fn exponential_pdf(x: f64, lambda: f64) -> f64 {
    exponential_pdf_impl(x, lambda)
}

#[wasm_bindgen(js_name = "exponentialCdf")]
pub fn exponential_cdf(x: f64, lambda: f64) -> f64 {
    exponential_cdf_impl(x, lambda)
}

#[wasm_bindgen(js_name = "exponentialSample")]
pub fn exponential_sample(n: usize, lambda: f64, seed: u64) -> Result<Vec<f64>, JsValue> {
    exponential_sample_impl(n, lambda, seed).map_err(|e| JsValue::from_str(&e.message))
}

// ---------------------------------------------------------------------------
// WASM Wrappers — Chi-Squared Distribution
// ---------------------------------------------------------------------------

#[wasm_bindgen(js_name = "chiSquaredPdf")]
pub fn chi_squared_pdf(x: f64, k: f64) -> f64 {
    chi_squared_pdf_impl(x, k)
}

#[wasm_bindgen(js_name = "chiSquaredCdf")]
pub fn chi_squared_cdf(x: f64, k: f64) -> f64 {
    chi_squared_cdf_impl(x, k)
}

#[wasm_bindgen(js_name = "chiSquaredSample")]
pub fn chi_squared_sample(n: usize, k: f64, seed: u64) -> Result<Vec<f64>, JsValue> {
    chi_squared_sample_impl(n, k, seed).map_err(|e| JsValue::from_str(&e.message))
}

// ---------------------------------------------------------------------------
// WASM Wrappers — Student's t Distribution
// ---------------------------------------------------------------------------

#[wasm_bindgen(js_name = "tPdf")]
pub fn t_pdf(x: f64, df: f64) -> f64 {
    t_pdf_impl(x, df)
}

#[wasm_bindgen(js_name = "tCdf")]
pub fn t_cdf(x: f64, df: f64) -> f64 {
    t_cdf_impl(x, df)
}

#[wasm_bindgen(js_name = "tPpf")]
pub fn t_ppf(p: f64, df: f64) -> f64 {
    t_ppf_impl(p, df)
}

// ---------------------------------------------------------------------------
// WASM Wrappers — F Distribution
// ---------------------------------------------------------------------------

#[wasm_bindgen(js_name = "fPdf")]
pub fn f_pdf(x: f64, d1: f64, d2: f64) -> f64 {
    f_pdf_impl(x, d1, d2)
}

#[wasm_bindgen(js_name = "fCdf")]
pub fn f_cdf(x: f64, d1: f64, d2: f64) -> f64 {
    f_cdf_impl(x, d1, d2)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn approx_eq(a: f64, b: f64, tol: f64) -> bool {
        (a - b).abs() < tol
    }

    // --- Special functions ---

    #[test]
    fn test_gamma_function() {
        // gamma(1) = 1
        assert!(approx_eq(gamma_function_impl(1.0), 1.0, 1e-10));
        // gamma(5) = 4! = 24
        assert!(approx_eq(gamma_function_impl(5.0), 24.0, 1e-8));
        // gamma(0.5) = sqrt(pi)
        let sqrt_pi = std::f64::consts::PI.sqrt();
        assert!(approx_eq(gamma_function_impl(0.5), sqrt_pi, 1e-10));
        // gamma(2) = 1
        assert!(approx_eq(gamma_function_impl(2.0), 1.0, 1e-10));
        // gamma(3) = 2
        assert!(approx_eq(gamma_function_impl(3.0), 2.0, 1e-10));
    }

    #[test]
    fn test_log_gamma() {
        // log(gamma(1)) = 0
        assert!(approx_eq(log_gamma_impl(1.0), 0.0, 1e-10));
        // log(gamma(5)) = log(24)
        assert!(approx_eq(log_gamma_impl(5.0), 24.0_f64.ln(), 1e-10));
        // log(gamma(0.5)) = log(sqrt(pi))
        assert!(approx_eq(log_gamma_impl(0.5), std::f64::consts::PI.sqrt().ln(), 1e-10));
    }

    #[test]
    fn test_beta_function() {
        // B(1,1) = 1
        assert!(approx_eq(beta_function_impl(1.0, 1.0), 1.0, 1e-10));
        // B(2,3) = 1/12
        assert!(approx_eq(beta_function_impl(2.0, 3.0), 1.0 / 12.0, 1e-10));
    }

    #[test]
    fn test_erf() {
        // erf(0) = 0
        assert!(approx_eq(erf_impl(0.0), 0.0, 1e-10));
        // erf(-x) = -erf(x)
        assert!(approx_eq(erf_impl(-1.0), -erf_impl(1.0), 1e-10));
        // erf(1) ~ 0.8427 (A&S 7.1.26 max error 1.5e-7)
        let v = erf_impl(1.0);
        assert!(approx_eq(v, 0.8427007929497149, 1.5e-7), "erf(1) = {}, expected ~0.8427", v);
        // erf(0.5) ~ 0.5205
        assert!(approx_eq(erf_impl(0.5), 0.5204998778130465, 1.5e-7));
    }

    // --- Normal distribution ---

    #[test]
    fn test_normal_pdf() {
        // Standard normal at 0: 1/sqrt(2*pi) ~ 0.3989
        assert!(approx_eq(normal_pdf_impl(0.0, 0.0, 1.0), 0.3989422804014327, 1e-6));
        // Standard normal at 1: ~ 0.2420
        assert!(approx_eq(normal_pdf_impl(1.0, 0.0, 1.0), 0.24197072451914337, 1e-6));
        // Standard normal is symmetric
        assert!(approx_eq(normal_pdf_impl(-1.0, 0.0, 1.0), normal_pdf_impl(1.0, 0.0, 1.0), 1e-10));
        // Non-standard: N(5,2) at x=5 should be 1/(2*sqrt(2*pi))
        assert!(approx_eq(normal_pdf_impl(5.0, 5.0, 2.0), 0.3989422804014327 / 2.0, 1e-6));
    }

    #[test]
    fn test_normal_cdf() {
        // CDF at mean = 0.5
        assert!(approx_eq(normal_cdf_impl(0.0, 0.0, 1.0), 0.5, 1e-10));
        // CDF(1.96) ~ 0.975
        assert!(approx_eq(normal_cdf_impl(1.96, 0.0, 1.0), 0.9750021048517795, 2e-4));
        // CDF(-1.96) ~ 0.025
        assert!(approx_eq(normal_cdf_impl(-1.96, 0.0, 1.0), 0.02499789514822046, 2e-4));
        // CDF(0) for any mean = 0.5
        assert!(approx_eq(normal_cdf_impl(5.0, 5.0, 2.0), 0.5, 1e-10));
    }

    #[test]
    fn test_normal_ppf() {
        // ppf(0.5) = mean
        assert!(approx_eq(normal_ppf_impl(0.5, 0.0, 1.0), 0.0, 1e-6));
        // ppf(0.975) ~ 1.96
        assert!(approx_eq(normal_ppf_impl(0.975, 0.0, 1.0), 1.959963984540054, 1e-3));
        // ppf(0.025) ~ -1.96
        assert!(approx_eq(normal_ppf_impl(0.025, 0.0, 1.0), -1.959963984540054, 1e-3));
        // ppf(0.5, 5, 2) = 5
        assert!(approx_eq(normal_ppf_impl(0.5, 5.0, 2.0), 5.0, 1e-6));
    }

    #[test]
    fn test_normal_ppf_roundtrip() {
        // Round-trip: cdf(ppf(p)) ~ p for moderate values
        let x_vals = [-1.0, 0.0, 0.5, 1.0, 1.96];
        for &x in &x_vals {
            let p = normal_cdf_impl(x, 0.0, 1.0);
            let x_back = normal_ppf_impl(p, 0.0, 1.0);
            assert!(
                approx_eq(x, x_back, 1e-3),
                "ppf(cdf({})) = {}, expected {}",
                x, x_back, x
            );
        }
    }

    #[test]
    fn test_normal_sample_mean() {
        // 10000 samples from N(5, 2) should have mean ~ 5
        let samples = normal_sample_impl(10000, 5.0, 2.0, 42).unwrap();
        let mean: f64 = samples.iter().sum::<f64>() / samples.len() as f64;
        let se = 2.0 / (10000.0_f64).sqrt();
        assert!((mean - 5.0).abs() < 4.0 * se, "Sample mean {} not close to 5.0", mean);
    }

    // --- Binomial distribution ---

    #[test]
    fn test_binomial_pmf() {
        // C(10,5) * 0.5^5 * 0.5^5 = 252/1024 ~ 0.2461
        assert!(approx_eq(binomial_pmf_impl(5, 10, 0.5), 0.24609375, 1e-8));
        // C(10,0) * 0.5^10 = 1/1024
        assert!(approx_eq(binomial_pmf_impl(0, 10, 0.5), (0.5_f64).powi(10), 1e-10));
        // k > n returns 0
        assert!(approx_eq(binomial_pmf_impl(11, 10, 0.5), 0.0, 1e-10));
        // k < 0 returns 0
        assert!(approx_eq(binomial_pmf_impl(-1, 10, 0.5), 0.0, 1e-10));
    }

    #[test]
    fn test_binomial_cdf() {
        // CDF at k=n should be 1.0
        assert!(approx_eq(binomial_cdf_impl(10, 10, 0.5), 1.0, 1e-8));
        // CDF at k=0 = P(X=0) = (1-p)^n
        assert!(approx_eq(binomial_cdf_impl(0, 10, 0.5), (0.5_f64).powi(10), 1e-10));
    }

    // --- Poisson distribution ---

    #[test]
    fn test_poisson_pmf() {
        // P(X=3) for lambda=3: 3^3 * e^-3 / 6 ~ 0.2240
        assert!(approx_eq(poisson_pmf_impl(3, 3.0), 0.22404180765538754, 1e-6));
        // P(X=0) = e^-lambda
        assert!(approx_eq(poisson_pmf_impl(0, 3.0), (-3.0_f64).exp(), 1e-10));
    }

    #[test]
    fn test_poisson_cdf() {
        // CDF should be monotonically increasing
        assert!(poisson_cdf_impl(0, 3.0) < poisson_cdf_impl(1, 3.0));
        assert!(poisson_cdf_impl(1, 3.0) < poisson_cdf_impl(5, 3.0));
        // CDF for large k should approach 1
        assert!(approx_eq(poisson_cdf_impl(20, 3.0), 1.0, 1e-6));
    }

    // --- Exponential distribution ---

    #[test]
    fn test_exponential_cdf() {
        // CDF(1, 1) = 1 - e^(-1) ~ 0.6321
        assert!(approx_eq(exponential_cdf_impl(1.0, 1.0), 0.6321205588285577, 1e-8));
        // CDF(0, any) = 0
        assert!(approx_eq(exponential_cdf_impl(0.0, 1.0), 0.0, 1e-10));
        // CDF(negative) = 0
        assert!(approx_eq(exponential_cdf_impl(-1.0, 1.0), 0.0, 1e-10));
    }

    #[test]
    fn test_exponential_pdf() {
        // PDF(0, 1) = 1
        assert!(approx_eq(exponential_pdf_impl(0.0, 1.0), 1.0, 1e-10));
        // PDF(negative) = 0
        assert!(approx_eq(exponential_pdf_impl(-1.0, 1.0), 0.0, 1e-10));
        // PDF(1, 2) = 2 * e^(-2)
        assert!(approx_eq(exponential_pdf_impl(1.0, 2.0), 2.0 * (-2.0_f64).exp(), 1e-10));
    }

    // --- Chi-squared distribution ---

    #[test]
    fn test_chi_squared_pdf() {
        // PDF(0, any) = 0 for df > 2
        assert!(approx_eq(chi_squared_pdf_impl(0.0, 5.0), 0.0, 1e-10));
        // PDF(negative) = 0
        assert!(approx_eq(chi_squared_pdf_impl(-1.0, 5.0), 0.0, 1e-10));
        // Known value: chi2_pdf(1, 1) = 1/sqrt(2*pi) * e^(-0.5)
        let expected = (-0.5_f64).exp() / (2.0_f64 * std::f64::consts::PI).sqrt();
        assert!(approx_eq(chi_squared_pdf_impl(1.0, 1.0), expected, 1e-4));
    }

    #[test]
    fn test_chi_squared_cdf() {
        // CDF(0, any) = 0
        assert!(approx_eq(chi_squared_cdf_impl(0.0, 5.0), 0.0, 1e-10));
        // CDF increases with x
        assert!(chi_squared_cdf_impl(3.0, 5.0) < chi_squared_cdf_impl(10.0, 5.0));
        // For large x, CDF approaches 1
        assert!(chi_squared_cdf_impl(30.0, 5.0) > 0.999);
    }

    // --- Student's t distribution ---

    #[test]
    fn test_t_pdf() {
        // t_pdf(0, df) should be the mode
        let pdf_at_zero = t_pdf_impl(0.0, 5.0);
        assert!(pdf_at_zero > t_pdf_impl(1.0, 5.0));
        assert!(pdf_at_zero > t_pdf_impl(-1.0, 5.0));
        // Symmetric
        assert!(approx_eq(t_pdf_impl(1.0, 5.0), t_pdf_impl(-1.0, 5.0), 1e-10));
    }

    #[test]
    fn test_t_cdf() {
        // t_cdf(0, df) = 0.5 for any df
        assert!(approx_eq(t_cdf_impl(0.0, 1.0), 0.5, 1e-6));
        assert!(approx_eq(t_cdf_impl(0.0, 5.0), 0.5, 1e-6));
        assert!(approx_eq(t_cdf_impl(0.0, 30.0), 0.5, 1e-6));
        assert!(approx_eq(t_cdf_impl(0.0, 100.0), 0.5, 1e-6));
        // CDF increases with x
        assert!(t_cdf_impl(1.0, 5.0) > 0.5);
        assert!(t_cdf_impl(-1.0, 5.0) < 0.5);
        // Symmetry
        assert!(approx_eq(t_cdf_impl(1.0, 5.0), 1.0 - t_cdf_impl(-1.0, 5.0), 1e-4));
    }

    // --- F distribution ---

    #[test]
    fn test_f_pdf() {
        // F(0) = 0
        assert!(approx_eq(f_pdf_impl(0.0, 5.0, 10.0), 0.0, 1e-10));
        // F(negative) = 0
        assert!(approx_eq(f_pdf_impl(-1.0, 5.0, 10.0), 0.0, 1e-10));
        // F(1) > 0
        assert!(f_pdf_impl(1.0, 5.0, 10.0) > 0.0);
    }

    #[test]
    fn test_f_cdf() {
        // F_cdf(0) = 0
        assert!(approx_eq(f_cdf_impl(0.0, 5.0, 10.0), 0.0, 1e-10));
        // CDF increases with x
        assert!(f_cdf_impl(1.0, 5.0, 10.0) < f_cdf_impl(5.0, 5.0, 10.0));
        // For large x, CDF approaches 1
        assert!(f_cdf_impl(50.0, 5.0, 10.0) > 0.999);
    }

    // --- Distribution sampling tests ---

    #[test]
    fn test_binomial_sample_distribution() {
        let samples = binomial_sample_impl(10000, 20, 0.3, 42).unwrap();
        let mean: f64 = samples.iter().sum::<f64>() / samples.len() as f64;
        // Expected mean = n*p = 6
        assert!(approx_eq(mean, 6.0, 0.5), "Binomial sample mean {} not close to 6.0", mean);
    }

    #[test]
    fn test_poisson_sample_distribution() {
        let samples = poisson_sample_impl(10000, 5.0, 42).unwrap();
        let mean: f64 = samples.iter().sum::<f64>() / samples.len() as f64;
        // Expected mean = lambda = 5
        assert!(approx_eq(mean, 5.0, 0.5), "Poisson sample mean {} not close to 5.0", mean);
    }

    #[test]
    fn test_exponential_sample_mean() {
        let samples = exponential_sample_impl(10000, 2.0, 42).unwrap();
        let mean: f64 = samples.iter().sum::<f64>() / samples.len() as f64;
        // Expected mean = 1/lambda = 0.5
        assert!(approx_eq(mean, 0.5, 0.1), "Exponential sample mean {} not close to 0.5", mean);
    }
}
