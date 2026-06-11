## 2026-06-10T23:16:00Z

You are a teamwork_preview_worker. Your task is to implement and verify the remaining 3 of the 10 Tier P1 cognition breeds:
8. `dempster_shafer`
9. `frames_inheritance`
10. `ebl`

For each of these 3 breeds, perform the following steps:
1. Implement the core algorithm in `crates/wasm4pm-cognition/src/breeds/<b>.rs` implementing the `CognitionBreed` trait.
   - For `dempster_shafer`: Implement Dempster-Shafer theory of evidence. Combine mass functions (beliefs over subsets of hypotheses in the frame of discernment) from input facts using Dempster's rule of combination: m_{1+2}(A) = (1/(1-K)) * sum_{B cap C = A} m_1(B)*m_2(C). Assert conflict factor K < 1.0; if K = 1.0, return a typed refusal error. Calculate belief (Bel) and plausibility (Pl) for query hypotheses. Trace steps must record combination operations and conflict checks.
   - For `frames_inheritance`: Implement frame-based representation with multiple inheritance and defaults/overrides. Parse frame graph (classes, instances, parent links, slot values) from input facts/state. Perform search (e.g. DFS/BFS or topological linearization) up the inheritance tree to retrieve slot values, ensuring local values override defaults/parents. Trace steps must record traversal path and overriding events.
   - For `ebl`: Implement Explanation-Based Learning / generalization (EBG). Parse target concept, positive training example (facts), domain theory (rules), and operationality criterion (subset of predicates) from input. Build a proof tree of the training example (explain step) and regress it back to generate a generalized rule (generalize step) containing variables instead of training constants. Trace steps must record proof steps and regression steps.
2. Register the module in `crates/wasm4pm-cognition/src/breeds/mod.rs` (e.g., `pub mod <b>;`).
3. Wire up dispatch in `crates/wasm4pm-cognition/src/breeds/dispatch.rs` (update `dispatch_breed` and `dispatch_breed_test` to use the new implementations).
4. Register static lifecycle models in `crates/wasm4pm-cognition/src/ocel/models_p1.rs` and update `crates/wasm4pm-cognition/src/ocel/mod.rs` `lifecycle_model_for`.
5. Add `include_str!` in `crates/wasm4pm-cognition/src/ocel/model_sources.rs`.
6. Author the OCPN model JSON in `ocel/models/l1/<b>.ocpn.json` (ensure fitness will be 1.0 against the generated trace steps).
7. Implement test cases in `crates/wasm4pm-cognition/tests/oracle_negative.rs`, `crates/wasm4pm-cognition/tests/oracle_hidden.rs`, `crates/wasm4pm-cognition/tests/paper_grounded.rs` (with fixture `crates/wasm4pm-cognition/tests/fixtures/papers/<b>.json`), and `crates/wasm4pm-cognition/tests/breed_determinism.rs`.
8. Add the breed bench entry in `crates/wasm4pm-cognition/benches/breed_latency.rs`.
9. Add TS test cases in `packages/cognition/src/__tests__/cognition-breeds.integration.test.ts` and update TS inputs in `packages/cognition/src/__tests__/fixtures/breed-inputs.ts`.
10. Flip status in `crates/wasm4pm-cognition/breeds/registry.json` from `UNSUPPORTED` to `PARTIAL_ALIVE`.
11. Generate documentation cards in `docs/breeds/<b>.md` (8-section format).
12. Measure OCEL fitness (must be 1.0) and generate `ocel/reports/<b>.json`.
13. Run `cargo test -p wasm4pm-cognition` and `pnpm run test` or `npx vitest` to ensure all tests pass cleanly.
