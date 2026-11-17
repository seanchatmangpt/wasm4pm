<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: docs/reference/reviews/predict_remaining_time.md; source-sha256: f535d7bb1fb4b43f502b11af18709a6bec01d16254d1279d598aaef181a7a4b9; reason: canonical Diátaxis or ADR surface -->

# Algorithm Review: predict_remaining_time

## Algorithm ID & Domain
- **Registry ID**: `predict_remaining_time`
- **Domain**: Predictive Process Monitoring

## Correctness Audit
- **Input/Output Contracts**:
  - Accepts `model_handle` and `prefix_json`.
  - Returns a JSON string with `remaining_ms`, `confidence`, and `method`.
- **Boundary Checks**:
  - Validates that the handle points to a valid stored `RemainingTimeModel` (JsonString).
  - Falls back gracefully using strategies: (1) exact bucket `last_activity|prefix_len`, (2) activity average across all prefix lengths, (3) prefix length average across all activities, and (4) global average duration.
  - Fits a Weibull distribution to historical trace durations using the method of moments.
  - Handles division-by-zero or negative variance by clamping values in standard deviation calculations.
  - Uses `gamma_approx` (Lanczos approximation) for gamma functions, with proper handling of values `< 0.5`.
- **Edge Cases & Errors**:
  - Clamps `elapsed_ms == 0.0` check to handle hazard rate limit states properly depending on the shape parameter.
  - Returns error if the prefix is empty.

## Improvement Areas
- **Performance Optimization**:
  - Model serialization: serializes the entire `RemainingTimeModel` to JSON string to store in state, and deserializes it on every prediction call. For large models (e.g. many buckets), this is slow. Storing the model as a native Rust struct in `StoredObject` rather than as a serialized JSON string would avoid parsing overhead on every prediction.
  - Float parameters: fits the Weibull distribution using a method of moments approximation. Under high variance, the shape parameter `shape` is clamped to `[0.1, 20.0]` which prevents numerical issues but can yield coarse predictions for extreme distributions.

## Code References
- **Rust Implementation**: `wasm4pm/src/prediction_remaining_time.rs` -> `predict_case_duration`, `build_remaining_time_model`
- **TypeScript dispatch**: `packages/kernel/src/api.ts` -> `runRaw`
- **Test file**: `packages/kernel/src/__tests__/algorithm-parity.test.ts`

## Evaluation semantics (2026-10-10, commit `0e3d81b38`)

- `build_remaining_time_model_with_eval(log_handle, activity_key, timestamp_key)`
  trains on the first `prefix_split(n, 0.8)` slice and scores every prefix of
  every held-out trace. `prefix_split` guarantees a non-empty test slice
  whenever `n >= 2` (`prefix_split(10, 0.8) == (8, 2)`).
- The stored model JSON carries an optional `holdout` object with `mae`,
  `rmse`, `r_squared` (can be negative — a model worse than the test mean is
  reported as such, not clamped), `n_test`, `n_train`. `holdout` is absent
  below `MIN_EVAL_SAMPLES = 10` total samples.
- Hold-out MAE exceeding in-sample MAE on noise-injected logs is a regression
  oracle in `wasm4pm/src/prediction_remaining_time.rs`.
- NaN/Inf in the extracted lengths/durations return a typed error
  (`input contains NaN/Inf at index i`) instead of silently poisoning metrics.
