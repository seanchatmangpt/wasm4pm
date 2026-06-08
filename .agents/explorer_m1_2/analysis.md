# pm4py-lsp Milestone 1: Unit & Integration Test Mapping and Gap Analysis

## 1. Executive Summary
We have conducted a systematic, read-only analysis of the `crates/pm4py-lsp` codebase under `src/` and `tests/`. The goal is to map the existing unit and integration tests to the 18 Unit Gates (U1-U18) and 10 Integration Gates (I1-I10) defined in the project instructions, identify missing tests or semantic mismatches, and recommend a strategy for closure.

All 26 existing unit and integration tests compile and run successfully on macOS, provided the correct dynamic framework path is supplied to PyO3:
`DYLD_FRAMEWORK_PATH=/Applications/Xcode.app/Contents/Developer/Library/Frameworks cargo test -p pm4py-lsp --tests`

### Overall Status: **PARTIAL_ALIVE**
While the basic infrastructure and 26 tests are passing, we identified multiple test coverage gaps (e.g., parsing imports with `from pm4py import ...` or `from pandas import ...`, variable extraction, repeated command idempotency) and a lack of fully realized verdict classification logic for parity contract gates (U15-U17).

---

## 2. Unit Gates Mapping (U1-U18)

| Gate | Requirement Description | Test Location / Function | Code Path | Status | Gaps / Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **U1** | Detect `import pm4py` | `static_analysis_test.rs`:<br>`test_pipeline_facts_extraction` | `analysis.rs` (lines 25-33) | **Fully Covered** | Correctly asserts `facts.has_pm4py` and `facts.pm4py_aliases`. |
| **U2** | Detect `import pm4py as pm` | `static_analysis_test.rs`:<br>`test_all_pm4py_capabilities_static_analysis` | `analysis.rs` (lines 25-33) | **Fully Covered** | Correctly asserts custom pm4py import aliases. |
| **U3** | Detect `from pm4py import ...` | **None** | `analysis.rs` (lines 35-38) | **Missing Test** | Code exists to check `from pm4py\b`, but there is zero test verification. |
| **U4** | Detect pandas aliases | `static_analysis_test.rs`:<br>`test_pipeline_facts_extraction` | `analysis.rs` (lines 41-56) | **Partially Covered** | Asserts `"pd"` alias, but does not test `import pandas` without alias or `from pandas import ...`. |
| **U5** | Detect `read_csv` variables | `static_analysis_test.rs`:<br>`test_pipeline_facts_extraction`, `test_all_pm4py_capabilities_static_analysis` | `analysis.rs` (lines 59-68) | **Partially Covered** | Checks path extraction (`csv_loads`), but never asserts `facts.csv_vars` contents (variable name). |
| **U6** | Detect `format_dataframe` variables | `static_analysis_test.rs`:<br>`test_pipeline_facts_extraction` | `analysis.rs` (lines 71-118) | **Fully Covered** | Verifies `facts.formatted_vars` contains the formatted variable name. |
| **U7** | Detect discovery calls | `static_analysis_test.rs`:<br>`test_pipeline_facts_extraction`, `test_all_pm4py_capabilities_static_analysis` | `analysis.rs` (lines 121-144) | **Fully Covered** | Asserts correct extraction of discovery methods (e.g. `pm.discover_dfg`). |
| **U8** | Detect missing mappings | `static_analysis_test.rs`:<br>`test_missing_mappings` | `analysis.rs` (lines 79-117) | **Fully Covered** | Asserts that `missing_case_id`, `missing_activity`, and `missing_timestamp` flags are set. |
| **U9** | Deterministic snapshot hash | `receipts_fixtures_test.rs`:<br>`test_snapshot_id_determinism`<br>`capability_test.rs`:<br>`test_snapshot_determinism` | `receipts.rs` (lines 9-30)<br>`lib.rs` (lines 518-531) | **Fully Covered** | Verifies snapshot ID is identical for same files/configs regardless of order. |
| **U10** | Snapshot changes on edits | `receipts_fixtures_test.rs`:<br>`test_snapshot_id_determinism` | `receipts.rs` (lines 9-30) | **Fully Covered** | Verifies snapshot ID changes when document text changes. |
| **U11** | Generate fixture payload | `capability_test.rs`:<br>`test_create_parity_fixture` | `lib.rs` (lines 240-269) | **Fully Covered** | Asserts correct extraction of CSV path, separator parameters, and expected outcome. |
| **U12** | Persist/reload fixture | `receipts_fixtures_test.rs`:<br>`test_fixture_persistence` | `fixtures.rs` (lines 12-22) | **Partially Covered** | Asserts persistence/existence, but **never reload-tests** (deserialization back to struct). |
| **U13** | Persist/reload receipt | `receipts_fixtures_test.rs`:<br>`test_receipt_persistence` | `receipts.rs` (lines 44-56) | **Fully Covered** | Verifies receipt is written, reloaded, and verified via `verify_receipt_file`. |
| **U14** | Corrupt receipt refuses | `receipts_fixtures_test.rs`:<br>`test_corrupt_receipt_refusal` | `receipts.rs` (lines 58-73) | **Fully Covered** | Verifies that modifying the hash or data in the persisted JSON returns false. |
| **U15** | Parity exact match admits | `parity_contract_test.rs`:<br>`test_classify_parity_gap`, `test_parity_fixture_and_verdict_instantiation` | `parity.rs` (lines 31-37) | **Partially Covered** | Barebones helper `classify_parity_gap` is tested, but there is no verdict classification logic. |
| **U16** | Parity mismatch refuses | `parity_contract_test.rs`:<br>`test_classify_parity_gap` | `parity.rs` (lines 31-37) | **Partially Covered** | Checks string gap detection, but lacks verdict mapping or formal refusal. |
| **U17** | Unsupported parity | **None** | `parity.rs` | **Missing Test / Code** | No logic exists to distinguish Unsupported parity from Refused parity. |
| **U18** | PM4Py unavailable safety | `parity_contract_test.rs`:<br>`test_run_pm4py_workflow_runtime` | `pm4py_bridge.rs` (lines 29-264) | **Fully Covered** | Asserts execution fails gracefully (returning `Err`) rather than panicking. |

