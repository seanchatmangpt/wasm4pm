# Algorithm Review: automl_classify

## Algorithm ID & Domain
- **Registry ID**: `automl_classify`
- **Domain**: Automated Machine Learning / Parameter Tuning

## Correctness Audit
- **Input/Output Contracts**:
  - Accepts `eventlog_handle` and `activity_key`.
  - Returns a JSON string containing the optimized hyperparameter `best_k` and the corresponding `max_accuracy` achieved during K-NN cross-validation.
- **Boundary Checks**:
  - Validates that the handle points to a valid `StoredObject::EventLog`.
  - Checks if the number of traces is less than 10 via `features.len() < 10` and returns an explicit error message instead of dividing by zero or running with insufficient data.
  - Limits maximum K neighbors to `MAX_K = 15`. In the core `knn_sweep_cv` function, K is clamped internally to `[1, 32]`.
- **Edge Cases & Errors**:
  - Employs 5-fold cross-validation sweep over K in range `[1, 15]`.
  - Sweeps all K values in a single pass of the distance matrix using the optimized `knn_sweep_cv`, which prevents redundant distance calculations.

## Improvement Areas
- **Performance Optimization**:
  - Feature extraction is hardcoded to trace length and number of unique activities per trace. This is a very simple feature space. Supporting custom feature templates or event attributes would make the classifier far more useful.
  - Sweeps a fixed range of K from 1 to 15. If a log has hundreds of thousands of traces, a much higher K might be optimal. Making K range configurable would improve flexibility.

## Code References
- **Rust Implementation**: `wasm4pm/src/ml/automl.rs` -> `discover_automl_classify`, `discover_automl_classify_internal`, `wasm4pm/src/ml/classification.rs` -> `knn_sweep_cv`
- **TypeScript dispatch**: `packages/kernel/src/api.ts` -> `runRaw`
- **Test file**: `packages/kernel/src/__tests__/algorithm-parity.test.ts`
