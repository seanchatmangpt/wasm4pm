# PM4Py-LSP Exploration & Design Report

This report presents a thorough investigation of the existing static analysis module and outlines the design and testing strategies for the PM4Py runtime bridge and related documentation for Milestone 2.

---

## 1. Static Analysis Gaps in `src/analysis.rs`

The current implementation of `crates/pm4py-lsp/src/analysis.rs` extracts pipeline facts using raw regular expressions. While lightweight, this approach has substantial gaps that limit its robustness and correctness. Below is a detailed gap analysis.

### A. Python Import Variations
* **Indentation Gaps**: All import regexes (`re_pm4py`, `re_from_pm4py`, `re_pandas`) use the `(?m)^` anchor, forcing imports to start at the very beginning of the line. Consequently, the analyzer fails to detect imports nested inside blocks (e.g., inside function definitions `def run():`, conditional branches `if flag:`, or exception handling `try: ... except:`).
* **Multiple Imports on One Line**: The regex `import pandas(?: as (\w+))?` only matches imports where the module is the sole target. It misses compound imports such as `import os, pandas, pm4py` or `import pandas as pd, pm4py as pm`.
* **Direct Submodule Imports**: The parser fails to recognize imports of specific submodules, e.g.:
  ```python
  from pm4py.algo.discovery.inductive import algorithm as inductive_miner
  from pm4py.objects.log.importer.xes import factory as xes_importer
  ```
  Since `inductive_miner` is not matched as an alias in `pm4py_aliases`, any calls on it (like `inductive_miner.apply(...)`) will bypass the discovery call detector.
* **Wildcard and Specific Function Imports**: Imports like `from pm4py import format_dataframe` or `from pm4py.algo.discovery.alpha.algorithm import apply` are completely ignored, preventing the analyzer from checking if those functions are called directly.

### B. Pandas Aliases
* **Default Heuristic Risk**: If no pandas import is matched (due to indentation or multiline syntax), the analyzer defaults to inserting `"pd"` into `pandas_aliases`. While common, if the developer imports pandas under a different unmatched name (e.g., `import pandas as pan`), the fallback to `pd` will cause the analyzer to look for `pd.read_csv`, resulting in false negatives for both the alias and the loaded CSVs.
* **Indentation Gaps**: As with pm4py, indented pandas imports are ignored.

### C. Data Loading Patterns
* **Strict Format Requirement**: The regex `{}\.read_csv\s*\(\s*['"]([^'"]+)['"]` requires the path string literal to be the first argument and start immediately after the opening parenthesis. It fails to match if there are spaces, keyword arguments, or comments preceding the file path.
* **Non-Literal Arguments**: If the file path is stored in a variable or computed dynamically (e.g., `log_path = "event_log.csv"; df = pd.read_csv(log_path)`), the regex cannot capture the filename, leading to an empty `csv_loads` list.
* **Alternative Loaders**: Only `read_csv` is checked. The analyzer misses other pandas/PM4Py log-loading formats, including:
  * PM4Py-native: `pm4py.read_xes()`, `pm4py.read_csv()`
  * Alternative pandas loaders: `read_parquet()`, `read_excel()`, `read_json()`, `read_table()`

### D. Formatting Patterns
* **Assignment Requirement**: The regex `(\w+)\s*=\s*{}\.format_dataframe` requires the format function output to be assigned directly to a variable. It fails to detect:
  * In-place modifications where the output is reassigned to the same variable: `df = pm4py.format_dataframe(df, ...)`
  * Direct inline calls: `pm4py.discover_petri_net_inductive(pm4py.format_dataframe(df, ...))`
  * Nested assignments or function arguments.
* **Positional Parameter Fallback**: The parser checks for argument completeness via a simple `.contains(...)` on the argument string.
  * In PM4Py, the actual arguments are `case_id`, `activity_key`, and `timestamp_key`. Checking `.contains("activity")` works for `activity_key`, but checking `.contains("timestamp")` works for `timestamp_key`.
  * However, if parameters are passed positionally (e.g., `pm4py.format_dataframe(df, "case:concept:name", "concept:name", "time:timestamp")`), the parameter names `case_id` or `activity_key` are not in the source text, resulting in false positive warnings for missing mappings.

### E. Process Discovery Calls
* **Method Call on Alias**: The regex `{pm4py_alias}\.discover_[\w_]+` only detects discovery functions called as methods on the main `pm4py` alias.
* **Direct Submodule/Function Gaps**: It does not match when discovery is performed through a submodule import (e.g., `from pm4py.algo.discovery.inductive import algorithm; algorithm.apply(df)`) or when older PM4Py paths are used.

