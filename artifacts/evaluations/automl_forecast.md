# Algorithm Evaluation: automl_forecast

## Metadata
- **Algorithm ID**: `automl_forecast`
- **Category**: `discovery`
- **Supported Profiles**: `fast`, `balanced`, `quality`

## Status Proof
- **Registry**: ✅ Present
- **TypeScript Dispatch**: ✅ Present
- **CLI Surface**: ✅ Present
- **WASM Export**: ✅ Present

## Behavioral Evidence
- **Positive Cases**:
    - `automl_forecast.valid_minimal_log`: **PASSED**
- **Negative Cases**:
    - `automl_forecast.MalformedLogCase`: **FAILED_CORRECTLY** (Error: `MALFORMED_EVENT_LOG`)
    - `automl_forecast.EmptyLogCase`: **FAILED_CORRECTLY** (Error: `EMPTY_EVENT_LOG`)
- **Invariant Cases**:
    - `automl_forecast.DeterministicSameInputCase`: **PASSED** (Stable: true)

## Evidence Binding
- **Evidence Hash**: `55020483939297ac8586ae681e4bffa6d92bea397438da4a9d5b9ad58cb2b6e7`
- **Verification State**: `Closed`

## Algorithmic Role
The `automl_forecast` algorithm applies automated machine learning to forecast future events or numeric process attributes. By analyzing historical event patterns and their timing, it generates predictive models that can estimate future activity timestamps, remaining process duration, or other continuous variables critical for proactive process management.

## Implementation Validation & Details
The `automl_forecast` algorithm is implemented in Rust (`wasm4pm/src/ml/automl.rs`). It performs automated hyperparameter selection for Exponentially Weighted Moving Average (EWMA) forecasting models by:
- **Cross-Validation Sweep**: Executing a 5-fold cross-validation sweep across smoothing factors ($\alpha$) ranging from $0.05$ to $0.95$ in $0.05$ increments.
- **Fold Evaluation Strategy**: For each fold, it fits the EWMA state on the training complement (windows outside the holdout set). It then evaluates on the held-out test fold by continually rolling the EWMA state while accumulating squared and absolute errors.
- **Metric Aggregation**: Aggregating Root Mean Squared Error (RMSE) and Mean Absolute Error (MAE) across all folds for each candidate $\alpha$.
- **Optimal Selection**: Returning the optimal $\alpha$ (`best_alpha`) that minimizes the average cross-validated RMSE (`cv_rmse`).
