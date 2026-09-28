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
//! Scope note (Phase 3 update): of the original 15 Phase-2 candidates, only
//! `causal_footprint` remains unbound in THIS crate. `align`
//! (`wasm4pm::alignments::compute_trace_alignment`, made `pub` upstream —
//! a one-line visibility change, no other code moved),
//! `etc_precision` (`wasm4pm::etconformance_precision::compute_precision`,
//! already `pub` and JsValue-free — the original deferral note was
//! mistaken about this one), `soundness`
//! (`wasm4pm::soundness::analyze_petri_net`, already `pub`), `playout`
//! (`wasm4pm::petri_net_playout::play_petri_net`, already `pub`, see
//! `phase2_playout.rs`), and `oc_discover`
//! (`wasm4pm::oc_petri_net::discover_oc_petri_net_pure`, already `pub`) are
//! now all bound below/in sibling files, each calling a real, JsValue-free
//! pure function directly — no reimplementation, matching the rest of this
//! module's discipline. `prolog_query` is bound too, in `prolog.rs` (see
//! that file's module doc for the variable-encoding design note).
//!
//! `causal_footprint` remains genuinely deferred: `wasm4pm::causal`'s
//! `causal_footprint`/`granger_like_test` open by calling
//! `get_or_init_state().with_event_log(log_handle, ...)` — the JsValue/
//! object-handle store — before doing any pure computation, and `causal`
//! is not even `pub mod`-exported from `wasm4pm`'s crate root today.
//! Unblocking it needs a real upstream change (extracting a
//! `causal_footprint_pure(traces: &[Trace], activity_key: &str) -> ...`
//! free function out of the handle-coupled body, then `pub mod causal;`),
//! which is a larger, more invasive edit than the one-line visibility
//! flips the other five needed — left as named follow-on work, not
//! silently dropped.

