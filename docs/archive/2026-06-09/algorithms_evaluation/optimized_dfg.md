<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/docs/archive/2026-06-09/algorithms_evaluation/optimized_dfg.md; source-sha256: 2fde18db782b8b0a52059cd2eb3897e5394093e08aa742939962ec88cb630df6; reason: tooling or agent control surface -->

# Algorithm Evaluation: Optimized DFG (ILP)

## Metadata
- **ID**: `optimized_dfg`
- **Export Name**: `discover_dfg`
- **Reachability**: `Reachable`

## Implementation Status
- **Source Code Path**: `crates/wasm4pm-algos/src/dfg.rs`
- **WASM Bindings Path**: `wasm4pm/src/wasm_testing_utils.rs`

## Testing Status
- **Test Location**: `packages/kernel/__tests__/gap-fixes.test.ts`
- **Command to Run**: `npx vitest run packages/kernel/__tests__/gap-fixes.test.ts`
- **Result**: `Pass`

## Behavior Details
- **Correct Refusals Verified**: MALFORMED_EVENT_LOG, EMPTY_EVENT_LOG
- **Invariants Checked**: optimized_dfg.DeterministicSameInputCase
- **Identified Gaps**: None identified. The algorithm meets all conformance and reachability requirements.
