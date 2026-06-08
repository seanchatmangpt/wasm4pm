# Worker Task: Milestone 7 Verification and Checkpoint Promotion

You are the implementation worker for final verification and checkpoint promotion of the pm4py-lsp project.
Your working directory is `/Users/sac/wasm4pm/.agents/worker_m7/`.

## Tasks

1. **Create Checkpoint Promotion Document**:
   Create `/Users/sac/wasm4pm/docs/checkpoints/PM4PY-LSP-002.md` with:
   - Verdict: `PM4PY-LSP-002_ALIVE`
   - Exact statement:
     `PM4PY-LSP-002_ALIVE: deterministic snapshot, persisted fixture, persisted receipt, LSP lifecycle, code action, command actuation, conformance shift, safe runtime boundary, and parity fixture contract are validated for the first bounded PM4Py Python workflow surface.`
   - Detailed list of admitted, refused, unknown, and future surfaces.
   - Table of all DOD gates G1-G20 with PASS status.

2. **Generate All Agent Reports & Verdict Files**:
   Create the following report files under BOTH `/Users/sac/wasm4pm/docs/reports/pm4py-lsp-agent-reports/` and `/Users/sac/wasm4pm/docs/reports/pm4py-lsp-dod/` (ensure directories are created):
   - `CHECKLIST.md` (and `agent-01-coordinator.md` / `agent-02-boundary.md` where appropriate): Complete table showing PASS for all G1-G20 gates.
   - `static_analysis.md` / `agent-03-static-analysis.md`: Detail the Python/pandas AST facts parsing, regex robustness, and tested scenarios.
   - `diagnostic.md` / `agent-04-diagnostics.md`: Document diagnostic definitions (codes, severity, range, message) and test verification.
   - `lsp_lifecycle.md` / `agent-05-lsp-lifecycle.md`: Document LSP capability initialization, open/change/close document state management.
   - `code_action_command.md` / `agent-06-actions-commands.md`: Detail quickfix actions and command triggers (`pm4py-lsp.formatDataFrame`, `pm4py-lsp.createParityFixture`).
   - `receipt_fixture.md` / `agent-07-receipts-fixtures.md`: Document blake3 snapshot hash determinism, persistence directories, reloading verification.
   - `pm4py_runtime.md` / `agent-08-runtime.md`: Detail the optional Pyo3 execution bridge, static mode default, and failure safety.
   - `wasm4pm_parity.md` / `agent-09-parity.md`: Detail the parity contract (equivalence kinds, verdicts, classification gap).
   - `VERIFICATION.md` / `agent-10-verifier.md` / `FINAL-VERDICT.md`: State check/test verification command executions, outputs, and the final verdict of `PM4PY-LSP-002_ALIVE`.

   *Make sure all files are fully realized, with zero TODOs or placeholder values.*

3. **Verify Build & Test Stability**:
   Run:
   - `cargo fmt -p pm4py-lsp --check`
   - `cargo check -p pm4py-lsp`
   - `DYLD_FRAMEWORK_PATH=/Applications/Xcode.app/Contents/Developer/Library/Frameworks cargo test -p pm4py-lsp`
   Document the command outputs in your handoff report (`/Users/sac/wasm4pm/.agents/worker_m7/handoff.md`).

DO NOT CHEAT. All implementations must be genuine. A Forensic Auditor will independently verify your work.
