use pyo3::prelude::*;
use pyo3::types::{PyDict, PyModule};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};

static RUNTIME_MODE: AtomicBool = AtomicBool::new(false);

pub fn set_runtime_mode(enabled: bool) {
    RUNTIME_MODE.store(enabled, Ordering::Relaxed);
}

pub fn is_runtime_mode() -> bool {
    RUNTIME_MODE.load(Ordering::Relaxed)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BridgeError {
    PythonUnavailable,
    ImportError(String),
    ExecutionError(String),
}

#[derive(Debug, Clone, PartialEq)]
pub enum PM4PyStatus {
    Available(String),
    Unknown,
}

pub fn check_pm4py() -> PM4PyStatus {
    if !is_runtime_mode() {
        return PM4PyStatus::Unknown;
    }
    let res = std::panic::catch_unwind(|| {
        Python::with_gil(|py| match PyModule::import_bound(py, "pm4py") {
            Ok(module) => {
                let version = module
                    .getattr("__version__")
                    .and_then(|v| v.extract::<String>())
                    .unwrap_or_else(|_| "unknown".to_string());
                PM4PyStatus::Available(version)
            }
            Err(_) => PM4PyStatus::Unknown,
        })
    });
    match res {
        Ok(status) => status,
        Err(_) => PM4PyStatus::Unknown,
    }
}

pub fn run_pm4py_workflow(
    csv_path: &str,
    method: &str,
    parameters: &HashMap<String, String>,
) -> Result<String, BridgeError> {
    if !is_runtime_mode() {
        // Static mode default fallback simulation
        if method.contains("discover_petri_net") {
            return Ok("Petri Net discovered (static mode)".to_string());
        } else if method.contains("discover_bpmn") {
            return Ok("BPMN discovered (static mode)".to_string());
        } else {
            return Ok("Process discovered (static mode)".to_string());
        }
    }

    let res = std::panic::catch_unwind(|| {
        Python::with_gil(|py| {
            let pandas = PyModule::import_bound(py, "pandas")
                .map_err(|e| BridgeError::ImportError(format!("pandas import failed: {:?}", e)))?;
            let pm4py = PyModule::import_bound(py, "pm4py")
                .map_err(|e| BridgeError::ImportError(format!("pm4py import failed: {:?}", e)))?;

            let read_kwargs = PyDict::new_bound(py);
            for (k, v) in parameters {
                if k != "case_id"
                    && k != "activity"
                    && k != "timestamp"
                    && k != "case_id_key"
                    && k != "activity_key"
                    && k != "timestamp_key"
                {
                    let clean_v = v.trim_matches(|c| c == '\'' || c == '"');
                    read_kwargs.set_item(k, clean_v).ok();
                }
            }

            let df = pandas
                .call_method("read_csv", (csv_path,), Some(&read_kwargs))
                .map_err(|e| BridgeError::ExecutionError(format!("read_csv failed: {:?}", e)))?;

            let format_kwargs = PyDict::new_bound(py);
            if let Some(case_id) = parameters
                .get("case_id")
                .or_else(|| parameters.get("case_id_key"))
            {
                let clean_case_id = case_id.trim_matches(|c| c == '\'' || c == '"');
                format_kwargs.set_item("case_id", clean_case_id).ok();
            }
            if let Some(activity) = parameters
                .get("activity")
                .or_else(|| parameters.get("activity_key"))
            {
                let clean_activity = activity.trim_matches(|c| c == '\'' || c == '"');
                format_kwargs.set_item("activity", clean_activity).ok();
            }
            if let Some(timestamp) = parameters
                .get("timestamp")
                .or_else(|| parameters.get("timestamp_key"))
            {
                let clean_timestamp = timestamp.trim_matches(|c| c == '\'' || c == '"');
                format_kwargs.set_item("timestamp", clean_timestamp).ok();
            }

            let df_formatted = pm4py
                .call_method("format_dataframe", (df,), Some(&format_kwargs))
                .map_err(|e| {
                    BridgeError::ExecutionError(format!("format_dataframe failed: {:?}", e))
                })?;

            let result = pm4py
                .call_method1(method, (df_formatted,))
                .map_err(|e| BridgeError::ExecutionError(format!("{} failed: {:?}", method, e)))?;

            let result_str = result
                .str()
                .map_err(|e| {
                    BridgeError::ExecutionError(format!("Failed to stringify result: {:?}", e))
                })?
                .extract::<String>()
                .unwrap_or_default();

            Ok(result_str)
        })
    });

    match res {
        Ok(Ok(val)) => Ok(val),
        Ok(Err(e)) => Err(e),
        Err(_) => Err(BridgeError::ExecutionError(
            "Python panic caught during execution".to_string(),
        )),
    }
}
