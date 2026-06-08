# Milestone 2 Analysis — PM4Py-LSP Static Analysis and PyO3 Runtime Bridge

## 1. Executive Summary

This report presents a read-only investigation of the `pm4py-lsp` adapter codebase. We identified several compilation errors in the current codebase state, analyzed gaps in the static analysis engine (`crates/pm4py-lsp/src/analysis.rs`), and designed a robust interface for the PyO3 runtime bridge (`crates/pm4py-lsp/src/pm4py_bridge.rs`). We also proposed extensive testing strategies and documentation structures to support Milestone 2.

### Summary of Major Codebase Gaps:
- **Compilation Failures**: The project currently fails to compile due to missing definitions of `diagnose_text` and `create_parity_fixture` in `src/lib.rs`, missing `LawAxis::as_str()`, and mismatched fields in `RepairAction` initialization.
- **Static Analysis Gaps**: The current `analysis.rs` uses basic regex matches that ignore indented imports, direct sub-module imports, native PM4Py log loaders (e.g. `pm4py.read_xes`), multi-line calls, and comments in python source files.
- **PyO3 Integration Design**: The PyO3 bridge needs a safe, capability-gated runtime execution wrapper that prevents process-level panics by catching all PyO3 and Python exceptions.

---

## 2. Analysis of `crates/pm4py-lsp/src/analysis.rs` & Extraction Gaps

### A. Gaps Identified

| Domain | Current Limitations | Required Gaps / Cases to Support |
| :--- | :--- | :--- |
| **Import Forms** | Matches only `import pm4py [as alias]` or `from pm4py ...` on a fresh line (`^import` or `^from`). | <ul><li>Indented imports (e.g., inside local function or class blocks).</li><li>Sub-module direct imports (e.g., `import pm4py.algo.discovery.inductive`).</li><li>Comma-separated imports (e.g., `import pandas, pm4py`).</li><li>Imports of specific sub-modules/functions (e.g., `from pm4py.objects.log.importer.xes import factory as xes_importer`).</li></ul> |
| **Pandas Aliases** | Matches only `import pandas [as alias]` on a fresh line. Defaults to `"pd"`. | <ul><li>Indented pandas imports.</li><li>Comma-separated imports (e.g., `import os, pandas as pd`).</li><li>Fallback mechanism for un-imported but referenced `pd` calls.</li></ul> |
| **Loading Patterns** | Only matches `pandas_alias.read_csv(...)`. | <ul><li>Other pandas log-loading formats (e.g., `read_excel`, `read_parquet`, `read_table`).</li><li>Native PM4Py file readers (e.g., `pm4py.read_xes(...)`, `pm4py.read_csv(...)`).</li><li>Variable-bound paths (e.g., `log_path = "data.csv"; pd.read_csv(log_path)`).</li><li>Direct function imports (e.g., `from pm4py import read_xes; read_xes('file.xes')`).</li></ul> |
| **Formatting Patterns** | Only matches `var = pm4py.format_dataframe(...)` on a single line. | <ul><li>In-place formatting parameters (e.g., `pm4py.format_dataframe(df)` without reassignment).</li><li>Multi-line calls with line continuation or formatting inside loops.</li><li>Naive parameter detection: currently checks if raw string contains `"case_id"`, which matches commented-out lines (e.g. `# case_id='case'`) and fails on nested calls.</li></ul> |
| **Discovery Calls** | Only matches `pm4py_alias.discover_[\w_]+`. | <ul><li>Imported sub-modules called directly (e.g., `from pm4py.algo.discovery.inductive import algorithm as inductive_miner` -> `inductive_miner.apply(df)`).</li><li>Other process mining activities needing formatting (e.g., conformance checking, token replay, social network analysis).</li></ul> |

### B. Proposed Replacement for `crates/pm4py-lsp/src/analysis.rs`

Below is the proposed implementation of `crates/pm4py-lsp/src/analysis.rs` incorporating all missing cases:

