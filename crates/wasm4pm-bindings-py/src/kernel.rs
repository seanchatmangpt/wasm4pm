//! Kernel-style algorithm dispatch mirroring packages/kernel/src/api.ts runRaw.

use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;
use pyo3::types::{PyDict, PyModule};
use serde_json::{json, Value};
use std::collections::HashMap;
use wasm4pm::native_bridge::{clear_native_json, take_native_json};
use wasm_bindgen::JsValue;

use crate::invoke::js_error;

fn py_err(msg: impl Into<String>) -> PyErr {
    PyValueError::new_err(msg.into())
}

fn json_to_py(py: Python<'_>, value: &Value) -> PyResult<PyObject> {
    let json_mod = PyModule::import(py, "json")?;
    let dumped = serde_json::to_string(value).map_err(|e| py_err(e.to_string()))?;
    Ok(json_mod.call_method1("loads", (dumped,))?.into())
}

fn call_js_result(py: Python<'_>, f: impl FnOnce() -> Result<JsValue, JsValue>) -> PyResult<PyObject> {
    clear_native_json();
    f().map_err(js_error).map_err(py_err)?;
    let json = take_native_json().ok_or_else(|| py_err("algorithm produced no result"))?;
    let value: Value = serde_json::from_str(&json).map_err(|e| py_err(e.to_string()))?;
    json_to_py(py, &value)
}

fn call_string(f: impl FnOnce() -> Result<String, JsValue>) -> PyResult<String> {
    f().map_err(js_error).map_err(py_err)
}

const ALGORITHM_IDS: &[&str] = &[
    "dfg",
    "process_skeleton",
    "alpha_plus_plus",
    "heuristic_miner",
    "inductive_miner",
    "genetic_algorithm",
    "pso",
    "a_star",
    "hill_climbing",
    "aco",
    "simulated_annealing",
    "declare",
    "optimized_dfg",
    "ilp",
    "simd_streaming_dfg",
    "hierarchical_dfg",
    "streaming_log",
    "smart_engine",
    "ml_classify",
    "ml_cluster",
    "ml_forecast",
    "ml_anomaly",
    "ml_regress",
    "ml_pca",
    "transition_system",
    "log_to_trie",
    "causal_graph",
    "performance_spectrum",
    "batches",
    "correlation_miner",
    "generalization",
    "etconformance_precision",
    "alignments",
    "complexity_metrics",
    "pnml_import",
    "bpmn_import",
    "powl_to_process_tree",
    "yawl_export",
    "playout",
    "monte_carlo_simulation",
    "handover_network",
    "working_together_network",
    "ocel_dfg",
    "ocel_dfg_per_type",
    "ocel_petri_net",
    "ocel_encode",
    "ocel_ocla",
    "ocel_oc_declare",
    "predict_next_activity",
    "predict_remaining_time",
    "predict_outcome",
    "detect_drift",
    "compute_ewma",
    "analyze_variant_complexity",
    "compute_activity_transition_matrix",
    "analyze_process_speedup",
    "compute_trace_similarity_matrix",
    "automl_classify",
    "automl_forecast",
    "agentic_pipeline",
];

#[pyfunction]
fn list_algorithms() -> Vec<&'static str> {
    ALGORITHM_IDS.to_vec()
}

