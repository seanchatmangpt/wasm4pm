<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: docs/reference/reviews/automl_forecast.md; source-sha256: 3bf9996a2583491cb9b81873c392577a938e0aa76dc6a39e5683060e7b1420c5; reason: canonical Diátaxis or ADR surface -->

# Algorithm Review: automl_forecast

## Algorithm ID & Domain
- **Registry ID**: `automl_forecast`
- **Domain**: Automated Machine Learning / Parameter Tuning

## Correctness Audit
- **Input/Output Contracts**:
  - Accepts `eventlog_handle` and `activity_key` (unused, but required by API contract).
  - Returns a JSON string containing the optimized hyperparameter `best_alpha` and the cross-validated error metrics `avg_rmse`, `cv_rmse`, `cv_mae`, and `cv_folds`.
- **Boundary Checks**:
  - Validates that the handle points to a valid `StoredObject::EventLog`.
  - Checks if the number of windows is less than 10 via `count < 10` and returns an explicit error message instead of dividing by zero or running with insufficient data.
  - In `discover_automl_forecast_internal`, checks if number of windows is less than `FOLDS + 1` (6 windows) and returns an infinity sentinel: `AutomlForecastResult { best_alpha: 0.3, min_avg_rmse: f64::INFINITY, min_avg_mae: f64::INFINITY, folds: FOLDS }`.
- **Edge Cases & Errors**:
  - Disjoint train/test sets: `eval_fold` correctly fits EWMA on the training complement (prefix + suffix of windows) and evaluates on the test fold.
  - Clamps alpha to `(0.0, 1.0]` using `alpha.clamp(f64::MIN_POSITIVE, 1.0)` inside the EWMA recurrences to prevent numerical issues.

## Improvement Areas
- **Performance Optimization**:
  - The parameter sweep step is fixed at 0.05. Using a gradient descent or binary search optimization (e.g. golden-section search) could find the optimal alpha faster and with higher precision.
  - The forecasting target is hardcoded to trace count per window. Supporting other numeric targets (like average duration per window) would improve capability.

## Code References
- **Rust Implementation**: `wasm4pm/src/ml/automl.rs` -> `discover_automl_forecast`, `discover_automl_forecast_internal`, `eval_fold`
- **TypeScript dispatch**: `packages/kernel/src/api.ts` -> `runRaw`
- **Test file**: `packages/kernel/src/__tests__/algorithm-parity.test.ts`

## Honesty notes (2026-10-10, commit `0e3d81b38`)

- The k-fold sweep now truly fits each fold on the training complement and
  scores the held-out fold (`cv_method: "kfold_train_complement_test_holdout"`).
  Earlier releases fit each fold on the data it scored (in-sample metrics).
- `avg_rmse` is a back-compat field equal to `cv_rmse` for the best alpha;
  prefer the explicit `cv_rmse`/`cv_mae`/`cv_folds` fields.
- Below 10 windows the export refuses with an explicit insufficient-data
  error; below `FOLDS + 1` windows the internal search returns infinity
  sentinels rather than a fake optimum.
