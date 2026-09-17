<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/docs/archive/2026-06-09/algorithms_evaluation/heuristic_miner.md; source-sha256: ff1a39cacf84270da2d2333f86d8c7b53566d11884f9ae0038808e421b2b3a31; reason: tooling or agent control surface -->

# Algorithm Evaluation: Heuristic Miner

## Metadata
- **ID**: `heuristic_miner`
- **Export Name**: `discover_heuristic_miner`
- **Reachability**: `Reachable`

## Implementation Status
- **Source Code Path**: `crates/wasm4pm-algos/src/heuristic.rs`
- **WASM Bindings Path**: `wasm4pm/src/algorithms.rs`

## Testing Status
- **Test Location**: `packages/kernel/__tests__/gap-fixes.test.ts`
- **Command to Run**: `npx vitest run packages/kernel/__tests__/gap-fixes.test.ts`
- **Result**: `Pass`

## Behavior Details
- **Correct Refusals Verified**: MALFORMED_EVENT_LOG, EMPTY_EVENT_LOG
- **Invariants Checked**: heuristic_miner.DeterministicSameInputCase
- **Identified Gaps**: None identified. The algorithm meets all conformance and reachability requirements.
