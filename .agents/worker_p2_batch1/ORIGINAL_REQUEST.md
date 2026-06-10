## 2026-06-10T23:29:15Z
Task: Implement and verify Batch 1 of Tier P2 cognition breeds: `asp`, `description_logic`, `abductive_lp`, and `abductive_ibe`.

Working Directory: You are assigned the working directory `/Users/sac/wasm4pm/.agents/worker_p2_batch1/`. Initialize your `progress.md` and `handoff.md` there.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. Integrity violations WILL be detected and your work WILL be rejected.

Please perform the following steps for each of the 4 breeds (`asp`, `description_logic`, `abductive_lp`, `abductive_ibe`):
1. Implement the breed's core algorithm in `crates/wasm4pm-cognition/src/breeds/<b>.rs` implementing the `CognitionBreed` trait.
   - For `asp`: Answer Set Programming stable models solver (using Gelfond-Lifschitz reduct over a finite domain). Support NAF (negation as failure) with "not " prefix in premise. Steps: `asp-load`, `asp-solve`, `asp-model`.
   - For `description_logic`: Ontological subsumption and consistency classification. Facts define class/role assertions and subsumptions. Propagate subsumptions (transitive closure) and check individual class membership consistency. Steps: `dl-load`, `dl-subsume`, `dl-consistent`.
   - For `abductive_lp`: Find abductive explanations (set of abducible atoms) to satisfy query goals under integrity constraints. Steps: `alp-load`, `alp-abduce`, `alp-hypothesis`.
   - For `abductive_ibe`: Explanatory coherence selection (Thagard cover) among competing hypotheses. Steps: `ibe-load`, `ibe-explain`, `ibe-select`.
2. Register the breed in `crates/wasm4pm-cognition/src/breeds/mod.rs` (import module, update `BreedId`, display, etc.).
3. Update `crates/wasm4pm-cognition/src/breeds/dispatch.rs` and `crates/wasm4pm-cognition/src/ocel/model_sources.rs`.
4. Create/update `crates/wasm4pm-cognition/src/ocel/models_p2.rs` to define the static lifecycle models for these 4 breeds, and register them in `crates/wasm4pm-cognition/src/ocel/mod.rs`.
5. Author the OCPN Petri-net models in `ocel/models/l1/<b>.ocpn.json`.
6. Implement negative tests in `crates/wasm4pm-cognition/tests/oracle_negative.rs` (precondition failures/empty cases).
7. Implement hidden oracle tests in `crates/wasm4pm-cognition/tests/oracle_hidden.rs`.
8. Create paper-grounded JSON fixtures in `crates/wasm4pm-cognition/tests/fixtures/papers/<b>.json` and implementation in `crates/wasm4pm-cognition/tests/paper_grounded.rs`.
9. Implement determinism tests in `crates/wasm4pm-cognition/tests/breed_determinism.rs`. Update the `exactly_23_breed_pairs_covered` test count assert to reflect the new breeds.
10. Add benchmark entries in `crates/wasm4pm-cognition/benches/breed_latency.rs`.
11. Add to `packages/cognition/src/schemas.ts` and add vitest integration tests in `packages/cognition/src/__tests__/cognition-breeds.integration.test.ts` (with inputs in `packages/cognition/src/__tests__/fixtures/breed-inputs.ts` and paper fixtures in `packages/cognition/src/__tests__/fixtures/papers/<b>.json`).
12. Measure OCEL fitness and generate `ocel/reports/<b>.json` by running fitness measurements.
13. Flip status in `crates/wasm4pm-cognition/breeds/registry.json` to `PARTIAL_ALIVE`.
14. Generate documentation cards in `docs/breeds/<b>.md`.

Verify that all Rust tests pass using `cargo test -p wasm4pm-cognition` and TS tests pass using `pnpm test` (or vitest).
When complete, write a detailed handoff.md in your working directory and message the parent with the results.
