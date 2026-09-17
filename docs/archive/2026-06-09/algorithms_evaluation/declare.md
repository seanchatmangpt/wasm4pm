<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/docs/archive/2026-06-09/algorithms_evaluation/declare.md; source-sha256: 18b9ebfa3e0bacaf1ca6ea0ebf3c63f00362ecf502712123581dc0e224ab1ad4; reason: tooling or agent control surface -->

# Algorithm Evaluation: Declare (Constraints)

## Metadata
- **ID**: `declare`
- **Export Name**: `discover_declare`
- **Reachability**: `Reachable`

## Implementation Status
- **Source Code Path**: `wasm4pm/src/discovery.rs`
- **WASM Bindings Path**: `wasm4pm/src/discovery.rs`

## Testing Status
- **Test Location**: `packages/kernel/__tests__/algorithms-error-handling.test.ts`
- **Command to Run**: `npx vitest run packages/kernel/__tests__/algorithms-error-handling.test.ts`
- **Result**: `Pass`

## Behavior Details
- **Correct Refusals Verified**: MALFORMED_EVENT_LOG, EMPTY_EVENT_LOG
- **Invariants Checked**: declare.DeterministicSameInputCase
- **Identified Gaps**: None identified. The algorithm meets all conformance and reachability requirements.
