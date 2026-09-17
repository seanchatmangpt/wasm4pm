<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/docs/archive/2026-06-09/algorithms_evaluation/complexity_metrics.md; source-sha256: 729b7d5a3b50d1617d7710a4282446c4c6e2f3b674b694b65cf2746556b11eab; reason: tooling or agent control surface -->

# Algorithm Evaluation: POWL Complexity Metrics

## Metadata
- **ID**: `complexity_metrics`
- **Export Name**: `measure_complexity`
- **Reachability**: `Reachable`

## Implementation Status
- **Source Code Path**: `wasm4pm/src/complexity_metrics.rs`
- **WASM Bindings Path**: `wasm4pm/src/lib.rs`

## Testing Status
- **Test Location**: `packages/kernel/__tests__/gap-fixes.test.ts`
- **Command to Run**: `npx vitest run packages/kernel/__tests__/gap-fixes.test.ts`
- **Result**: `Pass`

## Behavior Details
- **Correct Refusals Verified**: MALFORMED_EVENT_LOG, EMPTY_EVENT_LOG
- **Invariants Checked**: complexity_metrics.DeterministicSameInputCase
- **Identified Gaps**: None identified. The algorithm meets all conformance and reachability requirements.
