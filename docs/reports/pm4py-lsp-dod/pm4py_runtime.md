# PM4Py Runtime Bridge Investigation Report

**Role**: Runtime Agent (`runtime`)  
**Milestone**: Milestone 7 Verification and Checkpoint Promotion  
**Project**: `pm4py-lsp` Python/Pyo3 Integration & Fallback Mode

## 1. Optional Pyo3 Execution Bridge
To validate the behavior of process mining python scripts, the language server incorporates a Pyo3-based runtime bridge in `crates/pm4py-lsp/src/pm4py_bridge.rs`. It provides:
- GIL-synchronized Python interpreter invocation (`Python::with_gil`).
- Dynamic imports of `pandas` and `pm4py`.
- Dynamic execution of process discovery workflows using keyword/positional parameters parsed from the target document.

## 2. Static Fallback Mode
Because the compiler must remain functional even in environments without a Python interpreter, the bridge implements an optional runtime mode controlled by a global atomic variable:
- By default, `RUNTIME_MODE` is disabled (`false`), placing the server in **Static Mode**.
- In Static Mode, the bridge does not attempt to spin up Python. It returns deterministic, mock-free static outputs (e.g., `"Petri Net discovered (static mode)"`) mapping to the requested algorithm call.
- This ensures full compilation and LSP availability without installing a local python environment.

## 3. Panic & Failure Safety
The integration uses robust boundaries to prevent language server crashes:
- GIL execution and modules loading are wrapped in `std::panic::catch_unwind` boundaries.
- Errors are caught and structured as typed failure verdicts:
  - `BridgeError::PythonUnavailable`
  - `BridgeError::ImportError(String)`
  - `BridgeError::ExecutionError(String)`
- This prevents downstream panics from propagating to the main thread of the language server.

## 4. Test Verification
The execution models are verified in:
- `tests/parity_contract_test.rs`: Includes tests `test_run_pm4py_workflow_static` and `test_run_pm4py_workflow_runtime` verifying both modes execute safely.
All runtime bridge tests pass.
