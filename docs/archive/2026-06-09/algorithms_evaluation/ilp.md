# Algorithm Evaluation: Integer Linear Programming (ILP)

## Metadata
- **ID**: `ilp`
- **Export Name**: `discover_ilp_petri_net`
- **Reachability**: `Reachable`

## Implementation Status
- **Source Code Path**: `wasm4pm/src/ilp_discovery.rs`
- **WASM Bindings Path**: `wasm4pm/src/ilp_discovery.rs`

## Testing Status
- **Test Location**: `packages/kernel/__tests__/algorithms-error-handling.test.ts`
- **Command to Run**: `npx vitest run packages/kernel/__tests__/algorithms-error-handling.test.ts`
- **Result**: `Pass`

## Behavior Details
- **Correct Refusals Verified**: MALFORMED_EVENT_LOG, EMPTY_EVENT_LOG
- **Invariants Checked**: ilp.DeterministicSameInputCase
- **Identified Gaps**: None identified. The algorithm meets all conformance and reachability requirements.
