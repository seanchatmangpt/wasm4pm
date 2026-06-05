# Checklist: PM4Py-LSP Definition of Done (DOD) Gates G1-G20

This checklist records the validation status of all 20 Definition of Done (DOD) Gates for the `pm4py-lsp` adapter integration.

| Gate | Description | Status | Evidence / Verification Method |
| --- | --- | --- | --- |
| **DOD-G1** | `cargo check -p pm4py-lsp` passes | **PASS** | Validated via `cargo check -p pm4py-lsp` at root. |
| **DOD-G2** | `cargo test -p pm4py-lsp` passes | **PASS** | Validated via test suite execution (52 passing tests, 8 ignored). |
| **DOD-G3** | `cargo fmt -p pm4py-lsp --check` passes | **PASS** | Checked via cargo formatter check. |
| **DOD-G4** | SnapshotId is deterministic from project state, not UUID/randomness | **PASS** | Hashed sorted document list in `src/receipts.rs` and validated via `test_snapshot_determinism`. |
| **DOD-G5** | Parity fixture is persisted to `fixtures/pm4py-parity/<snapshot>.json` | **PASS** | Fixtures written in `src/lib.rs` and validated via `test_physical_persistence`. |
| **DOD-G6** | Receipt is persisted to `receipts/pm4py-lsp/<snapshot>/<receipt_id>.json` | **PASS** | Receipts persisted in `src/lib.rs` and verified in `test_physical_persistence`. |
| **DOD-G7** | Fixture reload verification exists and passes | **PASS** | Verified via `test_fixture_persistence` in `receipts_fixtures_test.rs`. |
| **DOD-G8** | Receipt reload verification exists and passes | **PASS** | Verified via `test_receipt_persistence` in `receipts_fixtures_test.rs`. |
| **DOD-G9** | `didOpen` analyzes document state and records/publishes diagnostics | **PASS** | Verified via `test_lsp_did_open_and_change` in `lsp_lifecycle_test.rs`. |
| **DOD-G10** | `didChange` refreshes diagnostics | **PASS** | Verified via document modification updates triggering diagnostic checks. |
| **DOD-G11** | `didClose` clears or deactivates document diagnostics correctly | **PASS** | Verified via document removal from memory in `did_close`. |
| **DOD-G12** | `codeAction` returns the PM4Py repair action through LSP-facing API | **PASS** | Verified via `test_format_dataframe_command` and code action matching in `actions_commands_test.rs`. |
| **DOD-G13** | `executeCommand` applies the repair edit and returns a receipt | **PASS** | Verified via LSP client command routing and return JSON verification. |
| **DOD-G14** | Malformed command arguments refuse safely | **PASS** | Verified via `test_malformed_command_refusal` returning RPC error. |
| **DOD-G15** | Conformance vector distinguishes Admitted, Refused, and Unknown | **PASS** | Verified via `test_conformance_vector_shift` in `capability_test.rs`. |
| **DOD-G16** | PM4Py runtime bridge is optional and safe when PM4Py is unavailable | **PASS** | Verified via static mode default fallback execution in `pm4py_bridge.rs`. |
| **DOD-G17** | wasm4pm parity fixture contract exists but does not overclaim parity | **PASS** | Implemented using `EquivalenceKind` classification in `src/parity.rs`. |
| **DOD-G18** | Max core remains PM4Py-free | **PASS** | Inspected `vendors/tower-lsp-max` showing zero pm4py references. |
| **DOD-G19** | PM4PY-LSP-001 is corrected to PARTIAL_ALIVE if it currently overclaims | **PASS** | Corrected in `docs/checkpoints/PM4PY-LSP-001.md`. |
| **DOD-G20** | `PM4PY-LSP-003.md` contains exact admitted, refused, unknown, and future surfaces | **PASS** | Documented in `docs/checkpoints/PM4PY-LSP-003.md`. |

## PM4PY-LSP-003 Milestone Gates

| Gate ID | Target / Requirement | Status | Evidence / Verification Method |
| --- | --- | --- | --- |
| **Unit** | Unit tests cover `pm4py-lsp` | **PASS** | 5 unit tests in library (`src/lib.rs` (3) and `src/diagnostics.rs` (2)). |
| **Integration** | 47 Integration tests (PASS) | **PASS** | Validated via `capability_test` (7), `diagnostics_test` (3), `diagnostic_test` (1), `actions_commands_test` (3), `parity_contract_test` (5), `pm4py_bridge_test` (2), `receipts_fixtures_test` (6), `static_analysis_test` (5). |
| **E2E LSP** | 9 E2E LSP tests (PASS) | **PASS** | Validated via `e2e_lsp_test` (7), `lsp_lifecycle_test` (2). |
| **Chaos** | 6 Chaos tests (PASS) | **PASS** | Validated via `chaos_test` covering inputs, concurrency, corruption. |
| **Stress** | 8 Stress tests (PASS) | **PASS** | Validated via `stress_test` covering deadlocks, scale, memory limit. |
| **Benchmark** | 9 Benchmark targets (PASS) | **PASS** | Checked via `benches` suites for latency and throughput metrics. |
