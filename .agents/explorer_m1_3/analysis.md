# Milestone 1 Assessment: Unit & Integration Gates Mapping Analysis

**Prepared by:** Teamwork Explorer (`explorer_m1_3`)  
**Date:** June 5, 2026  
**Crate:** `crates/pm4py-lsp`  

---

## 1. Executive Summary

This report maps the existing unit and integration tests under `crates/pm4py-lsp/tests/` to the twenty-eight required gates defined in `ORIGINAL_REQUEST.md` (Unit Gates U1-U18 and Integration Gates I1-I10). 

### Key Findings
1. **Missing Test Target File**: `tests/pm4py_bridge_test.rs` is completely missing from the filesystem despite being listed as a planned target in the repository layout. As a result, unit/graceful fallback tests for the PyO3 execution bridge (U18) are severely under-tested.
2. **Untested Implementation Branches (U3, U4)**: Although the static analysis parser in `src/analysis.rs` has logic to detect `from pm4py import ...` and plain `import pandas` imports, these code paths are not exercised by any test.
3. **Fixture Reload Gap (U12)**: The test `test_fixture_persistence` in `tests/receipts_fixtures_test.rs` verifies that a fixture JSON file is written to disk, but it never reloads/parses the file to verify its structure.
4. **Idempotency/Refusal Bug (I10)**: Repeated execution of the `pm4py-lsp.formatDataFrame` command is not idempotent. Because the command execution blindly appends the format statement at `next_line`, calling it multiple times will insert duplicate lines (e.g., `df = pm4py.format_dataframe(df)` repeated consecutively), corrupting the script. No tests verify idempotency or correct refusal behavior for repeated commands.
5. **Reconciled Verdict**: The test suite is functionally passing, but there are multiple verification gaps in parity contract decisions, fixture reload checks, and command idempotency. 

---

## 2. Unit Gates Mapping (U1 - U18)

