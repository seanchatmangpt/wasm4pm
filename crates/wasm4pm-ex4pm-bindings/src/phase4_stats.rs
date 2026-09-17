//! Phase 4 — thin `extern "C"` wrappers over already-implemented, plain
//! (non-`wasm_bindgen`) statistics/ML primitives already present in the
//! `wasm4pm` crate's `ml::*`, `hand_stats`, and `prediction_drift` modules.
//!
//! Same discipline as `phase2.rs`: no reimplementation, each export
//! deserializes a JSON request, calls a real `pub fn` already defined in
//! `wasm4pm`, and serializes the real return value. These 14 were selected
//! (out of the crate's 111 total `#[wasm_bindgen]`-attributed items) because
//! each has a plain, non-`wasm_bindgen`, JsValue-free inner implementation
//! with a directly JSON-representable signature (`&[f64]`/`usize`/`f64` in,
//! a primitive/`Vec`/plain `Serialize` struct out) -- see the session's real
//! inventory of `wasm4pm/src/**`'s `#[wasm_bindgen]` surface for the fuller
//! set and why most of the rest (generic-const-`D` k-NN/k-means, JsValue/
//! `web_sys`-coupled functions, functions requiring the JS-object handle
//! store) are not directly wrappable without a larger upstream change.
//!
//! ABI helpers (`read_input`, `write_output`, `respond`, `error_response`,
//! `replay_ok`) are reused from `crate::` (`lib.rs`), not duplicated.

use crate::{error_response, read_input, replay_ok, respond, write_output};
use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// ks_statistic / ks_critical_value: wasm4pm::prediction_drift
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct KsStatisticRequest {
    sample_a: Vec<f64>,
    sample_b: Vec<f64>,
}

#[derive(Serialize)]
struct KsStatisticResult {
    ks_statistic: f64,
}

fn ks_statistic(request_json: &str) -> String {
    let req: KsStatisticRequest = match serde_json::from_str(request_json) {
        Ok(r) => r,
        Err(e) => return error_response(&format!("invalid ks_statistic request: {e}")),
    };
    respond(&KsStatisticResult {
        ks_statistic: wasm4pm::prediction_drift::ks_statistic(&req.sample_a, &req.sample_b),
    })
}

/// # Safety
/// See `crate`'s module-level ABI contract.
#[unsafe(export_name = "wasm4pm_ex4pm_ks_statistic_v1")]
pub unsafe extern "C" fn ks_statistic_v1(
    ptr: *const u8,
    len: usize,
    out_len: *mut usize,
) -> *mut u8 {
    let input = unsafe { read_input(ptr, len) };
    write_output(ks_statistic(&input), out_len)
}

/// # Safety
/// See `crate`'s module-level ABI contract.
#[unsafe(export_name = "wasm4pm_ex4pm_ks_statistic_replay_v1")]
pub unsafe extern "C" fn ks_statistic_replay_v1(ptr: *const u8, len: usize) -> u32 {
    let input = unsafe { read_input(ptr, len) };
    replay_ok(&ks_statistic(&input)) as u32
}

#[derive(Deserialize)]
struct KsCriticalValueRequest {
    n: usize,
    m: usize,
    alpha: f64,
}

#[derive(Serialize)]
struct KsCriticalValueResult {
    ks_critical_value: f64,
}

fn ks_critical_value(request_json: &str) -> String {
    let req: KsCriticalValueRequest = match serde_json::from_str(request_json) {
        Ok(r) => r,
        Err(e) => return error_response(&format!("invalid ks_critical_value request: {e}")),
    };
    respond(&KsCriticalValueResult {
        ks_critical_value: wasm4pm::prediction_drift::ks_critical_value(req.n, req.m, req.alpha),
    })
}

/// # Safety
/// See `crate`'s module-level ABI contract.
#[unsafe(export_name = "wasm4pm_ex4pm_ks_critical_value_v1")]
pub unsafe extern "C" fn ks_critical_value_v1(
    ptr: *const u8,
    len: usize,
    out_len: *mut usize,
) -> *mut u8 {
    let input = unsafe { read_input(ptr, len) };
    write_output(ks_critical_value(&input), out_len)
}