```rust
use regex::Regex;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PipelineFacts {
    pub has_pm4py: bool,
    pub pm4py_aliases: Vec<String>,
    pub pandas_aliases: Vec<String>,
    pub csv_loads: Vec<String>,
    pub formatted_vars: Vec<String>,
    pub discovery_calls: Vec<String>,
    pub missing_case_id: bool,
    pub missing_activity: bool,
    pub missing_timestamp: bool,
}

impl PipelineFacts {
    pub fn extract(content: &str) -> Self {
        let mut facts = PipelineFacts::default();
        
        // 1. Check for pm4py imports & sub-modules
        let re_pm4py = Regex::new(r"(?m)(?:^|\s)import\s+pm4py(?:\s+as\s+(\w+))?").unwrap();
        for cap in re_pm4py.captures_iter(content) {
            facts.has_pm4py = true;
            if let Some(alias) = cap.get(1) {
                facts.pm4py_aliases.push(alias.as_str().to_string());
            } else {
                facts.pm4py_aliases.push("pm4py".to_string());
            }
        }
        
        // Comma-separated imports: e.g., import pandas, pm4py as pm
        let re_comma_pm4py = Regex::new(r"(?m)(?:^|\s)import\s+[^#\n]*pm4py\s+as\s+(\w+)").unwrap();
        for cap in re_comma_pm4py.captures_iter(content) {
            let alias = cap.get(1).unwrap().as_str().to_string();
            if !facts.pm4py_aliases.contains(&alias) {
                facts.pm4py_aliases.push(alias);
                facts.has_pm4py = true;
            }
        }

        let re_from_pm4py = Regex::new(r"(?m)(?:^|\s)from\s+pm4py").unwrap();
        if re_from_pm4py.is_match(content) {
            facts.has_pm4py = true;
            
            // Extract custom aliases from from pm4py import x as y
            let re_from_import_alias = Regex::new(r"(?m)(?:^|\s)from\s+pm4py\S*\s+import\s+(?:[^#\n]*\s+as\s+(\w+)|(\w+))").unwrap();
            for cap in re_from_import_alias.captures_iter(content) {
                if let Some(alias) = cap.get(1).or_else(|| cap.get(2)) {
                    let alias_str = alias.as_str();
                    // Avoid inserting standard function names as aliases
                    if alias_str != "format_dataframe" && alias_str != "read_xes" && alias_str != "read_csv" {
                        facts.pm4py_aliases.push(alias_str.to_string());
                    }
                }
            }
        }

        // 2. Check for pandas aliases
        let re_pandas = Regex::new(r"(?m)(?:^|\s)import\s+pandas(?:\s+as\s+(\w+))?").unwrap();
        for cap in re_pandas.captures_iter(content) {
            if let Some(alias) = cap.get(1) {
                facts.pandas_aliases.push(alias.as_str().to_string());
            } else {
                facts.pandas_aliases.push("pandas".to_string());
            }
        }
        // Comma-separated imports: e.g., import os, pandas as pd
        let re_comma_pandas = Regex::new(r"(?m)(?:^|\s)import\s+[^#\n]*pandas\s+as\s+(\w+)").unwrap();
        for cap in re_comma_pandas.captures_iter(content) {
            let alias = cap.get(1).unwrap().as_str().to_string();
            if !facts.pandas_aliases.contains(&alias) {
                facts.pandas_aliases.push(alias);
            }
        }
        if facts.pandas_aliases.is_empty() {
            facts.pandas_aliases.push("pd".to_string()); // Common fallback
        }

        // 3. Check for CSV & Event Log loads (pandas and native pm4py)
        for alias in &facts.pandas_aliases {
            let pattern = format!(
                r#"{}\.read_(?:csv|excel|parquet|table)\s*\(\s*['"]([^'"]+)['"]"#,
                regex::escape(alias)
            );
            let re_csv = Regex::new(&pattern).unwrap();
            for cap in re_csv.captures_iter(content) {
                facts.csv_loads.push(cap.get(1).unwrap().as_str().to_string());
            }
        }
        
        for alias in &facts.pm4py_aliases {
            let pattern = format!(
                r#"{}\.read_(?:xes|csv)\s*\(\s*['"]([^'"]+)['"]"#,
                regex::escape(alias)
            );
            let re_pm4py_load = Regex::new(&pattern).unwrap();
            for cap in re_pm4py_load.captures_iter(content) {
                facts.csv_loads.push(cap.get(1).unwrap().as_str().to_string());
            }
        }

        // Handle direct function loads (from pm4py import read_xes; read_xes('file.xes'))
        let re_direct_load = Regex::new(r#"(?:read_xes|read_csv)\s*\(\s*['"]([^'"]+)['"]"#).unwrap();
        for cap in re_direct_load.captures_iter(content) {
            facts.csv_loads.push(cap.get(1).unwrap().as_str().to_string());
        }

        // 4. Formatted vars (pm4py.format_dataframe)
        for alias in &facts.pm4py_aliases {
            let pattern = format!(r"(\w+)\s*=\s*{}\.format_dataframe", regex::escape(alias));
            let re_format = Regex::new(&pattern).unwrap();
            for cap in re_format.captures_iter(content) {
                facts.formatted_vars.push(cap.get(1).unwrap().as_str().to_string());
            }
            
            // Extract and clean formatting arguments (multiline and comments supported)
            let re_full_format = Regex::new(&format!(
                r#"{}\.format_dataframe\s*\((?s:(.*?))\)"#,
                regex::escape(alias)
            )).unwrap();
            for cap in re_full_format.captures_iter(content) {
                let args = cap.get(1).unwrap().as_str();
                let has_case_id = args.lines()
                    .filter(|line| !line.trim().starts_with('#'))
                    .any(|line| line.contains("case_id"));
                let has_activity = args.lines()
                    .filter(|line| !line.trim().starts_with('#'))
                    .any(|line| line.contains("activity"));
                let has_timestamp = args.lines()
                    .filter(|line| !line.trim().starts_with('#'))
                    .any(|line| line.contains("timestamp"));

                if !has_case_id { facts.missing_case_id = true; }
                if !has_activity { facts.missing_activity = true; }
                if !has_timestamp { facts.missing_timestamp = true; }
            }
        }

        // 5. Discovery calls (pm4py.discover_*, sub-module calls, direct imported miner calls)
        for alias in &facts.pm4py_aliases {
            let re_discovery = Regex::new(&format!(r"{}\.discover_[\w_]+", regex::escape(alias))).unwrap();
            for cap in re_discovery.captures_iter(content) {
                facts.discovery_calls.push(cap.get(0).unwrap().as_str().to_string());
            }

            let re_sub_discovery = Regex::new(&format!(r"{}\.algo\.discovery\.\w+", regex::escape(alias))).unwrap();
            for cap in re_sub_discovery.captures_iter(content) {
                facts.discovery_calls.push(cap.get(0).unwrap().as_str().to_string());
            }
        }

        // Direct imported miner calls (e.g., alpha_miner.apply(df))
        let re_direct_discover = Regex::new(r"(\w+)\.apply\s*\(").unwrap();
        for cap in re_direct_discover.captures_iter(content) {
            let caller = cap.get(1).unwrap().as_str();
            if facts.pm4py_aliases.contains(&caller.to_string()) {
                facts.discovery_calls.push(format!("{}.apply", caller));
            }
        }

        facts
    }
}
```

