## 2026-06-10T23:53:35Z

Task: Implement and verify Batch 2 of Tier P2 cognition breeds: `partial_order_plan`, `event_calculus`, `mdp`, and `version_space`.

Working Directory: You are assigned the working directory `/Users/sac/wasm4pm/.agents/worker_p2_batch2/`. Initialize your `progress.md` and `handoff.md` there.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. Integrity violations WILL be detected and your work WILL be rejected.

Please perform the following steps for each of the 4 breeds (`partial_order_plan`, `event_calculus`, `mdp`, `version_space`):
1. Implement the breed's core algorithm in `crates/wasm4pm-cognition/src/breeds/<b>.rs` implementing the `CognitionBreed` trait.
   - For `partial_order_plan`: Partial order planning (POP) algorithm. Steps: `pop-init`, `pop-resolve`, `pop-plan`.
   - For `event_calculus`: Discrete Event Calculus solver. Steps: `ec-load`, `ec-infer`, `ec-model`.
   - For `mdp`: Markov Decision Process value iteration (Bellman utility propagation over states, transitions, rewards, gamma). Steps: `mdp-init`, `mdp-iterate`, `mdp-policy`.
   - For `version_space`: Candidate elimination version space boundary tracker (General/G and Specific/S boundaries). Steps: `vs-init`, `vs-update`, `vs-verdict`.
2. Register the breed in `crates/wasm4pm-cognition/src/breeds/mod.rs` (import module, update `BreedId`, display, etc.).
3. Update `crates/wasm4pm-cognition/src/breeds/dispatch.rs` and `crates/wasm4pm-cognition/src/ocel/model_sources.rs`.
4. Create/update `crates/wasm4pm-cognition/src/ocel/models_p2.rs` to define the static lifecycle models for these 4 breeds, and register them in `crates/wasm4pm-cognition/src/ocel/mod.rs`.
5. Author the OCPN Petri-net models in `ocel/models/l1/<b>.ocpn.json`.
6. Implement negative tests in `crates/wasm4pm-cognition/tests/oracle_negative.rs` (precondition failures/empty cases).
7. Implement hidden oracle tests in `crates/wasm4pm-cognition/tests/oracle_hidden.rs`.
8. Create paper-grounded JSON fixtures in `crates/wasm4pm-cognition/tests/fixtures/papers/<b>.json` and implementation in `crates/wasm4pm-cognition/tests/paper_grounded.rs`.
9. Implement determinism tests in `crates/wasm4pm-cognition/tests/breed_determinism.rs`. Update the `exactly_35_breed_pairs_covered` test count assert to reflect the new breeds (we are at 23 + 4 + 4 = 31 breeds total now, update the count check to whatever is current).
10. Add benchmark entries in `crates/wasm4pm-cognition/benches/breed_latency.rs`.
11. Add to `packages/cognition/src/schemas.ts` and add vitest integration tests in `packages/cognition/src/__tests__/cognition-breeds.integration.test.ts` (with inputs in `packages/cognition/src/__tests__/fixtures/breed-inputs.ts` and paper fixtures in `packages/cognition/src/__tests__/fixtures/papers/<b>.json`).
12. Measure OCEL fitness and generate `ocel/reports/<b>.json` by running fitness measurements.
13. Flip status in `crates/wasm4pm-cognition/breeds/registry.json` to `PARTIAL_ALIVE`.
14. Generate documentation cards in `docs/breeds/<b>.md`.

Verify that all Rust tests pass using `cargo test -p wasm4pm-cognition` and TS tests pass using `pnpm test` (or vitest).
When complete, write a detailed handoff.md in your working directory and message the parent with the results.
