<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/docs/archive/2026-06-09/algorithms_evaluation/yawl_export.md; source-sha256: d4337081cbbeb5e6f94db57191ef8ebd2f34eecb117ed98e8ea9f4f59750bdbf; reason: tooling or agent control surface -->

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
