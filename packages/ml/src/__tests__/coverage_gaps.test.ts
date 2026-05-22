/**
 * Tests targeting code paths not exercised by the per-module test files:
 *   - polynomial and exponential regression branches
 *   - EMA smoothing branch in detectEnhancedAnomalies
 *   - forecastThroughput exponential overlay
 *   - DBSCAN noise/cluster reporting
 *   - PCA without normalisation
 *   - additional classification methods (logistic_regression, naive_bayes, decision_tree)
 *   - regression error paths
 *   - forecastSeries confidence intervals
 *   - buildThroughputSeries edge cases
 *   - clusterTraces edge cases
 */
import { describe, it, expect } from 'vitest';
import { regressRemainingTime, classifyTraces } from '../classifiers.js';
import { detectEnhancedAnomalies } from '../anomaly.js';
import { forecastThroughput, forecastSeries, buildThroughputSeries } from '../forecasting.js';
import { clusterTraces } from '../clustering.js';
import { reduceFeaturesPCA } from '../reduction.js';

// ─── Regression: polynomial ───────────────────────────────────────────────────

describe('regressRemainingTime — polynomial', () => {
  it('fits a quadratic with sensible R²', async () => {
    const features = Array.from({ length: 10 }, (_, i) => ({
      case_id: `c${i}`,
      x: i,
      remaining_time: i * i,
    }));
    const result = await regressRemainingTime(features, {
      method: 'polynomial_regression',
      degree: 2,
    });
    expect(result.method).toBe('polynomial_regression');
    expect(result.degree).toBe(2);
    expect(result.coefficients).toHaveLength(3);
    expect(result.rSquared).toBeGreaterThan(0.99);
  });

  it('polynomial result has predictions for each input trace', async () => {
    const features = Array.from({ length: 5 }, (_, i) => ({
      case_id: `c${i}`,
      x: i,
      remaining_time: i * i,
    }));
    const result = await regressRemainingTime(features, {
      method: 'polynomial_regression',
      degree: 2,
    });
    expect(result.predictions).toHaveLength(5);
  });

  it('polynomial result has finite rmse and mae', async () => {
    const features = Array.from({ length: 6 }, (_, i) => ({
      case_id: `c${i}`,
      x: i,
      remaining_time: i * i,
    }));
    const result = await regressRemainingTime(features, {
      method: 'polynomial_regression',
      degree: 2,
    });
    expect(Number.isFinite(result.rmse)).toBe(true);
    expect(Number.isFinite(result.mae)).toBe(true);
  });

  it('polynomial degree=1 is equivalent to linear behavior', async () => {
    const features = Array.from({ length: 6 }, (_, i) => ({
      case_id: `c${i}`,
      x: i,
      remaining_time: 2 * i + 1,
    }));
    const result = await regressRemainingTime(features, {
      method: 'polynomial_regression',
      degree: 1,
    });
    expect(result.rSquared).toBeGreaterThan(0.99);
  });
});

// ─── Regression: exponential ──────────────────────────────────────────────────

describe('regressRemainingTime — exponential', () => {
  it('fits exponential growth and reports a finite doubling time', async () => {
    const features = Array.from({ length: 8 }, (_, i) => ({
      case_id: `c${i}`,
      x: i,
      remaining_time: Math.exp(0.5 * i),
    }));
    const result = await regressRemainingTime(features, {
      method: 'exponential_regression',
    });
    expect(result.method).toBe('exponential_regression');
    expect(result.amplitude).toBeGreaterThan(0);
    expect(result.growthRate).toBeGreaterThan(0);
    expect(Number.isFinite(result.doublingTime!)).toBe(true);
    expect(result.rSquared).toBeGreaterThan(0.99);
  });

  it('exponential result has predictions for each input trace', async () => {
    const features = Array.from({ length: 5 }, (_, i) => ({
      case_id: `c${i}`,
      x: i,
      remaining_time: Math.exp(0.3 * i),
    }));
    const result = await regressRemainingTime(features, {
      method: 'exponential_regression',
    });
    expect(result.predictions).toHaveLength(5);
  });

  it('exponential result has positive amplitude', async () => {
    const features = Array.from({ length: 5 }, (_, i) => ({
      case_id: `c${i}`,
      x: i,
      remaining_time: Math.exp(0.3 * i),
    }));
    const result = await regressRemainingTime(features, {
      method: 'exponential_regression',
    });
    expect(result.amplitude).toBeGreaterThan(0);
  });
});