use serde::{Deserialize, Serialize};
use wasm4pm_cognition::breeds::{
    allen_temporal::AllenTemporal, ctl_check::CtlCheck, htn_planning::HtnPlanning, strips::Strips,
    BreedInput, CognitionBreed,
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
pub unsafe extern "C" fn survival_v1(ptr: *const u8, len: usize, out_len: *mut usize) -> *mut u8 {
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
pub unsafe extern "C" fn ocpq_eval_v1(ptr: *const u8, len: usize, out_len: *mut usize) -> *mut u8 {
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
pub unsafe extern "C" fn htn_plan_v1(ptr: *const u8, len: usize, out_len: *mut usize) -> *mut u8 {
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
pub unsafe extern "C" fn ctl_check_v1(ptr: *const u8, len: usize, out_len: *mut usize) -> *mut u8 {
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

// ---------------------------------------------------------------------------
// oc_discover: wasm4pm::oc_petri_net::discover_oc_petri_net_pure
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct OcDiscoverRequest {
    ocel: wasm4pm::models::OCEL,
    algorithm: String,
}

fn oc_discover(request_json: &str) -> String {
    let req: OcDiscoverRequest = match serde_json::from_str(request_json) {
        Ok(r) => r,
        Err(e) => return crate::error_response(&format!("invalid oc_discover request: {e}")),
    };

    match wasm4pm::oc_petri_net::discover_oc_petri_net_pure(&req.ocel, &req.algorithm) {
        Ok(result) => crate::respond(&result),
        Err(e) => crate::error_response(&e),
    }
}

/// # Safety
/// See `crate`'s module-level ABI contract.
#[unsafe(export_name = "wasm4pm_ex4pm_oc_discover_v1")]
pub unsafe extern "C" fn oc_discover_v1(
    ptr: *const u8,
    len: usize,
    out_len: *mut usize,
) -> *mut u8 {
    let input = unsafe { crate::read_input(ptr, len) };
    crate::write_output(oc_discover(&input), out_len)
}

/// # Safety
/// See `crate`'s module-level ABI contract.
#[unsafe(export_name = "wasm4pm_ex4pm_oc_discover_replay_v1")]
pub unsafe extern "C" fn oc_discover_replay_v1(ptr: *const u8, len: usize) -> u32 {
    let input = unsafe { crate::read_input(ptr, len) };
    crate::replay_ok(&oc_discover(&input)) as u32
}

// ---------------------------------------------------------------------------
// align: wasm4pm::alignments::compute_trace_alignment (made `pub` upstream)
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct AlignRequest {
    traces: Vec<Vec<String>>,
    petri_net: wasm4pm::models::PetriNet,
    sync_cost: f64,
    log_move_cost: f64,
    model_move_cost: f64,
}

#[derive(Serialize)]
struct SingleAlignment {
    cost: f64,
    path: Vec<String>,
    sync_moves: usize,
    log_moves: usize,
    model_moves: usize,
}

#[derive(Serialize)]
struct AlignResult {
    alignments: Vec<SingleAlignment>,
}

fn align(request_json: &str) -> String {
    let req: AlignRequest = match serde_json::from_str(request_json) {
        Ok(r) => r,
        Err(e) => return crate::error_response(&format!("invalid align request: {e}")),
    };

    let alignments = req
        .traces
        .iter()
        .map(|trace| {
            let (cost, path, sync_moves, log_moves, model_moves) =
                wasm4pm::alignments::compute_trace_alignment(
                    trace,
                    &req.petri_net,
                    req.sync_cost,
                    req.log_move_cost,
                    req.model_move_cost,
                );
            SingleAlignment {
                cost,
                path,
                sync_moves,
                log_moves,
                model_moves,
            }
        })
        .collect();

    crate::respond(&AlignResult { alignments })
}

/// # Safety
/// See `crate`'s module-level ABI contract.
#[unsafe(export_name = "wasm4pm_ex4pm_align_v1")]
pub unsafe extern "C" fn align_v1(ptr: *const u8, len: usize, out_len: *mut usize) -> *mut u8 {
    let input = unsafe { crate::read_input(ptr, len) };
    crate::write_output(align(&input), out_len)
}

/// # Safety
/// See `crate`'s module-level ABI contract.
#[unsafe(export_name = "wasm4pm_ex4pm_align_replay_v1")]
pub unsafe extern "C" fn align_replay_v1(ptr: *const u8, len: usize) -> u32 {
    let input = unsafe { crate::read_input(ptr, len) };
    crate::replay_ok(&align(&input)) as u32
}

// ---------------------------------------------------------------------------
// etc_precision: wasm4pm::etconformance_precision::compute_precision
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct EtcPrecisionRequest {
    net: wasm4pm::models::PetriNet,
    initial_marking: wasm4pm::etconformance_precision::Marking,
    final_marking: wasm4pm::etconformance_precision::Marking,
    log: wasm4pm::models::EventLog,
    activity_key: String,
}

fn etc_precision(request_json: &str) -> String {
    let req: EtcPrecisionRequest = match serde_json::from_str(request_json) {
        Ok(r) => r,
        Err(e) => return crate::error_response(&format!("invalid etc_precision request: {e}")),
    };

    let result = wasm4pm::etconformance_precision::compute_precision(
        &req.net,
        &req.initial_marking,
        &req.final_marking,
        &req.log,
        &req.activity_key,
    );

    crate::respond(&result)
}

/// # Safety
/// See `crate`'s module-level ABI contract.
#[unsafe(export_name = "wasm4pm_ex4pm_etc_precision_v1")]
pub unsafe extern "C" fn etc_precision_v1(
    ptr: *const u8,
    len: usize,
    out_len: *mut usize,
) -> *mut u8 {
    let input = unsafe { crate::read_input(ptr, len) };
    crate::write_output(etc_precision(&input), out_len)
}

/// # Safety
/// See `crate`'s module-level ABI contract.
#[unsafe(export_name = "wasm4pm_ex4pm_etc_precision_replay_v1")]
pub unsafe extern "C" fn etc_precision_replay_v1(ptr: *const u8, len: usize) -> u32 {
    let input = unsafe { crate::read_input(ptr, len) };
    crate::replay_ok(&etc_precision(&input)) as u32
}

// ---------------------------------------------------------------------------
// soundness: wasm4pm::soundness::analyze_petri_net
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct SoundnessRequest {
    petri_net: wasm4pm::models::PetriNet,
}

fn soundness(request_json: &str) -> String {
    let req: SoundnessRequest = match serde_json::from_str(request_json) {
        Ok(r) => r,
        Err(e) => return crate::error_response(&format!("invalid soundness request: {e}")),
    };

    let report = wasm4pm::soundness::analyze_petri_net(&req.petri_net);
    crate::respond(&report)
}

/// # Safety
/// See `crate`'s module-level ABI contract.
#[unsafe(export_name = "wasm4pm_ex4pm_soundness_v1")]
pub unsafe extern "C" fn soundness_v1(ptr: *const u8, len: usize, out_len: *mut usize) -> *mut u8 {
    let input = unsafe { crate::read_input(ptr, len) };
    crate::write_output(soundness(&input), out_len)
}

/// # Safety
/// See `crate`'s module-level ABI contract.
#[unsafe(export_name = "wasm4pm_ex4pm_soundness_replay_v1")]
pub unsafe extern "C" fn soundness_replay_v1(ptr: *const u8, len: usize) -> u32 {
    let input = unsafe { crate::read_input(ptr, len) };
    crate::replay_ok(&soundness(&input)) as u32
}

#[cfg(test)]
mod phase3_tests {
    use super::*;

    #[test]
    fn soundness_analyzes_a_real_two_transition_wf_net() {
        let out = soundness(
            r#"{"petri_net":{
                "places":[{"id":"p0","label":"p0"},{"id":"p1","label":"p1"},{"id":"p2","label":"p2"}],
                "transitions":[{"id":"t0","label":"a"},{"id":"t1","label":"b"}],
                "arcs":[
                    {"from":"p0","to":"t0"},{"from":"t0","to":"p1"},
                    {"from":"p1","to":"t1"},{"from":"t1","to":"p2"}
                ],
                "initial_marking":{"p0":1},
                "final_markings":[{"p2":1}]
            }}"#,
        );
        assert!(!out.contains("\"error\""), "unexpected error: {out}");
    }

    #[test]
    fn etc_precision_computes_a_real_result_on_an_empty_log() {
        let out = etc_precision(
            r#"{"net":{
                "places":[{"id":"p0","label":"p0"},{"id":"p1","label":"p1"}],
                "transitions":[{"id":"t0","label":"a"}],
                "arcs":[{"from":"p0","to":"t0"},{"from":"t0","to":"p1"}],
                "initial_marking":{"p0":1},
                "final_markings":[{"p1":1}]
            },"initial_marking":{"p0":1},"final_marking":{"p1":1},
            "log":{"attributes":{},"traces":[]},"activity_key":"concept:name"}"#,
        );
        assert!(!out.contains("\"error\""), "unexpected error: {out}");
        assert!(out.contains("\"precision\""), "unexpected: {out}");
    }

    #[test]
    fn align_computes_a_real_alignment_over_a_two_transition_net() {
        let out = align(
            r#"{"traces":[["a","b"]],"petri_net":{
                "places":[{"id":"p0","label":"p0"},{"id":"p1","label":"p1"},{"id":"p2","label":"p2"}],
                "transitions":[{"id":"t0","label":"a"},{"id":"t1","label":"b"}],
                "arcs":[
                    {"from":"p0","to":"t0"},{"from":"t0","to":"p1"},
                    {"from":"p1","to":"t1"},{"from":"t1","to":"p2"}
                ],
                "initial_marking":{"p0":1},
                "final_markings":[{"p2":1}]
            },"sync_cost":0.0,"log_move_cost":1.0,"model_move_cost":1.0}"#,
        );
        assert!(!out.contains("\"error\""), "unexpected error: {out}");
        assert!(out.contains("\"alignments\":["));
    }
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
        let out =
            bayesian(r#"{"data":[1.0,2.0,3.0,4.0],"n_features":1,"targets":[2.0,4.0,6.0,8.0]}"#);
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
        let out = strips_plan(
            r#"{"intent":"test","candidates":[],"facts":[],"cases":[],"rules":[],"goals":[],"state":[]}"#,
        );
        assert!(out.contains("\"breed\""));
    }

    #[test]
    fn htn_plan_produces_a_real_inference_trace() {
        let out = htn_plan(
            r#"{"intent":"test","candidates":[],"facts":[],"cases":[],"rules":[],"goals":[],"state":[]}"#,
        );
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
        let out = allen_temporal(
            r#"{"intent":"test","candidates":[],"facts":[],"cases":[],"rules":[],"goals":[],"state":[]}"#,
        );
        assert!(out.contains("\"breed\""));
    }
}

#[cfg(test)]
mod oc_discover_manual_verify {
    #[test]
    fn oc_discover_runs_end_to_end() {
        let req = r#"{"ocel":{"event_types":["A","B"],"object_types":["Order"],"events":[{"id":"e1","event_type":"A","timestamp":"2024-01-01T10:00:00Z","attributes":{},"object_ids":["order1"],"object_refs":[]},{"id":"e2","event_type":"B","timestamp":"2024-01-01T11:00:00Z","attributes":{},"object_ids":["order1"],"object_refs":[]}],"objects":[{"id":"order1","object_type":"Order","attributes":{},"changes":[],"embedded_relations":[]}],"object_relations":[]},"algorithm":"alpha++"}"#;
        let out = super::oc_discover(req);
        assert!(out.contains("\"digest\""), "unexpected: {out}");
        assert!(!out.contains("\"error\""), "unexpected error: {out}");
        assert!(out.contains("\"nets\""), "unexpected: {out}");
        println!("{out}");
    }
}
