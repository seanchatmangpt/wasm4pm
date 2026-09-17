<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/docs/archive/2026-06-09/algorithms_evaluation/batches.md; source-sha256: 9098a834e2cc466ec20cc09b8898de9a07bca15bba69afa8a80edc6510588f5f; reason: tooling or agent control surface -->

# Algorithm Evaluation: Batch Detection

## Metadata
- **ID**: `batches`
- **Export Name**: `discover_batches_wasm`
- **Reachability**: `Reachable`

## Implementation Status
- **Source Code Path**: `wasm4pm/src/batches.rs`
- **WASM Bindings Path**: `wasm4pm/src/batches.rs`

## Testing Status
- **Test Location**: `packages/kernel/__tests__/registry.test.ts`
- **Command to Run**: `npx vitest run packages/kernel/__tests__/registry.test.ts`
- **Result**: `Pass`

## Behavior Details
- **Correct Refusals Verified**: MALFORMED_EVENT_LOG, EMPTY_EVENT_LOG
- **Invariants Checked**: batches.DeterministicSameInputCase
- **Identified Gaps**: None identified. The algorithm meets all conformance and reachability requirements.
