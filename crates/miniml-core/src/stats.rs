use wasm_bindgen::prelude::*;
use crate::error::MlError;
use crate::distributions::{
    t_cdf, normal_cdf, normal_ppf,
    chi_squared_cdf, f_cdf,
};

// ---------------------------------------------------------------------------
// Result structs
// ---------------------------------------------------------------------------

#[wasm_bindgen]
pub struct TTestResult {
    statistic: f64,
    p_value: f64,
    df: f64,
    mean_diff: f64,
    ci_lower: f64,
    ci_upper: f64,
}

#[wasm_bindgen]
impl TTestResult {
    #[wasm_bindgen(getter)]
    pub fn statistic(&self) -> f64 { self.statistic }
    #[wasm_bindgen(getter)]
    pub fn p_value(&self) -> f64 { self.p_value }
    #[wasm_bindgen(getter)]
    pub fn df(&self) -> f64 { self.df }
    #[wasm_bindgen(getter)]
    pub fn mean_diff(&self) -> f64 { self.mean_diff }
    #[wasm_bindgen(getter)]
    pub fn ci_lower(&self) -> f64 { self.ci_lower }
    #[wasm_bindgen(getter)]
    pub fn ci_upper(&self) -> f64 { self.ci_upper }
}

#[wasm_bindgen]
pub struct AnovaResult {
    f_statistic: f64,
    p_value: f64,
    between_groups_ss: f64,
    within_groups_ss: f64,
    between_groups_df: f64,
    within_groups_df: f64,
}

#[wasm_bindgen]
impl AnovaResult {
    #[wasm_bindgen(getter)]
    pub fn f_statistic(&self) -> f64 { self.f_statistic }
    #[wasm_bindgen(getter)]
    pub fn p_value(&self) -> f64 { self.p_value }
    #[wasm_bindgen(getter)]
    pub fn between_groups_ss(&self) -> f64 { self.between_groups_ss }
    #[wasm_bindgen(getter)]
    pub fn within_groups_ss(&self) -> f64 { self.within_groups_ss }
    #[wasm_bindgen(getter)]
    pub fn between_groups_df(&self) -> f64 { self.between_groups_df }
    #[wasm_bindgen(getter)]
    pub fn within_groups_df(&self) -> f64 { self.within_groups_df }
}

#[wasm_bindgen]
pub struct ChiSquareResult {
    statistic: f64,
    p_value: f64,
    df: f64,
}

#[wasm_bindgen]
impl ChiSquareResult {
    #[wasm_bindgen(getter)]
    pub fn statistic(&self) -> f64 { self.statistic }
    #[wasm_bindgen(getter)]
    pub fn p_value(&self) -> f64 { self.p_value }
    #[wasm_bindgen(getter)]
    pub fn df(&self) -> f64 { self.df }
}

#[wasm_bindgen]
pub struct MannWhitneyResult {
    u_statistic: f64,
    p_value: f64,
    z_approx: f64,
}

#[wasm_bindgen]
impl MannWhitneyResult {
    #[wasm_bindgen(getter)]
    pub fn u_statistic(&self) -> f64 { self.u_statistic }
    #[wasm_bindgen(getter)]
    pub fn p_value(&self) -> f64 { self.p_value }
    #[wasm_bindgen(getter)]
    pub fn z_approx(&self) -> f64 { self.z_approx }
}

#[wasm_bindgen]
pub struct KSTestResult {
    statistic: f64,
    p_value: f64,
}

#[wasm_bindgen]
impl KSTestResult {
    #[wasm_bindgen(getter)]
    pub fn statistic(&self) -> f64 { self.statistic }
    #[wasm_bindgen(getter)]
    pub fn p_value(&self) -> f64 { self.p_value }
}

#[wasm_bindgen]
pub struct ConfidenceInterval {
    lower: f64,
    upper: f64,
    point_estimate: f64,
    std_error: f64,
}

#[wasm_bindgen]
impl ConfidenceInterval {
    #[wasm_bindgen(getter)]
    pub fn lower(&self) -> f64 { self.lower }
    #[wasm_bindgen(getter)]
    pub fn upper(&self) -> f64 { self.upper }
    #[wasm_bindgen(getter)]
    pub fn point_estimate(&self) -> f64 { self.point_estimate }
    #[wasm_bindgen(getter)]
    pub fn std_error(&self) -> f64 { self.std_error }
}

#[wasm_bindgen]
pub struct DescriptiveStats {
    mean: f64,
    median: f64,
    std: f64,
    variance: f64,
    min: f64,
    max: f64,
    skewness: f64,
    kurtosis: f64,
    n: usize,
}

