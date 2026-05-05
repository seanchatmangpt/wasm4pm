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

// ─────────────────────────────────────────────────────────────────────────────
// Parameter validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate and clamp smoothing window.
 * Valid range: [1, n]
 */
function validateSmoothingWindow(window: number | undefined, seriesLength: number): number {
  const val = window ?? 3;
  if (!Number.isInteger(val) || val < 1) return 1;
  return Math.min(val, seriesLength);
}

// ---------------------------------------------------------------------------
// Smoothing (O(n) sliding window SMA)
// ---------------------------------------------------------------------------

function sma(series: number[], window: number): Float64Array {
  const n = series.length;
  const out = new Float64Array(n);
  const half = Math.floor(window / 2);
  const fullWindow = 2 * half + 1;

  // First half-window: expand window from 1 to full
  let sum = 0;
  let count = 0;
  for (let i = 0; i <= half && i < n; i++) {
    sum += series[i];
    count++;
  }
  out[0] = sum / count;

  for (let i = 1; i <= half && i < n; i++) {
    sum += series[i + half];
    count++;
    out[i] = sum / count;
  }

  // Middle: full window, O(1) per element
  for (let i = half + 1; i < n - half; i++) {
    sum += series[i + half] - series[i - half - 1];
    out[i] = sum / fullWindow;
  }

  // Last half-window: shrink window
  for (let i = n - half; i < n; i++) {
    sum -= series[i - half - 1];
    count--;
    out[i] = sum / count;
  }

  return out;
}

function ema(series: number[], window: number): Float64Array {
  const n = series.length;
  const out = new Float64Array(n);
  out[0] = series[0];
  const alpha = 2 / (window + 1);
  const beta = 1 - alpha;
  for (let i = 1; i < n; i++) out[i] = alpha * series[i] + beta * out[i - 1];
  return out;
}

// ---------------------------------------------------------------------------
// Peak finding (zero allocations)
// ---------------------------------------------------------------------------

function findPeaks(series: number[] | Float64Array): number[] {
  const n = series.length;
  if (n < 3) return [];
  // Pre-allocate max possible peaks
  const buf: number[] = [];
  for (let i = 1; i < n - 1; i++) {
    if (series[i] > series[i - 1] && series[i] > series[i + 1]) buf.push(i);
  }
  return buf;
}

// ---------------------------------------------------------------------------
// Seasonal decomposition (single-pass accumulation)
// ---------------------------------------------------------------------------

function seasonalDecompose(
  series: number[] | Float64Array,
  period: number,
): { trend: Float64Array; seasonal: Float64Array; residual: Float64Array } {
  const n = series.length;
  const halfPeriod = Math.floor(period / 2);

  // Trend: centered moving average
  const trend = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const start = Math.max(0, i - halfPeriod);
    const end = Math.min(n - 1, i + halfPeriod);
    let sum = 0;
    for (let j = start; j <= end; j++) sum += series[j];
    trend[i] = sum / (end - start + 1);
  }

  // Seasonal: single-pass accumulation per cycle position
  const seasonalParts = new Float64Array(period);
  const seasonalCounts = new Float64Array(period);

  for (let i = 0; i < n; i++) {
    const pos = i % period;
    seasonalParts[pos] += series[i] - trend[i];
    seasonalCounts[pos]++;
  }

  // Center seasonal (subtract mean)
  let seasonalTotal = 0;
  let countTotal = 0;
  for (let p = 0; p < period; p++) {
    seasonalTotal += seasonalParts[p];
    countTotal += seasonalCounts[p];
  }
  const seasonalMean = countTotal > 0 ? seasonalTotal / countTotal : 0;
  for (let p = 0; p < period; p++) {
    seasonalParts[p] = seasonalCounts[p] > 0 ? seasonalParts[p] / seasonalCounts[p] - seasonalMean : 0;
  }

  // Build full seasonal + residual in one pass
  const seasonal = new Float64Array(n);
  const residual = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    seasonal[i] = seasonalParts[i % period];
    residual[i] = series[i] - trend[i] - seasonal[i];
  }

  return { trend, seasonal, residual };
}

// ---------------------------------------------------------------------------
// Seasonality detection (autocorrelation, pre-computed denominator)
// ---------------------------------------------------------------------------

function detectSeasonality(series: number[] | Float64Array): { period: number; strength: number } {
  const n = series.length;
  if (n < 4) return { period: 1, strength: 0 };

  // Single-pass mean
  let avg = 0;
  for (let i = 0; i < n; i++) avg += series[i];
  avg /= n;

  // Pre-compute centered series and denominator (variance)
  const centered = new Float64Array(n);
  let den = 0;
  for (let i = 0; i < n; i++) {
    centered[i] = series[i] - avg;
    den += centered[i] * centered[i];
  }

  if (den === 0) return { period: 1, strength: 0 };

  const maxLag = Math.floor(n / 2);
  const invDen = 1 / den;

  let bestLag = 1;
  let bestAcf = 0;

  // Lag 1
  let num = 0;
  for (let i = 0; i < n - 1; i++) num += centered[i] * centered[i + 1];
  let prevAcf = num * invDen;

  for (let lag = 2; lag <= maxLag; lag++) {
    num = 0;
    for (let i = 0; i < n - lag; i++) num += centered[i] * centered[i + lag];
    const acf = num * invDen;

    // Peak detection: acf rises then falls (skip first lag)
    if (acf > bestAcf && acf > 0 && acf > prevAcf) {
      bestAcf = acf;
      bestLag = lag;
    }
    prevAcf = acf;
  }

  return { period: bestLag, strength: Math.abs(bestAcf) };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

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
export async function detectEnhancedAnomalies(
  driftDistances: number[],
  options: {
    smoothingWindow?: number;
    smoothingMethod?: 'sma' | 'ema';
  } = {},
): Promise<EnhancedAnomalyResult> {
  if (driftDistances.length < 3) {
    return {
      peakIndices: [],
      peakValues: [],
      smoothedSeries: driftDistances,
      originalLength: driftDistances.length,
    };
  }

  const validatedWindow = validateSmoothingWindow(options.smoothingWindow, driftDistances.length);
  const smoothingMethod = options.smoothingMethod ?? 'sma';
  const smoothed = smoothingMethod === 'ema'
    ? ema(driftDistances, validatedWindow)
    : sma(driftDistances, validatedWindow);

  // Find peaks in original series to preserve exact spike locations
  const peakIndices = findPeaks(driftDistances);
  const peakValues = peakIndices.map(i => driftDistances[i]);

  // Decompose smoothed for residual anomalies
  let decomposed: { trend: number[]; seasonal: number[]; residual: number[] } | undefined;
  let residualPeaks: number[] | undefined;

  try {
    if (smoothed.length >= 4) {
      const period = Math.min(
        Math.max(Math.floor(smoothed.length / 3), 2),
        smoothed.length - 1,
      );
      const decomp = seasonalDecompose(smoothed, period);
      decomposed = {
        trend: Array.from(decomp.trend),
        seasonal: Array.from(decomp.seasonal),
        residual: Array.from(decomp.residual),
      };
      residualPeaks = findPeaks(decomp.residual);
    }
  } catch {
    // Non-fatal
  }

  return {
    peakIndices,
    peakValues,
    decomposed,
    residualPeaks,
    smoothedSeries: Array.from(smoothed),
    originalLength: driftDistances.length,
  };
}
