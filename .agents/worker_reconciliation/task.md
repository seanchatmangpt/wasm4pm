# Worker Task: PM4PY-LSP-002 Verifier Reconciliation

You are the implementation worker spawned to finalize PM4PY-LSP-002 verifier reconciliation.
Your working directory is `/Users/sac/wasm4pm/.agents/worker_reconciliation/`.

## Tasks

1. **Verify Codebase Quality & Run Tests**:
   Execute the following commands and capture their exact output/results:
   - `cargo fmt -p pm4py-lsp --check`
   - `cargo check -p pm4py-lsp`
   - `cargo clippy -p pm4py-lsp -- -D warnings`
   - `DYLD_FRAMEWORK_PATH=/Applications/Xcode.app/Contents/Developer/Library/Frameworks cargo test -p pm4py-lsp`

2. **Retrieve Git Metadata**:
   Obtain the exact commit hash of the current HEAD (`git rev-parse HEAD`).
   Check whether the physical fixtures and receipts under `crates/pm4py-lsp/fixtures/` and `crates/pm4py-lsp/receipts/` are committed/tracked artifacts in Git or dynamically generated at test-time (e.g. check `git status`, `git ls-files`, `.gitignore`).

3. **Check Purity Fence**:
   Verify that the `vendors/tower-lsp-max` directory remains strictly PM4Py-free and does not contain any process mining domain terminology.

4. **Classify Surfaces & Receipt Taxonomy**:
   List:
   - Admitted surfaces (e.g. static analysis, diagnostics, code actions, format commands, optional pyo3 runtime bridge, etc.)
   - Non-admitted / Refused surfaces (e.g. unformatted dataframes, missing mappings, invalid commands, corrupted receipts)
   - Analyze the receipt taxonomy in the codebase:
     - Command receipts (e.g. `pm4py-lsp.formatDataFrame` output)
     - Fixture receipts (e.g. `pm4py-lsp.createParityFixture` output)
     - Behavior receipts (are they present/implemented?)
     - Release certificates (are they present/implemented?)
     Explain that the receipt taxonomy remains ambiguous / has gaps because behavior receipts and release certificates are not supported or implemented for this LSP server checkpoint.

5. **Generate Final Verdict File**:
   Produce the file `/Users/sac/wasm4pm/docs/reports/pm4py-lsp-dod/FINAL-VERDICT.md` containing:
   - Exact `cargo fmt`/`check`/`clippy`/`test` results
   - Exact commit hash
   - Admitted surfaces
   - Non-admitted surfaces
   - Receipt taxonomy details
   - Whether persisted fixtures/receipts are committed or test-generated
   - Boundary status proving `max` remains PM4Py-free
   - Final verdict: Since the receipt taxonomy has gaps, you MUST mark it as `PM4PY-LSP-002_ALIVE_WITH_RECEIPT_TAXONOMY_GAP`.
   - Explicitly note that you do not claim `wasm4pm` parity, nor all PM4Py workflows.

6. **Liveness & Heartbeat**:
   Keep updating `/Users/sac/wasm4pm/.agents/worker_reconciliation/progress.md` with:
   `Last visited: [timestamp]`
   at each step.

7. **Deliver Handoff**:
   Write a self-contained handoff report at `/Users/sac/wasm4pm/.agents/worker_reconciliation/handoff.md` and notify the orchestrator.