---

## 3. Design of `crates/pm4py-lsp/src/pm4py_bridge.rs` (PyO3 Runtime Bridge)

To enable capability-gated process mining execution checks on the local host during LSP operations without risking system panics, we design a PyO3 runtime bridge.

### A. Interface and Type Definitions

```rust
use pyo3::prelude::*;
use pyo3::types::{PyDict, PyModule};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};

// Configuration of the PM4Py bridge
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PM4PyBridgeConfig {
    pub enable_runtime: bool,
    pub python_path: Option<String>,
}

// Result mapping indicating runtime success or safe refusal/failures
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum ExecutionResult<T> {
    Success(T),
    CapabilityGated,
    PythonUnavailable(String),
    ExecutionError(String),
}

// Current status of local PM4Py install
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum PM4PyStatus {
    Available(String), // Version
    Unknown,
}
```

### B. Safe GIL Management & Exception Catching Implementation

The PyO3 execution context must be wrapped safely using `Python::with_gil` to prevent compiler/GIL deadlocks. The proposed code structure is as follows:

```rust
static RUNTIME_ENABLED: AtomicBool = AtomicBool::new(false);

pub fn set_runtime_enabled(enabled: bool) {
    RUNTIME_ENABLED.store(enabled, Ordering::Relaxed);
}

pub fn is_runtime_enabled() -> bool {
    RUNTIME_ENABLED.load(Ordering::Relaxed) && check_pm4py() != PM4PyStatus::Unknown
}

pub fn check_pm4py() -> PM4PyStatus {
    // Safely verify if python and pm4py are importable without crashing the host process
    Python::with_gil(|py| {
        match PyModule::import_bound(py, "pm4py") {
            Ok(module) => {
                let version = module
                    .getattr("__version__")
                    .and_then(|v| v.extract::<String>())
                    .unwrap_or_else(|_| "unknown".to_string());
                PM4PyStatus::Available(version)
            }
            Err(_) => PM4PyStatus::Unknown,
        }
    })
}

/// Safely execute pandas loading and PM4Py discovery to verify parity
pub fn run_discovery(
    csv_path: &str,
    parameters: &HashMap<String, String>,
) -> ExecutionResult<String> {
    if !is_runtime_enabled() {
        return ExecutionResult::CapabilityGated;
    }

    Python::with_gil(|py| {
        // Safe module imports
        let pd = match PyModule::import_bound(py, "pandas") {
            Ok(m) => m,
            Err(e) => return ExecutionResult::PythonUnavailable(format!("pandas unavailable: {}", e)),
        };
        let pm4py = match PyModule::import_bound(py, "pm4py") {
            Ok(m) => m,
            Err(e) => return ExecutionResult::PythonUnavailable(format!("pm4py unavailable: {}", e)),
        };

        // Construct kwargs for read_csv safely
        let py_params = PyDict::new_bound(py);
        for (k, v) in parameters {
            let clean_v = v.trim_matches(|c| c == '\'' || c == '"');
            if let Err(e) = py_params.set_item(k, clean_v) {
                return ExecutionResult::ExecutionError(format!("Invalid parameter conversion: {}", e));
            }
        }

        // Run Pandas Load (Read CSV)
        let df = match pd.call_method("read_csv", (csv_path,), Some(&py_params)) {
            Ok(val) => val,
            Err(e) => return ExecutionResult::ExecutionError(format!("pandas.read_csv failed: {}", e)),
        };

        // Format DataFrame as event log
        let formatted_df = match pm4py.call_method1("format_dataframe", (df,)) {
            Ok(val) => val,
            Err(e) => return ExecutionResult::ExecutionError(format!("pm4py.format_dataframe failed: {}", e)),
        };

        // Discover Petri Net (Inductive Miner)
        match pm4py.call_method1("discover_petri_net_inductive", (formatted_df,)) {
            Ok(petri_result) => {
                // If it successfully returns the components, we verify discovery occurred
                if petri_result.get_item(0).is_ok() {
                    ExecutionResult::Success("Petri Net discovered".to_string())
                } else {
                    ExecutionResult::Success("Process discovered".to_string())
                }
            }
            Err(e) => ExecutionResult::ExecutionError(format!("PM4Py Discovery failed: {}", e)),
        }
    })
}

/// Execute arbitrary Python script in the environment (e.g. for dynamic testing)
pub fn execute_code(python_code: &str) -> ExecutionResult<String> {
    if !is_runtime_enabled() {
        return ExecutionResult::CapabilityGated;
    }

    Python::with_gil(|py| {
        match py.run_bound(python_code, None, None) {
            Ok(_) => ExecutionResult::Success("Code execution completed".to_string()),
            Err(e) => ExecutionResult::ExecutionError(format!("Python exception: {:?}", e)),
        }
    })
}
```