---

## 3. Integration Gates Mapping (I1-I10)

| Gate | Requirement Description | Test Location / Function | Code Path | Status | Gaps / Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **I1** | Unformatted DataFrame produces diagnostic | `capability_test.rs`:<br>`test_unformatted_dataframe_diagnostic`<br>`diagnostic_test.rs`:<br>`test_pm4py_diagnostic` | `lib.rs` (lines 55-136, 139-238)<br>`diagnostics.rs` (lines 37-91) | **Fully Covered** | Verifies that unformatted pd.read_csv loads produce the unformatted dataframe warning. |
| **I2** | Repair clears only related diagnostic (residual preservation) | `capability_test.rs`:<br>`test_formatted_dataframe_diagnostic_none` | `lib.rs` (lines 55-136, 139-238) | **Partially Covered** | Test clears *all* diagnostics by repairing everything. Does not assert that unrelated diagnostics remain. |
| **I3** | Missing mappings remain after formatting | `diagnostics_test.rs`:<br>`test_missing_mappings_diagnostics` | `diagnostics.rs` (lines 56-75) | **Fully Covered** | Unit test verifies that formatting without parameters leaves mapping diagnostics active. |
| **I4** | `createParityFixture` writes fixture | `actions_commands_test.rs`:<br>`test_create_parity_fixture_command`<br>`capability_test.rs`:<br>`test_physical_persistence` | `lib.rs` (lines 447-514) | **Fully Covered** | Verifies that running the command writes a valid fixture JSON file to disk. |
| **I5** | `generateReceipt` writes receipt | `actions_commands_test.rs`:<br>`test_format_dataframe_command`<br>`capability_test.rs`:<br>`test_physical_persistence` | `lib.rs` (lines 366-446, 447-514) | **Fully Covered** | Verifies execution of command writes a JSON receipt file to disk. |
| **I6** | Command receipt hash verifies | `capability_test.rs`:<br>`test_physical_persistence` | `lib.rs` (lines 475-497)<br>`receipts.rs` (lines 58-73) | **Fully Covered** | Asserts that receipt hash matches the BLAKE3 hash of the generated fixture content. |
| **I7** | Conformance vector shift: Refused -> Admitted | `capability_test.rs`:<br>`test_conformance_vector_shift` | `lib.rs` (lines 533-580) | **Fully Covered** | Asserts that formatting moves `"pm4py.law.formatted"` from refused to admitted. |
| **I8** | Unknown law axis remains Unknown | **None** | `lib.rs` (lines 562-564) | **Missing Test** | Conformance vector shift test does not assert on the `unknown` vector contents. |
| **I9** | Malformed command args refuse safely | `actions_commands_test.rs`:<br>`test_malformed_command_refusal` | `lib.rs` (lines 367-376, 448-453) | **Fully Covered** | Verifies that missing arguments in `ExecuteCommandParams` return an error. |
| **I10** | Repeated command is idempotent / safely refused | **None** | `lib.rs` (`execute_command`) | **Missing Test** | No test exists to verify command behavior when executed repeatedly on the same snapshot. |

---

## 4. Key Gaps and Codebase Issues