### F. Codebase Compilation Blockers
During investigation, it was observed that the `pm4py-lsp` library fails to compile due to the following defects:
1. `create_parity_fixture` is called in `src/lib.rs` (line 245) but is not defined anywhere in the workspace.
2. `diagnose_text` is called in `src/lib.rs` (line 301) but is not defined anywhere in the workspace.
3. `LawAxis` has no `as_str()` method, yet `crates/pm4py-lsp/src/lib.rs` (lines 335, 362, 378) attempts to call `axis.as_str()`.
4. `RepairAction` is constructed in `crates/pm4py-lsp/src/lib.rs` (lines 380-381) with fields `title` and `command`, but its definition in `tower-lsp-max-protocol` defines the fields as `action_id` and `description`.
5. `check_diagnostics` is imported in `tests/diagnostics_test.rs` but is not defined in `src/diagnostics.rs`.

---

## 2. Design of `src/pm4py_bridge.rs` using PyO3

To support capability-gated, panic-safe execution of Python/PM4Py logic, the `pm4py_bridge.rs` module should be designed with strict error boundaries, gating configuration, and custom result mappings.

### A. Proposed Module Interface

```rust
use pyo3::prelude::*;
use pyo3::types::{PyDict, PyModule};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Structured error enum to catch and map all Python/PyO3 errors without panicking.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum PM4PyBridgeError {
    PythonNotAvailable(String),
    PM4PyNotAvailable(String),
    ImportError(String),
    ExecutionError(String),
    SerializationError(String),
    CapabilityGated,
}

impl std::fmt::Display for PM4PyBridgeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::PythonNotAvailable(msg) => write!(f, "Python runtime not available: {}", msg),
            Self::PM4PyNotAvailable(msg) => write!(f, "PM4Py library not available: {}", msg),
            Self::ImportError(msg) => write!(f, "Python import failed: {}", msg),
            Self::ExecutionError(msg) => write!(f, "Python execution failed: {}", msg),
            Self::SerializationError(msg) => write!(f, "Serialization failed: {}", msg),
            Self::CapabilityGated => write!(f, "Runtime execution is disabled by capability gating"),
        }
    }
}

impl std::error::Error for PM4PyBridgeError {}

/// Configuration for runtime execution.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct BridgeConfig {
    /// Toggle to enable/disable runtime execution.
    pub enable_runtime: bool,
    /// Optional custom path to python virtual environment.
    pub python_path: Option<String>,
}

/// The runtime bridge manager.
pub struct PM4PyRuntimeBridge {
    config: BridgeConfig,
}

impl PM4PyRuntimeBridge {
    /// Create a new runtime bridge with the specified configuration.
    pub fn new(config: BridgeConfig) -> Self {
        Self { config }
    }

    /// Check if pm4py is installed and return its version.
    pub fn check_pm4py_availability(&self) -> Result<String, PM4PyBridgeError> {
        if !self.config.enable_runtime {
            return Err(PM4PyBridgeError::CapabilityGated);
        }
        Python::with_gil(|py| {
            let pm4py = PyModule::import_bound(py, "pm4py")
                .map_err(|e| PM4PyBridgeError::PM4PyNotAvailable(e.to_string()))?;
            let version = pm4py
                .getattr("__version__")
                .and_then(|v| v.extract::<String>())
                .unwrap_or_else(|_| "unknown".to_string());
            Ok(version)
        })
    }

    /// Safely run dataframe formatting in PM4Py.
    pub fn format_dataframe(
        &self,
        csv_data: &str,
        case_id: &str,
        activity: &str,
        timestamp: &str,
    ) -> Result<String, PM4PyBridgeError> {
        if !self.config.enable_runtime {
            return Err(PM4PyBridgeError::CapabilityGated);
        }
        Python::with_gil(|py| {
            let io = PyModule::import_bound(py, "io")
                .map_err(|e| PM4PyBridgeError::ImportError(e.to_string()))?;
            let pd = PyModule::import_bound(py, "pandas")
                .map_err(|e| PM4PyBridgeError::ImportError(e.to_string()))?;
            let pm4py = PyModule::import_bound(py, "pm4py")
                .map_err(|e| PM4PyBridgeError::PM4PyNotAvailable(e.to_string()))?;

            let string_io = io.getattr("StringIO")?.call1((csv_data,))?;
            let df = pd.getattr("read_csv")?.call1((string_io,))?;

            let kwargs = PyDict::new_bound(py);
            kwargs.set_item("case_id", case_id)?;
            kwargs.set_item("activity_key", activity)?;
            kwargs.set_item("timestamp_key", timestamp)?;

            let df_formatted = pm4py.getattr("format_dataframe")?.call((df,), Some(&kwargs))?;

            // Serialize formatted dataframe to CSV string
            let buf = io.getattr("StringIO")?.call0()?;
            let df_kwargs = PyDict::new_bound(py);
            df_kwargs.set_item("index", false)?;
            df_formatted.getattr("to_csv")?.call((buf.clone(),), Some(&df_kwargs))?;
            let result: String = buf.getattr("getvalue")?.call0()?.extract()?;
            Ok(result)
        })
        .map_err(|py_err| PM4PyBridgeError::ExecutionError(py_err.to_string()))
    }

    /// Safely discover a Petri net and return its PNML representation.
    pub fn discover_petri_net(
        &self,
        csv_data: &str,
        case_id: &str,
        activity: &str,
        timestamp: &str,
    ) -> Result<String, PM4PyBridgeError> {
        if !self.config.enable_runtime {
            return Err(PM4PyBridgeError::CapabilityGated);
        }
        Python::with_gil(|py| {
            let io = PyModule::import_bound(py, "io")
                .map_err(|e| PM4PyBridgeError::ImportError(e.to_string()))?;
            let pd = PyModule::import_bound(py, "pandas")
                .map_err(|e| PM4PyBridgeError::ImportError(e.to_string()))?;
            let pm4py = PyModule::import_bound(py, "pm4py")
                .map_err(|e| PM4PyBridgeError::PM4PyNotAvailable(e.to_string()))?;

            let string_io = io.getattr("StringIO")?.call1((csv_data,))?;
            let df = pd.getattr("read_csv")?.call1((string_io,))?;

            let kwargs = PyDict::new_bound(py);
            kwargs.set_item("case_id", case_id)?;
            kwargs.set_item("activity_key", activity)?;
            kwargs.set_item("timestamp_key", timestamp)?;

            let df_formatted = pm4py.getattr("format_dataframe")?.call((df,), Some(&kwargs))?;

            let net_tuple = pm4py.getattr("discover_petri_net_inductive")?.call1((df_formatted,))?;
            let net = net_tuple.get_item(0)?;
            let im = net_tuple.get_item(1)?;
            let fm = net_tuple.get_item(2)?;

            // Use tempfile to write PNML and read it back
            let tempfile = PyModule::import_bound(py, "tempfile")
                .map_err(|e| PM4PyBridgeError::ImportError(e.to_string()))?;
            let temp_dir = tempfile.getattr("mkdtemp")?.call0()?.extract::<String>()?;
            let temp_path = std::path::Path::new(&temp_dir).join("net.pnml");
            let temp_path_str = temp_path.to_str().ok_or_else(|| {
                PM4PyBridgeError::SerializationError("Invalid temp directory path".to_string())
            })?;

            pm4py.getattr("write_pnml")?.call1((net, im, fm, temp_path_str))?;
            let pnml_content = std::fs::read_to_string(&temp_path)
                .map_err(|e| PM4PyBridgeError::SerializationError(e.to_string()))?;

            let _ = std::fs::remove_dir_all(&temp_dir); // Clean up temp files

            Ok(pnml_content)
        })
        .map_err(|py_err| PM4PyBridgeError::ExecutionError(py_err.to_string()))
    }
}
```

