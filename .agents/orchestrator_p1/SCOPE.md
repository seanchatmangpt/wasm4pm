# Scope: Tier P1 Cognition Breeds

## Architecture
- `crates/wasm4pm-cognition` contains the Rust implementation of the breeds.
- Each breed `<b>` implements `CognitionBreed` in `src/breeds/<b>.rs` and is registered in `src/breeds/mod.rs` and `src/breeds/dispatch.rs`.
- An OCPN model JSON is placed in `ocel/models/l1/<b>.ocpn.json`.
- Lifecycle models are defined in `src/ocel/models_p1.rs`.
- TypeScript definitions are in `packages/cognition/src/schemas.ts`.
- Tests are added in Rust and Vitest.
- Documentation cards are generated under `docs/breeds/<b>.md`.
- OCEL fitness reports are stored in `ocel/reports/<b>.json`.
- Registry status is updated in `breeds/registry.json`.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | ltl_monitor | Implement and verify LTL runtime monitor breed | None | DONE |
| 2 | allen_temporal | Implement and verify Allen's Temporal Interval Algebra breed | None | DONE |
| 3 | fuzzy_logic | Implement and verify Fuzzy Logic inference breed | None | DONE |
| 4 | bayesian_network | Implement and verify Bayesian Inference breed | None | DONE |
| 5 | csp_ac3 | Implement and verify Constraint Satisfaction (AC-3) breed | None | DONE |
| 6 | default_logic | Implement and verify Default Logic extension finder breed | None | DONE |
| 7 | htn_planning | Implement and verify Hierarchical Task Network planner breed | None | DONE |
| 8 | dempster_shafer | Implement and verify Dempster-Shafer theory of evidence breed | None | DONE |
| 9 | frames_inheritance | Implement and verify Frame-based inheritance with overrides breed | None | DONE |
| 10| ebl | Implement and verify Explanation-Based Learning / generalization breed | None | DONE |
| 11| final_verification | Run cargo tests, vitest integration tests, ostar audit checks, and generate final proofs | M1-M10 | DONE |

## Interface Contracts
### CognitionBreed ↔ Host
- Input: `BreedInput` containing intent, candidates, facts, rules, cases, etc.
- Output: `BreedOutput` with updated candidates, new facts, selected option, explanation, inference trace, and ocel log.
- Preconditions: verified prior to run.
- Postconditions: verified after run.