### Gap 1: Missing Import Form and Alias Tests (U3, U4, U5)
- **Problem**: `PipelineFacts::extract` implements detection for `from pm4py import ...` and `from pandas import ...`. However, there are no tests exercising these patterns.
- **Problem**: `facts.csv_vars` captures the variable names associated with data loading (e.g. `df = pd.read_csv(...)`). Yet, there are no tests asserting that the variable name is correctly populated.

### Gap 2: Lack of Reload Verification for Persisted Fixtures (U12)
- **Problem**: While `test_fixture_persistence` asserts that the fixture file exists on disk, it does not attempt to reload (deserialize) the file back into the `Fixture` struct to verify that the format is valid and matches the original in-memory struct. In contrast, `test_receipt_persistence` correctly leverages `verify_receipt_file` which deserializes the JSON.

### Gap 3: Barebones Parity Contract Implementation (U15, U16, U17)
- **Problem**: The parity contract system in `crates/pm4py-lsp/src/parity.rs` is mostly just a declaration of data structures (`ParityFixture`, `ParityVerdict`, `EquivalenceKind`). It lacks the actual verdict classification logic (e.g., a function to determine if a given gap results in an `Admitted`, `Refused`, or `Unsupported` status). Consequently, U17 is entirely unimplemented and untested.

### Gap 4: Integration Test Gaps (I2, I8, I10)
- **I2 (Residual Preservation)**: `test_formatted_dataframe_diagnostic_none` formats the code and specifies case/activity/timestamp keys, clearing all diagnostics. It does not check if formatting *without* keys leaves the mapping diagnostics active while clearing the unformatted warning.
- **I8 (Unknown Law Axis)**: The `max_conformance_vector` method places `"pm4py.law.mapped"` into the `unknown` list, but the integration tests do not assert that this axis is populated or remains unknown.
- **I10 (Repeated Command)**: No test verifies the behavior of calling commands repeatedly. For instance, executing `pm4py-lsp.createParityFixture` twice should be idempotent and not produce corrupted files or duplicate receipts.

---

## 5. Recommended Implementation Strategy

### Step 1: Add Unit Tests in `tests/static_analysis_test.rs`
1. **Extend `test_pipeline_facts_extraction`** to assert that `facts.csv_vars` contains `"df"` when `df = pd.read_csv(...)` is parsed.
2. **Add a test `test_alternative_imports`** that parses:
   ```python
   from pm4py import discover_petri_net_inductive
   from pandas import read_csv as rc
   df = rc('log.csv')
   ```
   and asserts that `facts.has_pm4py` is true, and that pandas aliases include `"pandas"`.

### Step 2: Implement Reload Verification for Fixtures
1. Add a helper function `verify_fixture_file(fixture_path: &Path) -> bool` inside `crates/pm4py-lsp/src/fixtures.rs` that reads the JSON file from disk, attempts to deserialize it into `Fixture`, and returns `true` if successful.
2. Update `test_fixture_persistence` in `tests/receipts_fixtures_test.rs` to assert that `verify_fixture_file(&fixture_path)` is true.

### Step 3: Implement Parity Verdict Classification & Tests
1. Add a classification function in `crates/pm4py-lsp/src/parity.rs`:
   ```rust
   pub fn evaluate_verdict(fixture: &ParityFixture, actual_outcome: &str, kind: EquivalenceKind) -> ParityVerdict {
       let gap = classify_parity_gap(&fixture.expected_outcome, actual_outcome);
       if kind == EquivalenceKind::None {
           ParityVerdict {
               fixture_id: fixture.snapshot_id.clone(),
               equivalence: kind,
               gap_analysis: Some(gap),
           }
       } else if gap == "No gap detected." {
           ParityVerdict {
               fixture_id: fixture.snapshot_id.clone(),
               equivalence: kind,
               gap_analysis: None,
           }
       } else {
           ParityVerdict {
               fixture_id: fixture.snapshot_id.clone(),
               equivalence: EquivalenceKind::None,
               gap_analysis: Some(gap),
           }
       }
   }
   ```
2. Add unit tests for U15 (match -> Admitted), U16 (mismatch -> Refused), and U17 (unsupported equivalence kind -> Unsupported / none).

### Step 4: Enhance Integration Tests
1. **For I2**: Add a test in `capability_test.rs` that checks if inserting a format command *without* column mappings removes the `UnformattedDataframe` diagnostic but retains `MissingCaseIdMapping`.
2. **For I8**: In `test_conformance_vector_shift`, add:
   ```rust
   assert!(vector.unknown.contains(&LawAxis::Custom("pm4py.law.mapped".to_string())));
   ```
3. **For I10**: Add `test_repeated_command_idempotency` in `tests/actions_commands_test.rs` that executes the `pm4py-lsp.createParityFixture` command twice and asserts it succeeds both times without error or side-effects.