#[pyfunction]
fn run_algorithm(
    py: Python<'_>,
    algorithm_id: &str,
    event_log_handle: &str,
    activity_key: &str,
    params: Option<&Bound<'_, PyDict>>,
) -> PyResult<PyObject> {
    let mut p: HashMap<String, Value> = HashMap::new();
    if let Some(dict) = params {
        for (k, v) in dict.iter() {
            let key: String = k.extract()?;
            let json_mod = PyModule::import(py, "json")?;
            let dumped = json_mod.call_method1("dumps", (v,))?;
            let s: String = dumped.extract()?;
            let val: Value = serde_json::from_str(&s).map_err(|e| py_err(e.to_string()))?;
            p.insert(key, val);
        }
    }

    let param_f64 = |k: &str, default: f64| -> f64 {
        p.get(k).and_then(|v| v.as_f64()).unwrap_or(default)
    };
    let param_usize = |k: &str, default: usize| -> usize {
        p.get(k)
            .and_then(|v| v.as_u64())
            .map(|n| n as usize)
            .unwrap_or(default)
    };
    let param_str = |k: &str, default: &str| -> String {
        p.get(k)
            .and_then(|v| v.as_str())
            .map(str::to_string)
            .unwrap_or_else(|| default.to_string())
    };

    let result = match algorithm_id {
        "dfg" => call_js_result(py, || {
            wasm4pm::discover_dfg(event_log_handle, activity_key)
        })?,
        "process_skeleton" => call_js_result(py, || {
            wasm4pm::more_discovery::extract_process_skeleton(
                event_log_handle,
                activity_key,
                param_usize("min_frequency", 2),
            )
        })?,
        "alpha_plus_plus" => call_js_result(py, || {
            wasm4pm::algorithms::discover_alpha_plus_plus(
                event_log_handle,
                activity_key,
                param_f64("min_support", 0.0),
            )
        })?,
        "heuristic_miner" => call_js_result(py, || {
            wasm4pm::advanced_algorithms::discover_heuristic_miner(
                event_log_handle,
                activity_key,
                param_f64("dependency_threshold", 0.5),
            )
        })?,
        "inductive_miner" => call_js_result(py, || {
            wasm4pm::more_discovery::discover_inductive_miner(event_log_handle, activity_key)
        })?,
        "genetic_algorithm" => call_js_result(py, || {
            wasm4pm::genetic_discovery::discover_genetic_algorithm(
                event_log_handle,
                activity_key,
                param_usize("population_size", 50),
                param_usize("generations", 100),
            )
        })?,
        "pso" => call_js_result(py, || {
            wasm4pm::genetic_discovery::discover_pso_algorithm(
                event_log_handle,
                activity_key,
                param_usize("swarm_size", 30),
                param_usize("iterations", 50),
            )
        })?,
        "a_star" => call_js_result(py, || {
            wasm4pm::fast_discovery::discover_astar(
                event_log_handle,
                activity_key,
                param_usize("max_iterations", 10_000),
            )
        })?,
        "hill_climbing" => call_js_result(py, || {
            wasm4pm::fast_discovery::discover_hill_climbing(event_log_handle, activity_key)
        })?,
        "aco" => call_js_result(py, || {
            wasm4pm::more_discovery::discover_ant_colony(
                event_log_handle,
                activity_key,
                param_usize("colony_size", 40),
                param_usize("iterations", 100),
            )
        })?,
        "simulated_annealing" => call_js_result(py, || {
            wasm4pm::more_discovery::discover_simulated_annealing(
                event_log_handle,
                activity_key,
                param_f64("initial_temperature", 100.0),
                param_f64("cooling_rate", 0.95),
            )
        })?,
        "declare" => call_js_result(py, || {
            wasm4pm::discovery::discover_declare(event_log_handle, activity_key)
        })?,
        "ilp" => call_js_result(py, || {
            wasm4pm::ilp_discovery::discover_ilp_petri_net(event_log_handle, activity_key)
        })?,
        "ocel_dfg" => call_js_result(py, || wasm4pm::discovery::discover_ocel_dfg(event_log_handle))?,
        "ocel_dfg_per_type" => {
            call_js_result(py, || wasm4pm::discovery::discover_ocel_dfg_per_type(event_log_handle))?
        }
        "handover_network" => call_js_result(py, || {
            wasm4pm::social_network::discover_handover_network(event_log_handle, activity_key)
        })?,
        "working_together_network" => call_js_result(py, || {
            wasm4pm::social_network::discover_working_together_network(event_log_handle, activity_key)
        })?,
        "predict_next_activity" => call_js_result(py, || {
            wasm4pm::prediction::build_ngram_predictor(
                event_log_handle,
                activity_key,
                param_usize("n", 3),
            )
        })?,
        "predict_remaining_time" => call_js_result(py, || {
            wasm4pm::prediction_remaining_time::build_remaining_time_model(
                event_log_handle,
                activity_key,
                &param_str("timestamp_key", "time:timestamp"),
            )
        })?,
        "predict_outcome" => {
            let prefix = param_str("prefix_json", "[]");
            call_js_result(py, || {
                wasm4pm::prediction_outcome::predict_outcome_wasm(
                    event_log_handle,
                    activity_key,
                    &prefix,
                )
            })?
        }
        "detect_drift" => call_js_result(py, || {
            wasm4pm::prediction_drift::detect_drift(
                event_log_handle,
                activity_key,
                param_usize("window_size", 50),
            )
        })?,
        "compute_ewma" => {
            let values_json = param_str("values_json", "[]");
            let alpha = param_f64("alpha", 0.3);
            call_js_result(py, || wasm4pm::prediction_drift::compute_ewma(&values_json, alpha))?
        }
        "analyze_variant_complexity" => call_js_result(py, || {
            wasm4pm::final_analytics::analyze_variant_complexity(event_log_handle, activity_key)
        })?,
        "compute_activity_transition_matrix" => call_js_result(py, || {
            wasm4pm::final_analytics::compute_activity_transition_matrix(
                event_log_handle,
                activity_key,
            )
        })?,
        "analyze_process_speedup" => call_js_result(py, || {
            wasm4pm::final_analytics::analyze_process_speedup(
                event_log_handle,
                &param_str("timestamp_key", "time:timestamp"),
                param_usize("window_size", 10),
            )
        })?,
        "compute_trace_similarity_matrix" => call_js_result(py, || {
            wasm4pm::final_analytics::compute_trace_similarity_matrix(event_log_handle, activity_key)
        })?,
        "agentic_pipeline" => {
            let task = param_str("task_json", "{}");
            let result = call_string(|| wasm4pm::run_agentic_pipeline(&task))?;
            json_to_py(py, &json!({ "result": result }))?
        }
        other => {
            return Err(py_err(format!(
                "algorithm '{other}' not yet implemented in kernel dispatch — use wasm4pm.invoke('{other}', ...)"
            )));
        }
    };

    Ok(result)
}

pub fn register(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(list_algorithms, m)?)?;
    m.add_function(wrap_pyfunction!(run_algorithm, m)?)?;
    Ok(())
}
