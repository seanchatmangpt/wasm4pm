# Worker Task: Compile, Fix, and Verify pm4py-lsp (Milestones 2-6)

You are the implementation worker for the pm4py-lsp checkpoint parity promotion.
Your workspace directory is `/Users/sac/wasm4pm/.agents/worker_m2_m6_2/`.

## Tasks
1. Run `cargo check -p pm4py-lsp` and `cargo test -p pm4py-lsp` to assess the current status of the implementation.
2. If there are any compiler check errors or test failures, locate and fix them in:
   - `crates/pm4py-lsp/src/`
   - `crates/pm4py-lsp/tests/`
   Check specifically for:
   - Undefined functions or methods.
   - Any missing test helpers (e.g., `check_diagnostics` in `src/diagnostics.rs` or tests).
   - Any deadlocks or hangs in the async LSP server.
   - Ensuring `PipelineFacts` parsing in `analysis.rs` conforms to the requirements.
   - Optional PM4Py bridge safety (non-panicking, optional capability-gated bridge).
   - Equivalence kinds (`exact_json`, `dfg_equivalence`) and verdicts.
3. Verify that `cargo fmt -p pm4py-lsp --check`, `cargo check -p pm4py-lsp`, and `cargo test -p pm4py-lsp` all pass cleanly.
4. Document the exact results, including command outputs, in your handoff report (`/Users/sac/wasm4pm/.agents/worker_m2_m6_2/handoff.md`).

## Verification Requirements
Provide the exact outputs of:
- `cargo fmt -p pm4py-lsp --check`
- `cargo check -p pm4py-lsp`
- `cargo test -p pm4py-lsp`
Verify that no PM4Py concepts leak into `vendors/tower-lsp-max` core (the substrate must remain pure).

DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/boundary implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
