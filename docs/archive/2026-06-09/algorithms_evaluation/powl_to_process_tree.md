<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/docs/archive/2026-06-09/algorithms_evaluation/powl_to_process_tree.md; source-sha256: 647a3a14a21b22dbf7f503435035a0772d47f8105485f115a195b8455dda34f4; reason: tooling or agent control surface -->

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