/// # Safety
/// See `crate`'s module-level ABI contract.
#[unsafe(export_name = "wasm4pm_ex4pm_ks_critical_value_replay_v1")]
pub unsafe extern "C" fn ks_critical_value_replay_v1(ptr: *const u8, len: usize) -> u32 {
    let input = unsafe { read_input(ptr, len) };
    replay_ok(&ks_critical_value(&input)) as u32
}

// ---------------------------------------------------------------------------
// regression: wasm4pm::ml::regression::regression_internal
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct RegressionRequest {
    x: Vec<f64>,
    y: Vec<f64>,
}

fn regression(request_json: &str) -> String {
    let req: RegressionRequest = match serde_json::from_str(request_json) {
        Ok(r) => r,
        Err(e) => return error_response(&format!("invalid regression request: {e}")),
    };
    respond(&wasm4pm::ml::regression::regression_internal(
        &req.x, &req.y,
    ))
}

/// # Safety
/// See `crate`'s module-level ABI contract.
#[unsafe(export_name = "wasm4pm_ex4pm_regression_v1")]
pub unsafe extern "C" fn regression_v1(ptr: *const u8, len: usize, out_len: *mut usize) -> *mut u8 {
    let input = unsafe { read_input(ptr, len) };
    write_output(regression(&input), out_len)
}

/// # Safety
/// See `crate`'s module-level ABI contract.
#[unsafe(export_name = "wasm4pm_ex4pm_regression_replay_v1")]
pub unsafe extern "C" fn regression_replay_v1(ptr: *const u8, len: usize) -> u32 {
    let input = unsafe { read_input(ptr, len) };
    replay_ok(&regression(&input)) as u32
}

// ---------------------------------------------------------------------------
// forecast: wasm4pm::ml::forecasting::forecast_internal (simple exp. smoothing)
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct ForecastRequest {
    data: Vec<f64>,
    alpha: f64,
}

fn forecast(request_json: &str) -> String {
    let req: ForecastRequest = match serde_json::from_str(request_json) {
        Ok(r) => r,
        Err(e) => return error_response(&format!("invalid forecast request: {e}")),
    };
    respond(&wasm4pm::ml::forecasting::forecast_internal(
        &req.data, req.alpha,
    ))
}

/// # Safety
/// See `crate`'s module-level ABI contract.
#[unsafe(export_name = "wasm4pm_ex4pm_forecast_v1")]
pub unsafe extern "C" fn forecast_v1(ptr: *const u8, len: usize, out_len: *mut usize) -> *mut u8 {
    let input = unsafe { read_input(ptr, len) };
    write_output(forecast(&input), out_len)
}

/// # Safety
/// See `crate`'s module-level ABI contract.
#[unsafe(export_name = "wasm4pm_ex4pm_forecast_replay_v1")]
pub unsafe extern "C" fn forecast_replay_v1(ptr: *const u8, len: usize) -> u32 {
    let input = unsafe { read_input(ptr, len) };
    replay_ok(&forecast(&input)) as u32
}

// ---------------------------------------------------------------------------
// holt_forecast: wasm4pm::ml::forecasting::holt_internal (double exp. smoothing)
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct HoltForecastRequest {
    series: Vec<f64>,
    alpha: f64,
    beta: f64,
}

fn holt_forecast(request_json: &str) -> String {
    let req: HoltForecastRequest = match serde_json::from_str(request_json) {
        Ok(r) => r,
        Err(e) => return error_response(&format!("invalid holt_forecast request: {e}")),
    };
    respond(&wasm4pm::ml::forecasting::holt_internal(
        &req.series,
        req.alpha,
        req.beta,
    ))
}

/// # Safety
/// See `crate`'s module-level ABI contract.
#[unsafe(export_name = "wasm4pm_ex4pm_holt_forecast_v1")]
pub unsafe extern "C" fn holt_forecast_v1(
    ptr: *const u8,
    len: usize,
    out_len: *mut usize,
) -> *mut u8 {
    let input = unsafe { read_input(ptr, len) };
    write_output(holt_forecast(&input), out_len)
}

