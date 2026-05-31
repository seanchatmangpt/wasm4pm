# Algorithm Evaluation: DFG (Directly Follows Graph)

## Metadata
- **ID**: `dfg`
- **Export Name**: `discover_dfg`
- **Reachability**: `Reachable`

## Implementation Status
- **Source Code Path**: `crates/wasm4pm-algos/src/dfg.rs`
- **WASM Bindings Path**: `wasm4pm/src/algorithms.rs`

## Testing Status
- **Test Location**: `packages/kernel/__tests__/algorithms-error-handling.test.ts`
- **Command to Run**: `npx vitest run packages/kernel/__tests__/algorithms-error-handling.test.ts`
- **Result**: `Pass`

## Behavior Details
- **Correct Refusals Verified**: EMPTY_EVENT_LOG, MALFORMED_EVENT_LOG
- **Invariants Checked**: dfg.DeterministicSameInputCase
- **Identified Gaps**: None identified. The algorithm meets all conformance and reachability requirements.