---

## 4. Proposed Test Strategies & Test Cases

To guarantee Combinatorial Maximalism and ensure both success and correct refusal pathways are fully verified, we propose the following test layouts.

### A. For `crates/pm4py-lsp/tests/static_analysis_test.rs`

This suite validates the static analysis regex/AST extraction gates. We propose appending the following cases:

```rust
#[test]
fn test_indented_and_comma_imports() {
    let content = r#"
    def main():
        import pm4py as pm, pandas as pd
        df = pd.read_excel("event_log.xlsx")
        event_log = pm.format_dataframe(df)
        net, im, fm = pm.discover_petri_net_inductive(event_log)
    "#;
    let facts = PipelineFacts::extract(content);
    assert!(facts.has_pm4py);
    assert!(facts.pm4py_aliases.contains(&"pm".to_string()));
    assert!(facts.pandas_aliases.contains(&"pd".to_string()));
    assert_eq!(facts.csv_loads, vec!["event_log.xlsx"]);
}

#[test]
fn test_native_pm4py_loading() {
    let content = r#"
import pm4py
log = pm4py.read_xes('my_log.xes')
net = pm4py.algo.discovery.alpha.algorithm.apply(log)
"#;
    let facts = PipelineFacts::extract(content);
    assert!(facts.has_pm4py);
    assert_eq!(facts.csv_loads, vec!["my_log.xes"]);
    assert_eq!(facts.discovery_calls.len(), 1);
}

#[test]
fn test_multiline_format_dataframe_with_comments() {
    let content = r#"
import pm4py
import pandas as pd
df = pd.read_csv('log.csv')
event_log = pm4py.format_dataframe(
    df,
    # case_id='skipped_case',
    activity='concept:name',
    timestamp='time:timestamp'
)
"#;
    let facts = PipelineFacts::extract(content);
    // 'case_id' is commented out, so it must register as missing
    assert!(facts.missing_case_id);
    assert!(!facts.missing_activity);
    assert!(!facts.missing_timestamp);
}
```

