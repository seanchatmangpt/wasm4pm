/**
 * Enhanced anomaly detection — hyper-optimized native implementation.
 *
 * Performance techniques:
 *   - Float64Array for all series operations (cache-friendly, no GC)
 *   - SMA with sliding window (O(n) instead of O(n*window))
 *   - Autocorrelation with pre-computed mean (single-pass denominator)
 *   - Seasonal decomposition with single-pass accumulation per cycle position
 *   - Peak finding with no allocations in inner loop
 */
import type { EnhancedAnomalyResult } from './types.js';
/**
 * Detect enhanced anomalies in drift distance series.
 */
export declare function detectEnhancedAnomalies(
  driftDistances: number[],
  options?: {
    smoothingWindow?: number;
    smoothingMethod?: 'sma' | 'ema';
  }
): Promise<EnhancedAnomalyResult>;
//# sourceMappingURL=anomaly.d.ts.map
