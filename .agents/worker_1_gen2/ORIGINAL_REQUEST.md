## 2026-06-10T23:00:00Z
You are a teamwork_preview_worker. Your task is to implement and verify the first 4 of the 10 Tier P1 cognition breeds:
1. `ltl_monitor`
2. `allen_temporal`
3. `fuzzy_logic`
4. `bayesian_network`

For each of these 4 breeds, perform the following steps:
1. Implement the core algorithm in `crates/wasm4pm-cognition/src/breeds/<b>.rs` implementing the `CognitionBreed` trait.
   - For `ltl_monitor`: Implement LTL monitoring over a sequence of states/valuations. Parse formula from facts/intent using `support::formula::Formula::parse`. Trace steps must record states evaluated.
   - For `allen_temporal`: Implement Allen's Interval Algebra consistency/closure checks. Trace steps must record constraint propagation events.
   - For `fuzzy_logic`: Implement fuzzy logic inference (fuzzification, rule evaluation using min T-norm, max T-conorm, Mamdani implication, centroid defuzzification). Trace steps must record rule firings.
   - For `bayesian_network`: Implement exact Bayesian network inference via enumeration. Query variable, CPTs, and evidence should be parsed from input goals, rules, and facts. Trace steps must record variable elimination or enumeration steps.
2. Register the module in `crates/wasm4pm-cognition/src/breeds/mod.rs` (e.g., `pub mod <b>;`).
3. Wire up dispatch in `crates/wasm4pm-cognition/src/breeds/dispatch.rs` (update `dispatch_breed` and `dispatch_breed_test` to use the new implementations).
4. Create `crates/wasm4pm-cognition/src/ocel/models_p1.rs` if it doesn't exist, define the static `BreedLifecycleModel` for each breed, and register it in `crates/wasm4pm-cognition/src/ocel/mod.rs` `lifecycle_model_for`.
5. Add `include_str!` in `crates/wasm4pm-cognition/src/ocel/model_sources.rs`.
6. Author the OCPN model JSON in `ocel/models/l1/<b>.ocpn.json` (ensure fitness will be 1.0 against the generated trace steps).
7. Implement test cases in `crates/wasm4pm-cognition/tests/oracle_negative.rs`, `crates/wasm4pm-cognition/tests/oracle_hidden.rs`, `crates/wasm4pm-cognition/tests/paper_grounded.rs` (with fixture `crates/wasm4pm-cognition/tests/fixtures/papers/<b>.json`), and `crates/wasm4pm-cognition/tests/breed_determinism.rs`.
8. Add the breed bench entry in `crates/wasm4pm-cognition/benches/breed_latency.rs`.
9. Add TS test cases in `packages/cognition/src/__tests__/cognition-breeds.integration.test.ts` and update TS inputs in `packages/cognition/src/__tests__/fixtures/breed-inputs.ts`.
10. Flip status in `crates/wasm4pm-cognition/breeds/registry.json` from `UNSUPPORTED` to `PARTIAL_ALIVE`.
11. Generate documentation cards in `docs/breeds/<b>.md` (8-section format).
12. Measure OCEL fitness (must be 1.0) and generate `ocel/reports/<b>.json`.
13. Run `cargo test -p wasm4pm-cognition` and `pnpm run test` or `npx vitest` to ensure all tests pass cleanly.
