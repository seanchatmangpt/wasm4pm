# Algorithm Review: agentic_pipeline

## Algorithm ID & Domain
- **Registry ID**: `agentic_pipeline`
- **Domain**: Autonomic Agent Coordination

## Correctness Audit
- **Input/Output Contracts**:
  - Accepts `task_json` (a JSON string of a `TaskContext` object).
  - Returns a JSON string of compiled `bindings`, `evidence_sufficient`, `should_escalate`, `escalation_target`, and `gaps`.
- **Boundary Checks**:
  - Validates that the input is a valid `TaskContext` JSON structure and returns appropriate parser errors if malformed.
  - Integrates four sequential stages: role selection, topology selection, evidence sufficiency validation, and escalation evaluation.
  - Validates topology legality: `TopologyPolicy` checks if the chosen topology is allowed for the given task context phase/risk.
- **Edge Cases & Errors**:
  - Escalation logic triggers on critical risk, out-of-control/trend-detected drift, or failed workflow phases.
  - Handles default or empty task contexts safely without crashing or panicking.

## Improvement Areas
- **Performance Optimization**:
  - High degree of dependency on JSON serialization between pipeline steps. Passing a structured `TaskContext` in memory across steps is clean, but the top-level API parses and serializes large JSON strings. Storing TaskContext structures inside the app state would avoid these serialization overheads.
  - Policy decisions are statically compiled Rust rules. Supporting dynamically loaded policies (e.g. from a policy DSL or JSON schema) would make the agentic framework much more adaptable.

## Code References
- **Rust Implementation**: `wasm4pm/src/lib.rs` -> `run_agentic_pipeline`, `wasm4pm/src/agentic/prompt_bindings.rs` -> `DefaultPromptBindingCompiler`
- **TypeScript dispatch**: `packages/kernel/src/api.ts` -> `runRaw`
- **Test file**: `packages/kernel/src/__tests__/algorithm-parity.test.ts`