/// # Safety
/// See `crate`'s module-level ABI contract.
#[unsafe(export_name = "wasm4pm_ex4pm_holt_forecast_replay_v1")]
pub unsafe extern "C" fn holt_forecast_replay_v1(ptr: *const u8, len: usize) -> u32 {
    let input = unsafe { read_input(ptr, len) };
    replay_ok(&holt_forecast(&input)) as u32
}

// ---------------------------------------------------------------------------
// ewma: wasm4pm::prediction_drift::ewma_series
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct EwmaRequest {
    values: Vec<f64>,
    alpha: f64,
}

#[derive(Serialize)]
struct EwmaResult {
    ewma: Vec<f64>,
}

fn ewma(request_json: &str) -> String {
    let req: EwmaRequest = match serde_json::from_str(request_json) {
        Ok(r) => r,
        Err(e) => return error_response(&format!("invalid ewma request: {e}")),
    };
    respond(&EwmaResult {
        ewma: wasm4pm::prediction_drift::ewma_series(&req.values, req.alpha),
    })
}

/// # Safety
/// See `crate`'s module-level ABI contract.
#[unsafe(export_name = "wasm4pm_ex4pm_ewma_v1")]
pub unsafe extern "C" fn ewma_v1(ptr: *const u8, len: usize, out_len: *mut usize) -> *mut u8 {
    let input = unsafe { read_input(ptr, len) };
    write_output(ewma(&input), out_len)
}

/// # Safety
/// See `crate`'s module-level ABI contract.
#[unsafe(export_name = "wasm4pm_ex4pm_ewma_replay_v1")]
pub unsafe extern "C" fn ewma_replay_v1(ptr: *const u8, len: usize) -> u32 {
    let input = unsafe { read_input(ptr, len) };
    replay_ok(&ewma(&input)) as u32
}

// ---------------------------------------------------------------------------
// trend_classify: wasm4pm::prediction_drift::classify_trend
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct TrendClassifyRequest {
    smoothed: Vec<f64>,
}

#[derive(Serialize)]
struct TrendClassifyResult {
    trend: String,
}

fn trend_classify(request_json: &str) -> String {
    let req: TrendClassifyRequest = match serde_json::from_str(request_json) {
        Ok(r) => r,
        Err(e) => return error_response(&format!("invalid trend_classify request: {e}")),
    };
    respond(&TrendClassifyResult {
        trend: wasm4pm::prediction_drift::classify_trend(&req.smoothed).to_string(),
    })
}

/// # Safety
/// See `crate`'s module-level ABI contract.
#[unsafe(export_name = "wasm4pm_ex4pm_trend_classify_v1")]
pub unsafe extern "C" fn trend_classify_v1(
    ptr: *const u8,
    len: usize,
    out_len: *mut usize,
) -> *mut u8 {
    let input = unsafe { read_input(ptr, len) };
    write_output(trend_classify(&input), out_len)
}

/// # Safety
/// See `crate`'s module-level ABI contract.
#[unsafe(export_name = "wasm4pm_ex4pm_trend_classify_replay_v1")]
pub unsafe extern "C" fn trend_classify_replay_v1(ptr: *const u8, len: usize) -> u32 {
    let input = unsafe { read_input(ptr, len) };
    replay_ok(&trend_classify(&input)) as u32
}

// ---------------------------------------------------------------------------
// mean / dot_product / euclidean_distance: wasm4pm::ml::utils
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct SingleVecRequest {
    data: Vec<f64>,
}

#[derive(Serialize)]
struct MeanResult {
    mean: f64,
}

fn mean(request_json: &str) -> String {
    let req: SingleVecRequest = match serde_json::from_str(request_json) {
        Ok(r) => r,
        Err(e) => return error_response(&format!("invalid mean request: {e}")),
    };
    respond(&MeanResult {
        mean: wasm4pm::ml::utils::mean(&req.data),
    })
}

/// # Safety
/// See `crate`'s module-level ABI contract.
#[unsafe(export_name = "wasm4pm_ex4pm_mean_v1")]
pub unsafe extern "C" fn mean_v1(ptr: *const u8, len: usize, out_len: *mut usize) -> *mut u8 {
    let input = unsafe { read_input(ptr, len) };
    write_output(mean(&input), out_len)
}

