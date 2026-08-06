//! Native Python bindings for wasm4pm.

mod invoke;
mod kernel;
mod session;

use pyo3::prelude::*;
use pyo3::types::PyModule;
use std::collections::HashMap;
use wasm4pm::models::EventLog as ModelsEventLog;
use wasm4pm::powl::discovery::{discover_powl, DiscoveryConfig, DiscoveryVariant};
use wasm4pm::powl_arena::PowlArena;
use wasm4pm::powl_execution::execute_powl_string;
use wasm4pm::powl_parser::parse_powl_model_string;
use wasm4pm_compat::ocel::validate::validate;
use wasm4pm_compat::ocel::{ObjectTypeCardinality, OCEL};

use crate::invoke::py_value_err;
use crate::invoke::json_to_py;

fn parse_ocel(json: &str) -> Result<OCEL, PyErr> {
    serde_json::from_str::<OCEL>(json)
        .map_err(|e| py_value_err(format!("Invalid OCEL-v2 JSON: {e}")))
}

#[pyfunction]
fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

/// Parse and normalize an OCEL-v2 log.
#[pyfunction]
fn load_ocel_v2(py: Python<'_>, json: &str) -> PyResult<PyObject> {
    let ocel = parse_ocel(json)?;
    let value = serde_json::to_value(&ocel).map_err(|e| py_value_err(e.to_string()))?;
    json_to_py(py, &value)
}

/// Flatten an OCEL-v2 log onto a single object type.
#[pyfunction]
fn flatten_ocel_v2(py: Python<'_>, json: &str, object_type: &str) -> PyResult<PyObject> {
    let ocel = parse_ocel(json)?;

    let exists = ocel.object_types.iter().any(|ot| ot.name == object_type)
        || ocel.objects.iter().any(|o| o.object_type == object_type);
    if !exists {
        return Err(py_value_err(format!(
            "Object type '{object_type}' not found in the log"
        )));
    }

    let mut cases = Vec::new();
    let target_objects: Vec<_> = ocel
        .objects
        .iter()
        .filter(|o| o.object_type == object_type)
        .collect();

    for obj in target_objects {
        let mut events_for_obj: Vec<_> = ocel
            .events
            .iter()
            .filter(|e| ocel.e2o(&e.id).iter().any(|(oid, _)| oid == &obj.id))
            .collect();
        events_for_obj.sort_by_key(|x| x.time);

        let trace: Vec<String> = events_for_obj
            .iter()
            .map(|e| e.event_type.clone())
            .collect();
        let event_ids: Vec<String> = events_for_obj.iter().map(|e| e.id.clone()).collect();

        cases.push(serde_json::json!({
            "case_id": obj.id,
            "trace": trace,
            "event_ids": event_ids
        }));
    }

    let flat_log = serde_json::json!({
        "object_type": object_type,
        "cases": cases
    });
    json_to_py(py, &flat_log)
}

/// Parse a POWL model string.
#[pyfunction]
fn parse_powl(py: Python<'_>, model: &str) -> PyResult<PyObject> {
    let mut arena = PowlArena::new();
    let root = parse_powl_model_string(model.trim(), &mut arena)
        .map_err(|e| py_value_err(format!("parse error: {e}")))?;
    let repr = arena.to_repr(root);
    let value = serde_json::json!({
        "root": root,
        "node_count": arena.len(),
        "repr": repr,
    });
    json_to_py(py, &value)
}

/// Validate partial-order constraints in a POWL model.
#[pyfunction]
fn validate_partial_orders(py: Python<'_>, model: &str) -> PyResult<PyObject> {
    let mut arena = PowlArena::new();
    let root = parse_powl_model_string(model.trim(), &mut arena)
        .map_err(|e| py_value_err(format!("parse error: {e}")))?;
    arena
        .validate_partial_orders(root)
        .map_err(|e| py_value_err(e.to_string()))?;
    json_to_py(py, &serde_json::json!({ "valid": true }))
}

/// Discover a POWL model from an event log JSON string.
#[pyfunction]
#[pyo3(signature = (log_json, variant="decision_graph_cyclic"))]
fn discover_powl_from_log(py: Python<'_>, log_json: &str, variant: &str) -> PyResult<PyObject> {
    let log: ModelsEventLog = serde_json::from_str(log_json)
        .map_err(|e| py_value_err(format!("log parse error: {e}")))?;

    let discovery_variant = DiscoveryVariant::from_variant_str(variant)
        .unwrap_or(DiscoveryVariant::DecisionGraphCyclic);

    let config = DiscoveryConfig {
        activity_key: "concept:name".to_string(),
        variant: discovery_variant,
        min_trace_count: 1,
        noise_threshold: 0.0,
        from_dfg: false,
        fall_through_fired: false,
    };

    let (arena, root) = discover_powl(&log, &config)
        .map_err(|e| py_value_err(format!("discovery error: {e}")))?;

    let repr = arena.to_repr(root);
    let value = serde_json::json!({
        "root": root,
        "node_count": arena.len(),
        "repr": repr,
        "variant": variant,
    });
    json_to_py(py, &value)
}

/// Execute a POWL model with optional configuration JSON.
#[pyfunction]
#[pyo3(signature = (powl_str, config_json=""))]
fn powl_execute(py: Python<'_>, powl_str: &str, config_json: &str) -> PyResult<PyObject> {
    let max_iters: u8 = if config_json.trim().is_empty() {
        3
    } else {
        let cfg: serde_json::Value = serde_json::from_str(config_json)
            .map_err(|e| py_value_err(format!("invalid config JSON: {e}")))?;
        u8::try_from(cfg.get("max_iters").and_then(|v| v.as_u64()).unwrap_or(3))
            .map_err(|_| py_value_err("max_iters must fit in u8"))?
    };

    let result = execute_powl_string(powl_str, max_iters)
        .map_err(|e| py_value_err(e))?;
    json_to_py(py, &result)
}

/// Validate OCEL-v2 against optional object-type cardinality rules.
#[pyfunction]
#[pyo3(signature = (json, cardinality_json=""))]
fn validate_ocel_v2(py: Python<'_>, json: &str, cardinality_json: &str) -> PyResult<PyObject> {
    let ocel = parse_ocel(json)?;
    let card: HashMap<String, ObjectTypeCardinality> = if cardinality_json.trim().is_empty() {
        HashMap::new()
    } else {
        serde_json::from_str(cardinality_json)
            .map_err(|e| py_value_err(format!("Invalid object_types cardinality JSON: {e}")))?
    };
    let report = validate(&ocel, &card);
    let value = serde_json::to_value(&report).map_err(|e| py_value_err(e.to_string()))?;
    json_to_py(py, &value)
}

#[pymodule]
fn _native(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(version, m)?)?;
    m.add_function(wrap_pyfunction!(load_ocel_v2, m)?)?;
    m.add_function(wrap_pyfunction!(flatten_ocel_v2, m)?)?;
    m.add_function(wrap_pyfunction!(validate_ocel_v2, m)?)?;
    m.add_function(wrap_pyfunction!(parse_powl, m)?)?;
    m.add_function(wrap_pyfunction!(validate_partial_orders, m)?)?;
    m.add_function(wrap_pyfunction!(discover_powl_from_log, m)?)?;
    m.add_function(wrap_pyfunction!(powl_execute, m)?)?;
    invoke::register(m)?;
    kernel::register(m)?;
    session::register(m)?;
    Ok(())
}
