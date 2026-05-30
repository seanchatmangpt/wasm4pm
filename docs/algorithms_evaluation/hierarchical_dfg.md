# Algorithm Evaluation: Hierarchical DFG

## Metadata
- **ID**: `hierarchical_dfg`
- **Export Name**: `discover_dfg_hierarchical`
- **Reachability**: `Reachable`

## Implementation Status
- **Source Code Path**: `wasm4pm/src/hierarchical.rs`
- **WASM Bindings Path**: `wasm4pm/src/hierarchical.rs`

## Testing Status
- **Test Location**: `packages/kernel/__tests__/registry.test.ts`
- **Command to Run**: `npx vitest run packages/kernel/__tests__/registry.test.ts`
- **Result**: `Pass`

## Behavior Details
- **Correct Refusals Verified**: MALFORMED_EVENT_LOG, EMPTY_EVENT_LOG
- **Invariants Checked**: hierarchical_dfg.DeterministicSameInputCase
- **Identified Gaps**: None identified. The algorithm meets all conformance and reachability requirements.
