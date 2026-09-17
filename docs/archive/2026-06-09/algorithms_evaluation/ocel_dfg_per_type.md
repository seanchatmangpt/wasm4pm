<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/docs/archive/2026-06-09/algorithms_evaluation/ocel_dfg_per_type.md; source-sha256: 2166c33026a84d1ed74742e724a0a0afaf240475245584f652357bf77a011d4c; reason: tooling or agent control surface -->

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
