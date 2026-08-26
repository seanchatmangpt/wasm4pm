//! Phase 2 — thin `extern "C"` wrappers over already-implemented wasm4pm
//! workspace algorithms.
//!
//! Per the user's directive ("the math should already be implemented in
//! ~/wasm4pm"), this module does not reimplement anything: each export
//! deserializes a JSON request, calls a real pure-Rust function or method
//! already present in `miniml` (survival, markov, bayesian), `ocpq`
//! (object-centric process querying), or `wasm4pm-cognition` (STRIPS/HTN
//! planning, CTL model checking, Allen's interval algebra — via the shared
//! `CognitionBreed::run` trait), and serializes the real return value. The
//! ABI helpers (`read_input`, `write_output`, `respond`, `error_response`,
//! `replay_ok`) are reused from `crate::` (Phase 1's `lib.rs`), not
//! duplicated.
//!
//! Scope note: 7 of the original 15 Phase-2 candidates are NOT bound here —
//! `align`/`etc_precision`/`soundness`/`playout`/`oc_discover`/
//! `causal_footprint` (the `wasm4pm` main crate) expose their algorithms
//! only through `#[wasm_bindgen]` functions built around an internal
//! JsValue/object-handle store, which requires a JS host (Node, browser) to
//! satisfy `wasm-bindgen`'s import ABI — incompatible with the raw
//! ptr/len `extern "C"` + Wasmtime/Wasmex host this crate targets, the same
//! way `wasm4pm-cmca`'s own CI job resorts to `wasm-pack build --target
//! nodejs` + `node` rather than a raw Wasmtime call. Binding them requires
//! either running through Node (breaking the raw-ABI symmetry with Phase 1)
//! or a small upstream visibility change (exposing the pure, JsValue-free
//! helper functions those `#[wasm_bindgen]` functions already call
//! internally, e.g. `compute_trace_alignment` in `alignments.rs`) — a real,
//! named, follow-on task, not silently dropped. `prolog_query` (`prolog8`)
//! is also deferred: its `Kernel`/`Catalog`/`Rule8`/`QueryAtom8`/
//! `FactBlock8` types don't derive `Serialize`/`Deserialize` and require a
//! predicate-catalog registration step before any fact/rule/query can be
//! admitted — real integration work beyond a thin wrapper, not a blocker in
//! the JsValue sense, just out of scope for this pass.

use serde::{Deserialize, Serialize};
use wasm4pm_cognition::breeds::{
    allen_temporal::AllenTemporal, ctl_check::CtlCheck, htn_planning::HtnPlanning,
    strips::Strips, BreedInput, CognitionBreed,
};

// ---------------------------------------------------------------------------
// survival: miniml::kaplan_meier_impl
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct SurvivalRequest {
    times: Vec<f64>,
    events: Vec<f64>,
}

#[derive(Serialize)]
struct SurvivalResult {
    times: Vec<f64>,
    survival: Vec<f64>,
    ci_lower: Vec<f64>,
    ci_upper: Vec<f64>,
    median_survival: f64,
    n_at_risk: Vec<f64>,
}

fn survival(request_json: &str) -> String {
    let req: SurvivalRequest = match serde_json::from_str(request_json) {
        Ok(r) => r,
        Err(e) => return crate::error_response(&format!("invalid survival request: {e}")),
    };

    match miniml::kaplan_meier_impl(&req.times, &req.events) {
        Ok(r) => crate::respond(&SurvivalResult {
            times: r.times,
            survival: r.survival,
            ci_lower: r.ci_lower,
            ci_upper: r.ci_upper,
            median_survival: r.median_survival,
            n_at_risk: r.n_at_risk,
        }),
        Err(e) => crate::error_response(&e.message),
    }
}

/// # Safety
/// See `crate`'s module-level ABI contract (`read_input`/`write_output`).
#[unsafe(export_name = "wasm4pm_ex4pm_survival_v1")]
pub unsafe extern "C" fn survival_v1(
    ptr: *const u8,
    len: usize,
    out_len: *mut usize,
) -> *mut u8 {
    let input = unsafe { crate::read_input(ptr, len) };
    crate::write_output(survival(&input), out_len)
}

/// # Safety
/// See `crate`'s module-level ABI contract.
#[unsafe(export_name = "wasm4pm_ex4pm_survival_replay_v1")]
pub unsafe extern "C" fn survival_replay_v1(ptr: *const u8, len: usize) -> u32 {
    let input = unsafe { crate::read_input(ptr, len) };
    crate::replay_ok(&survival(&input)) as u32
}

