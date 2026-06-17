# Algorithm Evaluation: Causal Graph Discovery

## Metadata
- **ID**: `causal_graph`
- **Export Name**: `discover_causal_alpha`
- **Reachability**: `Reachable`

## Implementation Status
- **Source Code Path**: `wasm4pm/src/causal_graph.rs`
- **WASM Bindings Path**: `wasm4pm/src/causal_graph.rs`

## Testing Status
- **Test Location**: `packages/kernel/__tests__/registry.test.ts`
- **Command to Run**: `npx vitest run packages/kernel/__tests__/registry.test.ts`
- **Result**: `Pass`

## Behavior Details
- **Correct Refusals Verified**: MALFORMED_EVENT_LOG, EMPTY_EVENT_LOG
- **Invariants Checked**: causal_graph.DeterministicSameInputCase
- **Identified Gaps**: None identified. The algorithm meets all conformance and reachability requirements.
