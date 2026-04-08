/**
 * Enhanced anomaly detection — peak finding and seasonal decomposition
 * on drift distance series to identify anomalous process windows.
 */

import { findPeaks, sma, ema, seasonalDecompose } from 'micro-ml';
import type { EnhancedAnomalyResult } from './types.js';

/**
 * Detect enhanced anomalies in drift distance series.
 *
 * Smooths the drift series, finds peaks, then decomposes residuals
 * to identify anomalies not explained by trend or seasonality.
 *
 * @param driftDistances - Array of drift distances from wasm.detect_drift()
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

  const window = Math.min(
    options.smoothingWindow ?? 3,
    driftDistances.length,
  );

  // Smooth the drift distance series
  const smoothingMethod = options.smoothingMethod ?? 'sma';
  const smoothed =
    smoothingMethod === 'ema'
      ? await ema(driftDistances, window)
      : await sma(driftDistances, window);

  // Find peaks in the smoothed series
  const peakIndices = await findPeaks(smoothed);
  const peakValues = peakIndices.map(i => smoothed[i]);

  // Decompose to find residual anomalies
  let decomposed:
    | { trend: number[]; seasonal: number[]; residual: number[] }
    | undefined;
  let residualPeaks: number[] | undefined;

  try {
    if (smoothed.length >= 4) {
      const period = Math.min(
        Math.max(Math.floor(smoothed.length / 3), 2),
        smoothed.length - 1,
      );
      const decomp = await seasonalDecompose(smoothed, period);
      decomposed = {
        trend: decomp.getTrend(),
        seasonal: decomp.getSeasonal(),
        residual: decomp.getResidual(),
      };
      // Peaks in residuals = anomalies not explained by trend or seasonality
      residualPeaks = await findPeaks(decomp.getResidual());
    }
  } catch {
    // Non-fatal
  }

  return {
    peakIndices,
    peakValues,
    decomposed,
    residualPeaks,
    smoothedSeries: smoothed,
    originalLength: driftDistances.length,
  };
}
