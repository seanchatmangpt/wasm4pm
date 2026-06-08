use crate::error::MlError;
use wasm_bindgen::prelude::*;

// ---------------------------------------------------------------------------
// Xorshift64 PRNG
// ---------------------------------------------------------------------------

struct Rng {
    state: u64,
}

impl Rng {
    fn new(seed: u64) -> Self {
        Self {
            state: if seed == 0 { 1 } else { seed },
        }
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
// Special functions
// ---------------------------------------------------------------------------

const LANCZOS_P: [f64; 9] = [
    0.999_999_999_999_809_9,
    676.5203681218851,
    -1259.1392167224028,
    771.323_428_777_653_1,
    -176.615_029_162_140_6,
    12.507343278686905,
    -0.13857109526572012,
    9.984_369_578_019_572e-6,
    1.505_632_735_149_311_6e-7,
];
const LANCZOS_G: f64 = 7.0;

fn gamma_function_impl(x: f64) -> f64 {
    if x < 0.5 {
        std::f64::consts::PI / ((std::f64::consts::PI * x).sin() * gamma_function_impl(1.0 - x))
    } else {
        let x = x - 1.0;
        let mut a = LANCZOS_P[0];
        for (i, &p) in LANCZOS_P.iter().enumerate().take(9).skip(1) {
            a += p / (x + i as f64);
        }
        let t = x + LANCZOS_G + 0.5;
        let sqrt_2pi = 2.506_628_274_631_000_7;
        sqrt_2pi * t.powf(x + 0.5) * (-t).exp() * a
    }
}

fn log_gamma_impl(x: f64) -> f64 {
    if x < 0.5 {
        let log_pi = std::f64::consts::PI.ln();
        let log_sin = (std::f64::consts::PI * x).abs().sin().ln();
        log_pi - log_sin - log_gamma_impl(1.0 - x)
    } else {
        let x = x - 1.0;
        let mut a = LANCZOS_P[0];
        for (i, &p) in LANCZOS_P.iter().enumerate().take(9).skip(1) {
            a += p / (x + i as f64);
        }
        let t = x + LANCZOS_G + 0.5;
        0.5 * (2.0 * std::f64::consts::PI).ln() + (x + 0.5) * t.ln() - t + a.ln()
    }
}

fn beta_function_impl(a: f64, b: f64) -> f64 {
    (log_gamma_impl(a) + log_gamma_impl(b) - log_gamma_impl(a + b)).exp()
}

fn gamma_series(s: f64, x: f64) -> f64 {
    let mut sum = 1.0 / s;
    let mut term = 1.0 / s;
    for n in 1..200 {
        term *= x / (s + n as f64);
        sum += term;
        if term.abs() < sum.abs() * 1e-14 {
            break;
        }
    }
    sum
}

fn gamma_cf(s: f64, x: f64) -> f64 {
    const EPS: f64 = 1e-14;
    const TINY: f64 = 1e-30;
    let mut b = x + 1.0 - s;
    let mut c = 1.0 / TINY;
    let mut d = 1.0 / b;
    let mut h = d;
    for i in 1..200 {
        let an = -(i as f64) * (i as f64 - s);
        b += 2.0;
        d = an * d + b;
        if d.abs() < TINY {
            d = TINY;
        }
        c = b + an / c;
        if c.abs() < TINY {
            c = TINY;
        }
        d = 1.0 / d;
        let del = d * c;
        h *= del;
        if (del - 1.0).abs() < EPS {
            break;
        }
    }
    h
}

fn regularized_gamma_lower_impl(a: f64, x: f64) -> f64 {
    if x <= 0.0 {
        return 0.0;
    }
    let log_prefix = a * x.ln() - x - log_gamma_impl(a);
    if x < a + 1.0 {
        (log_prefix + gamma_series(a, x).ln()).exp()
    } else {
        1.0 - (log_prefix + gamma_cf(a, x).ln()).exp()
    }
}

fn erf_impl(x: f64) -> f64 {
    if x < 0.0 {
        -erf_impl(-x)
    } else {
        regularized_gamma_lower_impl(0.5, x * x)
    }
}

fn regularized_incomplete_beta_impl(x: f64, a: f64, b: f64) -> f64 {
    if x <= 0.0 {
        return 0.0;
    }
    if x >= 1.0 {
        return 1.0;
    }
    let log_beta = log_gamma_impl(a) + log_gamma_impl(b) - log_gamma_impl(a + b);
    let log_prefix = a * x.ln() + b * (1.0 - x).ln() - log_beta;
    if x < (a + 1.0) / (a + b + 2.0) {
        (log_prefix.exp() * beta_cf(a, b, x)) / a
    } else {
        1.0 - (log_prefix.exp() * beta_cf(b, a, 1.0 - x)) / b
    }
}

fn beta_cf(a: f64, b: f64, x: f64) -> f64 {
    const MAX_ITER: usize = 200;
    const EPS: f64 = 3.0e-12;
    let qap = a + 1.0;
    let qam = a - 1.0;
    let qab = a + b;
    let mut c = 1.0;
    let mut d = 1.0 - qab * x / qap;
    if d.abs() < f64::EPSILON {
        d = f64::EPSILON;
    }
    d = 1.0 / d;
    let mut h = d;
    for m in 1..=MAX_ITER {
        let m2 = 2 * m;
        let aa = (m as f64) * (b - m as f64) * x / ((qam + (m2 as f64)) * (a + (m2 as f64)));
        d = 1.0 + aa * d;
        if d.abs() < f64::EPSILON {
            d = f64::EPSILON;
        }
        c = 1.0 + aa / c;
        if c.abs() < f64::EPSILON {
            c = f64::EPSILON;
        }
        d = 1.0 / d;
        h *= d * c;
        let aa =
            -(a + (m as f64)) * (qab + (m as f64)) * x / ((a + (m2 as f64)) * (qap + (m2 as f64)));
        d = 1.0 + aa * d;
        if d.abs() < f64::EPSILON {
            d = f64::EPSILON;
        }
        c = 1.0 + aa / c;
        if c.abs() < f64::EPSILON {
            c = f64::EPSILON;
        }
        d = 1.0 / d;
        let del = d * c;
        h *= del;
        if (del - 1.0).abs() < EPS {
            break;
        }
    }
    h
}

fn box_muller(rng: &mut Rng) -> f64 {
    let u1 = rng.next_f64().max(f64::EPSILON);
    let u2 = rng.next_f64();
    (-2.0 * u1.ln()).sqrt() * (2.0 * std::f64::consts::PI * u2).cos()
}

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

fn normal_pdf_impl(x: f64, mean: f64, std: f64) -> f64 {
    let z = (x - mean) / std;
    (-0.5 * z * z).exp() / (std * (2.0 * std::f64::consts::PI).sqrt())
}

fn normal_cdf_impl(x: f64, mean: f64, std: f64) -> f64 {
    0.5 * (1.0 + erf_impl((x - mean) / (std * 2.0_f64.sqrt())))
}

fn normal_ppf_impl(p: f64, mean: f64, std: f64) -> f64 {
    if p <= 0.0 {
        return f64::NEG_INFINITY;
    }
    if p >= 1.0 {
        return f64::INFINITY;
    }
    if p == 0.5 {
        return mean;
    }
    const A: [f64; 6] = [
        -3.969683028665376e+01,
        2.209460984245205e+02,
        -2.759285104469687e+02,
        1.38357751867269e2,
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
    let e = 0.5 * (1.0 + erf_impl(q / 2.0_f64.sqrt())) - p;
    let u = e * (2.0 * std::f64::consts::PI).sqrt() * (-0.5 * q * q).exp();
    mean + std * (q - u)
}

fn normal_sample_impl(n: usize, mean: f64, std: f64, seed: u64) -> Result<Vec<f64>, MlError> {
    if n == 0 {
        return Ok(vec![]);
    }
    let mut rng = Rng::new(seed);
    let mut result = Vec::with_capacity(n);
    let pairs = n.div_ceil(2);
    for _ in 0..pairs {
        let u1 = rng.next_f64().max(f64::EPSILON);
        let u2 = rng.next_f64();
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

fn binomial_pmf_impl(k: i64, n: i64, p: f64) -> f64 {
    if k < 0 || k > n {
        return 0.0;
    }
    let log_pmf = log_binomial_coeff(n, k) + k as f64 * p.ln() + (n - k) as f64 * (1.0 - p).ln();
    log_pmf.exp()
}

fn binomial_cdf_impl(k: i64, n: i64, p: f64) -> f64 {
    let k = if k > n { n } else { k };
    let mut sum = 0.0;
    for i in 0..=k {
        sum += binomial_pmf_impl(i, n, p);
    }
    sum
}

fn binomial_sample_impl(
    n_samples: usize,
    n_trials: i64,
    p: f64,
    seed: u64,
) -> Result<Vec<f64>, MlError> {
    if n_trials < 0 {
        return Err(MlError::new("n_trials must be non-negative"));
    }
    if !(0.0..=1.0).contains(&p) {
        return Err(MlError::new("p must be in [0, 1]"));
    }
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

fn poisson_pmf_impl(k: i64, lambda: f64) -> f64 {
    if k < 0 {
        return 0.0;
    }
    let log_pmf = k as f64 * lambda.ln() - lambda - log_gamma_impl(k as f64 + 1.0);
    log_pmf.exp()
}

fn poisson_cdf_impl(k: i64, lambda: f64) -> f64 {
    let mut sum = 0.0;
    for i in 0..=k {
        sum += poisson_pmf_impl(i, lambda);
    }
    sum
}

fn poisson_sample_impl(n_samples: usize, lambda: f64, seed: u64) -> Result<Vec<f64>, MlError> {
    if lambda <= 0.0 {
        return Err(MlError::new("lambda must be positive"));
    }
    let mut rng = Rng::new(seed);
    let mut result = Vec::with_capacity(n_samples);
    let l = (-lambda).exp();
    for _ in 0..n_samples {
        let mut k = 0i64;
        let mut p = 1.0;
        loop {
            p *= rng.next_f64();
            if p < l {
                break;
            }
            k += 1;
            if k > 10000 {
                break;
            }
        }
        result.push(k as f64);
    }
    Ok(result)
}

// ---------------------------------------------------------------------------
// Exponential Distribution
// ---------------------------------------------------------------------------

fn exponential_pdf_impl(x: f64, lambda: f64) -> f64 {
    if x < 0.0 {
        return 0.0;
    }
    lambda * (-lambda * x).exp()
}

fn exponential_cdf_impl(x: f64, lambda: f64) -> f64 {
    if x < 0.0 {
        return 0.0;
    }
    1.0 - (-lambda * x).exp()
}

fn exponential_sample_impl(n: usize, lambda: f64, seed: u64) -> Result<Vec<f64>, MlError> {
    if lambda <= 0.0 {
        return Err(MlError::new("lambda must be positive"));
    }
    let mut rng = Rng::new(seed);
    let mut result = Vec::with_capacity(n);
    for _ in 0..n {
        let u = rng.next_f64().max(f64::EPSILON);
        result.push(-u.ln() / lambda);
    }
    Ok(result)
}

// ---------------------------------------------------------------------------
// Chi-Squared Distribution
// ---------------------------------------------------------------------------

fn chi_squared_pdf_impl(x: f64, k: f64) -> f64 {
    if x <= 0.0 {
        return 0.0;
    }
    let half_k = k / 2.0;
    let log_pdf =
        (half_k - 1.0) * x.ln() - x / 2.0 - half_k * 2.0_f64.ln() - log_gamma_impl(half_k);
    log_pdf.exp()
}

fn chi_squared_cdf_impl(x: f64, k: f64) -> f64 {
    if x <= 0.0 {
        return 0.0;
    }
    regularized_gamma_lower_impl(k / 2.0, x / 2.0)
}

fn chi_squared_sample_impl(n: usize, k: f64, seed: u64) -> Result<Vec<f64>, MlError> {
    if k <= 0.0 {
        return Err(MlError::new("degrees of freedom must be positive"));
    }
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

fn t_pdf_impl(x: f64, df: f64) -> f64 {
    let half_df = df / 2.0;
    let log_num = log_gamma_impl((df + 1.0) / 2.0);
    let log_den = 0.5 * (df * std::f64::consts::PI).ln() + log_gamma_impl(half_df);
    let log_base = log_num - log_den;
    let log_kernel = -((df + 1.0) / 2.0) * (1.0 + x * x / df).ln();
    (log_base + log_kernel).exp()
}

fn t_cdf_impl(x: f64, df: f64) -> f64 {
    let xx = df / (df + x * x);
    let ib = regularized_incomplete_beta_impl(xx, df / 2.0, 0.5);
    if x >= 0.0 {
        1.0 - 0.5 * ib
    } else {
        0.5 * ib
    }
}

fn t_ppf_impl(p: f64, df: f64) -> f64 {
    if p <= 0.0 {
        return f64::NEG_INFINITY;
    }
    if p >= 1.0 {
        return f64::INFINITY;
    }
    if (p - 0.5).abs() < 1e-15 {
        return 0.0;
    }
    let mut lo = -100.0;
    let mut hi = 100.0;
    while t_cdf_impl(lo, df) > p {
        lo *= 2.0;
    }
    while t_cdf_impl(hi, df) < p {
        hi *= 2.0;
    }
    for _ in 0..100 {
        let mid = 0.5 * (lo + hi);
        if (hi - lo).abs() < 1e-12 {
            return mid;
        }
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

fn f_pdf_impl(x: f64, d1: f64, d2: f64) -> f64 {
    if x <= 0.0 {
        return 0.0;
    }
    let half_d1 = d1 / 2.0;
    let half_d2 = d2 / 2.0;
    let log_num = log_gamma_impl(half_d1 + half_d2);
    let log_den = log_gamma_impl(half_d1) + log_gamma_impl(half_d2);
    let log_base = log_num - log_den + half_d1 * d1.ln() + half_d2 * d2.ln();
    let log_kernel = (half_d1 - 1.0) * x.ln() - (half_d1 + half_d2) * (d1 * x + d2).ln();
    (log_base + log_kernel).exp()
}

fn f_cdf_impl(x: f64, d1: f64, d2: f64) -> f64 {
    if x <= 0.0 {
        return 0.0;
    }
    let xx = d1 * x / (d1 * x + d2);
    regularized_incomplete_beta_impl(xx, d1 / 2.0, d2 / 2.0)
}

// ---------------------------------------------------------------------------
// WASM Wrappers
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

#[wasm_bindgen(js_name = "binomialPmf")]
pub fn binomial_pmf(k: i64, n: i64, p: f64) -> f64 {
    binomial_pmf_impl(k, n, p)
}

#[wasm_bindgen(js_name = "binomialCdf")]
pub fn binomial_cdf(k: i64, n: i64, p: f64) -> f64 {
    binomial_cdf_impl(k, n, p)
}

#[wasm_bindgen(js_name = "binomialSample")]
pub fn binomial_sample(n: usize, n_trials: i64, p: f64, seed: u64) -> Result<Vec<f64>, JsValue> {
    binomial_sample_impl(n, n_trials, p, seed).map_err(|e| JsValue::from_str(&e.message))
}

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

#[wasm_bindgen(js_name = "fPdf")]
pub fn f_pdf(x: f64, d1: f64, d2: f64) -> f64 {
    f_pdf_impl(x, d1, d2)
}

#[wasm_bindgen(js_name = "fCdf")]
pub fn f_cdf(x: f64, d1: f64, d2: f64) -> f64 {
    f_cdf_impl(x, d1, d2)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn approx_eq(a: f64, b: f64, tol: f64) -> bool {
        (a - b).abs() < tol
    }
    #[test]
    fn test_gamma() {
        assert!(approx_eq(gamma_function_impl(5.0), 24.0, 1e-8));
    }
    #[test]
    fn test_erf() {
        assert!(approx_eq(erf_impl(1.0), 0.8427, 1e-3));
    }
}