// ─── Regression: linear ───────────────────────────────────────────────────────

describe('regressRemainingTime — linear', () => {
  it('returns slope and intercept for perfect linear data', async () => {
    const features = Array.from({ length: 5 }, (_, i) => ({
      case_id: `c${i}`,
      x: i,
      remaining_time: 3 * i + 2,
    }));
    const result = await regressRemainingTime(features);
    expect(result.method).toBe('linear_regression');
    expect(result.slope).toBeDefined();
    expect(result.intercept).toBeDefined();
    expect(result.rSquared).toBeGreaterThan(0.99);
  });

  it('throws for fewer than 2 traces', async () => {
    await expect(
      regressRemainingTime([{ case_id: 'c1', x: 1, remaining_time: 5 }])
    ).rejects.toThrow('Not enough traces for regression');
  });
});

// ─── Classification: logistic_regression ──────────────────────────────────────

describe('classifyTraces — logistic_regression', () => {
  it('returns predictions for each trace', async () => {
    const features = [
      { case_id: 'a1', x: 1, outcome: 'A' },
      { case_id: 'a2', x: 2, outcome: 'A' },
      { case_id: 'b1', x: 10, outcome: 'B' },
      { case_id: 'b2', x: 11, outcome: 'B' },
    ];
    const result = await classifyTraces(features, { method: 'logistic_regression' });
    expect(result.method).toBe('logistic_regression');
    expect(result.predictions).toHaveLength(4);
  });

  it('logistic_regression confidence is in [0, 1]', async () => {
    const features = [
      { case_id: 'a1', x: 1, outcome: 'A' },
      { case_id: 'a2', x: 2, outcome: 'A' },
      { case_id: 'b1', x: 10, outcome: 'B' },
    ];
    const result = await classifyTraces(features, { method: 'logistic_regression' });
    for (const pred of result.predictions) {
      expect(pred.confidence).toBeGreaterThanOrEqual(0);
      expect(pred.confidence).toBeLessThanOrEqual(1);
    }
  });
});

// ─── Classification: naive_bayes ─────────────────────────────────────────────

describe('classifyTraces — naive_bayes', () => {
  it('returns predictions for each trace', async () => {
    const features = [
      { case_id: 'a1', x: 1, outcome: 'A' },
      { case_id: 'a2', x: 2, outcome: 'A' },
      { case_id: 'b1', x: 10, outcome: 'B' },
      { case_id: 'b2', x: 11, outcome: 'B' },
    ];
    const result = await classifyTraces(features, { method: 'naive_bayes' });
    expect(result.method).toBe('naive_bayes');
    expect(result.predictions).toHaveLength(4);
  });

  it('naive_bayes confidence is in [0, 1]', async () => {
    const features = [
      { case_id: 'a1', x: 1, outcome: 'A' },
      { case_id: 'a2', x: 2, outcome: 'A' },
      { case_id: 'b1', x: 10, outcome: 'B' },
    ];
    const result = await classifyTraces(features, { method: 'naive_bayes' });
    for (const pred of result.predictions) {
      expect(pred.confidence).toBeGreaterThanOrEqual(0);
      expect(pred.confidence).toBeLessThanOrEqual(1);
    }
  });
});

// ─── Classification: decision_tree ───────────────────────────────────────────

