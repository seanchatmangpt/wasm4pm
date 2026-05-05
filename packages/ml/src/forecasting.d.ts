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
 */
import type { ThroughputForecastResult, SeriesForecastResult } from './types.js';
/**
 * Build event count time series from timestamps.
 */
export declare function buildThroughputSeries(
  eventTimestamps: number[],
  windowSizeMs: number
): {
  series: number[];
  windowStarts: number[];
};
/**
 * Forecast future process throughput and detect seasonal patterns.
 */
export declare function forecastThroughput(
  eventTimestamps: number[],
  options?: {
    windowSizeMs?: number;
    forecastPeriods?: number;
    useExponential?: boolean;
  }
): Promise<ThroughputForecastResult>;
/**
 * Forecast future values from any numeric series.
 */
export declare function forecastSeries(
  series: number[],
  options?: {
    forecastPeriods?: number;
    useExponential?: boolean;
  }
): Promise<SeriesForecastResult>;
//# sourceMappingURL=forecasting.d.ts.map
