//! Session handle management for event logs and OCEL.

use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;
use wasm4pm::native_bridge::clear_native_json;

use crate::invoke::js_error;

fn py_err(msg: impl Into<String>) -> PyErr {
    PyValueError::new_err(msg.into())
}

#[pyfunction]
fn load_eventlog_from_json(content: &str) -> PyResult<String> {
    clear_native_json();
    wasm4pm::io::load_eventlog_from_json(content).map_err(js_error).map_err(py_err)
}

#[pyfunction]
fn load_ocel_from_json(content: &str) -> PyResult<String> {
    clear_native_json();
    wasm4pm::io::load_ocel_from_json(content).map_err(js_error).map_err(py_err)
}

#[pyfunction]
fn load_eventlog_from_xes(content: &str) -> PyResult<String> {
    clear_native_json();
    wasm4pm::load_eventlog_from_xes(content).map_err(js_error).map_err(py_err)
}

#[pyfunction]
fn export_eventlog_to_json(handle: &str) -> PyResult<String> {
    wasm4pm::io::export_eventlog_to_json(handle)
        .map_err(js_error)
        .map_err(py_err)
}

#[pyfunction]
fn export_ocel_to_json(handle: &str) -> PyResult<String> {
    wasm4pm::io::export_ocel_to_json(handle)
        .map_err(js_error)
        .map_err(py_err)
}

#[pyfunction]
fn delete_object(handle: &str) -> PyResult<()> {
    let _ = wasm4pm::state::delete_object(handle);
    Ok(())
}

#[pyfunction]
fn clear_all_objects() -> PyResult<()> {
    let _ = wasm4pm::state::clear_all_objects();
    Ok(())
}

#[pyfunction]
fn object_count() -> PyResult<usize> {
    wasm4pm::state::object_count()
        .map_err(|e| PyValueError::new_err(js_error(e)))
}

pub fn register(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(load_eventlog_from_json, m)?)?;
    m.add_function(wrap_pyfunction!(load_ocel_from_json, m)?)?;
    m.add_function(wrap_pyfunction!(load_eventlog_from_xes, m)?)?;
    m.add_function(wrap_pyfunction!(export_eventlog_to_json, m)?)?;
    m.add_function(wrap_pyfunction!(export_ocel_to_json, m)?)?;
    m.add_function(wrap_pyfunction!(delete_object, m)?)?;
    m.add_function(wrap_pyfunction!(clear_all_objects, m)?)?;
    m.add_function(wrap_pyfunction!(object_count, m)?)?;
    Ok(())
}
