## 2026-06-10T23:06:37Z

You are a teamwork_preview_worker. Your task is to implement and verify the next 3 of the 10 Tier P1 cognition breeds:
5. `csp_ac3`
6. `default_logic`
7. `htn_planning`

For each of these 3 breeds, perform the following steps:
1. Implement the core algorithm in `crates/wasm4pm-cognition/src/breeds/<b>.rs` implementing the `CognitionBreed` trait.
   - For `csp_ac3`: Implement finite-domain Constraint Satisfaction via AC-3 Mackworth 1977. You MUST use the existing finite-domain CSP solver in `support::csp`. Parse variables, domains, and constraints (like Lt, EqOffset, Ne, AllDiff) from input facts, rules, or state, run `support::csp::solve()`, and return the solved assignment (mapping to updated candidates or new facts). Trace steps must record AC-3 revisions and backtrack steps.
   - For `default_logic`: Implement Reiter's Default Logic extension finder. Parse default rules (e.g. from input rules: premise A, justifications B, consequent C) and facts, find all extensions closed under defaults and classical consequence, and return them. Trace steps must record applied defaults and extension candidates tested.
   - For `htn_planning`: Implement Hierarchical Task Network planning (SHOP-style total order planner). Parse initial state, tasks to run, methods (compound task decompositions with preconditions), and operators (primitive actions with preconditions/effects) from input state, goals, and rules. Perform recursive planning and return the sequence of plan steps. Trace steps must record decomposition and operator applications.
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

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Please execute these changes carefully and run the test suites to verify. Write your final report and hand off your changes.
Your working directory is: /Users/sac/wasm4pm/.agents/worker_2/
