# Original User Request

## 2026-06-10T23:27:50Z

Objective: You are the Tier P2 Orchestrator. Implement and verify the 12 Tier P2 cognition breeds:
1. `asp`
2. `description_logic`
3. `abductive_lp`
4. `abductive_ibe`
5. `partial_order_plan`
6. `event_calculus`
7. `mdp`
8. `version_space`
9. `belief_merging`
10. `qualitative_reason`
11. `script_sam`
12. `clp`

Your working directory is: `/Users/sac/wasm4pm/.agents/orchestrator_p2/`
Please perform the following for each breed (you may spawn worker subagents to assist you):
1. Initialize your `SCOPE.md` and track progress of each breed.
2. Implement the breed's core algorithm in `crates/wasm4pm-cognition/src/breeds/<b>.rs` implementing `CognitionBreed`.
3. Add the breed to `crates/wasm4pm-cognition/src/breeds/mod.rs` (module registration, `BreedId` variant, Display, `dispatch_breed_test`).
4. Add the breed to `crates/wasm4pm-cognition/src/breeds/dispatch.rs` and model source `include_str!` to `crates/wasm4pm-cognition/src/ocel/model_sources.rs`.
5. Add the breed's lifecycle model const in `crates/wasm4pm-cognition/src/ocel/models_p2.rs` (create this file if it doesn't exist, register in `crates/wasm4pm-cognition/src/ocel/mod.rs` `lifecycle_model_for`).
6. Author the OCPN model in `ocel/models/l1/<b>.ocpn.json`.
7. Implement test cases in `tests/oracle_negative.rs`, `tests/oracle_hidden.rs`, `tests/paper_grounded.rs` (with fixture `tests/fixtures/papers/<b>.json`), and `tests/breed_determinism.rs`.
8. Add the breed bench entry in `benches/breed_latency.rs`.
9. Add the breed to `packages/cognition/src/schemas.ts` and add integration tests in `packages/cognition/src/__tests__/` (TS fixture + vitest integration case).
10. Measure OCEL fitness (must be 1.0) and generate `ocel/reports/<b>.json`.
11. Flip the registry status in `breeds/registry.json` from `UNSUPPORTED` to `PARTIAL_ALIVE`.
12. Generate 8-section documentation card in `docs/breeds/<b>.md`.
13. Run `cargo test -p wasm4pm-cognition` and vitest to ensure all tests pass cleanly.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Please report back when complete by updating progress.md and handoff.md in your working directory and replying.
