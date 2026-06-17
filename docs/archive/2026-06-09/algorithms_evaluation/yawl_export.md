# Algorithm Evaluation: YAWL Export

## Metadata
- **ID**: `yawl_export`
- **Export Name**: `powl_to_yawl_string`
- **Reachability**: `Reachable`

## Implementation Status
- **Source Code Path**: `wasm4pm/src/yawl_export.rs`
- **WASM Bindings Path**: `wasm4pm/src/lib.rs`

## Testing Status
- **Test Location**: `packages/kernel/__tests__/gap-fixes.test.ts`
- **Command to Run**: `npx vitest run packages/kernel/__tests__/gap-fixes.test.ts`
- **Result**: `Pass`

## Behavior Details
- **Correct Refusals Verified**: MALFORMED_EVENT_LOG, EMPTY_EVENT_LOG
- **Invariants Checked**: yawl_export.DeterministicSameInputCase
- **Identified Gaps**: None identified. The algorithm meets all conformance and reachability requirements.