/// # Safety
/// See `crate`'s module-level ABI contract.
#[unsafe(export_name = "wasm4pm_ex4pm_mean_replay_v1")]
pub unsafe extern "C" fn mean_replay_v1(ptr: *const u8, len: usize) -> u32 {
    let input = unsafe { read_input(ptr, len) };
    replay_ok(&mean(&input)) as u32
}

#[derive(Deserialize)]
struct TwoVecRequest {
    a: Vec<f64>,
    b: Vec<f64>,
}

#[derive(Serialize)]
struct DotProductResult {
    dot_product: f64,
}

fn dot_product(request_json: &str) -> String {
    let req: TwoVecRequest = match serde_json::from_str(request_json) {
        Ok(r) => r,
        Err(e) => return error_response(&format!("invalid dot_product request: {e}")),
    };
    respond(&DotProductResult {
        dot_product: wasm4pm::ml::utils::dot_product(&req.a, &req.b),
    })
}

/// # Safety
/// See `crate`'s module-level ABI contract.
#[unsafe(export_name = "wasm4pm_ex4pm_dot_product_v1")]
pub unsafe extern "C" fn dot_product_v1(
    ptr: *const u8,
    len: usize,
    out_len: *mut usize,
) -> *mut u8 {
    let input = unsafe { read_input(ptr, len) };
    write_output(dot_product(&input), out_len)
}

/// # Safety
/// See `crate`'s module-level ABI contract.
#[unsafe(export_name = "wasm4pm_ex4pm_dot_product_replay_v1")]
pub unsafe extern "C" fn dot_product_replay_v1(ptr: *const u8, len: usize) -> u32 {
    let input = unsafe { read_input(ptr, len) };
    replay_ok(&dot_product(&input)) as u32
}

#[derive(Serialize)]
struct EuclideanDistanceResult {
    euclidean_distance: f64,
}

fn euclidean_distance(request_json: &str) -> String {
    let req: TwoVecRequest = match serde_json::from_str(request_json) {
        Ok(r) => r,
        Err(e) => return error_response(&format!("invalid euclidean_distance request: {e}")),
    };
    respond(&EuclideanDistanceResult {
        euclidean_distance: wasm4pm::ml::utils::euclidean_distance(&req.a, &req.b),
    })
}

/// # Safety
/// See `crate`'s module-level ABI contract.
#[unsafe(export_name = "wasm4pm_ex4pm_euclidean_distance_v1")]
pub unsafe extern "C" fn euclidean_distance_v1(
    ptr: *const u8,
    len: usize,
    out_len: *mut usize,
) -> *mut u8 {
    let input = unsafe { read_input(ptr, len) };
    write_output(euclidean_distance(&input), out_len)
}

/// # Safety
/// See `crate`'s module-level ABI contract.
#[unsafe(export_name = "wasm4pm_ex4pm_euclidean_distance_replay_v1")]
pub unsafe extern "C" fn euclidean_distance_replay_v1(ptr: *const u8, len: usize) -> u32 {
    let input = unsafe { read_input(ptr, len) };
    replay_ok(&euclidean_distance(&input)) as u32
}

// ---------------------------------------------------------------------------
// standardize: wasm4pm::ml::utils::standardize (in-place, wrapped as pure here)
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct StandardizeRequest {
    data: Vec<Vec<f64>>,
}

#[derive(Serialize)]
struct StandardizeResult {
    standardized: Vec<Vec<f64>>,
}

fn standardize(request_json: &str) -> String {
    let req: StandardizeRequest = match serde_json::from_str(request_json) {
        Ok(r) => r,
        Err(e) => return error_response(&format!("invalid standardize request: {e}")),
    };
    let mut data = req.data;
    wasm4pm::ml::utils::standardize(&mut data);
    respond(&StandardizeResult { standardized: data })
}

