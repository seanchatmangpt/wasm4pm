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