| Gate ID | Requirement | Status | Test File & Function | Analysis & Gaps |
| :--- | :--- | :--- | :--- | :--- |
| **U1** | Detect `import pm4py` | **FULLY COVERED** | `tests/static_analysis_test.rs`<br>`test_pipeline_facts_extraction` | Content contains `import pm4py` and asserts `facts.has_pm4py` is true and alias list contains `"pm4py"`. |
| **U2** | Detect `import pm4py as pm` | **FULLY COVERED** | `tests/static_analysis_test.rs`<br>`test_all_pm4py_capabilities_static_analysis` | Content contains `import pm4py as pm` and asserts alias list contains `"pm"`. |
| **U3** | Detect `from pm4py import ...` | **MISSING** | None | **Gap**: No test covers this syntax. The implementation exists in `src/analysis.rs` (lines 35-38) but is not exercised. |
| **U4** | Detect pandas aliases | **PARTIALLY COVERED** | `tests/static_analysis_test.rs`<br>`test_pipeline_facts_extraction` | Tests `import pandas as pd`. **Gap**: Plain `import pandas` or `from pandas import ...` imports are not tested, leaving those branches in `src/analysis.rs` (lines 45-53) unverified. |
| **U5** | Detect `read_csv` variables | **FULLY COVERED** | `tests/static_analysis_test.rs`<br>`test_pipeline_facts_extraction` | Tests `df = pd.read_csv('event_log.csv')` and asserts `facts.csv_loads` contains `"event_log.csv"`. Also tests parquet, json, excel loads. |
| **U6** | Detect `format_dataframe` variables | **FULLY COVERED** | `tests/static_analysis_test.rs`<br>`test_pipeline_facts_extraction` | Verifies variables returned by `format_dataframe` are stored in `facts.formatted_vars`. |
| **U7** | Detect discovery calls | **FULLY COVERED** | `tests/static_analysis_test.rs`<br>`test_all_pm4py_capabilities_static_analysis` | Asserts detection of `discover_dfg` and `discover_bpmn_inductive` under correct alias prefixes. |
| **U8** | Detect missing mappings | **FULLY COVERED** | `tests/static_analysis_test.rs`<br>`test_missing_mappings` | Asserts that `format_dataframe(df)` (without args) sets missing mapping flags to true. |
| **U9** | Generate deterministic snapshot | **FULLY COVERED** | `tests/receipts_fixtures_test.rs`<br>`test_snapshot_id_determinism`<br>`tests/capability_test.rs`<br>`test_snapshot_determinism` | Verifies that sorting and hashing inputs (URIs, text, config) yields identical `SnapshotId`. |
| **U10** | Snapshot changes when document changes | **FULLY COVERED** | `tests/receipts_fixtures_test.rs`<br>`test_snapshot_id_determinism` | Asserts that different document text contents produce distinct snapshot hashes (`assert_ne!`). |
| **U11** | Generate fixture payload | **FULLY COVERED** | `tests/capability_test.rs`<br>`test_create_parity_fixture` | Verifies that `create_parity_fixture` extracts CSV path, parameters, and outcome class correctly. |
| **U12** | Persist/reload fixture | **PARTIALLY COVERED** | `tests/receipts_fixtures_test.rs`<br>`test_fixture_persistence` | Tests *persisting* the fixture to disk under `fixtures/pm4py-parity/`. **Gap**: Does not reload or parse the file back to verify its structure. |
| **U13** | Persist/reload receipt | **FULLY COVERED** | `tests/receipts_fixtures_test.rs`<br>`test_receipt_persistence` | Writes the receipt to disk and reloads/validates it using `verify_receipt_file`. |
| **U14** | Corrupt receipt refuses | **FULLY COVERED** | `tests/receipts_fixtures_test.rs`<br>`test_corrupt_receipt_refusal` | Verifies that tampered hashes or modified data payloads trigger receipt verification failure. |
| **U15** | Parity exact match admits | **PARTIALLY COVERED** | `tests/parity_contract_test.rs`<br>`test_classify_parity_gap` | Asserts `classify_parity_gap` outputs `"No gap detected."` if outcomes match. **Gap**: No integration testing showing state machine or vector shifts based on parity verdicts. |
| **U16** | Parity mismatch refuses | **PARTIALLY COVERED** | `tests/parity_contract_test.rs`<br>`test_classify_parity_gap` | Asserts `classify_parity_gap` flags discrepancies. **Gap**: Only checks string format; does not verify server refusal actions. |
| **U17** | Unsupported parity is Unsupported | **MISSING** | None | **Gap**: No tests verify that unsupported parity models or equivalence kinds default to `Unsupported` instead of `Refused`. |
| **U18** | PM4Py unavailable returns Unknown/Refused | **PARTIALLY COVERED** | `tests/parity_contract_test.rs`<br>`test_run_pm4py_workflow_runtime` | Checks that running in runtime mode on a non-existent file returns a structured error and does not panic. **Gap**: **Missing test file `pm4py_bridge_test.rs`** leaves import unavailability and GIL catch-unwind logic untested. |

---

## 3. Integration Gates Mapping (I1 - I10)

