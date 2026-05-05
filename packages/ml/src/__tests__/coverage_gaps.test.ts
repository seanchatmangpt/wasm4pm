/**
 * Tests targeting code paths not exercised by the per-module test files:
 *   - polynomial and exponential regression branches
 *   - EMA smoothing branch in detectEnhancedAnomalies
 *   - forecastThroughput exponential overlay
 *   - DBSCAN noise/cluster reporting
 *   - PCA without normalisation
 */
import { describe, it, expect } from 'vitest';
import { regressRemainingTime } from '../classifiers.js';
import { detectEnhancedAnomalies } from '../anomaly.js';
import { forecastThroughput } from '../forecasting.js';
import { clusterTraces } from '../clustering.js';
import { reduceFeaturesPCA } from '../reduction.js';

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
});

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
});

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

describe('forecastThroughput — exponential overlay', () => {
  it('emits an exponentialForecast for exponential growth bins', async () => {
    // 1, 2, 4, 8, 16, 32 events per hour for 6 consecutive hours.
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
});

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
});

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