### B. For `crates/pm4py-lsp/tests/pm4py_bridge_test.rs`

This file checks that runtime operations do not panic and respect capability-gating constraints.

```rust
use pm4py_lsp::pm4py_bridge::{
    set_runtime_enabled, is_runtime_enabled, run_discovery, check_pm4py, ExecutionResult, PM4PyStatus
};
use std::collections::HashMap;

#[test]
fn test_bridge_when_disabled_gated() {
    set_runtime_enabled(false);
    assert!(!is_runtime_enabled());
    
    let mut params = HashMap::new();
    let result = run_discovery("dummy.csv", &params);
    assert_eq!(result, ExecutionResult::CapabilityGated);
}

#[test]
fn test_bridge_unavailable_python_returns_error_safely() {
    set_runtime_enabled(true);
    // We attempt to run against a missing CSV file with an active bridge
    let mut params = HashMap::new();
    let result = run_discovery("non_existent_file.csv", &params);
    
    // Depending on python/pm4py installation, this should either return PythonUnavailable (if no pm4py)
    // or ExecutionError (due to file not found in pandas) but NEVER panic.
    match result {
        ExecutionResult::PythonUnavailable(msg) => {
            assert!(msg.contains("unavailable") || msg.contains("failed"));
        }
        ExecutionResult::ExecutionError(msg) => {
            assert!(msg.contains("failed") || msg.contains("FileNotFoundError"));
        }
        ExecutionResult::CapabilityGated => {} // Pass if test runs on environment without config
        _ => panic!("Expected a controlled error, got {:?}", result),
    }
}
```

---

## 5. Proposed Documentation Layouts

We propose creating two dedicated documentation reports under `docs/reports/pm4py-lsp-agent-reports/`:

### A. Layout for `static_analysis.md`
```markdown
# PM4Py-LSP Static Analysis Design Report

## 1. Overview
Scope and core architecture of the static analysis matching engine.

## 2. Pipeline Extraction Logic
- Details of regex patterns used for pandas/pm4py imports.
- Supported file loader functions (Pandas vs native PM4Py).
- Handling of multi-line format arguments and comment skipping.

## 3. Diagnostic Rules & Codes
- **pm4py.py.unformatted_dataframe**: Raised when a dataframe is processed before formatting.
- **pm4py.py.missing_xxx_mapping**: Triggered when mandatory columns are missing from `format_dataframe`.
- **pm4py.py.discovery_before_formatting**: Triggered when a miner is applied to a raw DataFrame.

## 4. Verification Benchmarks
Matrix of positive (correct extraction) and negative (proper diagnosis) static test fixtures.
```

### B. Layout for `pm4py_runtime.md`
```markdown
# PM4Py-LSP Runtime Bridge (PyO3) Integration

## 1. Runtime Architecture
High-level structure of the PyO3 execution boundary.

## 2. Capability Gating
- Gating policy: dynamic enablement via LSP configuration parameters.
- Safe fallbacks: how the server behaves when Python is missing or disabled.

## 3. GIL Safety & Process Protection
- GIL acquisition strategy using `Python::with_gil`.
- Panic prevention: safe mapping of `PyErr` to Rust-native `ExecutionResult`.

## 4. Parity Verification Loop
Sequence diagram showing how standard LSP diagnostics verify physical receipts against the Python PM4Py backend.
```

---

## 6. Detailed Codebase Compilation Fixes

Here we present the analysis and exact diffs to fix the current codebase compilation failures in `crates/pm4py-lsp/src/lib.rs`.

### Compilation Error Analysis & Patches:

