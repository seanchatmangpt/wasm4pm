# Algorithm Review: compute_ewma

## Algorithm ID & Domain
- **Registry ID**: `compute_ewma`
- **Domain**: Process Health Monitoring

## Correctness Audit
- **Input/Output Contracts**:
  - Accepts `values_json` (a JSON array of floats) and `alpha` (smoothing factor, f64).
  - Returns a JSON string containing `smoothed` (float array), `trend` (string), `last_value` (float or null), and `alpha` (float).
- **Boundary Checks**:
  - Clamps `alpha` parameter into `(0.0, 1.0]` using `alpha.clamp(f64::MIN_POSITIVE, 1.0)` to guarantee mathematical stability and prevent division-by-zero or negative weight multipliers.
  - Handles empty inputs by returning empty list, trend `"stable"`, and null last value.
  - Trend classification uses stability fraction (`TREND_STABILITY_FRACTION = 0.05` of maximum value) to avoid classifying tiny numerical noise as rising/falling.
- **Edge Cases & Errors**:
  - Parses input JSON array into `Vec<f64>` and returns a JS error if the input format is invalid.

## Improvement Areas
- **Performance Optimization**:
  - Trend classification evaluates only the first and last values: `let range = (last - first).abs();`. If a series fluctuates wildly but starts and ends at similar values, it is classified as `"stable"`. A linear regression slope or mean absolute deviation check would be more robust.
  - Parsed floats are processed, but we could avoid deserializing the entire JSON array by using streaming parsers if integrated with larger analytics streams.

## Code References
- **Rust Implementation**: `wasm4pm/src/prediction_drift.rs` -> `compute_ewma`, `ewma_series`, `classify_trend`
- **TypeScript dispatch**: `packages/kernel/src/api.ts` -> `runRaw`
- **Test file**: `packages/kernel/src/__tests__/algorithm-parity.test.ts`
