# Algorithm Evaluation: Streaming Log (Probabilistic)

## Metadata
- **ID**: `streaming_log`
- **Export Name**: `discover_dfg`
- **Reachability**: `Reachable`

## Implementation Status
- **Source Code Path**: `wasm4pm/src/streaming_wasm.rs`
- **WASM Bindings Path**: `wasm4pm/src/lib.rs`

## Testing Status
- **Test Location**: `packages/kernel/__tests__/gap-fixes.test.ts`
- **Command to Run**: `npx vitest run packages/kernel/__tests__/gap-fixes.test.ts`
- **Result**: `Pass`

## Behavior Details
- **Correct Refusals Verified**: MALFORMED_EVENT_LOG, EMPTY_EVENT_LOG
- **Invariants Checked**: streaming_log.DeterministicSameInputCase
- **Identified Gaps**: None identified. The algorithm meets all conformance and reachability requirements.
