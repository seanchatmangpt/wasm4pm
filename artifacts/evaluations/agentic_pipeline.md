# Algorithm Evaluation: agentic_pipeline

## Metadata
- **Algorithm ID:** `agentic_pipeline`
- **Category:** `discovery`
- **Supported Profiles:** `fast`, `balanced`, `quality`

## Status
- **Registry:** ✓ Present
- **Dispatch:** ✓ Present
- **CLI:** ✓ Present
- **WASM:** ✗ Absent (Framework-level TypeScript orchestration)

## Behavior Evidence
- **Positive Cases:** 1/1 Passed
- **Negative Cases:** 2/2 Failed Correctly
- **Invariant Cases:** 1/1 Passed

### Test Details
- **Positive:** `agentic_pipeline.valid_minimal_log` (Passed)
- **Negative:** `EMPTY_EVENT_LOG`, `MALFORMED_EVENT_LOG` (Failed Correctly)
- **Invariant:** `DeterministicSameInputCase` (Passed)

## Evidence Hash
`1b01590f32d7c72313bb44755af860abcfa00a30a961fe6bcc5a2ec351f591fb`

## Verification State
**Closed**

## Summary of Algorithmic Role
The `agentic_pipeline` serves as a multi-agent orchestration framework for executing complex process mining tasks. It manages a pipeline of specialized agents to perform collaborative discovery, analysis, or transformation. Unlike core mining algorithms, it operates primarily at the orchestration layer (TypeScript) rather than as a pure WASM export, although it is fully integrated into the registry and CLI dispatch system.

## Implementation Validation & Details
- **Source File:** `wasm4pm/src/lib.rs` (WASM bindings) and `wasm4pm/src/agentic/` (Core logic)
- **Core Logic:** Implemented as `run_agentic_pipeline`. It orchestrates a multi-agent task pipeline, evaluating role selection, topology selection, evidence sufficiency, escalation checks, and prompt binding compilation.
- **Data Structures:** Consumes a JSON-encoded `TaskContext` which includes metadata like policies, evidence arrays, and required/blocked roles. It produces `PromptBindingSet` structures.
- **Underlying Components:** Relies on `DefaultPromptBindingCompiler` for prompt generation and `DefaultEvidenceSufficiencyChecker` to evaluate if the available evidence meets the requirements for a given task phase.