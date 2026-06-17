# Scope: Tier P2 Cognition Breeds Implementation

## Architecture
Each breed implements the `CognitionBreed` trait in Rust, gets registered in `mod.rs`, `dispatch.rs`, and has an OCPN model definition, integration tests, benchmark entries, and typescript schemas/tests.

## Milestones
| # | Breed ID | Status | Conv ID | Key Output / Verification |
|---|----------|--------|---------|---------------------------|
| 1 | `asp` | DONE | 2c3723b7-fd93-4e64-aa06-1c5b4901ac69 | docs/breeds/asp.md, ocel/reports/asp.json |
| 2 | `description_logic` | DONE | 2c3723b7-fd93-4e64-aa06-1c5b4901ac69 | docs/breeds/description_logic.md, ocel/reports/description_logic.json |
| 3 | `abductive_lp` | DONE | 2c3723b7-fd93-4e64-aa06-1c5b4901ac69 | docs/breeds/abductive_lp.md, ocel/reports/abductive_lp.json |
| 4 | `abductive_ibe` | DONE | 2c3723b7-fd93-4e64-aa06-1c5b4901ac69 | docs/breeds/abductive_ibe.md, ocel/reports/abductive_ibe.json |
| 5 | `partial_order_plan` | IN_PROGRESS | da26e72c-e534-4460-9fc9-48271f2adabd | |
| 6 | `event_calculus` | IN_PROGRESS | da26e72c-e534-4460-9fc9-48271f2adabd | |
| 7 | `mdp` | IN_PROGRESS | da26e72c-e534-4460-9fc9-48271f2adabd | |
| 8 | `version_space` | IN_PROGRESS | da26e72c-e534-4460-9fc9-48271f2adabd | |
| 9 | `belief_merging` | PLANNED | | |
| 10 | `qualitative_reason` | PLANNED | | |
| 11 | `script_sam` | PLANNED | | |
| 12 | `clp` | PLANNED | | |

## Interface Contracts
- Breed Rust module: `crates/wasm4pm-cognition/src/breeds/<b>.rs`
- Registry update in `breeds/registry.json`
- Lifecycle model: `crates/wasm4pm-cognition/src/ocel/models_p2.rs`
- OCPN model in `ocel/models/l1/<b>.ocpn.json`
- Tests in Rust (`tests/oracle_negative.rs`, `tests/oracle_hidden.rs`, `tests/paper_grounded.rs`, `tests/breed_determinism.rs`)
- Benchmark in `benches/breed_latency.rs`
- TypeScript in `packages/cognition/src/schemas.ts` and `packages/cognition/src/__tests__/`
- OCEL fitness report: `ocel/reports/<b>.json`
- Documentation card: `docs/breeds/<b>.md`