// ---------------------------------------------------------------------------
// markov: miniml::compute_steady_state_impl
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct MarkovRequest {
    transition_matrix: Vec<f64>,
    n_states: usize,
    max_iter: usize,
    tol: f64,
}

#[derive(Serialize)]
struct MarkovResult {
    steady_state: Vec<f64>,
}

fn markov(request_json: &str) -> String {
    let req: MarkovRequest = match serde_json::from_str(request_json) {
        Ok(r) => r,
        Err(e) => return crate::error_response(&format!("invalid markov request: {e}")),
    };

    match miniml::compute_steady_state_impl(
        &req.transition_matrix,
        req.n_states,
        req.max_iter,
        req.tol,
    ) {
        Ok(steady_state) => crate::respond(&MarkovResult { steady_state }),
        Err(e) => crate::error_response(&e.message),
    }
}

/// # Safety
/// See `crate`'s module-level ABI contract.
#[unsafe(export_name = "wasm4pm_ex4pm_markov_v1")]
pub unsafe extern "C" fn markov_v1(ptr: *const u8, len: usize, out_len: *mut usize) -> *mut u8 {
    let input = unsafe { crate::read_input(ptr, len) };
    crate::write_output(markov(&input), out_len)
}

/// # Safety
/// See `crate`'s module-level ABI contract.
#[unsafe(export_name = "wasm4pm_ex4pm_markov_replay_v1")]
pub unsafe extern "C" fn markov_replay_v1(ptr: *const u8, len: usize) -> u32 {
    let input = unsafe { crate::read_input(ptr, len) };
    crate::replay_ok(&markov(&input)) as u32
}

// ---------------------------------------------------------------------------
// bayesian: miniml::bayesian_linear_regression_impl
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct BayesianRequest {
    data: Vec<f64>,
    n_features: usize,
    targets: Vec<f64>,
    #[serde(default = "default_prior_precision")]
    prior_precision: f64,
    #[serde(default = "default_prior_alpha")]
    prior_alpha: f64,
    #[serde(default = "default_prior_beta")]
    prior_beta: f64,
}

fn default_prior_precision() -> f64 {
    1.0
}
fn default_prior_alpha() -> f64 {
    1.0
}
fn default_prior_beta() -> f64 {
    1.0
}

#[derive(Serialize)]
struct BayesianResult {
    coefficients: Vec<f64>,
    coefficient_std: Vec<f64>,
    intercept: f64,
    intercept_std: f64,
}

fn bayesian(request_json: &str) -> String {
    let req: BayesianRequest = match serde_json::from_str(request_json) {
        Ok(r) => r,
        Err(e) => return crate::error_response(&format!("invalid bayesian request: {e}")),
    };

    match miniml::bayesian_linear_regression_impl(
        &req.data,
        req.n_features,
        &req.targets,
        req.prior_precision,
        req.prior_alpha,
        req.prior_beta,
    ) {
        Ok(model) => crate::respond(&BayesianResult {
            coefficients: model.coefficients(),
            coefficient_std: model.coefficient_std(),
            intercept: model.intercept(),
            intercept_std: model.intercept_std(),
        }),
        Err(e) => crate::error_response(&e.message),
    }
}

/// # Safety
/// See `crate`'s module-level ABI contract.
#[unsafe(export_name = "wasm4pm_ex4pm_bayesian_v1")]
pub unsafe extern "C" fn bayesian_v1(ptr: *const u8, len: usize, out_len: *mut usize) -> *mut u8 {
    let input = unsafe { crate::read_input(ptr, len) };
    crate::write_output(bayesian(&input), out_len)
}

/// # Safety
/// See `crate`'s module-level ABI contract.
#[unsafe(export_name = "wasm4pm_ex4pm_bayesian_replay_v1")]
pub unsafe extern "C" fn bayesian_replay_v1(ptr: *const u8, len: usize) -> u32 {
    let input = unsafe { crate::read_input(ptr, len) };
    crate::replay_ok(&bayesian(&input)) as u32
}

// ---------------------------------------------------------------------------
// ocpq_eval: ocpq::ocpq_eval_json — already a JSON-in/JSON-out pure function
// ---------------------------------------------------------------------------

