<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/docs/archive/2026-06-09/algorithms_evaluation/hierarchical_dfg.md; source-sha256: d09d3933118cd19eb055c4128300e75e1845239b17afed2b7092a884b1045b3d; reason: tooling or agent control surface -->

# Algorithm Evaluation: Hierarchical DFG

## Metadata
- **ID**: `hierarchical_dfg`
- **Export Name**: `discover_dfg_hierarchical`
- **Reachability**: `Reachable`

## Implementation Status
- **Source Code Path**: `wasm4pm/src/hierarchical.rs`
- **WASM Bindings Path**: `wasm4pm/src/hierarchical.rs`

## Testing Status
- **Test Location**: `packages/kernel/__tests__/registry.test.ts`
- **Command to Run**: `npx vitest run packages/kernel/__tests__/registry.test.ts`
- **Result**: `Pass`

## Behavior Details
- **Correct Refusals Verified**: MALFORMED_EVENT_LOG, EMPTY_EVENT_LOG
- **Invariants Checked**: hierarchical_dfg.DeterministicSameInputCase
- **Identified Gaps**: None identified. The algorithm meets all conformance and reachability requirements.
