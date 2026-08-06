//! Dynamic invocation of wasm4pm exports for Python.

use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;
use pyo3::types::PyModule;
use serde_json::Value;
use wasm4pm::native_bridge::{clear_native_json, take_native_json};
use wasm_bindgen::JsValue;

mod dispatch_generated {
    #![allow(clippy::too_many_lines, clippy::cognitive_complexity)]
    include!("dispatch_generated.rs");
}

pub use dispatch_generated::{dispatch_export, list_export_names};

pub enum InvokeResult {
    Void,
    String(String),
    Number(f64),
    Bool(bool),
    Json(String),
}

pub fn wrap_string_result(f: impl FnOnce() -> Result<String, JsValue>) -> Result<InvokeResult, String> {
    Ok(InvokeResult::String(f().map_err(js_error)?))
}

pub fn wrap_js_result(f: impl FnOnce() -> Result<JsValue, JsValue>) -> Result<InvokeResult, String> {
    f().map_err(js_error)?;
    take_js_result()
        .map(InvokeResult::Json)
        .ok_or_else(|| "export produced no JSON payload".to_string())
}

pub fn wrap_js_value(f: impl FnOnce() -> JsValue) -> Result<InvokeResult, String> {
    drop(f());
    take_js_result()
        .map(InvokeResult::Json)
        .ok_or_else(|| "export produced no JSON payload".to_string())
}

pub fn wrap_usize_result(f: impl FnOnce() -> Result<usize, JsValue>) -> Result<InvokeResult, String> {
    Ok(InvokeResult::Number(f().map_err(js_error)? as f64))
}

pub fn wrap_u8_result(f: impl FnOnce() -> Result<u8, JsValue>) -> Result<InvokeResult, String> {
    Ok(InvokeResult::Number(f().map_err(js_error)? as f64))
}

pub fn wrap_u32_result(f: impl FnOnce() -> Result<u32, JsValue>) -> Result<InvokeResult, String> {
    Ok(InvokeResult::Number(f().map_err(js_error)? as f64))
}

pub fn wrap_bool_result(f: impl FnOnce() -> Result<bool, JsValue>) -> Result<InvokeResult, String> {
    Ok(InvokeResult::Bool(f().map_err(js_error)?))
}

pub fn wrap_f64_result(f: impl FnOnce() -> Result<f64, JsValue>) -> Result<InvokeResult, String> {
    Ok(InvokeResult::Number(f().map_err(js_error)?))
}

pub fn wrap_void_result(f: impl FnOnce() -> Result<(), JsValue>) -> Result<InvokeResult, String> {
    f().map_err(js_error)?;
    Ok(InvokeResult::Void)
}

pub fn wrap_void(f: impl FnOnce()) -> Result<InvokeResult, String> {
    f();
    Ok(InvokeResult::Void)
}

pub fn wrap_plain_string(f: impl FnOnce() -> String) -> Result<InvokeResult, String> {
    Ok(InvokeResult::String(f()))
}

pub fn js_error(err: JsValue) -> String {
    if let Some(s) = take_native_json() {
        return s;
    }
    "wasm export failed".to_string()
}

pub fn take_js_result() -> Option<String> {
    take_native_json()
}

pub fn arg_string(args: &[Value], idx: usize) -> Result<String, String> {
    args.get(idx)
        .and_then(|v| v.as_str().map(str::to_string))
        .ok_or_else(|| format!("argument {idx} must be a string"))
}

pub fn arg_f64(args: &[Value], idx: usize) -> Result<f64, String> {
    args.get(idx)
        .and_then(|v| v.as_f64())
        .ok_or_else(|| format!("argument {idx} must be a number"))
}

pub fn arg_usize(args: &[Value], idx: usize) -> Result<usize, String> {
    let n = arg_f64(args, idx)?;
    Ok(n as usize)
}

pub fn arg_u8(args: &[Value], idx: usize) -> Result<u8, String> {
    let n = arg_f64(args, idx)?;
    u8::try_from(n as u64).map_err(|_| format!("argument {idx} must fit in u8"))
}

pub fn arg_bool(args: &[Value], idx: usize) -> Result<bool, String> {
    args.get(idx)
        .and_then(|v| v.as_bool())
        .ok_or_else(|| format!("argument {idx} must be a boolean"))
}

pub fn arg_i64(args: &[Value], idx: usize) -> Result<i64, String> {
    args.get(idx)
        .and_then(|v| v.as_i64())
        .ok_or_else(|| format!("argument {idx} must be an integer"))
}

pub fn arg_js_value(args: &[Value], idx: usize) -> Result<JsValue, String> {
    let s = arg_string(args, idx)?;
    Ok(JsValue::from_str(&s))
}

pub fn py_value_err(msg: impl Into<String>) -> PyErr {
    PyValueError::new_err(msg.into())
}

pub fn json_to_py(py: Python<'_>, value: &serde_json::Value) -> PyResult<PyObject> {
    let json_mod = PyModule::import(py, "json")?;
    let dumped = serde_json::to_string(value).map_err(|e| py_value_err(e.to_string()))?;
    let obj = json_mod.call_method1("loads", (dumped,))?;
    Ok(obj.into())
}

fn py_value_err_local(msg: impl Into<String>) -> PyErr {
    py_value_err(msg)
}

fn py_args_to_json(py: Python<'_>, args: &Bound<'_, PyAny>) -> PyResult<Vec<Value>> {
    let json_mod = PyModule::import(py, "json")?;
    let dumped = json_mod.call_method1("dumps", (args,))?;
    let s: String = dumped.extract()?;
    serde_json::from_str(&s).map_err(|e| py_value_err_local(e.to_string()))
}

fn invoke_result_to_py(py: Python<'_>, result: InvokeResult) -> PyResult<PyObject> {
    match result {
        InvokeResult::Void => Ok(py.None()),
        InvokeResult::String(s) => Ok(s.into_py(py)),
        InvokeResult::Number(n) => Ok(n.into_py(py)),
        InvokeResult::Bool(b) => Ok(b.into_py(py)),
        InvokeResult::Json(s) => {
            let json_mod = PyModule::import(py, "json")?;
            let obj = json_mod.call_method1("loads", (s,))?;
            Ok(obj.into_py(py))
        }
    }
}

#[pyfunction]
fn invoke(py: Python<'_>, name: &str, args: &Bound<'_, PyAny>) -> PyResult<PyObject> {
    clear_native_json();
    let json_args = py_args_to_json(py, args)?;
    let result = dispatch_export(name, &json_args).map_err(py_value_err_local)?;
    invoke_result_to_py(py, result)
}

#[pyfunction]
fn list_exports() -> Vec<&'static str> {
    list_export_names().to_vec()
}

#[pyfunction]
fn get_capabilities(py: Python<'_>) -> PyResult<PyObject> {
    clear_native_json();
    wasm4pm::get_capabilities().map_err(js_error).map_err(py_value_err_local)?;
    let json = take_native_json().ok_or_else(|| py_value_err_local("no capabilities payload"))?;
    let json_mod = PyModule::import(py, "json")?;
    Ok(json_mod.call_method1("loads", (json,))?.into_py(py))
}

pub fn register(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(invoke, m)?)?;
    m.add_function(wrap_pyfunction!(list_exports, m)?)?;
    m.add_function(wrap_pyfunction!(get_capabilities, m)?)?;
    Ok(())
}