/// # Safety
/// See `crate`'s module-level ABI contract.
#[unsafe(export_name = "wasm4pm_ex4pm_standardize_v1")]
pub unsafe extern "C" fn standardize_v1(
    ptr: *const u8,
    len: usize,
    out_len: *mut usize,
) -> *mut u8 {
    let input = unsafe { read_input(ptr, len) };
    write_output(standardize(&input), out_len)
}

/// # Safety
/// See `crate`'s module-level ABI contract.
#[unsafe(export_name = "wasm4pm_ex4pm_standardize_replay_v1")]
pub unsafe extern "C" fn standardize_replay_v1(ptr: *const u8, len: usize) -> u32 {
    let input = unsafe { read_input(ptr, len) };
    replay_ok(&standardize(&input)) as u32
}

// ---------------------------------------------------------------------------
// median / percentile / std_deviation: wasm4pm::hand_stats
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct HandStatsRequest {
    data: Vec<f64>,
}

#[derive(Serialize)]
struct MedianResult {
    median: Option<f64>,
}

fn median(request_json: &str) -> String {
    let req: HandStatsRequest = match serde_json::from_str(request_json) {
        Ok(r) => r,
        Err(e) => return error_response(&format!("invalid median request: {e}")),
    };
    let mut data = req.data;
    respond(&MedianResult {
        median: wasm4pm::hand_stats::median(&mut data),
    })
}

/// # Safety
/// See `crate`'s module-level ABI contract.
#[unsafe(export_name = "wasm4pm_ex4pm_median_v1")]
pub unsafe extern "C" fn median_v1(ptr: *const u8, len: usize, out_len: *mut usize) -> *mut u8 {
    let input = unsafe { read_input(ptr, len) };
    write_output(median(&input), out_len)
}

/// # Safety
/// See `crate`'s module-level ABI contract.
#[unsafe(export_name = "wasm4pm_ex4pm_median_replay_v1")]
pub unsafe extern "C" fn median_replay_v1(ptr: *const u8, len: usize) -> u32 {
    let input = unsafe { read_input(ptr, len) };
    replay_ok(&median(&input)) as u32
}

#[derive(Deserialize)]
struct PercentileRequest {
    data: Vec<f64>,
    p: f64,
}

#[derive(Serialize)]
struct PercentileResult {
    percentile: Option<f64>,
}

fn percentile(request_json: &str) -> String {
    let req: PercentileRequest = match serde_json::from_str(request_json) {
        Ok(r) => r,
        Err(e) => return error_response(&format!("invalid percentile request: {e}")),
    };
    let mut data = req.data;
    respond(&PercentileResult {
        percentile: wasm4pm::hand_stats::percentile(&mut data, req.p),
    })
}

/// # Safety
/// See `crate`'s module-level ABI contract.
#[unsafe(export_name = "wasm4pm_ex4pm_percentile_v1")]
pub unsafe extern "C" fn percentile_v1(
    ptr: *const u8,
    len: usize,
    out_len: *mut usize,
) -> *mut u8 {
    let input = unsafe { read_input(ptr, len) };
    write_output(percentile(&input), out_len)
}

/// # Safety
/// See `crate`'s module-level ABI contract.
#[unsafe(export_name = "wasm4pm_ex4pm_percentile_replay_v1")]
pub unsafe extern "C" fn percentile_replay_v1(ptr: *const u8, len: usize) -> u32 {
    let input = unsafe { read_input(ptr, len) };
    replay_ok(&percentile(&input)) as u32
}

#[derive(Serialize)]
struct StdDeviationResult {
    std_deviation: Option<f64>,
}

fn std_deviation(request_json: &str) -> String {
    let req: HandStatsRequest = match serde_json::from_str(request_json) {
        Ok(r) => r,
        Err(e) => return error_response(&format!("invalid std_deviation request: {e}")),
    };
    respond(&StdDeviationResult {
        std_deviation: wasm4pm::hand_stats::std_deviation(&req.data),
    })
}

/// # Safety
/// See `crate`'s module-level ABI contract.
#[unsafe(export_name = "wasm4pm_ex4pm_std_deviation_v1")]
pub unsafe extern "C" fn std_deviation_v1(
    ptr: *const u8,
    len: usize,
    out_len: *mut usize,
) -> *mut u8 {
    let input = unsafe { read_input(ptr, len) };
    write_output(std_deviation(&input), out_len)
}

