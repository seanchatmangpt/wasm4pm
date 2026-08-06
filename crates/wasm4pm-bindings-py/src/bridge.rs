//! Conversion helpers between Python and wasm4pm native exports.

use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;
use pyo3::types::PyModule;
use wasm4pm::native_bridge::{clear_native_json, take_native_json};

pub fn py_err(msg: impl Into<String>) -> PyErr {
    PyValueError::new_err(msg.into())
}

pub fn js_error(_err: wasm_bindgen::JsValue) -> String {
    take_native_json().unwrap_or_else(|| "wasm export failed".to_string())
}

pub fn json_to_py(py: Python<'_>, json: &str) -> PyResult<PyObject> {
    let json_mod = PyModule::import(py, "json")?;
    Ok(json_mod.call_method1("loads", (json,))?.into_py(py))
}

pub fn json_result_to_py(py: Python<'_>) -> PyResult<PyObject> {
    let json = take_native_json().ok_or_else(|| py_err("export produced no JSON payload"))?;
    json_to_py(py, &json)
}

pub fn prepare_call() {
    clear_native_json();
}
