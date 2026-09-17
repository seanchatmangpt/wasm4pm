<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/docs/archive/2026-06-09/algorithms_evaluation/dfg.md; source-sha256: de0fa03d7482333c47d8d7047de47963c0651eec48136f48c2d8c6d9a8b05233; reason: tooling or agent control surface -->

# Algorithm Evaluation: DFG (Directly Follows Graph)

## Metadata
- **ID**: `dfg`
- **Export Name**: `discover_dfg`
- **Reachability**: `Reachable`

## Implementation Status
- **Source Code Path**: `crates/wasm4pm-algos/src/dfg.rs`
- **WASM Bindings Path**: `wasm4pm/src/algorithms.rs`

## Testing Status
- **Test Location**: `packages/kernel/__tests__/algorithms-error-handling.test.ts`
- **Command to Run**: `npx vitest run packages/kernel/__tests__/algorithms-error-handling.test.ts`
- **Result**: `Pass`

## Behavior Details
- **Correct Refusals Verified**: EMPTY_EVENT_LOG, MALFORMED_EVENT_LOG
- **Invariants Checked**: dfg.DeterministicSameInputCase
- **Identified Gaps**: None identified. The algorithm meets all conformance and reachability requirements.
