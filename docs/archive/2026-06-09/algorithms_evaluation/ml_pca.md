# Algorithm Evaluation: ML PCA Feature Reduction

## Metadata
- **ID**: `ml_pca`
- **Export Name**: `discover_ml_pca`
- **Reachability**: `Reachable`

## Implementation Status
- **Source Code Path**: `wasm4pm/src/ml/pca.rs`
- **WASM Bindings Path**: `wasm4pm/src/ml/pca.rs`

## Testing Status
- **Test Location**: `packages/kernel/__tests__/prediction/ml.test.ts`
- **Command to Run**: `npx vitest run packages/kernel/__tests__/prediction/ml.test.ts`
- **Result**: `Pass`

## Behavior Details
- **Correct Refusals Verified**: PREDICTION_FEATURES_REQUIRED, EMPTY_EVENT_LOG
- **Invariants Checked**: ml_pca.DeterministicSameInputCase
- **Identified Gaps**: None identified. The algorithm meets all conformance and reachability requirements.
