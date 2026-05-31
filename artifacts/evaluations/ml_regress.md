# Algorithm Evaluation: ml_regress

## Metadata
- **Algorithm ID:** ml_regress
- **Category:** discovery
- **Supported Profiles:** fast, balanced, quality

## Implementation Status
- **Registry:** present
- **TS Dispatch:** present
- **CLI Surface:** present
- **WASM Export:** present

## Verification Results
- **Positive Cases:** 1 passed
- **Negative Cases:** 2 failed correctly
    - `ml_regress.MalformedLogCase`: PREDICTION_FEATURES_REQUIRED
    - `ml_regress.EmptyLogCase`: EMPTY_EVENT_LOG
- **Invariant Cases:** 1 passed
    - `ml_regress.DeterministicSameInputCase`: passed (stable: true)

## Evidence
- **Evidence Hash:** `60a5508520ea4244f3b2d2b35fd06cb815f548c9ffa82118bb20bd740228502b`
- **Verification State:** Closed

## Algorithmic Role
`ml_regress` performs linear regression on case duration to estimate the remaining time for active process instances. By training on historical completion times and trace features, it provides data-driven predictions for when a currently running case is expected to finish, aiding in SLA management and process orchestration.

## Implementation Validation & Details
Based on the implementation in `wasm4pm/src/ml/regression.rs`, the component acts as a high-performance Ordinary Least Squares (OLS) simple linear regression solver. It models the relationship between trace lengths (event count) and overall case durations. The routine calculates the normal equations over a two-pass phase: the first pass uses manually unrolled chunking (8-element accumulator blocks) to disrupt dependency chains and simulate SIMD speed for sums and cross-products. The second pass computes the line of best fit and generates exact residual metrics, including Mean Absolute Error (MAE), Root Mean Square Error (RMSE), and an unbiased residual standard error (n-2 degrees of freedom). An AutoML variant (`discover_ml_regress_automl`) also provides K-fold chunking for cross-validated regression testing.