#[wasm_bindgen]
impl DescriptiveStats {
    #[wasm_bindgen(getter)]
    pub fn mean(&self) -> f64 { self.mean }
    #[wasm_bindgen(getter)]
    pub fn median(&self) -> f64 { self.median }
    #[wasm_bindgen(getter)]
    pub fn std(&self) -> f64 { self.std }
    #[wasm_bindgen(getter)]
    pub fn variance(&self) -> f64 { self.variance }
    #[wasm_bindgen(getter)]
    pub fn min(&self) -> f64 { self.min }
    #[wasm_bindgen(getter)]
    pub fn max(&self) -> f64 { self.max }
    #[wasm_bindgen(getter)]
    pub fn skewness(&self) -> f64 { self.skewness }
    #[wasm_bindgen(getter)]
    pub fn kurtosis(&self) -> f64 { self.kurtosis }
    #[wasm_bindgen(getter)]
    pub fn n(&self) -> usize { self.n }
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

fn mean(data: &[f64]) -> f64 {
    data.iter().sum::<f64>() / data.len() as f64
}

fn variance(data: &[f64]) -> f64 {
    let m = mean(data);
    let ss: f64 = data.iter().map(|x| (x - m) * (x - m)).sum();
    ss / (data.len() - 1) as f64
}

fn std_dev(data: &[f64]) -> f64 {
    variance(data).sqrt()
}

fn median(data: &mut [f64]) -> f64 {
    data.sort_unstable_by(|a, b| a.partial_cmp(b).unwrap());
    let n = data.len();
    if n % 2 == 0 {
        (data[n / 2 - 1] + data[n / 2]) / 2.0
    } else {
        data[n / 2]
    }
}

fn t_test_p_value(t_stat: f64, df: f64) -> f64 {
    let abs_t = t_stat.abs();
    let cdf_val = t_cdf(abs_t, df);
    2.0 * (1.0 - cdf_val)
}

/// Inverse CDF (quantile function) of the t-distribution using bisection.
fn t_ppf(p: f64, df: f64) -> f64 {
    if p <= 0.0 { return f64::NEG_INFINITY; }
    if p >= 1.0 { return f64::INFINITY; }
    if (p - 0.5).abs() < 1e-15 { return 0.0; }

    let mut lo = -1000.0;
    let mut hi = 1000.0;
    while t_cdf(lo, df) > p { lo *= 2.0; }
    while t_cdf(hi, df) < p { hi *= 2.0; }

    for _ in 0..200 {
        let mid = (lo + hi) / 2.0;
        let mid_cdf = t_cdf(mid, df);
        if (mid_cdf - p).abs() < 1e-12 { return mid; }
        if mid_cdf < p { lo = mid; } else { hi = mid; }
    }
    (lo + hi) / 2.0
}

fn rank_values(data: &[f64]) -> Vec<f64> {
    let n = data.len();
    let mut indexed: Vec<(usize, f64)> = data.iter().copied().enumerate().collect();
    indexed.sort_unstable_by(|a, b| a.1.partial_cmp(&b.1).unwrap());
    let mut ranks = vec![0.0f64; n];
    let mut i = 0;
    while i < n {
        let mut j = i + 1;
        while j < n && (indexed[j].1 - indexed[i].1).abs() < 1e-15 { j += 1; }
        let avg_rank = (i + 1 + j) as f64 / 2.0;
        for k in i..j { ranks[indexed[k].0] = avg_rank; }
        i = j;
    }
    ranks
}

fn ks_p_value(d_stat: f64, n: usize) -> f64 {
    if n == 0 { return 1.0; }
    let z = d_stat * (n as f64).sqrt();
    let z2 = z * z;
    let mut sum = 0.0;
    for k in 1..=100 {
        let sign = if k % 2 == 1 { 1.0 } else { -1.0 };
        let term = sign * (-2.0 * k as f64 * k as f64 * z2).exp();
        sum += term;
        if term.abs() < 1e-15 { break; }
    }
    (2.0 * sum).max(0.0).min(1.0)
}

// ---------------------------------------------------------------------------
// T-Tests
// ---------------------------------------------------------------------------

pub fn t_test_one_sample_impl(
    data: &[f64],
    hypothesized_mean: f64,
    alpha: f64,
) -> Result<TTestResult, MlError> {
    let n = data.len();
    if n < 2 { return Err(MlError::new("Need at least 2 observations for a t-test")); }
    if alpha <= 0.0 || alpha >= 1.0 { return Err(MlError::new("alpha must be between 0 and 1")); }

    let m = mean(data);
    let s = std_dev(data);
    let df = (n - 1) as f64;
    let se = s / (n as f64).sqrt();
    let t_stat = (m - hypothesized_mean) / se;
    let p_value = t_test_p_value(t_stat, df);
    let t_crit = t_ppf(1.0 - alpha / 2.0, df);
    let ci_lower = m - t_crit * se;
    let ci_upper = m + t_crit * se;

    Ok(TTestResult { statistic: t_stat, p_value, df, mean_diff: m - hypothesized_mean, ci_lower, ci_upper })
}

pub fn t_test_two_sample_impl(
    data1: &[f64],
    data2: &[f64],
    alpha: f64,
) -> Result<TTestResult, MlError> {
    let n1 = data1.len();
    let n2 = data2.len();
    if n1 < 2 || n2 < 2 { return Err(MlError::new("Each sample needs at least 2 observations")); }
    if alpha <= 0.0 || alpha >= 1.0 { return Err(MlError::new("alpha must be between 0 and 1")); }

    let m1 = mean(data1);
    let m2 = mean(data2);
    let v1 = variance(data1);
    let v2 = variance(data2);
    let df = (n1 + n2 - 2) as f64;
    let s_p_sq = ((n1 - 1) as f64 * v1 + (n2 - 1) as f64 * v2) / df;
    let se = (s_p_sq * (1.0 / n1 as f64 + 1.0 / n2 as f64)).sqrt();
    let mean_diff = m1 - m2;
    let t_stat = mean_diff / se;
    let p_value = t_test_p_value(t_stat, df);
    let t_crit = t_ppf(1.0 - alpha / 2.0, df);

    Ok(TTestResult { statistic: t_stat, p_value, df, mean_diff, ci_lower: mean_diff - t_crit * se, ci_upper: mean_diff + t_crit * se })
}

pub fn t_test_paired_impl(
    data1: &[f64],
    data2: &[f64],
    alpha: f64,
) -> Result<TTestResult, MlError> {
    if data1.len() != data2.len() { return Err(MlError::new("Paired samples must have the same length")); }
    if data1.len() < 2 { return Err(MlError::new("Need at least 2 paired observations")); }
    if alpha <= 0.0 || alpha >= 1.0 { return Err(MlError::new("alpha must be between 0 and 1")); }

    let diffs: Vec<f64> = data1.iter().zip(data2.iter()).map(|(a, b)| a - b).collect();
    t_test_one_sample_impl(&diffs, 0.0, alpha)
}

pub fn welch_t_test_impl(
    data1: &[f64],
    data2: &[f64],
    alpha: f64,
) -> Result<TTestResult, MlError> {
    let n1 = data1.len();
    let n2 = data2.len();
    if n1 < 2 || n2 < 2 { return Err(MlError::new("Each sample needs at least 2 observations")); }
    if alpha <= 0.0 || alpha >= 1.0 { return Err(MlError::new("alpha must be between 0 and 1")); }

    let m1 = mean(data1);
    let m2 = mean(data2);
    let v1 = variance(data1);
    let v2 = variance(data2);
    let mean_diff = m1 - m2;
    let se = (v1 / n1 as f64 + v2 / n2 as f64).sqrt();
    let t_stat = mean_diff / se;

    let num = (v1 / n1 as f64 + v2 / n2 as f64).powi(2);
    let den = (v1 / n1 as f64).powi(2) / (n1 - 1) as f64
        + (v2 / n2 as f64).powi(2) / (n2 - 1) as f64;
    let df = num / den;
    let p_value = t_test_p_value(t_stat, df);
    let t_crit = t_ppf(1.0 - alpha / 2.0, df);

    Ok(TTestResult { statistic: t_stat, p_value, df, mean_diff, ci_lower: mean_diff - t_crit * se, ci_upper: mean_diff + t_crit * se })
}

// ---------------------------------------------------------------------------
// Non-parametric tests
// ---------------------------------------------------------------------------

pub fn mann_whitney_u_impl(
    data1: &[f64],
    data2: &[f64],
) -> Result<MannWhitneyResult, MlError> {
    let n1 = data1.len();
    let n2 = data2.len();
    if n1 == 0 || n2 == 0 { return Err(MlError::new("Both samples must be non-empty")); }

    let combined: Vec<f64> = data1.iter().chain(data2.iter()).copied().collect();
    let ranks = rank_values(&combined);
    let r1: f64 = ranks[..n1].iter().sum();
    let u1 = r1 - n1 as f64 * (n1 as f64 + 1.0) / 2.0;
    let u2 = n1 as f64 * n2 as f64 - u1;
    let u_stat = u1.min(u2);

    let n = (n1 + n2) as f64;
    let mean_u = n1 as f64 * n2 as f64 / 2.0;

    let rank_counts: Vec<usize> = {
        let mut sorted = ranks.clone();
        sorted.sort_unstable_by(|a, b| a.partial_cmp(b).unwrap());
        let mut counts = Vec::new();
        let mut i = 0;
        while i < sorted.len() {
            let mut j = i + 1;
            while j < sorted.len() && (sorted[j] - sorted[i]).abs() < 1e-15 { j += 1; }
            counts.push(j - i);
            i = j;
        }
        counts
    };
    let tie_correction: f64 = rank_counts.iter()
        .map(|&t| (t * t * t - t) as f64)
        .sum::<f64>() / (n * (n - 1.0));

    let var_u = n1 as f64 * n2 as f64 * (n + 1.0 - tie_correction) / 12.0;
    let std_u = var_u.sqrt().max(1e-15);
    let z_approx = (u1 - mean_u) / std_u;
    let p_value = 2.0 * (1.0 - normal_cdf(z_approx.abs(), 0.0, 1.0));

    Ok(MannWhitneyResult { u_statistic: u_stat, p_value, z_approx })
}

pub fn wilcoxon_signed_rank_impl(
    data1: &[f64],
    data2: &[f64],
) -> Result<MannWhitneyResult, MlError> {
    if data1.len() != data2.len() { return Err(MlError::new("Paired samples must have the same length")); }
    if data1.len() < 2 { return Err(MlError::new("Need at least 2 paired observations")); }

    let diffs: Vec<f64> = data1.iter()
        .zip(data2.iter())
        .map(|(a, b)| a - b)
        .filter(|d| d.abs() > 1e-15)
        .collect();

    let n = diffs.len();
    if n == 0 { return Err(MlError::new("No non-zero differences found")); }

    let abs_diffs: Vec<f64> = diffs.iter().map(|d| d.abs()).collect();
    let ranks = rank_values(&abs_diffs);

    let w_plus: f64 = diffs.iter().zip(ranks.iter()).filter(|(d, _)| **d > 0.0).map(|(_, r)| *r).sum();
    let w_minus: f64 = diffs.iter().zip(ranks.iter()).filter(|(d, _)| **d < 0.0).map(|(_, r)| *r).sum();
    let w_stat = w_plus.min(w_minus);

    let mean_w = n as f64 * (n as f64 + 1.0) / 4.0;
    let var_w = n as f64 * (n as f64 + 1.0) * (2.0 * n as f64 + 1.0) / 24.0;
    let std_w = var_w.sqrt().max(1e-15);
    let z_approx = (w_stat - mean_w) / std_w;
    let p_value = 2.0 * (1.0 - normal_cdf(z_approx.abs(), 0.0, 1.0));

    Ok(MannWhitneyResult { u_statistic: w_stat, p_value, z_approx })
}

pub fn ks_test_impl(data: &[f64]) -> Result<KSTestResult, MlError> {
    let n = data.len();
    if n < 2 { return Err(MlError::new("Need at least 2 observations for KS test")); }

    let mut sorted = data.to_vec();
    sorted.sort_unstable_by(|a, b| a.partial_cmp(b).unwrap());

    let mut d_stat = 0.0f64;
    for i in 0..n {
        let x = sorted[i];
        let ecdf = (i + 1) as f64 / n as f64;
        let ncdf = normal_cdf(x, 0.0, 1.0);
        let diff = (ecdf - ncdf).abs();
        let diff_prev = (i as f64 / n as f64 - ncdf).abs();
        d_stat = d_stat.max(diff).max(diff_prev);
    }

    let p_value = ks_p_value(d_stat, n);
    Ok(KSTestResult { statistic: d_stat, p_value })
}

// ---------------------------------------------------------------------------
// Chi-Square tests
// ---------------------------------------------------------------------------

pub fn chi_square_test_impl(
    observed: &[f64],
    expected: &[f64],
) -> Result<ChiSquareResult, MlError> {
    if observed.len() != expected.len() { return Err(MlError::new("Observed and expected must have the same length")); }
    if observed.is_empty() { return Err(MlError::new("Data must be non-empty")); }
    for &e in expected {
        if e <= 0.0 { return Err(MlError::new("Expected frequencies must be positive")); }
    }

    let chi2: f64 = observed.iter().zip(expected.iter()).map(|(o, e)| (o - e) * (o - e) / e).sum();
    let df = (observed.len() - 1) as f64;
    let p_value = 1.0 - chi_squared_cdf(chi2, df);

    Ok(ChiSquareResult { statistic: chi2, p_value, df })
}

pub fn chi_square_independence_impl(
    contingency: &[f64],
    n_rows: usize,
    n_cols: usize,
) -> Result<ChiSquareResult, MlError> {
    if contingency.len() != n_rows * n_cols { return Err(MlError::new("Contingency table size does not match n_rows * n_cols")); }
    if n_rows < 2 || n_cols < 2 { return Err(MlError::new("Contingency table must have at least 2 rows and 2 columns")); }

    let mut row_totals = vec![0.0f64; n_rows];
    let mut col_totals = vec![0.0f64; n_cols];
    let mut grand_total = 0.0f64;

    for i in 0..n_rows {
        for j in 0..n_cols {
            let val = contingency[i * n_cols + j];
            row_totals[i] += val;
            col_totals[j] += val;
            grand_total += val;
        }
    }

    if grand_total <= 0.0 { return Err(MlError::new("Grand total must be positive")); }

    let mut chi2 = 0.0f64;
    for i in 0..n_rows {
        for j in 0..n_cols {
            let observed = contingency[i * n_cols + j];
            let expected = row_totals[i] * col_totals[j] / grand_total;
            if expected > 0.0 { chi2 += (observed - expected) * (observed - expected) / expected; }
        }
    }

    let df = ((n_rows - 1) * (n_cols - 1)) as f64;
    let p_value = 1.0 - chi_squared_cdf(chi2, df);

    Ok(ChiSquareResult { statistic: chi2, p_value, df })
}

// ---------------------------------------------------------------------------
// ANOVA
// ---------------------------------------------------------------------------

pub fn one_way_anova_impl(
    groups: &[f64],
    group_sizes: &[usize],
) -> Result<AnovaResult, MlError> {
    if group_sizes.is_empty() { return Err(MlError::new("Need at least one group")); }
    if group_sizes.len() < 2 { return Err(MlError::new("Need at least 2 groups for ANOVA")); }

    let k = group_sizes.len();
    let total_n: usize = group_sizes.iter().sum();
    if groups.len() != total_n { return Err(MlError::new("Total group sizes must equal length of groups data")); }
    if total_n < k + 1 { return Err(MlError::new("Not enough observations for ANOVA")); }

    let grand_mean = mean(groups);
    let mut between_ss = 0.0f64;
    let mut within_ss = 0.0f64;
    let mut offset = 0;

    for &size in group_sizes {
        if size == 0 { return Err(MlError::new("Group sizes must be positive")); }
        let group = &groups[offset..offset + size];
        let group_mean = mean(group);
        between_ss += size as f64 * (group_mean - grand_mean) * (group_mean - grand_mean);
        for &val in group { within_ss += (val - group_mean) * (val - group_mean); }
        offset += size;
    }

    let between_df = (k - 1) as f64;
    let within_df = (total_n - k) as f64;
    let ms_between = between_ss / between_df;
    let ms_within = within_ss / within_df;
    let f_statistic = ms_between / ms_within;
    let p_value = 1.0 - f_cdf(f_statistic, between_df, within_df);

    Ok(AnovaResult {
        f_statistic, p_value,
        between_groups_ss: between_ss, within_groups_ss: within_ss,
        between_groups_df: between_df, within_groups_df: within_df,
    })
}

// ---------------------------------------------------------------------------
// Confidence intervals
// ---------------------------------------------------------------------------

pub fn confidence_interval_mean_impl(
    data: &[f64],
    alpha: f64,
) -> Result<ConfidenceInterval, MlError> {
    let n = data.len();
    if n < 2 { return Err(MlError::new("Need at least 2 observations")); }
    if alpha <= 0.0 || alpha >= 1.0 { return Err(MlError::new("alpha must be between 0 and 1")); }

    let m = mean(data);
    let s = std_dev(data);
    let se = s / (n as f64).sqrt();
    let df = (n - 1) as f64;
    let t_crit = t_ppf(1.0 - alpha / 2.0, df);

    Ok(ConfidenceInterval { lower: m - t_crit * se, upper: m + t_crit * se, point_estimate: m, std_error: se })
}

pub fn confidence_interval_proportion_impl(
    successes: i64,
    total: i64,
    alpha: f64,
) -> Result<ConfidenceInterval, MlError> {
    if total <= 0 { return Err(MlError::new("Total must be positive")); }
    if successes < 0 || successes > total { return Err(MlError::new("Successes must be between 0 and total")); }
    if alpha <= 0.0 || alpha >= 1.0 { return Err(MlError::new("alpha must be between 0 and 1")); }

    let p_hat = successes as f64 / total as f64;
    let z = normal_ppf(1.0 - alpha / 2.0, 0.0, 1.0);
    let n = total as f64;

    // Wilson score interval
    let denom = 1.0 + z * z / n;
    let center = (p_hat + z * z / (2.0 * n)) / denom;
    let margin = z * (p_hat * (1.0 - p_hat) / n + z * z / (4.0 * n * n)).sqrt() / denom;
    let se = (p_hat * (1.0 - p_hat) / n).sqrt();

    Ok(ConfidenceInterval { lower: center - margin, upper: center + margin, point_estimate: p_hat, std_error: se })
}

// ---------------------------------------------------------------------------
// Descriptive statistics
// ---------------------------------------------------------------------------

pub fn describe_impl(data: &[f64]) -> Result<DescriptiveStats, MlError> {
    let n = data.len();
    if n == 0 { return Err(MlError::new("Data must be non-empty")); }

    let m = mean(data);
    let v = if n < 2 { 0.0 } else { variance(data) };
    let s = v.sqrt();

    let mut sorted = data.to_vec();
    let med = median(&mut sorted);
    let min_val = sorted[0];
    let max_val = sorted[n - 1];

    let skewness = if n < 3 || s < 1e-15 {
        0.0
    } else {
        let m3: f64 = data.iter().map(|x| (x - m).powi(3)).sum::<f64>() / n as f64;
        m3 / s.powi(3)
    };

    let kurtosis = if n < 4 || s < 1e-15 {
        0.0
    } else {
        let m4: f64 = data.iter().map(|x| (x - m).powi(4)).sum::<f64>() / n as f64;
        m4 / s.powi(4) - 3.0
    };

    Ok(DescriptiveStats { mean: m, median: med, std: s, variance: v, min: min_val, max: max_val, skewness, kurtosis, n })
}

// ---------------------------------------------------------------------------
// WASM wrappers
// ---------------------------------------------------------------------------

#[wasm_bindgen(js_name = "tTestOneSample")]
pub fn t_test_one_sample(data: &[f64], hypothesized_mean: f64, alpha: f64) -> Result<TTestResult, JsValue> {
    t_test_one_sample_impl(data, hypothesized_mean, alpha).map_err(|e| JsValue::from_str(&e.message))
}

#[wasm_bindgen(js_name = "tTestTwoSample")]
pub fn t_test_two_sample(data1: &[f64], data2: &[f64], alpha: f64) -> Result<TTestResult, JsValue> {
    t_test_two_sample_impl(data1, data2, alpha).map_err(|e| JsValue::from_str(&e.message))
}

#[wasm_bindgen(js_name = "tTestPaired")]
pub fn t_test_paired(data1: &[f64], data2: &[f64], alpha: f64) -> Result<TTestResult, JsValue> {
    t_test_paired_impl(data1, data2, alpha).map_err(|e| JsValue::from_str(&e.message))
}

#[wasm_bindgen(js_name = "welchTTest")]
pub fn welch_t_test(data1: &[f64], data2: &[f64], alpha: f64) -> Result<TTestResult, JsValue> {
    welch_t_test_impl(data1, data2, alpha).map_err(|e| JsValue::from_str(&e.message))
}

#[wasm_bindgen(js_name = "mannWhitneyU")]
pub fn mann_whitney_u(data1: &[f64], data2: &[f64]) -> Result<MannWhitneyResult, JsValue> {
    mann_whitney_u_impl(data1, data2).map_err(|e| JsValue::from_str(&e.message))
}

#[wasm_bindgen(js_name = "wilcoxonSignedRank")]
pub fn wilcoxon_signed_rank(data1: &[f64], data2: &[f64]) -> Result<MannWhitneyResult, JsValue> {
    wilcoxon_signed_rank_impl(data1, data2).map_err(|e| JsValue::from_str(&e.message))
}

#[wasm_bindgen(js_name = "ksTest")]
pub fn ks_test(data: &[f64]) -> Result<KSTestResult, JsValue> {
    ks_test_impl(data).map_err(|e| JsValue::from_str(&e.message))
}

#[wasm_bindgen(js_name = "chiSquareTest")]
pub fn chi_square_test(observed: &[f64], expected: &[f64]) -> Result<ChiSquareResult, JsValue> {
    chi_square_test_impl(observed, expected).map_err(|e| JsValue::from_str(&e.message))
}

#[wasm_bindgen(js_name = "chiSquareIndependence")]
pub fn chi_square_independence(contingency: &[f64], n_rows: usize, n_cols: usize) -> Result<ChiSquareResult, JsValue> {
    chi_square_independence_impl(contingency, n_rows, n_cols).map_err(|e| JsValue::from_str(&e.message))
}

#[wasm_bindgen(js_name = "oneWayAnova")]
pub fn one_way_anova(groups: &[f64], group_sizes: &[usize]) -> Result<AnovaResult, JsValue> {
    one_way_anova_impl(groups, group_sizes).map_err(|e| JsValue::from_str(&e.message))
}

#[wasm_bindgen(js_name = "confidenceIntervalMean")]
pub fn confidence_interval_mean(data: &[f64], alpha: f64) -> Result<ConfidenceInterval, JsValue> {
    confidence_interval_mean_impl(data, alpha).map_err(|e| JsValue::from_str(&e.message))
}

#[wasm_bindgen(js_name = "confidenceIntervalProportion")]
pub fn confidence_interval_proportion(successes: i64, total: i64, alpha: f64) -> Result<ConfidenceInterval, JsValue> {
    confidence_interval_proportion_impl(successes, total, alpha).map_err(|e| JsValue::from_str(&e.message))
}

#[wasm_bindgen(js_name = "describe")]
pub fn describe(data: &[f64]) -> Result<DescriptiveStats, JsValue> {
    describe_impl(data).map_err(|e| JsValue::from_str(&e.message))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn approx_eq(a: f64, b: f64, tol: f64) -> bool {
        if a.is_nan() && b.is_nan() { return true; }
        (a - b).abs() < tol
    }

    #[test]
    fn test_t_test_one_sample_known() {
        let data = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        let result = t_test_one_sample_impl(&data, 3.0, 0.05).unwrap();
        assert!(approx_eq(result.statistic, 0.0, 1e-10),
            "Expected t=0, got {}", result.statistic);
        assert!(result.p_value > 0.99,
            "Expected p~1, got {}", result.p_value);
        assert!(approx_eq(result.df, 4.0, 1e-10));
        assert!(approx_eq(result.mean_diff, 0.0, 1e-10));
    }

    #[test]
    fn test_t_test_two_sample_identical() {
        let data1 = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        let data2 = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        let result = t_test_two_sample_impl(&data1, &data2, 0.05).unwrap();
        assert!(approx_eq(result.statistic, 0.0, 1e-10),
            "Expected t=0 for identical samples, got {}", result.statistic);
        assert!(result.p_value > 0.99,
            "Expected p~1 for identical samples, got {}", result.p_value);
    }

    #[test]
    fn test_t_test_paired() {
        let data1 = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        let data2 = vec![2.0, 3.0, 4.0, 5.0, 6.0];
        let result = t_test_paired_impl(&data1, &data2, 0.05).unwrap();
        assert!(approx_eq(result.mean_diff, -1.0, 1e-10),
            "Expected mean_diff=-1, got {}", result.mean_diff);
        assert!(approx_eq(result.df, 4.0, 1e-10));
    }

    #[test]
    fn test_mann_whitney_separated() {
        let data1 = vec![1.0, 2.0, 1.5, 2.5, 1.8];
        let data2 = vec![10.0, 11.0, 12.0, 10.5, 11.5];
        let result = mann_whitney_u_impl(&data1, &data2).unwrap();
        assert!(result.p_value < 0.05,
            "Expected p < 0.05 for separated groups, got {}", result.p_value);
        // With perfect separation, min(U1, U2) = 0 which is correct
        assert!(result.u_statistic == 0.0,
            "Expected U=0 for perfectly separated groups, got {}", result.u_statistic);
    }

    #[test]
    fn test_chi_square_good_fit() {
        let observed = vec![10.0, 20.0, 30.0];
        let expected = vec![20.0, 20.0, 20.0];
        let result = chi_square_test_impl(&observed, &expected).unwrap();
        assert!(approx_eq(result.statistic, 10.0, 1e-6),
            "Expected chi2=10, got {}", result.statistic);
        assert!(result.p_value < 0.05,
            "Expected significant p-value, got {}", result.p_value);
        assert!(approx_eq(result.df, 2.0, 1e-10));
    }

    #[test]
    fn test_chi_square_independence_2x2() {
        let contingency = vec![10.0, 20.0, 20.0, 10.0];
        let result = chi_square_independence_impl(&contingency, 2, 2).unwrap();
        assert!(approx_eq(result.statistic, 100.0 / 15.0, 1e-4),
            "Expected chi2=6.667, got {}", result.statistic);
        assert!(approx_eq(result.df, 1.0, 1e-10));
    }

    #[test]
    fn test_anova_different_groups() {
        let group1 = vec![1.0, 2.0, 1.5, 2.5, 1.8];
        let group2 = vec![10.0, 11.0, 10.5, 11.5, 10.2];
        let group3 = vec![20.0, 21.0, 20.5, 19.5, 20.8];
        let mut groups = Vec::new();
        groups.extend_from_slice(&group1);
        groups.extend_from_slice(&group2);
        groups.extend_from_slice(&group3);
        let group_sizes = vec![5, 5, 5];

        let result = one_way_anova_impl(&groups, &group_sizes).unwrap();
        assert!(result.p_value < 0.001,
            "Expected very small p-value, got {}", result.p_value);
        assert!(result.f_statistic > 100.0,
            "Expected large F statistic, got {}", result.f_statistic);
        assert!(approx_eq(result.between_groups_df, 2.0, 1e-10));
        assert!(approx_eq(result.within_groups_df, 12.0, 1e-10));
    }

    #[test]
    fn test_confidence_interval_mean() {
        let data = vec![2.0, 4.0, 6.0, 8.0, 10.0];
        let result = confidence_interval_mean_impl(&data, 0.05).unwrap();
        assert!(approx_eq(result.point_estimate, 6.0, 1e-10),
            "Expected point_estimate=6, got {}", result.point_estimate);
        assert!(result.lower <= 6.0 && result.upper >= 6.0,
            "CI [{}, {}] does not contain mean 6.0", result.lower, result.upper);
        assert!(result.lower < result.upper);
        assert!(result.std_error > 0.0);
    }

    #[test]
    fn test_describe_basic() {
        let data = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        let result = describe_impl(&data).unwrap();
        assert!(approx_eq(result.mean, 3.0, 1e-10),
            "Expected mean=3, got {}", result.mean);
        assert!(approx_eq(result.median, 3.0, 1e-10),
            "Expected median=3, got {}", result.median);
        assert!(approx_eq(result.std, 2.5_f64.sqrt(), 1e-6),
            "Expected std~1.5811, got {}", result.std);
        assert!(approx_eq(result.min, 1.0, 1e-10));
        assert!(approx_eq(result.max, 5.0, 1e-10));
        assert!(approx_eq(result.n as f64, 5.0, 1e-10));
        assert!(result.skewness.abs() < 1e-10,
            "Expected skewness~0 for symmetric data, got {}", result.skewness);
    }

    #[test]
    fn test_ks_test_normal_data() {
        let data = vec![
            -0.5, 0.2, -0.1, 0.8, -0.3, 0.1, -0.7, 0.4, -0.2, 0.6,
            -0.4, 0.3, -0.6, 0.0, -0.8, 0.5, -0.9, 0.7, -0.15, 0.35,
        ];
        let result = ks_test_impl(&data).unwrap();
        assert!(result.p_value > 0.05,
            "Expected p > 0.05 for normal-like data, got p={}", result.p_value);
        assert!(result.statistic >= 0.0 && result.statistic <= 1.0);
    }

    #[test]
    fn test_welch_t_test_different_means() {
        let data1 = vec![1.0, 2.0, 1.5, 2.5, 1.8];
        let data2 = vec![10.0, 12.0, 11.0, 13.0, 10.5];
        let result = welch_t_test_impl(&data1, &data2, 0.05).unwrap();
        assert!(result.p_value < 0.001,
            "Expected small p-value, got {}", result.p_value);
        assert!(result.statistic.abs() > 5.0);
        assert!(result.ci_lower > 0.0 || result.ci_upper < 0.0);
    }

    #[test]
    fn test_confidence_interval_proportion() {
        let result = confidence_interval_proportion_impl(50, 100, 0.05).unwrap();
        assert!(approx_eq(result.point_estimate, 0.5, 1e-10),
            "Expected p_hat=0.5, got {}", result.point_estimate);
        assert!(result.lower > 0.39 && result.lower < 0.41,
            "CI lower out of range: {}", result.lower);
        assert!(result.upper > 0.59 && result.upper < 0.61,
            "CI upper out of range: {}", result.upper);
    }

    #[test]
    fn test_anova_same_groups() {
        let groups = vec![
            1.0, 2.0, 3.0, 4.0, 5.0,
            1.0, 2.0, 3.0, 4.0, 5.0,
            1.0, 2.0, 3.0, 4.0, 5.0,
        ];
        let group_sizes = vec![5, 5, 5];
        let result = one_way_anova_impl(&groups, &group_sizes).unwrap();
        assert!(approx_eq(result.f_statistic, 0.0, 1e-6),
            "Expected F~0 for identical groups, got {}", result.f_statistic);
        assert!(result.p_value > 0.95,
            "Expected p~1 for identical groups, got {}", result.p_value);
    }

    #[test]
    fn test_error_cases() {
        assert!(t_test_one_sample_impl(&[1.0], 0.0, 0.05).is_err());
        assert!(t_test_two_sample_impl(&[1.0], &[2.0, 3.0], 0.05).is_err());
        assert!(t_test_paired_impl(&[1.0, 2.0], &[3.0], 0.05).is_err());
        assert!(describe_impl(&[]).is_err());
        assert!(ks_test_impl(&[1.0]).is_err());
    }
}
