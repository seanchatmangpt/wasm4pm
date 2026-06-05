# Worker Task: PM4PY-LSP-003 Checkpoint and FINAL-VERDICT.md Generation

You are the implementation worker spawned to finalize the PM4PY-LSP-003 Definition-of-Done report and checkpoint.
Your working directory is `/Users/sac/wasm4pm/.agents/worker_dod_report/`.

## Tasks

1. **Verify Codebase Quality & Run Tests**:
   Ensure everything passes by running and capturing:
   - `cargo fmt -p pm4py-lsp --check`
   - `cargo check -p pm4py-lsp`
   - `cargo clippy -p pm4py-lsp --all-targets -- -D warnings`
   - `DYLD_FRAMEWORK_PATH=/Applications/Xcode.app/Contents/Developer/Library/Frameworks cargo test -p pm4py-lsp`
   - `DYLD_FRAMEWORK_PATH=/Applications/Xcode.app/Contents/Developer/Library/Frameworks cargo test -p pm4py-lsp --test e2e_lsp_test`
   - `DYLD_FRAMEWORK_PATH=/Applications/Xcode.app/Contents/Developer/Library/Frameworks cargo test -p pm4py-lsp --test chaos_test`
   - `DYLD_FRAMEWORK_PATH=/Applications/Xcode.app/Contents/Developer/Library/Frameworks cargo test -p pm4py-lsp --test stress_test -- --ignored`
   - `DYLD_FRAMEWORK_PATH=/Applications/Xcode.app/Contents/Developer/Library/Frameworks cargo bench -p pm4py-lsp`

2. **Retrieve Git Metadata**:
   Obtain the exact commit hash of the current HEAD (`git rev-parse HEAD`).
   Check whether the physical fixtures and receipts under `crates/pm4py-lsp/fixtures/` and `crates/pm4py-lsp/receipts/` are committed/tracked artifacts in Git or dynamically generated at test-time.

3. **Check Purity Fence**:
   Verify that the `vendors/tower-lsp-max` directory remains strictly PM4Py-free and does not contain any process mining domain terminology.

4. **Produce Checkpoint `PM4PY-LSP-003.md`**:
   Write the checkpoint file `/Users/sac/wasm4pm/docs/checkpoints/PM4PY-LSP-003.md` promoting the checkpoint to `PM4PY-LSP-003_ALIVE` with:
   - Verdict: `PM4PY-LSP-003_ALIVE`
   - Statement:
     `PM4PY-LSP-003_ALIVE: pm4py-lsp is validated across unit, integration, e2e, chaos, stress, and benchmark gates for the first bounded PM4Py workflow surface.`
   - Admitted, Refused, and Unknown/Future surfaces classification.
   - List of all DOD gates verified (unit tests U1-U18, integration tests I1-I10, E2E scenarios, Chaos gates C1-C12, Stress gates S1-S8, and Benchmark dimensions B1-B8).

5. **Generate `/Users/sac/wasm4pm/docs/reports/pm4py-lsp-dod/FINAL-VERDICT.md`**:
   Ensure `/Users/sac/wasm4pm/docs/reports/pm4py-lsp-dod/FINAL-VERDICT.md` is updated with:
   - Title: `# PM4PY-LSP-003 Definition-of-Done Verdict`
   - Verdict: `PM4PY-LSP-003_ALIVE`
   - Exact Statement:
     `PM4PY-LSP-003_ALIVE: pm4py-lsp is validated across unit, integration, e2e, chaos, stress, and benchmark gates for the first bounded PM4Py workflow surface.`
   - Exact clippy, fmt, check, test, chaos, stress, and benchmark results.
   - Exact commit hash.
   - Admitted surfaces.
   - Non-admitted surfaces.
   - Receipt taxonomy details.
   - Verification details proving `max` remains PM4Py-free.
   - Explicitly note that you do not claim `wasm4pm` parity, nor all PM4Py workflows.

6. **Liveness & Heartbeat**:
   Keep updating `/Users/sac/wasm4pm/.agents/worker_dod_report/progress.md` with:
   `Last visited: [timestamp]`
   at each step.

7. **Deliver Handoff**:
   Write a self-contained handoff report at `/Users/sac/wasm4pm/.agents/worker_dod_report/handoff.md` and notify the orchestrator.
