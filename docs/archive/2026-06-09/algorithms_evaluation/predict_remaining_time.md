<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/docs/archive/2026-06-09/algorithms_evaluation/predict_remaining_time.md; source-sha256: 61793cf80288cb69d8a728a4065cd84b910d46e023e0716f7aa80ddcabf6396c; reason: tooling or agent control surface -->

# Algorithm Evaluation: Remaining Time Prediction

## Metadata
- **ID**: `predict_remaining_time`
- **Export Name**: `predict_case_duration`
- **Reachability**: `Reachable`

## Implementation Status
- **Source Code Path**: `wasm4pm/src/prediction_remaining_time.rs`
- **WASM Bindings Path**: `wasm4pm/src/prediction_remaining_time.rs`

## Testing Status
- **Test Location**: `packages/kernel/__tests__/pm4wasm-backend.test.ts`
- **Command to Run**: `npx vitest run packages/kernel/__tests__/pm4wasm-backend.test.ts`
- **Result**: `Pass`

## Behavior Details
- **Correct Refusals Verified**: PREDICTION_FEATURES_REQUIRED, EMPTY_EVENT_LOG
- **Invariants Checked**: predict_remaining_time.DeterministicSameInputCase
- **Identified Gaps**: None identified. The algorithm meets all conformance and reachability requirements.
