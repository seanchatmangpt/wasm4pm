# Algorithm Review: ml_forecast

## Algorithm ID & Domain
- **Algorithm ID**: `ml_forecast`
- **Domain**: Machine Learning / Forecasting (Exponential Smoothing for Event Logs)

## Correctness Audit
- **Early Exit Guards**:
  - `forecast_internal` checks if data length `n == 0` (lines 24-31) and safely returns early with zeroed metrics (RMSE, MAE, MAPE, next_window).
  - In `discover_ml_forecast`, if the event log has `count < 2` events (lines 126-131), it returns early with `next_window: 0.0` and `confidence: 0.0`.
- **Division-by-Zero Protection**:
  - In `forecast_internal`, the denominator for RMSE and MAE calculation is computed as `let denom = (n - 1).max(1) as f64;` (line 54). This ensures that even if `n == 1`, `denom` is `1.0`, avoiding division-by-zero or division-by-negative numbers.
  - The MAPE calculation loops over data points and computes percentage error only if `val.abs() > f64::EPSILON` (lines 48-51), protecting against division-by-zero when actual values are 0.0.
  - If `mape_count > 0` (lines 61-65), MAPE is computed; otherwise, it defaults to `0.0`. This protects against division-by-zero when all actual values are zero.
  - In `discover_ml_forecast`, confidence is computed as `1.0 - (res.rmse / mean_density)` if `mean_density > 0.0` (lines 136-140); otherwise, it is set to `0.0`. The value is clamped using `.clamp(0.0, 1.0)`.
- **Special Cases / Edge Behaviors**:
  - If event timestamps are stored in formats other than `AttributeValue::Date` or `AttributeValue::String`, they are ignored (lines 83-88).
  - Minimum and maximum timestamps are obtained from the sorted array. If `min_t == max_t`, the duration is `0.0`, and the window size `window_ms` is computed as `(duration / NUM_WINDOWS as f64).max(1.0)` (line 108), guaranteeing `window_ms` is at least `1.0` and preventing division-by-zero in index computation.

## Improvement Areas
- **Parameterization**:
  - The smoothing parameter `alpha` is hardcoded to `DEFAULT_ALPHA = 0.3` (line 9). The API could expose `alpha` as an input configuration parameter inside the TypeScript wrapper.
  - The number of windows is hardcoded to `NUM_WINDOWS = 10` (line 8). Exposing this parameter would allow more flexible forecasting horizons.
- **Memory Optimization**:
  - `get_windows` collects all timestamps into a `Vec<i64>` (lines 80-94) and sorts them using `sort_unstable()`. The space complexity is $O(E)$ where $E$ is the total events in the log. While sorting is necessary for windowing, this allocation could be avoided if the input log events were guaranteed to be sorted chronologically. A check for sortedness could allow a single-pass $O(E)$ window assignment without sorting or cloning.

## Code References
- **Rust Implementation**: `wasm4pm/src/ml/forecasting.rs` (method: `discover_ml_forecast`)
- **TypeScript Dispatch Wrapper**: `packages/kernel/src/api.ts` (method: `runRaw`, case `ml_forecast`)
- **Test File**: `packages/kernel/src/__tests__/algorithm-parity.test.ts`