| Gate ID | Requirement | Status | Test File & Function | Analysis & Gaps |
| :--- | :--- | :--- | :--- | :--- |
| **I1** | Unformatted DataFrame produces diagnostic | **FULLY COVERED** | `tests/diagnostic_test.rs`<br>`test_pm4py_diagnostic`<br>`tests/capability_test.rs`<br>`test_unformatted_dataframe_diagnostic` | Verifies unformatted read_csv triggers `pm4py.py.unformatted_dataframe` warning. |
| **I2** | Repair clears only related diagnostic | **MISSING** | None | **Gap**: No integration test ensures that applying the quickfix repair preserves unrelated warnings (such as discovery before formatting). |
| **I3** | Missing mapping diagnostics remain after formatting | **PARTIALLY COVERED** | `tests/diagnostics_test.rs`<br>`test_missing_mappings_diagnostics` | Validates that mapping warnings co-exist when `format_dataframe` lacks options. **Gap**: No integration-level didChange test validates this lifecycle behavior. |
| **I4** | `createParityFixture` writes fixture | **FULLY COVERED** | `tests/actions_commands_test.rs`<br>`test_create_parity_fixture_command` | Asserts `execute_command` for parity fixture creation writes a physical JSON to `fixtures/pm4py-parity/`. |
| **I5** | `generateReceipt` writes receipt | **FULLY COVERED** | `tests/actions_commands_test.rs`<br>`test_create_parity_fixture_command`<br>`tests/capability_test.rs`<br>`test_physical_persistence` | Verifies receipt JSON is written under `receipts/pm4py-lsp/<snapshot>/` on command execution. |
| **I6** | Command receipt hash verifies | **FULLY COVERED** | `tests/capability_test.rs`<br>`test_physical_persistence` | Asserts receipt hash matches the computed BLAKE3 hash of the written fixture payload. |
| **I7** | Conformance vector moves Refused → Admitted | **FULLY COVERED** | `tests/capability_test.rs`<br>`test_conformance_vector_shift` | Validates that adding `format_dataframe` shifts conformance axis `pm4py.law.formatted` from Refused to Admitted. |
| **I8** | Unknown law axis remains Unknown | **MISSING** | None | **Gap**: No test asserts that `pm4py.law.mapped` resides in the unknown vector of `max_conformance_vector`. |
| **I9** | Malformed command args refuse safely | **FULLY COVERED** | `tests/actions_commands_test.rs`<br>`test_malformed_command_refusal` | Confirms execution of `formatDataFrame` with empty arguments yields an RPC error, not a panic. |
| **I10** | Repeated command is idempotent/refused | **MISSING** | None | **Gap / Bug**: Repeated execution of `formatDataFrame` blindly appends duplicate lines without verifying prior edits. This violates idempotency and corrupts source files. There is no test for this behavior. |

---

## 4. Summary of Codebase Gaps & Issues

1. **Non-Idempotency of `pm4py-lsp.formatDataFrame` (Bug/Gap)**:
   In `src/lib.rs` (lines 366-446), the handler for `pm4py-lsp.formatDataFrame` inserts the formatting statement `df = pm4py.format_dataframe(df)` on the line following `pd.read_csv`. It does not verify if that line (or subsequent lines) already contains a formatting call. Running the command twice corrupts the Python script by inserting the same statement multiple times.
2. **Missing Test File `tests/pm4py_bridge_test.rs`**:
   The test module layout specifies a unit test file dedicated to `pm4py_bridge.rs`. Its absence leaves capability-gated Python package checking and GIL panic catching unverified in standalone tests.
3. **Fixture Reload Check Absence**:
   While receipt verification (`verify_receipt_file`) fully reloads and parses receipts, `test_fixture_persistence` only asserts the file exists on disk, failing to verify that the serialized JSON can be deserialized back into a valid fixture struct.
4. **Untested Python Parser Patterns**:
   The parser regexes support imports of type `from pm4py import ...` and `import pandas`, but no tests use these structures.

---

## 5. Recommended Remediation Strategy

1. **Implement Idempotency Guard**:
   Update `Backend::execute_command` for `pm4py-lsp.formatDataFrame` to check if `pm4py.format_dataframe` already exists for the variable before applying the text edit. Return a structured error/refusal if formatting is already present.
2. **Create `tests/pm4py_bridge_test.rs`**:
   Add a unit test file specifically for the PyO3 bridge. It should verify:
   - Behavior when python/pm4py packages are missing.
   - Behavior when `RUNTIME_MODE` is disabled vs enabled.
   - Exception handling and catching GIL unwinds.
3. **Enhance Fixture Verification**:
   Add a `verify_fixture_file` helper in `src/fixtures.rs` (similar to receipts) that reads and deserializes the JSON file from disk to ensure it is structurally valid, and call it from `test_fixture_persistence`.
4. **Expand Test Cases in `static_analysis_test.rs`**:
   Add test cases exercising imports of the format `from pm4py import *`, plain `import pandas`, and `from pandas import read_csv`.
5. **Add Integration Tests for Coexisting Diagnostics and Idempotency**:
   Add integration test assertions verifying that diagnostics clear appropriately, and executing the repair twice returns a safe refusal.