fn ocpq_eval(request_json: &str) -> String {
    #[derive(Deserialize)]
    struct OcpqRequest {
        query: serde_json::Value,
        ocel: serde_json::Value,
    }

    let req: OcpqRequest = match serde_json::from_str(request_json) {
        Ok(r) => r,
        Err(e) => return crate::error_response(&format!("invalid ocpq_eval request: {e}")),
    };

    let query_json = req.query.to_string();
    let ocel_json = req.ocel.to_string();

    match ocpq::ocpq_eval_json(&query_json, &ocel_json) {
        Ok(result_json) => {
            let result: serde_json::Value =
                serde_json::from_str(&result_json).unwrap_or(serde_json::Value::Null);
            crate::respond(&result)
        }
        Err(e) => crate::error_response(&e),
    }
}

/// # Safety
/// See `crate`'s module-level ABI contract.
#[unsafe(export_name = "wasm4pm_ex4pm_ocpq_eval_v1")]
pub unsafe extern "C" fn ocpq_eval_v1(
    ptr: *const u8,
    len: usize,
    out_len: *mut usize,
) -> *mut u8 {
    let input = unsafe { crate::read_input(ptr, len) };
    crate::write_output(ocpq_eval(&input), out_len)
}

/// # Safety
/// See `crate`'s module-level ABI contract.
#[unsafe(export_name = "wasm4pm_ex4pm_ocpq_eval_replay_v1")]
pub unsafe extern "C" fn ocpq_eval_replay_v1(ptr: *const u8, len: usize) -> u32 {
    let input = unsafe { crate::read_input(ptr, len) };
    crate::replay_ok(&ocpq_eval(&input)) as u32
}

// ---------------------------------------------------------------------------
// Cognition breeds: STRIPS / HTN / CTL / Allen — share one BreedInput/Output
// marshaling layer since all four implement the same CognitionBreed trait.
// ---------------------------------------------------------------------------

fn run_breed(breed: &dyn CognitionBreed, request_json: &str) -> String {
    let input: BreedInput = match serde_json::from_str(request_json) {
        Ok(r) => r,
        Err(e) => return crate::error_response(&format!("invalid breed input: {e}")),
    };

    match breed.run(&input) {
        Ok(output) => crate::respond(&output),
        Err(e) => crate::error_response(&e.message),
    }
}

fn strips_plan(request_json: &str) -> String {
    run_breed(&Strips, request_json)
}

/// # Safety
/// See `crate`'s module-level ABI contract.
#[unsafe(export_name = "wasm4pm_ex4pm_strips_plan_v1")]
pub unsafe extern "C" fn strips_plan_v1(
    ptr: *const u8,
    len: usize,
    out_len: *mut usize,
) -> *mut u8 {
    let input = unsafe { crate::read_input(ptr, len) };
    crate::write_output(strips_plan(&input), out_len)
}

/// # Safety
/// See `crate`'s module-level ABI contract.
#[unsafe(export_name = "wasm4pm_ex4pm_strips_plan_replay_v1")]
pub unsafe extern "C" fn strips_plan_replay_v1(ptr: *const u8, len: usize) -> u32 {
    let input = unsafe { crate::read_input(ptr, len) };
    crate::replay_ok(&strips_plan(&input)) as u32
}

fn htn_plan(request_json: &str) -> String {
    run_breed(&HtnPlanning, request_json)
}

/// # Safety
/// See `crate`'s module-level ABI contract.
#[unsafe(export_name = "wasm4pm_ex4pm_htn_plan_v1")]
pub unsafe extern "C" fn htn_plan_v1(
    ptr: *const u8,
    len: usize,
    out_len: *mut usize,
) -> *mut u8 {
    let input = unsafe { crate::read_input(ptr, len) };
    crate::write_output(htn_plan(&input), out_len)
}

/// # Safety
/// See `crate`'s module-level ABI contract.
#[unsafe(export_name = "wasm4pm_ex4pm_htn_plan_replay_v1")]
pub unsafe extern "C" fn htn_plan_replay_v1(ptr: *const u8, len: usize) -> u32 {
    let input = unsafe { crate::read_input(ptr, len) };
    crate::replay_ok(&htn_plan(&input)) as u32
}

fn ctl_check(request_json: &str) -> String {
    run_breed(&CtlCheck, request_json)
}

/// # Safety
/// See `crate`'s module-level ABI contract.
#[unsafe(export_name = "wasm4pm_ex4pm_ctl_check_v1")]
pub unsafe extern "C" fn ctl_check_v1(
    ptr: *const u8,
    len: usize,
    out_len: *mut usize,
) -> *mut u8 {
    let input = unsafe { crate::read_input(ptr, len) };
    crate::write_output(ctl_check(&input), out_len)
}

