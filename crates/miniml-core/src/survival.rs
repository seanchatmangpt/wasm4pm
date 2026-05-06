//! Survival analysis algorithms.
//!
//! Kaplan-Meier estimator and Cox proportional hazards model.

use wasm_bindgen::prelude::*;
use crate::error::MlError;

/// Kaplan-Meier survival curve estimate.
#[derive(Debug, Clone)]
pub struct KaplanMeierResult {
    pub times: Vec<f64>,
    pub survival: Vec<f64>,
    pub ci_lower: Vec<f64>,
    pub ci_upper: Vec<f64>,
    pub median_survival: f64,
    pub n_at_risk: Vec<f64>,
}

/// Cox proportional hazards model result.
#[derive(Debug, Clone)]
pub struct CoxResult {
    pub coefficients: Vec<f64>,
    pub hazard_ratios: Vec<f64>,
    pub log_likelihood: f64,
    pub n_features: usize,
}

pub fn kaplan_meier_impl(times: &[f64], events: &[f64]) -> Result<KaplanMeierResult, MlError> {
    if times.is_empty() { return Err(MlError::new("times must not be empty")); }
    if times.len() != events.len() { return Err(MlError::new("times and events must have the same length")); }
    let n = times.len();
    let mut pairs: Vec<(f64, f64)> = times.iter().zip(events.iter()).map(|(&t, &e)| (t, e)).collect();
    pairs.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));
    let mut event_times: Vec<f64> = Vec::new();
    let mut n_at_risk_vals: Vec<f64> = Vec::new();
    let mut n_events: Vec<usize> = Vec::new();
    let mut i = 0;
    while i < n {
        let t = pairs[i].0;
        let mut d = 0usize;
        let mut j = i;
        while j < n && (pairs[j].0 - t).abs() < 1e-10 { if pairs[j].1 > 0.5 { d += 1; } j += 1; }
        if d > 0 { event_times.push(t); n_at_risk_vals.push((n - i) as f64); n_events.push(d); }
        i = j;
    }
    if event_times.is_empty() {
        return Ok(KaplanMeierResult { times: vec![], survival: vec![], ci_lower: vec![], ci_upper: vec![], median_survival: f64::NAN, n_at_risk: vec![] });
    }
    let mut survival_probs = Vec::with_capacity(event_times.len());
    let mut var_log_s = Vec::with_capacity(event_times.len());
    let mut s = 1.0;
    let mut cum_var = 0.0;
    for k in 0..event_times.len() {
        let ni = n_at_risk_vals[k]; let di = n_events[k] as f64;
        s *= (ni - di) / ni; survival_probs.push(s);
        if ni - di > 0.0 { cum_var += di / (ni * (ni - di)); }
        var_log_s.push(cum_var);
    }
    let z = 1.96;
    let mut ci_lower = Vec::with_capacity(event_times.len());
    let mut ci_upper = Vec::with_capacity(event_times.len());
    for k in 0..event_times.len() {
        let log_s = if survival_probs[k] > 0.0 { survival_probs[k].ln() } else { f64::NEG_INFINITY };
        let se = var_log_s[k].sqrt();
        ci_lower.push((log_s - z * se).exp().max(0.0).min(1.0));
        ci_upper.push((log_s + z * se).exp().max(0.0).min(1.0));
    }
    let median_survival = survival_probs.iter().position(|&sp| sp <= 0.5).map(|idx| event_times[idx]).unwrap_or(f64::NAN);
    Ok(KaplanMeierResult { times: event_times, survival: survival_probs, ci_lower, ci_upper, median_survival, n_at_risk: n_at_risk_vals })
}

#[wasm_bindgen(js_name = "kaplanMeier")]
pub fn kaplan_meier(times: &[f64], events: &[f64]) -> Result<JsValue, JsValue> {
    let result = kaplan_meier_impl(times, events).map_err(|e| JsValue::from_str(&e.message))?;
    let mut out = vec![result.median_survival, result.times.len() as f64];
    for k in 0..result.times.len() { out.push(result.times[k]); out.push(result.survival[k]); out.push(result.ci_lower[k]); out.push(result.ci_upper[k]); out.push(result.n_at_risk[k]); }
    Ok(JsValue::from(out))
}

