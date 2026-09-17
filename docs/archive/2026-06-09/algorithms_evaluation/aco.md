<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/docs/archive/2026-06-09/algorithms_evaluation/aco.md; source-sha256: 2ae396eea75d2cf9c59b6ffd235058e078c4749787837b162e44436439971034; reason: tooling or agent control surface -->

# Algorithm Evaluation: Ant Colony Optimization (ACO)

## Metadata
- **ID**: `aco`
- **Export Name**: `discover_ant_colony`
- **Reachability**: `Reachable`

## Implementation Status
- **Source Code Path**: `wasm4pm/src/more_discovery.rs`
- **WASM Bindings Path**: `wasm4pm/src/more_discovery.rs`

## Testing Status
- **Test Location**: `packages/kernel/__tests__/deployment-profiles.test.ts`
- **Command to Run**: `npx vitest run packages/kernel/__tests__/deployment-profiles.test.ts`
- **Result**: `Pass`

## Behavior Details
- **Correct Refusals Verified**: MALFORMED_EVENT_LOG, EMPTY_EVENT_LOG
- **Invariants Checked**: aco.SeededRepeatabilityCase
- **Identified Gaps**: None identified. The algorithm meets all conformance and reachability requirements.
