## 2026-06-05T06:30:54Z

You are teamwork_preview_worker. Your working directory is `/Users/sac/wasm4pm/.agents/worker_m2_m6/`.

Your objective is to implement the source code files and tests for pm4py-lsp under `crates/pm4py-lsp/`, satisfying all requirements for Milestones 2 through 6.

Specifically:
1. Refactor/upgrade `src/analysis.rs` to parse Python code robustly (indented imports, pandas/pm4py aliases, CSV loads, format_dataframe arguments, discovery/conformance calls).
2. Implement `src/pm4py_bridge.rs` for PyO3-gated runtime execution (static by default, runtime gated, no panics on unavailable Python environment).
3. Complete/extend `src/diagnostics.rs` to generate diagnostics for:
   - `pm4py.py.unformatted_dataframe`
   - `pm4py.py.missing_case_id_mapping`
   - `pm4py.py.missing_activity_mapping`
   - `pm4py.py.missing_timestamp_mapping`
   - `pm4py.py.discovery_before_formatting`
   - `pm4py.py.parity_fixture_missing`
   - `pm4py.py.unreceipted_output`
4. Refactor/move the LanguageServer `Backend` into `src/server.rs` and resolve the tokio mutex deadlock in `execute_command` (release lock before awaiting `max_snapshot()`). Implement `didOpen`, `didChange`, `didClose` notifications.
5. Implement `src/actions.rs` and `src/commands.rs` to handle codeAction and executeCommand for the required commands (`formatDataFrame`, `createParityFixture`, `generateReceipt`, `explainPipelineState`).
6. Implement `src/parity.rs` defining equivalence contracts.
7. Ensure `src/lib.rs` registers all modules properly.
8. Create/update all test suites under `tests/` (`static_analysis_test.rs`, `diagnostics_test.rs`, `lsp_lifecycle_test.rs`, `actions_commands_test.rs`, `receipts_fixtures_test.rs`, `parity_contract_test.rs`, `pm4py_bridge_test.rs`) to ensure 100% pass rate.
9. Perform local compilation verification (`cargo check -p pm4py-lsp` and `cargo test -p pm4py-lsp`) and confirm they compile and pass.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Document your changes, compilation/test command results in your handoff report, and send a message back when complete.