### B. Exception Catching & Safety Strategy
* **PyO3 Exception Mapping**: PyO3 errors (`PyErr`) are mapped directly to `PM4PyBridgeError` variants. This isolates the LSP server from Python runtime failures, syntax crashes, or missing system dependencies.
* **Defensive Cleanup**: Temporary directories/files created inside Python are cleaned up immediately via a scoped file remove wrapper in Rust, preventing leakage of sensitive event log fragments.

---

## 3. Test Strategies and File Proposals

To ensure high-fidelity verification and prevent regressions, we propose structured test strategies for static analysis and the runtime bridge.

### A. `crates/pm4py-lsp/tests/static_analysis_test.rs`
The test suite for static analysis should be expanded to explicitly test all edge cases and gaps.

**Key Test Cases**:
1. **`test_indented_imports`**:
   Verify that `import pm4py` and `import pandas as pd` placed inside an indented python function or conditional block are correctly extracted.
2. **`test_compound_imports`**:
   Verify that `import sys, pandas as pd, pm4py` correctly extracts `pd` and `pm4py` aliases.
3. **`test_submodule_import_extraction`**:
   Verify that `from pm4py.algo.discovery.inductive import algorithm as inductive_miner` successfully registers `inductive_miner` as a pm4py alias, and that subsequent calls like `inductive_miner.apply(...)` are classified as discovery calls.