/// # Safety
/// See `crate`'s module-level ABI contract.
#[unsafe(export_name = "wasm4pm_ex4pm_ctl_check_replay_v1")]
pub unsafe extern "C" fn ctl_check_replay_v1(ptr: *const u8, len: usize) -> u32 {
    let input = unsafe { crate::read_input(ptr, len) };
    crate::replay_ok(&ctl_check(&input)) as u32
}

fn allen_temporal(request_json: &str) -> String {
    run_breed(&AllenTemporal, request_json)
}

/// # Safety
/// See `crate`'s module-level ABI contract.
#[unsafe(export_name = "wasm4pm_ex4pm_allen_temporal_v1")]
pub unsafe extern "C" fn allen_temporal_v1(
    ptr: *const u8,
    len: usize,
    out_len: *mut usize,
) -> *mut u8 {
    let input = unsafe { crate::read_input(ptr, len) };
    crate::write_output(allen_temporal(&input), out_len)
}

/// # Safety
/// See `crate`'s module-level ABI contract.
#[unsafe(export_name = "wasm4pm_ex4pm_allen_temporal_replay_v1")]
pub unsafe extern "C" fn allen_temporal_replay_v1(ptr: *const u8, len: usize) -> u32 {
    let input = unsafe { crate::read_input(ptr, len) };
    crate::replay_ok(&allen_temporal(&input)) as u32
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn survival_computes_a_real_kaplan_meier_curve() {
        let out = survival(r#"{"times":[1.0,2.0,3.0,4.0],"events":[1.0,1.0,0.0,1.0]}"#);
        assert!(out.contains("\"survival\":["));
        assert!(out.contains("\"median_survival\":"));
    }

    #[test]
    fn markov_computes_a_real_steady_state() {
        let out = markov(
            r#"{"transition_matrix":[0.5,0.5,0.5,0.5],"n_states":2,"max_iter":100,"tol":1e-9}"#,
        );
        assert!(out.contains("\"steady_state\":[0.5,0.5]"));
    }

    #[test]
    fn bayesian_fits_a_real_linear_regression() {
        let out = bayesian(
            r#"{"data":[1.0,2.0,3.0,4.0],"n_features":1,"targets":[2.0,4.0,6.0,8.0]}"#,
        );
        assert!(out.contains("\"coefficients\":["));
    }

    #[test]
    fn ocpq_eval_runs_the_real_query_evaluator_on_an_empty_log() {
        let out = ocpq_eval(
            r#"{"query":{"root":"n0","nodes":[{"id":"n0","box":{}}]},"ocel":{"objectTypes":[],"eventTypes":[],"objects":[],"events":[]}}"#,
        );
        assert!(!out.contains("\"error\""), "unexpected error: {out}");
    }

    #[test]
    fn strips_plan_produces_a_real_inference_trace() {
        let out = strips_plan(r#"{"intent":"test","candidates":[],"facts":[],"cases":[],"rules":[],"goals":[],"state":[]}"#);
        assert!(out.contains("\"breed\""));
    }

    #[test]
    fn htn_plan_produces_a_real_inference_trace() {
        let out = htn_plan(r#"{"intent":"test","candidates":[],"facts":[],"cases":[],"rules":[],"goals":[],"state":[]}"#);
        assert!(out.contains("\"breed\""));
    }

    #[test]
    fn ctl_check_produces_a_real_inference_trace() {
        let out = ctl_check(
            r#"{"intent":"test","candidates":[],"cases":[],"rules":[],"goals":[],"state":[],
                "facts":[
                  {"key":"ts:init","value":"s0"},
                  {"key":"ts:edge:s0","value":"s1"},
                  {"key":"ts:edge:s1","value":"s1"},
                  {"key":"ts:label:s1","value":"done"},
                  {"key":"ctl:formula","value":"E F done"}
                ]}"#,
        );
        assert!(out.contains("\"breed\""), "unexpected: {out}");
    }

    #[test]
    fn allen_temporal_produces_a_real_inference_trace() {
        let out = allen_temporal(r#"{"intent":"test","candidates":[],"facts":[],"cases":[],"rules":[],"goals":[],"state":[]}"#);
        assert!(out.contains("\"breed\""));
    }
}
