# Algorithm Evaluation: POWL to Process Tree

## Metadata
- **ID**: `powl_to_process_tree`
- **Export Name**: `powl_to_process_tree`
- **Reachability**: `Reachable`

## Implementation Status
- **Source Code Path**: `wasm4pm/src/powl_api.rs`
- **WASM Bindings Path**: `wasm4pm/src/powl_api.rs`

## Testing Status
- **Test Location**: `packages/kernel/__tests__/gap-fixes.test.ts`
- **Command to Run**: `npx vitest run packages/kernel/__tests__/gap-fixes.test.ts`
- **Result**: `Pass`

## Behavior Details
- **Correct Refusals Verified**: MALFORMED_EVENT_LOG, EMPTY_EVENT_LOG
- **Invariants Checked**: powl_to_process_tree.DeterministicSameInputCase
- **Identified Gaps**: None identified. The algorithm meets all conformance and reachability requirements.
