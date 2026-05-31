# Algorithm Evaluation: Agentic Process Pipeline

## Metadata
- **ID**: `agentic_pipeline`
- **Export Name**: `run_agentic_pipeline`
- **Reachability**: `Reachable`
- **Absence Reason**: requires feature-cloud WASM build

## Implementation Status
- **Source Code Path**: `wasm4pm/src/autoprocess.rs`
- **WASM Bindings Path**: `wasm4pm/src/lib.rs`

## Testing Status
- **Test Location**: `packages/kernel/__tests__/registry.test.ts`
- **Command to Run**: `npx vitest run packages/kernel/__tests__/registry.test.ts`
- **Result**: `Pass`

## Behavior Details
- **Correct Refusals Verified**: EMPTY_EVENT_LOG, MALFORMED_EVENT_LOG
- **Invariants Checked**: agentic_pipeline.DeterministicSameInputCase
- **Identified Gaps**: None identified. The algorithm meets all conformance and reachability requirements.
