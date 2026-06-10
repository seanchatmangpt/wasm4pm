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
