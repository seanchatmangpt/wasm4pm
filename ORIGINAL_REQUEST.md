# Original User Request

## Initial Request — 2026-06-10T15:22:35-07:00

Implement the "Full Periodic Table" expansion for the wasm4pm project, adding all 42 new symbolic-reasoning cognition breeds. The work will execute the entire `wasm4pm-full-periodic-adaptive-melody.md` plan, starting with Phase A (Batch 0: Infrastructure) and Phase C1 (Combinator Core), and then scaling out to all breeds in parallel.

Working directory: /Users/sac/wasm4pm
Integrity mode: benchmark

## Requirements

### R1. Establish Infrastructure and Combinator Core
Complete Phase A (Batch 0) by refactoring OCEL/dispatch and reconciling the registry. Complete Stage C1 by building and proving all shared combinator core components (`support/` modules like `fact_keys.rs`, `formula.rs`, `csp.rs`) before starting on breeds.

### R2. Implement All 42 Breeds
Implement all 42 cognition breeds across the P1, P2, P3, and P4 tiers according to the precise algorithm specifications, trace kinds, and hidden oracles defined in the plan. Each breed must have a complete implementation, OCPN model, and verification tests.

### R3. Strict Mathematical Correctness
Adhere to Lean Six Sigma discipline: zero placeholders, stubs, or empty-trace returns. Every breed must pass its formal specification gate (Rank-1 oracles, closed-form values).

## Acceptance Criteria

### Verification Gates
- [ ] `cargo check` and `cargo test -p wasm4pm-cognition` run and pass continuously with 0 failures.
- [ ] The `registry.json` contains exactly 55 ADMITTED-track breeds.
- [ ] OCEL fitness is measured at 1.0 for every new breed.
- [ ] The determinism suite is green for all breeds.
- [ ] `cargo bench --bench breed_latency` executes successfully for all breeds.
- [ ] Full-ensemble verification (`tests/ensemble_meta.rs`) passes.