pub fn cox_proportional_hazards_impl(features: &[f64], n_features: usize, times: &[f64], events: &[f64], max_iter: usize, lr: f64) -> Result<CoxResult, MlError> {
    if features.is_empty() || n_features == 0 { return Err(MlError::new("features must not be empty and n_features must be > 0")); }
    if features.len() % n_features != 0 { return Err(MlError::new("features length must be divisible by n_features")); }
    if times.len() != events.len() { return Err(MlError::new("times and events must have the same length")); }
    let n_samples = features.len() / n_features;
    if times.len() != n_samples { return Err(MlError::new("features, times, and events must have the same sample count")); }
    if max_iter == 0 { return Err(MlError::new("max_iter must be > 0")); }
    let mut indices: Vec<usize> = (0..n_samples).collect();
    indices.sort_by(|&a, &b| times[a].partial_cmp(&times[b]).unwrap_or(std::cmp::Ordering::Equal));
    let mut beta = vec![0.0; n_features];
    let mut prev_ll = f64::NEG_INFINITY;
    let mut final_ll = f64::NEG_INFINITY;
    for _iter in 0..max_iter {
        let mut eta = vec![0.0; n_samples];
        for i in 0..n_samples { for j in 0..n_features { eta[i] += beta[j] * features[i * n_features + j]; } }
        let mut log_likelihood = 0.0;
        let mut gradient = vec![0.0; n_features];
        let mut i = 0;
        while i < n_samples {
            let idx = indices[i]; let t = times[idx];
            let mut at_risk: Vec<usize> = Vec::new(); let mut event_indices: Vec<usize> = Vec::new();
            let mut j = i;
            while j < n_samples && (times[indices[j]] - t).abs() < 1e-10 { at_risk.push(indices[j]); if events[indices[j]] > 0.5 { event_indices.push(indices[j]); } j += 1; }
            for k in j..n_samples { at_risk.push(indices[k]); }
            if event_indices.is_empty() { i = j; continue; }
            let mut sum_exp = 0.0;
            for &ar_idx in &at_risk { sum_exp += eta[ar_idx].exp(); }
            if sum_exp < 1e-30 { i = j; continue; }
            for &ei in &event_indices {
                log_likelihood += eta[ei] - sum_exp.ln();
                for p in 0..n_features {
                    let xp = features[ei * n_features + p]; gradient[p] += xp;
                    let mut ws = 0.0;
                    for &ar_idx in &at_risk { ws += eta[ar_idx].exp() * features[ar_idx * n_features + p]; }
                    gradient[p] -= ws / sum_exp;
                }
            }
            i = j;
        }
        if (log_likelihood - prev_ll).abs() < 1e-8 { final_ll = log_likelihood; break; }
        prev_ll = log_likelihood; final_ll = log_likelihood;
        for j in 0..n_features { beta[j] += lr * gradient[j]; }
    }
    let hazard_ratios: Vec<f64> = beta.iter().map(|b| b.exp()).collect();
    Ok(CoxResult { coefficients: beta, hazard_ratios, log_likelihood: final_ll, n_features })
}

#[wasm_bindgen(js_name = "coxProportionalHazards")]
pub fn cox_proportional_hazards(features: &[f64], n_features: usize, times: &[f64], events: &[f64], max_iter: usize, lr: f64) -> Result<JsValue, JsValue> {
    let result = cox_proportional_hazards_impl(features, n_features, times, events, max_iter, lr).map_err(|e| JsValue::from_str(&e.message))?;
    let mut out = vec![result.n_features as f64, result.log_likelihood]; out.extend(&result.coefficients); out.extend(&result.hazard_ratios);
    Ok(JsValue::from(out))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn test_kaplan_meier_simple() {
        let times = vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0];
        let events = vec![1.0, 1.0, 1.0, 0.0, 1.0, 0.0, 1.0, 0.0, 1.0, 0.0];
        let result = kaplan_meier_impl(&times, &events).unwrap();
        assert_eq!(result.times.len(), 6);
        assert!(result.survival[0] < 1.0);
        for i in 1..result.survival.len() { assert!(result.survival[i] <= result.survival[i - 1] + 1e-10); }
        for i in 0..result.times.len() { assert!(result.ci_lower[i] >= 0.0 && result.ci_upper[i] <= 1.0); }
    }
    #[test]
    fn test_kaplan_meier_all_events() {
        let times = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        let events = vec![1.0, 1.0, 1.0, 1.0, 1.0];
        let result = kaplan_meier_impl(&times, &events).unwrap();
        assert!((result.survival[4]).abs() < 1e-10);
        assert!(!result.median_survival.is_nan());
    }
    #[test]
    fn test_kaplan_meier_all_censored() {
        let result = kaplan_meier_impl(&[1.0, 2.0, 3.0], &[0.0, 0.0, 0.0]).unwrap();
        assert!(result.times.is_empty());
        assert!(result.median_survival.is_nan());
    }
    #[test]
    fn test_kaplan_meier_errors() {
        assert!(kaplan_meier_impl(&[], &[1.0]).is_err());
        assert!(kaplan_meier_impl(&[1.0, 2.0], &[1.0]).is_err());
    }
    #[test]
    fn test_cox_simulated() {
        // Higher feature value = longer survival => negative coefficient (protective factor)
        let features = vec![5.0, 4.0, 3.0, 2.0, 1.0];
        let times = vec![10.0, 8.0, 6.0, 4.0, 2.0];
        let events = vec![1.0, 1.0, 1.0, 1.0, 1.0];
        let result = cox_proportional_hazards_impl(&features, 1, &times, &events, 10000, 0.001).unwrap();
        assert!(result.coefficients[0] < 0.0, "Expected negative coefficient, got {}", result.coefficients[0]);
        assert!(result.hazard_ratios[0] < 1.0, "Expected HR < 1, got {}", result.hazard_ratios[0]);
    }
    #[test]
    fn test_cox_errors() {
        let f = vec![1.0, 2.0]; let t = vec![1.0, 2.0]; let e = vec![1.0, 1.0];
        assert!(cox_proportional_hazards_impl(&[], 1, &t, &e, 100, 0.01).is_err());
        assert!(cox_proportional_hazards_impl(&f, 0, &t, &e, 100, 0.01).is_err());
        assert!(cox_proportional_hazards_impl(&f, 1, &t, &e, 0, 0.01).is_err());
    }
}
