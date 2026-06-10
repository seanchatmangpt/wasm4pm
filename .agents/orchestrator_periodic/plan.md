# Project: wasm4pm Full Periodic Table
# Scope: 42 Cognition Breeds implementation

## Architecture
- Module/package boundaries, data flow, shared interfaces
- Rust crate `crates/wasm4pm-cognition` exposes `CognitionBreed` trait and `dispatch_breed` / `dispatch_breed_test` to route inputs to algorithms.
- WASM boundary in `src/wasm.rs` exposes JS bindings.
- TS side `packages/cognition` defines schemas and runs integration tests.
- OCEL validation runs on inference trace steps.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Phase A: Batch 0 | Split ocel, extract dispatch, reconcile registry. | none | DONE |
| 2 | Stage C1: Core | Build and verify support modules in `src/breeds/support/`. | M1 | DONE |
| 3 | Tier P1 Breeds | Implement 10 P1 breeds and verify. | M2 | DONE |
| 4 | Tier P2 Breeds | Implement 12 P2 breeds and verify. | M2 | IN_PROGRESS |
| 5 | Tier P3 Breeds | Implement 11 P3 breeds and verify. | M2 | PLANNED |
| 6 | Tier P4 Breeds | Implement 6 P4 breeds, Meta-Reasoning, Reasoning Compiler. | M3, M4, M5 | PLANNED |
| 7 | Phase C3/D Release| Run full-ensemble, benches, registry checks, release certificate. | M6 | PLANNED |

## Interface Contracts
### `crates/wasm4pm-cognition` ↔ `packages/cognition`
- Data types: `BreedInput` / `BreedOutput` serialized as JSON.
- `BreedId` enum in Rust must match `BreedIdSchema` in TypeScript.
- WASM export: `cognition_run` runs a breed and returns serialized `BreedOutput`.
