<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/docs/archive/2026-06-09/algorithms_evaluation/ml_regress.md; source-sha256: a760c6d32ace0a8de47b9a5c2cfb7d4f7a815ece838d51b2fd80c85c89afe754; reason: tooling or agent control surface -->

# Algorithm Evaluation: ML Remaining Time Regression

## Metadata
- **ID**: `ml_regress`
- **Export Name**: `discover_ml_regress`
- **Reachability**: `Reachable`

## Implementation Status
- **Source Code Path**: `wasm4pm/src/ml/regression.rs`
- **WASM Bindings Path**: `wasm4pm/src/ml/regression.rs`

## Testing Status
- **Test Location**: `packages/kernel/__tests__/prediction/ml.test.ts`
- **Command to Run**: `npx vitest run packages/kernel/__tests__/prediction/ml.test.ts`
- **Result**: `Pass`

## Behavior Details
- **Correct Refusals Verified**: PREDICTION_FEATURES_REQUIRED, EMPTY_EVENT_LOG
- **Invariants Checked**: ml_regress.DeterministicSameInputCase
- **Identified Gaps**: None identified. The algorithm meets all conformance and reachability requirements.