4. **`test_path_variable_resolution`**:
   Verify that when paths are stored in variables (e.g. `path = "log.csv"; df = pd.read_csv(path)`), the file "log.csv" is still identified in the `csv_loads`.
5. **`test_alternative_loading_methods`**:
   Verify that `pm4py.read_xes('log.xes')` and `pm4py.read_csv('log.csv')` are detected.
6. **`test_positional_arguments_format`**:
   Verify that calling `pm4py.format_dataframe(df, "case", "act", "time")` positionally does not generate false positive missing mapping diagnostics.

### B. `crates/pm4py-lsp/tests/pm4py_bridge_test.rs`
This is a new test file that isolates Python runtime execution testing.

**Key Test Cases**:
1. **`test_capability_gating_disabled`**:
   Initialize `PM4PyRuntimeBridge` with `enable_runtime: false`. Assert that calls to `check_pm4py_availability`, `format_dataframe`, and `discover_petri_net` return `Err(PM4PyBridgeError::CapabilityGated)`.
2. **`test_python_import_failure`**:
   Initialize bridge with `enable_runtime: true` and verify that if pandas/pm4py are not available in the python environment, it returns `Err(PM4PyBridgeError::PM4PyNotAvailable)` or `Err(PM4PyBridgeError::ImportError)` and does not panic.
3. **`test_invalid_csv_data_safety`**:
   Pass malformed CSV data (e.g. empty CSV or invalid headers) to `format_dataframe` and assert it returns `Err(PM4PyBridgeError::ExecutionError)`.
4. **`test_successful_discovery_roundtrip`**:
   Pass a valid CSV structure to `discover_petri_net` and verify that a valid PNML string containing the `<pnml>` tag structure is returned.

---

## 4. Documentation Layouts

We propose two new report structures to detail our technical implementation and validation.

### A. `docs/reports/pm4py-lsp-agent-reports/static_analysis.md`

```markdown
# Static Analysis Implementation Report

**Role**: Static Analysis Agent
**Milestone**: Milestone 2
**Project**: `pm4py-lsp` Parser Specifications & AST Refinements

## 1. Overview
This report describes the static analysis parser engine implemented in `crates/pm4py-lsp/src/analysis.rs`. It details the parser's strategy, supported Python import forms, and the classification patterns used to detect process mining pipelines.

## 2. Parsing Engine Architecture
- **Regex Strategy**: Explanation of the regex engine, anchors, and multiline flags used.
- **AST Transition (Optional)**: Discussion of why regex was chosen over a full Python AST compiler, and the trade-offs in performance and portability.

## 3. Supported Patterns & Grammar
- **Imports**: Complete list of matched import declarations (indented, compound, submodule).
- **Log Loaders**: Supported loaders (pandas, pm4py native, alternative file formats).
- **Format dataframe**: Detection of keyword/positional parameters.
- **Discovery**: Supported algorithm calls.

## 4. Verification & Testing
- Summary of static analysis tests executed in `static_analysis_test.rs`.
- Verifications for correct refusal behavior on incomplete column mappings.
```

### B. `docs/reports/pm4py-lsp-agent-reports/pm4py_runtime.md`

```markdown
# PM4Py Runtime Bridge Report

**Role**: Runtime Agent
**Milestone**: Milestone 2
**Project**: `pm4py-lsp` PyO3 Integration & Safe Execution

## 1. Runtime Isolation Architecture
This report outlines how `pm4py-lsp` interfaces with local Python interpreters via PyO3, highlighting safety guarantees, error isolation, and configuration gating.

## 2. Gating and Capability Verification
- **gated_execution**: Details of how capability gates block Python imports if disabled.
- **Verification Commands**: List of checks to determine Python/PM4Py availability.

## 3. Safe Execution Boundaries
- **PyO3 Exception Mapping Table**: Maps specific Python runtime exceptions (e.g. `FileNotFoundError`, `KeyError`) to Rust's `PM4PyBridgeError` enum.
- **Memory & Resource Safety**: Details of temporary file cleanup when extracting models.

## 4. Parity and Replay Verdicts
- Execution flow of the `verify_parity` routine.
- Classification criteria for equivalence (Exact, Semantic, Statistical).
```