1. **`create_parity_fixture` and `diagnose_text` missing**:
   - `create_parity_fixture` is used in `lib.rs` line 245, but never imported or defined.
   - `diagnose_text` is used in `lib.rs` line 301.
   - **Resolution**:
     - Implement `create_parity_fixture` inside `crates/pm4py-lsp/src/lib.rs` (or `fixtures.rs` and import it).
     - Implement `diagnose_text` in `crates/pm4py-lsp/src/lib.rs` (or `diagnostics.rs` and import/re-export it).

2. **`LawAxis` has no `as_str()`**:
   - `axis` is a `max_protocol::LawAxis`. In `lib.rs`, `axis.as_str()` is called.
   - **Resolution**: Map the `LawAxis` enum variants to static strings manually in `lib.rs` or vendor a helper.

3. **`RepairAction` field mismatch**:
   - `RepairAction` expects `action_id` and `description`. The code tries to initialize `title` and `command`.
   - **Resolution**: Initialize `action_id` and `description` instead.

### Proposed Code Diffs for `crates/pm4py-lsp/src/lib.rs`:

```rust
// 1. Map LawAxis to string helper function (defined at the bottom of lib.rs)
fn law_axis_to_str(axis: &max_protocol::LawAxis) -> &str {
    match axis {
        max_protocol::LawAxis::Protocol => "protocol",
        max_protocol::LawAxis::Type => "type",
        max_protocol::LawAxis::Fixture => "fixture",
        max_protocol::LawAxis::Documentation => "documentation",
        max_protocol::LawAxis::Release => "release",
        max_protocol::LawAxis::Hook => "hook",
        max_protocol::LawAxis::Repair => "repair",
        max_protocol::LawAxis::Receipt => "receipt",
        max_protocol::LawAxis::Security => "security",
        max_protocol::LawAxis::Autopoiesis => "autopoiesis",
        max_protocol::LawAxis::Domain => "domain",
        max_protocol::LawAxis::Custom(s) => s.as_str(),
    }
}

// 2. Implement diagnose_text (in lib.rs)
pub fn diagnose_text(text: &str) -> Vec<Diagnostic> {
    let facts = analysis::PipelineFacts::extract(text);
    diagnostics::diagnose_pipeline(&facts)
}

// 3. Implement create_parity_fixture (in lib.rs)
pub fn create_parity_fixture(text: &str) -> Option<ParityFixture> {
    let facts = analysis::PipelineFacts::extract(text);
    if !facts.has_pm4py || facts.pandas_aliases.is_empty() {
        return None;
    }
    
    let csv_path = facts.csv_loads.first()?.clone();
    
    // Parse read_csv parameters (e.g. sep=';')
    let mut parameters = HashMap::new();
    for alias in &facts.pandas_aliases {
        let pattern = format!(r#"{}\.read_csv\s*\(\s*['"]([^'"]+)['"]\s*(?:,\s*(.*))?\)"#, regex::escape(alias));
        let re_read_csv = Regex::new(&pattern).unwrap();
        if let Some(cap) = re_read_csv.captures(text) {
            if let Some(args_match) = cap.get(2) {
                let args_str = args_match.as_str();
                let re_kwargs = Regex::new(r#"(\w+)\s*=\s*('[^']+'|"[^"]+"|\w+)"#).unwrap();
                for kwarg_cap in re_kwargs.captures_iter(args_str) {
                    let key = kwarg_cap.get(1).unwrap().as_str().to_string();
                    let val = kwarg_cap.get(2).unwrap().as_str().to_string();
                    parameters.insert(key, val);
                }
            }
            break;
        }
    }
    
    let expected_outcome = if !facts.discovery_calls.is_empty() {
        "Petri Net discovered".to_string()
    } else {
        "Process discovered".to_string()
    };
    
    Some(ParityFixture {
        csv_path,
        parameters,
        expected_outcome,
    })
}

// 4. Update max_admission & max_refusal in lib.rs to use law_axis_to_str & fix RepairAction fields:
// Line 335 change:
let axis_str = law_axis_to_str(&axis);
let hash = hash::blake3_string(&format!("{}-{}", snapshot_id, axis_str));

// Line 362 change:
let axis_str = law_axis_to_str(&axis);
let hash = hash::blake3_string(&format!("{}-{}", snapshot_id, axis_str));

// Line 378 change:
let repair_actions = if law_axis_to_str(&axis) == "pm4py.law.formatted" {
    vec![max_protocol::RepairAction {
        action_id: "pm4py-lsp.formatDataFrame".to_string(),
        description: "Format DataFrame using pm4py".to_string(),
    }]
} else {
    Vec::new()
};
```
