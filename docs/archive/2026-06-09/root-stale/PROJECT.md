# Project: wasm4pm Process-Law Oracle

## Architecture
The system consists of three main layers:
1. **Core WASM Engine (`@wasm4pm/core`, in `wasm4pm/`):** Implements high-performance process mining algorithms in Rust, including compiled Petri Net representation, streaming token-based conformance, prefix A* alignments, Process-Model Registry, OCEL 2.0 object traversal, and the OCPQ query engine.
2. **TypeScript Kernel (`wasm4pm`, in `packages/kernel/`):** Wraps the WASM bindings and exposes high-level API services for `ggen`, orchestrating model validation, conformance checks, and causality query resolution.
3. **Command Line Interface (`@wasm4pm/cli`, in `apps/wasm4pm/`):** Provides a CLI tool `wpm` for running offline/online conformance checks, managing the model registry, and executing OCPQ queries.

```
+----------------------------------------+
|        @wasm4pm/cli (wpm)              |
+----------------------------------------+
                    |
                    v
+----------------------------------------+
|          wasm4pm (Kernel)              |
+----------------------------------------+
                    |
                    v
+----------------------------------------+
|         @wasm4pm/core (WASM/Rust)      |
|  - ModelRegistry - ConformanceEngine   |
|  - OCPQ Engine   - OCEL 2.0 Traversal  |
+----------------------------------------+
```

## Milestones
| # | Name | Scope | Dependencies | Status | Conversation ID |
|---|---|---|---|---|---|
| M1 | Process-Model Registry | Implement `ProcessModelRegistry` in Rust core & TS with SemVer, variants, structural validation, and LRU memory limit (512). | None | DONE | 2394abb2-9da0-4de1-ab5b-46a64b90f1e4 |
| M2 | Streaming Conformance | Implement incremental token-based replay, A* frontier caching, and prefix fitness in Rust core & TS. | M1 | DONE | 4c90a29f-7eed-4256-91ba-771197c2723c |
| M3 | OCEL 2.0 & Causality | Add OCEL 2.0 schema and provenance traversal query over Agent, File, Diagnostic, and Receipt objects. | None | DONE | 471169bf-50c5-453a-b873-3d896fec015b |
| M4 | OCPQ Parser & Runtime | Implement Process-Law Query Language (OCPQ) parser, AST, and runtime evaluator in Rust and TS. | M3 | DONE | 4c90a29f-7eed-4256-91ba-771197c2723c |
| M5 | CLI Integration & Corpus | Integrate registry, streaming, and OCPQ commands in `wpm` CLI, add fixture corpus, and pass E2E tests. | M2, M4 | DONE | 4c90a29f-7eed-4256-91ba-771197c2723c |
| M6 | Primitive Inventory | Map existing primitives, modules, tests, paper grounding, and downstream use in 00-WASM4PM-PRIMITIVE-INVENTORY.md. | None | PLANNED | |
| M7 | OCEL v2 Primitives | Validate OCEL v2 canonical evidence surface and document in 01-OCEL-V2-PRIMITIVES.md. | None | PLANNED | |
| M8 | POWL 2.0 Primitives | Validate POWL 2.0 models, choice graphs, and conversion in 02-POWL-2-PRIMITIVES.md. | None | PLANNED | |
| M9 | WF-Net / Petri-Net Primitives | Validate Petri net place/transition structures and token-replay in 03-WFNET-PETRI-PRIMITIVES.md. | None | PLANNED | |
| M10 | Conformance Primitives | Validate fitness, alignment, and prefix conformance in 04-CONFORMANCE-PRIMITIVES.md. | None | PLANNED | |
| M11 | Process-World Foundry | Validate OCEL/POWL simulators and generators in 05-PROCESS-WORLD-FOUNDRY.md. | None | PLANNED | |
| M12 | Negative Fixtures & Sabotage | Verify negative/sabotage trace corpus and document in 06-NEGATIVE-CORPUS.md. | None | PLANNED | |
| M13 | Route-Driven TDD | Verify powl_test macro-driven testing substrate and document in 07-ROUTE-DRIVEN-TDD.md. | None | PLANNED | |
| M14 | Benchmark Gates | Verify G1-G5 benchmark gates and document in 08-BENCHMARK-GATES.md. | None | PLANNED | |
| M15 | Plan Synthesizer & Receipt | Synthesize dependency DAG in 00-BUILD-PLAN.md and emit WASM4PM_PRIMITIVE_KERNEL_RECEIPT.md. | M6-M14 | PLANNED | |

## Interface Contracts

### `@wasm4pm/core` ↔ `wasm4pm` (Kernel TS)
- **Model Registry:**
  - `register_model(envelope_json: string): string` -> returns registration status or throws `INVALID_WORKFLOW_NET` / `LIMIT_EXCEEDED`.
  - `get_model(model_id: string): string` -> returns model envelope JSON.
- **Streaming Conformance:**
  - `create_stream_checker(net_json: string): string` -> returns checker instance ID.
  - `feed_event(checker_id: string, event_json: string): string` -> returns conformance result JSON (fitness, transition fired, missing tokens).
- **OCPQ Parser & Runtime:**
  - `evaluate_ocpq(ocel_json: string, query_str: string): string` -> returns query verdict JSON (Allow/Deny, list of violations).

## Code Layout
- `wasm4pm/src/` — Rust core engine source code
- `packages/kernel/src/` — TypeScript kernel wrapping WASM
- `packages/contracts/src/` — Shared TypeScript typings and contracts
- `apps/wasm4pm/src/` — CLI application commands
- `fixtures/ocpq/` — Fixture corpus of valid/invalid traces
