<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/docs/archive/2026-06-09/algorithms_evaluation/correlation_miner.md; source-sha256: 7483510799625d9a7e85c3119e9f3b9dd41e5bfaaea49a906887998c0032fa77; reason: tooling or agent control surface -->

# Algorithm Evaluation: Correlation Miner

## Metadata
- **ID**: `correlation_miner`
- **Export Name**: `discover_correlation`
- **Reachability**: `Reachable`

## Implementation Status
- **Source Code Path**: `wasm4pm/src/correlation_miner.rs`
- **WASM Bindings Path**: `wasm4pm/src/correlation_miner.rs`

## Testing Status
- **Test Location**: `packages/kernel/__tests__/gap-fixes.test.ts`
- **Command to Run**: `npx vitest run packages/kernel/__tests__/gap-fixes.test.ts`
- **Result**: `Pass`

## Behavior Details
- **Correct Refusals Verified**: MALFORMED_EVENT_LOG, EMPTY_EVENT_LOG
- **Invariants Checked**: correlation_miner.DeterministicSameInputCase
- **Identified Gaps**: None identified. The algorithm meets all conformance and reachability requirements.
