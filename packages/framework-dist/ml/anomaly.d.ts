/**
 * Enhanced anomaly detection — hyper-optimized native implementation.
 *
 * Performance techniques:
 *   - Float64Array for all series operations (cache-friendly, no GC)
 *   - SMA with sliding window (O(n) instead of O(n*window))
 *   - Autocorrelation with pre-computed mean (single-pass denominator)
 *   - Seasonal decomposition with single-pass accumulation per cycle position
 *   - Peak finding with no allocations in inner loop
 *
 * Defensive hardening:
 *   - Parameter validation (smoothing window)
 *   - Guard against division by zero in smoothing
 *   - Safe empty-series handling
 */
import type { EnhancedAnomalyResult } from './types.js';
/**
 * Detect peaks and residual anomalies in a numeric series (e.g., concept-drift
 * distances over a sliding window).
 *
 * Pipeline:
 *   1. Smooth the series (SMA or EMA) with the supplied window.
 *   2. Find peaks in the *original* series (preserves exact spike positions).
 *   3. Decompose the smoothed series into trend + seasonal + residual when
 *      `length >= 4`, then surface peaks of the residual as `residualPeaks`.
 *
 * Series shorter than 3 points return empty peak lists with the original data
 * passed through as `smoothedSeries`.
 *
 * @param driftDistances - Numeric series in chronological order.
 * @param options.smoothingWindow - SMA/EMA window size (default 3, clamped to length).
 * @param options.smoothingMethod - `'sma'` (default) or `'ema'`.
 */
export declare function detectEnhancedAnomalies(driftDistances: number[], options?: {
    smoothingWindow?: number;
    smoothingMethod?: 'sma' | 'ema';
}): Promise<EnhancedAnomalyResult>;
//# sourceMappingURL=anomaly.d.ts.map