describe('classifyTraces — decision_tree', () => {
  it('returns predictions for each trace', async () => {
    const features = [
      { case_id: 'a1', x: 1, outcome: 'A' },
      { case_id: 'a2', x: 2, outcome: 'A' },
      { case_id: 'b1', x: 10, outcome: 'B' },
      { case_id: 'b2', x: 11, outcome: 'B' },
    ];
    const result = await classifyTraces(features, { method: 'decision_tree', maxDepth: 3 });
    expect(result.method).toBe('decision_tree');
    expect(result.predictions).toHaveLength(4);
  });

  it('decision_tree confidence is in [0, 1]', async () => {
    const features = [
      { case_id: 'a1', x: 1, outcome: 'A' },
      { case_id: 'a2', x: 2, outcome: 'A' },
      { case_id: 'b1', x: 10, outcome: 'B' },
    ];
    const result = await classifyTraces(features, { method: 'decision_tree' });
    for (const pred of result.predictions) {
      expect(pred.confidence).toBeGreaterThanOrEqual(0);
      expect(pred.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('empty input returns empty predictions without throwing', async () => {
    const result = await classifyTraces([], { method: 'decision_tree' });
    expect(result.predictions).toHaveLength(0);
  });
});

// ─── Anomaly detection: EMA path ─────────────────────────────────────────────

describe('detectEnhancedAnomalies — EMA path', () => {
  it('produces a smoothed series of equal length under EMA', async () => {
    const series = [0.1, 0.1, 0.1, 0.9, 0.1, 0.1, 0.1, 0.1];
    const result = await detectEnhancedAnomalies(series, {
      smoothingMethod: 'ema',
      smoothingWindow: 3,
    });
    expect(result.smoothedSeries).toHaveLength(series.length);
    expect(result.peakIndices).toContain(3);
  });
});

// ─── forecastThroughput ───────────────────────────────────────────────────────

describe('forecastThroughput — exponential overlay', () => {
  it('emits an exponentialForecast for exponential growth bins', async () => {
    const base = 1_700_000_000_000;
    const hour = 3_600_000;
    const timestamps: number[] = [];
    for (let w = 0; w < 6; w++) {
      const count = 1 << w;
      for (let e = 0; e < count; e++) {
        timestamps.push(base + w * hour + e * 1000);
      }
    }
    const result = await forecastThroughput(timestamps, {
      windowSizeMs: hour,
      forecastPeriods: 3,
      useExponential: true,
    });
    expect(result.forecast).toHaveLength(3);
    expect(result.exponentialForecast).toBeDefined();
    expect(result.exponentialForecast!).toHaveLength(3);
  });

  it('eventCounts has one bin per window', async () => {
    const base = 1_700_000_000_000;
    const hour = 3_600_000;
    const timestamps = Array.from({ length: 6 }, (_, i) => base + i * hour);
    const result = await forecastThroughput(timestamps, { windowSizeMs: hour });
    expect(result.eventCounts.length).toBe(result.windowCount);
  });

  it('short series (< 3 bins) returns unknown trend', async () => {
    const base = 1_700_000_000_000;
    const result = await forecastThroughput([base, base + 100], { windowSizeMs: 3_600_000 });
    expect(result.trend.direction).toBe('unknown');
  });
});

// ─── forecastSeries ───────────────────────────────────────────────────────────

describe('forecastSeries — confidence intervals', () => {
  it('confidenceIntervals are present for series >= 3 with Sxx > 0', async () => {
    const series = [1, 2, 3, 4, 5, 6, 7, 8];
    const result = await forecastSeries(series, { forecastPeriods: 3 });
    expect(result.confidenceIntervals).toBeDefined();
    expect(result.confidenceIntervals!).toHaveLength(3);
  });

  it('each confidenceInterval is [lower, upper] with lower <= upper', async () => {
    const series = [1, 2, 3, 4, 5, 6, 7, 8];
    const result = await forecastSeries(series, { forecastPeriods: 3 });
    if (result.confidenceIntervals) {
      for (const [lo, hi] of result.confidenceIntervals) {
        expect(lo).toBeLessThanOrEqual(hi);
      }
    }
  });

  it('rSquared is present for series >= 3', async () => {
    const series = [1, 2, 3, 4, 5];
    const result = await forecastSeries(series, { forecastPeriods: 2 });
    expect(result.rSquared).toBeDefined();
    expect(Number.isFinite(result.rSquared!)).toBe(true);
  });

  it('rSquared is 1.0 for perfectly linear series', async () => {
    const series = [1, 2, 3, 4, 5, 6, 7, 8];
    const result = await forecastSeries(series);
    expect(result.rSquared).toBeGreaterThan(0.999);
  });

  it('short series (< 3 elements) returns unknown trend', async () => {
    const result = await forecastSeries([1, 2]);
    expect(result.trend.direction).toBe('unknown');
    expect(result.forecast).toBeUndefined();
  });
});

// ─── buildThroughputSeries ────────────────────────────────────────────────────

describe('buildThroughputSeries', () => {
  it('returns empty series for empty timestamps', () => {
    const result = buildThroughputSeries([], 3_600_000);
    expect(result.series).toHaveLength(0);
    expect(result.windowStarts).toHaveLength(0);
  });

  it('bins all events and total count equals input count', () => {
    const base = 1_700_000_000_000;
    const hour = 3_600_000;
    const timestamps = [base, base + 1000, base + hour, base + 2 * hour];
    const result = buildThroughputSeries(timestamps, hour);
    // Total event count across all windows must equal number of input timestamps
    const totalEvents = result.series.reduce((s, v) => s + v, 0);
    expect(totalEvents).toBe(timestamps.length);
  });

  it('series and windowStarts have same length', () => {
    const base = 1_700_000_000_000;
    const hour = 3_600_000;
    const timestamps = Array.from({ length: 5 }, (_, i) => base + i * hour);
    const result = buildThroughputSeries(timestamps, hour);
    expect(result.series.length).toBe(result.windowStarts.length);
  });

  it('windowStarts are sorted in ascending order', () => {
    const base = 1_700_000_000_000;
    const hour = 3_600_000;
    const timestamps = Array.from({ length: 4 }, (_, i) => base + i * hour);
    const result = buildThroughputSeries(timestamps, hour);
    for (let i = 1; i < result.windowStarts.length; i++) {
      expect(result.windowStarts[i]).toBeGreaterThan(result.windowStarts[i - 1]);
    }
  });
});

// ─── clusterTraces: DBSCAN labels ────────────────────────────────────────────

describe('clusterTraces — DBSCAN labels', () => {
  it('reports cluster count and noise count consistently', async () => {
    const features = [
      // Tight cluster A
      { case_id: 'a1', x: 0, y: 0 },
      { case_id: 'a2', x: 0.1, y: 0.1 },
      { case_id: 'a3', x: 0.05, y: 0.05 },
      // Tight cluster B (far away)
      { case_id: 'b1', x: 100, y: 100 },
      { case_id: 'b2', x: 100.1, y: 100.1 },
      { case_id: 'b3', x: 100.05, y: 100.05 },
      // Outlier
      { case_id: 'o1', x: 50, y: 50 },
    ];
    const result = await clusterTraces(features, {
      method: 'dbscan',
      eps: 1,
      minPoints: 2,
    });
    expect(result.clusterCount).toBe(2);
    expect(result.noiseCount).toBe(1);
    const totalAssigned = result.assignments.length;
    expect(totalAssigned).toBe(features.length);
  });

  it('kmeans returns no noise (noiseCount=0)', async () => {
    const features = [
      { case_id: 'a1', x: 1, y: 1 },
      { case_id: 'a2', x: 2, y: 2 },
      { case_id: 'b1', x: 10, y: 10 },
      { case_id: 'b2', x: 11, y: 11 },
    ];
    const result = await clusterTraces(features, { method: 'kmeans', k: 2 });
    expect(result.noiseCount).toBe(0);
  });

  it('kmeans centroids count equals k', async () => {
    const features = [
      { case_id: 'a1', x: 1, y: 1 },
      { case_id: 'a2', x: 2, y: 2 },
      { case_id: 'b1', x: 10, y: 10 },
      { case_id: 'b2', x: 11, y: 11 },
    ];
    const result = await clusterTraces(features, { method: 'kmeans', k: 2 });
    expect(result.centroids).toHaveLength(2);
  });
});

// ─── PCA: without normalisation ──────────────────────────────────────────────

describe('reduceFeaturesPCA — without normalisation', () => {
  it('runs on raw feature scales when normalize=false', async () => {
    const features = [
      { case_id: '1', a: 1, b: 1000 },
      { case_id: '2', a: 2, b: 2000 },
      { case_id: '3', a: 3, b: 3000 },
      { case_id: '4', a: 4, b: 4000 },
    ];
    const result = await reduceFeaturesPCA(features, {
      nComponents: 2,
      normalize: false,
    });
    expect(result.nComponents).toBe(2);
    expect(result.components).toHaveLength(2);
    // First component should explain almost all variance (perfectly collinear data).
    expect(result.explainedVariance[0]).toBeGreaterThan(0.99);
  });
});
