# Algorithm Evaluation: OC-DFG Per Object Type

## Metadata
- **ID**: `ocel_dfg_per_type`
- **Export Name**: `discover_ocel_dfg_per_type`
- **Reachability**: `Reachable`

## Implementation Status
- **Source Code Path**: `wasm4pm/src/discovery.rs`
- **WASM Bindings Path**: `wasm4pm/src/discovery.rs`

## Testing Status
- **Test Location**: `packages/kernel/__tests__/gap-fixes.test.ts`
- **Command to Run**: `npx vitest run packages/kernel/__tests__/gap-fixes.test.ts`
- **Result**: `Pass`

## Behavior Details
- **Correct Refusals Verified**: EMPTY_EVENT_LOG, MALFORMED_EVENT_LOG
- **Invariants Checked**: ocel_dfg_per_type.DeterministicSameInputCase
- **Identified Gaps**: None identified. The algorithm meets all conformance and reachability requirements.
