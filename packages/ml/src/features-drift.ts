/**
 * Feature extraction for drift detection (anomaly-based).
 *
 * Extracts windowed EWMA features from concept drift signals to enable
 * ML-based anomaly detection on top of Jaccard-distance drift detection.
 *
 * Pattern: Same as remaining-time + outcome integrations
 */

import { detectEnhancedAnomalies } from './anomaly.js';

/**
 * Drift feature definition.
 *
 * Extracts the following features from a drift distance series:
 * - mean_distance: Average Jaccard distance across window
 * - max_distance: Maximum distance in window (spike detector)
 * - std_distance: Standard deviation (volatility indicator)
 * - trend_slope: Linear trend over window (rising/falling)
 * - autocorr_lag1: Autocorrelation lag-1 (persistence)
 * - peak_count: Number of detected peaks
 * - residual_anomaly_score: Anomaly score from residual decomposition
 */
export interface DriftFeatures {
  window_index: number;
  mean_distance: number;
  max_distance: number;
  std_distance: number;
  trend_slope: number;
  autocorr_lag1: number;
  peak_count: number;
  residual_anomaly_score: number;
  is_anomalous: boolean;
}

/**
 * Compute simple statistics on a numeric series.
 */
function computeSeriesStats(series: number[]): {
  mean: number;
  std: number;
  max: number;
} {
  if (series.length === 0) {
    return { mean: 0, std: 0, max: 0 };
  }

  const mean = series.reduce((a, b) => a + b, 0) / series.length;
  const variance =
    series.length > 1
      ? series.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (series.length - 1)
      : 0;
  const std = Math.sqrt(variance);
  const max = Math.max(...series);

  return { mean, std, max };
}

/**
 * Compute linear trend via least-squares fit.
 * Returns slope of the line y = a*x + b.
 */
function computeTrendSlope(series: number[]): number {
  if (series.length < 2) return 0;

  const n = series.length;
  const indices = Array.from({ length: n }, (_, i) => i);
  const sumX = indices.reduce((a, b) => a + b, 0);
  const sumY = series.reduce((a, b) => a + b, 0);
  const sumXY = indices.reduce((a, i) => a + i * series[i], 0);
  const sumX2 = indices.reduce((a, i) => a + i * i, 0);

  const denominator = n * sumX2 - sumX * sumX;
  if (Math.abs(denominator) < 1e-10) return 0;

  const slope = (n * sumXY - sumX * sumY) / denominator;
  return slope;
}

/**
 * Compute lag-1 autocorrelation.
 */
function computeAutocorrelation(series: number[]): number {
  if (series.length < 2) return 0;

  const mean = series.reduce((a, b) => a + b, 0) / series.length;
  const centered = series.map((x) => x - mean);

  let numerator = 0;
  for (let i = 0; i < series.length - 1; i++) {
    numerator += centered[i] * centered[i + 1];
  }

  let denominator = 0;
  for (const x of centered) {
    denominator += x * x;
  }

  if (Math.abs(denominator) < 1e-10) return 0;
  return numerator / denominator;
}

/**
 * Extract drift features from a series of Jaccard distances.
 *
 * Applies windowed feature computation: slides a window of size `windowSize`
 * over the input series, computing features for each window position.
 *
 * @param driftDistances - Array of Jaccard distances from detect_drift
 * @param windowSize - Sliding window size (default 10)
 * @param anomalyThreshold - Threshold for flagging windows as anomalous (default 0.7)
 * @returns Array of DriftFeatures, one per window
 */
export async function extractDriftFeatures(
  driftDistances: number[],
  windowSize: number = 10,
  anomalyThreshold: number = 0.7
): Promise<DriftFeatures[]> {
  if (!driftDistances || driftDistances.length === 0) {
    return [];
  }

  // Clamp window size to series length
  const actualWindowSize = Math.min(windowSize, driftDistances.length);
  if (actualWindowSize < 2) {
    return [];
  }

  const features: DriftFeatures[] = [];

  // Slide window over the series
  for (let i = 0; i + actualWindowSize <= driftDistances.length; i++) {
    const window = driftDistances.slice(i, i + actualWindowSize);

    // Compute basic statistics
    const { mean, std, max } = computeSeriesStats(window);

    // Compute trend
    const trend = computeTrendSlope(window);

    // Compute autocorrelation
    const autocorr = computeAutocorrelation(window);

    // Detect peaks and anomalies
    let peakCount = 0;
    let residualAnomalyScore = 0;
    try {
      const anomalyResult = await detectEnhancedAnomalies(window, {
        smoothingWindow: Math.max(2, Math.floor(actualWindowSize / 3)),
        smoothingMethod: 'ema',
      });
      peakCount = (anomalyResult.peakIndices ?? []).length;

      // Compute residual anomaly score: fraction of residual peaks vs window size
      const residualPeaks = (anomalyResult.residualPeaks ?? []).length;
      residualAnomalyScore =
        residualPeaks > 0
          ? residualPeaks / actualWindowSize // Normalize by window size
          : 0;
    } catch {
      // Non-fatal: if anomaly detection fails, just use 0 score
      peakCount = 0;
      residualAnomalyScore = 0;
    }

    // Flag as anomalous if any metric exceeds threshold
    const isAnomalous =
      mean > anomalyThreshold || max > anomalyThreshold || residualAnomalyScore > anomalyThreshold;

    features.push({
      window_index: i,
      mean_distance: mean,
      max_distance: max,
      std_distance: std,
      trend_slope: trend,
      autocorr_lag1: autocorr,
      peak_count: peakCount,
      residual_anomaly_score: residualAnomalyScore,
      is_anomalous: isAnomalous,
    });
  }

  return features;
}

/**
 * Detect anomalous drift windows using extracted features.
 *
 * Returns indices and scores of windows flagged as anomalous.
 *
 * @param features - Array of DriftFeatures
 * @param scoringMethod - How to weight features ('equal', 'weighted')
 * @returns Object with anomalous window indices and scores
 */
export function detectAnomalousDriftWindows(
  features: DriftFeatures[],
  scoringMethod: 'equal' | 'weighted' = 'weighted'
): {
  anomalousIndices: number[];
  scores: number[];
  threshold: number;
} {
  if (!features || features.length === 0) {
    return { anomalousIndices: [], scores: [], threshold: 0.7 };
  }

  const scores: number[] = [];

  for (const feat of features) {
    let score: number;

    if (scoringMethod === 'equal') {
      // Simple average of normalized metrics
      const metrics = [
        Math.min(1, feat.mean_distance),
        Math.min(1, feat.max_distance),
        feat.residual_anomaly_score,
      ];
      score = metrics.reduce((a, b) => a + b, 0) / metrics.length;
    } else {
      // Weighted: prioritize residual anomalies + peak count
      const residualWeight = feat.residual_anomaly_score > 0.5 ? 0.5 : 0.3;
      const distanceWeight = Math.min(1, feat.mean_distance) * 0.3;
      const peakWeight = Math.min(1, feat.peak_count / 5) * 0.2; // Max 5 peaks
      score = residualWeight + distanceWeight + peakWeight;
    }

    scores.push(score);
  }

  // Threshold: 70th percentile
  const threshold = 0.7;
  const anomalousIndices: number[] = [];
  for (let i = 0; i < scores.length; i++) {
    if (scores[i] > threshold) {
      anomalousIndices.push(i);
    }
  }

  return { anomalousIndices, scores, threshold };
}
