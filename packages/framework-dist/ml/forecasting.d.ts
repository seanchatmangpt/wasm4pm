/**
 * Throughput forecasting — hyper-optimized native implementation.
 *
 * Performance techniques:
 *   - Float64Array for all series operations
 *   - Single-pass mean computation
 *   - Autocorrelation with pre-computed centered series and denominator
 *   - O(n) sliding window SMA (no nested loops)
 *   - Seasonal decomposition with single-pass per-cycle accumulation
 *   - Pre-allocated throughput binning
 *
 * Defensive hardening:
 *   - Parameter validation (window size, forecast periods)
 *   - Guard against division by zero in mean/variance
 *   - Safe handling of very short series
 */
import type { ThroughputForecastResult, SeriesForecastResult } from './types.js';
/**
 * Build an event-count time series by binning event timestamps into fixed-width
 * windows. Returns one count per window, plus the start time of each window.
 *
 * @param eventTimestamps - Event timestamps in milliseconds (any order).
 * @param windowSizeMs - Bin width in milliseconds.
 */
export declare function buildThroughputSeries(eventTimestamps: number[], windowSizeMs: number): {
    series: number[];
    windowStarts: number[];
};
/**
 * Forecast future process throughput and detect seasonal patterns.
 *
 * Pipeline: bin timestamps → linear trend → autocorrelation seasonality →
 * (optional) exponential overlay if R² > 0.5.
 *
 * @param eventTimestamps - Event timestamps (milliseconds).
 * @param options.windowSizeMs - Bin size (default 1 hour = 3_600_000 ms).
 * @param options.forecastPeriods - Number of future windows to forecast (default 5).
 * @param options.useExponential - Also fit `y = a · e^(b·x)` (default false).
 */
export declare function forecastThroughput(eventTimestamps: number[], options?: {
    windowSizeMs?: number;
    forecastPeriods?: number;
    useExponential?: boolean;
}): Promise<ThroughputForecastResult>;
/**
 * Forecast future values from any numeric series.
 *
 * Same pipeline as `forecastThroughput`, but accepts a pre-binned numeric
 * series (e.g., drift distances, queue lengths). Returns `direction: 'unknown'`
 * for series with fewer than 3 observations.
 *
 * @param series - Numeric observations in chronological order.
 * @param options.forecastPeriods - Number of future steps to forecast (default 5).
 * @param options.useExponential - Also fit exponential model (default false).
 */
export declare function forecastSeries(series: number[], options?: {
    forecastPeriods?: number;
    useExponential?: boolean;
}): Promise<SeriesForecastResult>;
//# sourceMappingURL=forecasting.d.ts.map