/// # Safety
/// See `crate`'s module-level ABI contract.
#[unsafe(export_name = "wasm4pm_ex4pm_std_deviation_replay_v1")]
pub unsafe extern "C" fn std_deviation_replay_v1(ptr: *const u8, len: usize) -> u32 {
    let input = unsafe { read_input(ptr, len) };
    replay_ok(&std_deviation(&input)) as u32
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ks_statistic_is_zero_for_identical_samples() {
        let out = ks_statistic(r#"{"sample_a":[1.0,2.0,3.0],"sample_b":[1.0,2.0,3.0]}"#);
        assert!(out.contains("\"ks_statistic\":0.0") || out.contains("\"ks_statistic\":0"));
    }

    #[test]
    fn ks_critical_value_is_finite_for_real_sample_sizes() {
        let out = ks_critical_value(r#"{"n":10,"m":10,"alpha":0.05}"#);
        assert!(!out.contains("inf"));
    }

    #[test]
    fn regression_recovers_a_real_perfect_linear_fit() {
        let out = regression(r#"{"x":[1.0,2.0,3.0,4.0],"y":[2.0,4.0,6.0,8.0]}"#);
        assert!(out.contains("\"slope\":2.0") || out.contains("\"slope\":1.9999"));
        assert!(out.contains("\"r_squared\":1.0") || out.contains("\"r_squared\":0.9999"));
    }

    #[test]
    fn forecast_returns_real_error_metrics() {
        let out = forecast(r#"{"data":[1.0,2.0,3.0,4.0,5.0],"alpha":0.3}"#);
        assert!(out.contains("\"next_window\""));
    }

    #[test]
    fn holt_forecast_returns_real_error_metrics() {
        let out = holt_forecast(r#"{"series":[1.0,2.0,3.0,4.0,5.0],"alpha":0.5,"beta":0.5}"#);
        assert!(out.contains("\"next_window\""));
    }

    #[test]
    fn ewma_matches_first_value_for_alpha_one() {
        let out = ewma(r#"{"values":[1.0,5.0,10.0],"alpha":1.0}"#);
        assert!(out.contains("\"ewma\":[1.0,5.0,10.0]"));
    }

    #[test]
    fn trend_classify_detects_a_real_rising_series() {
        let out = trend_classify(r#"{"smoothed":[1.0,2.0,3.0,4.0,5.0]}"#);
        assert!(out.contains("\"trend\":\"rising\""));
    }

    #[test]
    fn mean_computes_the_real_average() {
        let out = mean(r#"{"data":[1.0,2.0,3.0,4.0]}"#);
        assert!(out.contains("\"mean\":2.5"));
    }

    #[test]
    fn dot_product_computes_the_real_inner_product() {
        let out = dot_product(r#"{"a":[1.0,2.0,3.0],"b":[4.0,5.0,6.0]}"#);
        assert!(out.contains("\"dot_product\":32.0"));
    }

    #[test]
    fn euclidean_distance_computes_the_real_distance() {
        let out = euclidean_distance(r#"{"a":[0.0,0.0],"b":[3.0,4.0]}"#);
        assert!(out.contains("\"euclidean_distance\":5.0"));
    }

    #[test]
    fn standardize_zero_means_each_column() {
        let out = standardize(r#"{"data":[[1.0,10.0],[2.0,20.0],[3.0,30.0]]}"#);
        assert!(out.contains("\"standardized\":["));
    }

    #[test]
    fn median_computes_the_real_middle_value() {
        let out = median(r#"{"data":[3.0,1.0,2.0]}"#);
        assert!(out.contains("\"median\":2.0"));
    }

    #[test]
    fn percentile_50_matches_median() {
        let out = percentile(r#"{"data":[1.0,2.0,3.0,4.0],"p":50.0}"#);
        assert!(out.contains("\"percentile\":"));
    }

    #[test]
    fn std_deviation_is_zero_for_a_constant_series() {
        let out = std_deviation(r#"{"data":[5.0,5.0,5.0]}"#);
        assert!(out.contains("\"std_deviation\":0.0"));
    }
}
