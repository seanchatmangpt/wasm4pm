# Plan - pm4py-lsp PM4PY-LSP-003 Definition-of-Done Swarm

## Goal
Prove whether pm4py-lsp is DONE (PM4PY-LSP-003_ALIVE) by implementing and verifying the complete test suite across unit, integration, E2E, chaos, stress, and benchmark gates.

## Milestones

### Milestone 1: Unit & Integration Gates Verification
- Implement/verify all unit test gates (U1-U18).
- Ensure `static_analysis_test.rs`, `diagnostics_test.rs`, `receipts_fixtures_test.rs`, `parity_contract_test.rs`, and `pm4py_bridge_test.rs` are fully present and passing.
- Implement/verify all integration test gates (I1-I10) via `capability_test.rs` and `actions_commands_test.rs`.
- Dispatch to specialists to implement any missing unit/integration tests and verify.

### Milestone 2: E2E LSP Test Implementation & Verification
- Implement `crates/pm4py-lsp/tests/e2e_lsp_test.rs` covering the complete 13-step E2E lifecycle (initialize, didOpen, diagnostics, codeAction, command, WorkspaceEdit, receipt persistence, didChange, diagnostics clear, conformance vector Admitted, didClose, deactivate).
- Run and verify the E2E test.

### Milestone 3: Chaos & Stress Gates Implementation & Verification
- Implement `crates/pm4py-lsp/tests/chaos_test.rs` covering C1-C18 (or C1-C12) including malformed python, partial edits, corrupted fixtures/receipts, concurrent edits, and unavailable runtime.
- Implement `crates/pm4py-lsp/tests/stress_test.rs` covering S1-S8 (1,000 files, 10k lines, concurrent didChange, memory bounds, etc.). Mark heavy stress tests as `#[ignore = "stress gate"]`.
- Run chaos tests and run stress tests with `-- --ignored`.

### Milestone 4: Performance Benchmarking
- Add `criterion = "0.5"` to `crates/pm4py-lsp/Cargo.toml` dev-dependencies.
- Implement Criterion benches under `crates/pm4py-lsp/benches/`:
  - `analysis_bench.rs`
  - `diagnostics_bench.rs`
  - `receipts_bench.rs`
  - `lsp_flow_bench.rs`
- Run `cargo bench -p pm4py-lsp` to verify throughput/latency.

### Milestone 5: Final Swarm Report & Checkpoint Promotion
- Collect all test and benchmark reports.
- Verify clippy, fmt, and boundary fence purity.
- Write all individual agent reports under `docs/reports/pm4py-lsp-dod/`.
- Produce the final verdict report `docs/reports/pm4py-lsp-dod/FINAL-VERDICT.md` with final verdict `PM4PY-LSP-003_ALIVE`.
