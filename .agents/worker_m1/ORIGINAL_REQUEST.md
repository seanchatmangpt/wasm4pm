## 2026-06-05T07:55:18Z

You are a teamwork_preview_worker. Your working directory is `/Users/sac/wasm4pm/.agents/worker_m1/`.
Your task is to implement the fixes for all the Unit and Integration gaps identified by the explorer in Milestone 1.

Specifically, you need to modify/create the following files inside `crates/pm4py-lsp/`:

1. In `src/fixtures.rs`:
   - Implement `reload_fixture(snapshot_id: &SnapshotId, base_path: &Path) -> std::io::Result<Fixture>` which reads and deserializes a persisted fixture from disk.

2. In `tests/receipts_fixtures_test.rs`:
   - Update `test_fixture_persistence` to call `reload_fixture` and verify that the reloaded fixture is equal to the saved fixture (solving U12).

3. In `src/parity.rs`:
   - Update `EquivalenceKind` to include `Unsupported` variant.
   - Implement `ParityVerdictDecision` enum with `Admitted`, `Refused`, `Unsupported` variants.
   - Update `ParityVerdict` to include `decision` field of type `ParityVerdictDecision`.
   - Implement `evaluate_parity(fixture_id: &str, expected: &str, actual: &str, kind: EquivalenceKind) -> ParityVerdict` that computes the decision and gap analysis (solving U15, U16, U17).
   - Implement appropriate test assertions for these in `tests/parity_contract_test.rs`.

4. In `tests/static_analysis_test.rs`:
   - Add a test verifying `from pm4py import ...` syntax detection (solving U3).

5. In `tests/pm4py_bridge_test.rs` (create this file if it doesn't exist):
   - Add a unit test verifying `check_pm4py()` under both static and runtime modes without panicking (solving U18). Add `pub mod pm4py_bridge_test` in `tests` if needed, or register it in `Cargo.toml`. Note: tests in `tests/` are automatically discovered if they are separate files.

6. In `src/lib.rs` (Backend command execution):
   - In `execute_command` for `pm4py-lsp.formatDataFrame`, add an idempotency check: if the document text already contains `format_dataframe`, refuse the call safely by returning `Err(Error::invalid_params("DataFrame is already formatted"))` (solving I10).

7. In `tests/capability_test.rs`:
   - Update `test_conformance_vector_shift` to verify that `pm4py.law.mapped` is included in the `unknown` conformance vector (solving I8).
   - Add an integration test that:
     a. Opens a Python document with unformatted read_csv.
     b. Verifies the `pm4py.py.unformatted_dataframe` diagnostic is present.
     c. Simulates formatting repair (inserting `df = pm4py.format_dataframe(df)`).
     d. Verifies that the unformatted diagnostic is cleared but `pm4py.py.missing_case_id_mapping`, `pm4py.py.missing_activity_mapping`, and `pm4py.py.missing_timestamp_mapping` diagnostics are now present (solving I2, I3).
     e. Verifies idempotency by executing `pm4py-lsp.formatDataFrame` again and checking that it is safely refused.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Run `DYLD_FRAMEWORK_PATH=/Applications/Xcode.app/Contents/Developer/Library/Frameworks cargo test -p pm4py-lsp` to ensure all tests pass. Document your changes in your handoff report.
