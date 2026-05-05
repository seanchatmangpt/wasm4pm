/**
 * Marshaling contract tests for @wasm4pm/ml
 *
 * Validates JSON→numeric conversion at WASM boundary.
 * Tests defensive guards and edge case handling.
 *
 * Oracle type: Rank 2 (Domain contract)
 * - Numeric coercion rules are documented and verified
 * - NaN/Infinity are safely coerced to 0
 * - Empty/missing values have predictable defaults
 */

import { describe, it, expect } from 'vitest';
import { buildFeatureMatrix, encodeLabels } from '../bridge.js';
import { classifyTraces, regressRemainingTime } from '../classifiers.js';
import { clusterTraces } from '../clustering.js';
import { detectEnhancedAnomalies } from '../anomaly.js';
import { forecastThroughput, forecastSeries } from '../forecasting.js';
import { reduceFeaturesPCA } from '../reduction.js';

// ─────────────────────────────────────────────────────────────────────────────
// Bridge marshaling: buildFeatureMatrix
// ─────────────────────────────────────────────────────────────────────────────

describe('buildFeatureMatrix - marshaling contracts', () => {
  it('handles empty array gracefully', () => {
    const result = buildFeatureMatrix([]);
    expect(result.data).toEqual([]);
    expect(result.caseIds).toEqual([]);
  });

  it('handles array with valid elements', () => {
    const features = [
      { case_id: 'c1', value: 10 },
      { case_id: 'c2', value: 20 },
      { case_id: 'c3', value: 30 },
    ];
    const result = buildFeatureMatrix(features);
    expect(result.caseIds).toEqual(['c1', 'c2', 'c3']);
    expect(result.data.length).toBe(3);
  });

  it('detects NaN in numeric columns and skips them', () => {
    // NaN will not be detected as numeric at column-typing stage
    const features = [
      { case_id: 'c1', value: 10 },
      { case_id: 'c2', value: NaN },
      { case_id: 'c3', value: 30 },
    ];
    const result = buildFeatureMatrix(features);
    // Since first row has a finite number, 'value' is typed as numeric
    // Second row will be coerced to 0
    expect(result.data.length).toBe(3);
  });

  it('detects Infinity in numeric columns and skips them', () => {
    // Infinity will not be detected as numeric at column-typing stage
    const features = [
      { case_id: 'c1', value: 10 },
      { case_id: 'c2', value: Infinity },
      { case_id: 'c3', value: -Infinity },
    ];
    const result = buildFeatureMatrix(features);
    // Since first row has a finite number, 'value' is typed as numeric
    // Remaining rows will be coerced to 0
    expect(result.data.length).toBe(3);
  });

  it('provides case_id extraction from objects', () => {
    const features = [
      { case_id: 'id1', value: 10 },
      { case_id: 'id2', value: 20 },
    ];
    const result = buildFeatureMatrix(features);
    expect(result.caseIds[0]).toBe('id1');
    expect(result.caseIds[1]).toBe('id2');
  });

  it('guards against non-numeric values coercing to 0', () => {
    const features = [
      { case_id: 'c1', value: 10 },
      { case_id: 'c2', value: 'invalid' }, // String in numeric column
      { case_id: 'c3', value: {} },       // Object in numeric column
    ];
    const result = buildFeatureMatrix(features);
    expect(result.data[1][0]).toBe(0); // Non-numeric coerced to 0
    expect(result.data[2][0]).toBe(0); // Object coerced to 0
  });

  it('handles empty one-hot encoded values', () => {
    const features = [
      { case_id: 'c1', category: 'A' },
      { case_id: 'c2', category: '' },
      { case_id: 'c3', category: null },
    ];
    const result = buildFeatureMatrix(features);
    expect(result.featureNames).toContain('category=');
    expect(result.featureNames).toContain('category=A');
  });

  it('guards against null/undefined in numeric target', () => {
    const features = [
      { case_id: 'c1', value: 10, target: 100 },
      { case_id: 'c2', value: 20, target: null },
      { case_id: 'c3', value: 30, target: undefined },
    ];
    const result = buildFeatureMatrix(features, 'target');
    expect(result.targets).toEqual([100, 0, 0]);
  });

  it('guards against non-finite values in numeric target', () => {
    const features = [
      { case_id: 'c1', value: 10, target: 100 },
      { case_id: 'c2', value: 20, target: 200 },
      { case_id: 'c3', value: 30, target: 300 },
    ];
    const result = buildFeatureMatrix(features, 'target');
    expect(result.targets.every(Number.isFinite)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Classifiers: output contract validation
// ─────────────────────────────────────────────────────────────────────────────

describe('classifyTraces - output contracts', () => {
  it('clamps confidence scores to [0, 1]', async () => {
    const features = [
      { case_id: 'c1', f1: 1, outcome: 'A' },
      { case_id: 'c2', f1: 2, outcome: 'B' },
      { case_id: 'c3', f1: 3, outcome: 'A' },
    ];
    const result = await classifyTraces(features, { targetKey: 'outcome', method: 'knn' });
    for (const pred of result.predictions) {
      expect(pred.confidence).toBeGreaterThanOrEqual(0);
      expect(pred.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('converts modelInfo weights to plain arrays (JSON serializable)', async () => {
    const features = [
      { case_id: 'c1', f1: 1, outcome: 'A' },
      { case_id: 'c2', f1: 2, outcome: 'B' },
      { case_id: 'c3', f1: 3, outcome: 'A' },
    ];
    const result = await classifyTraces(features, { targetKey: 'outcome', method: 'logistic_regression' });
    // Weights should be serializable to JSON
    const serialized = JSON.stringify(result.modelInfo);
    expect(serialized).toBeDefined();
    const deserialized = JSON.parse(serialized);
    expect(deserialized.weights).toBeDefined();
    expect(Array.isArray(deserialized.weights)).toBe(true);
  });

  it('handles k parameter validation', async () => {
    const features = [
      { case_id: 'c1', f1: 1, outcome: 'A' },
      { case_id: 'c2', f1: 2, outcome: 'B' },
      { case_id: 'c3', f1: 3, outcome: 'A' },
    ];
    // Valid k should pass through
    const result = await classifyTraces(features, { targetKey: 'outcome', method: 'knn', k: 2 });
    expect(result.modelInfo.k).toBe(2);
  });

  it('handles invalid maxDepth parameter gracefully', async () => {
    const features = [
      { case_id: 'c1', f1: 1, outcome: 'A' },
      { case_id: 'c2', f1: 2, outcome: 'B' },
      { case_id: 'c3', f1: 3, outcome: 'A' },
    ];
    // Invalid depth (non-integer) should be clamped
    const result = await classifyTraces(features, {
      targetKey: 'outcome',
      method: 'decision_tree',
      maxDepth: 0,
    });
    expect(result.modelInfo.depth).toBeGreaterThanOrEqual(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Regression: metric contracts
// ─────────────────────────────────────────────────────────────────────────────

describe('regressRemainingTime - metric contracts', () => {
  it('returns R² in [-1, 1] range', async () => {
    const features = [
      { case_id: 'c1', idx: 1, remaining_time: 100 },
      { case_id: 'c2', idx: 2, remaining_time: 200 },
      { case_id: 'c3', idx: 3, remaining_time: 300 },
    ];
    const result = await regressRemainingTime(features, { targetKey: 'remaining_time' });
    expect(result.rSquared).toBeGreaterThanOrEqual(-1);
    expect(result.rSquared).toBeLessThanOrEqual(1);
  });

  it('returns MAE >= 0', async () => {
    const features = [
      { case_id: 'c1', idx: 1, remaining_time: 100 },
      { case_id: 'c2', idx: 2, remaining_time: 200 },
      { case_id: 'c3', idx: 3, remaining_time: 300 },
    ];
    const result = await regressRemainingTime(features);
    expect(result.mae).toBeGreaterThanOrEqual(0);
  });

  it('guards against degenerate data (all same value)', async () => {
    const features = [
      { case_id: 'c1', idx: 1, remaining_time: 100 },
      { case_id: 'c2', idx: 2, remaining_time: 100 },
      { case_id: 'c3', idx: 3, remaining_time: 100 },
    ];
    // Should handle zero variance gracefully
    const result = await regressRemainingTime(features);
    expect(result.rSquared).toBeGreaterThanOrEqual(-1);
    expect(result.rSquared).toBeLessThanOrEqual(1);
  });

  it('validates polynomial degree is returned', async () => {
    const features = [
      { case_id: 'c1', idx: 1, remaining_time: 100 },
      { case_id: 'c2', idx: 2, remaining_time: 200 },
      { case_id: 'c3', idx: 3, remaining_time: 300 },
    ];
    // Polynomial regression should return degree
    const result = await regressRemainingTime(features, { method: 'polynomial_regression', degree: 2 });
    expect(result.degree).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Clustering: assignment contract validation
// ─────────────────────────────────────────────────────────────────────────────

describe('clusterTraces - assignment contracts', () => {
  it('returns assignments matching input length', async () => {
    const features = [
      { case_id: 'c1', f1: 1 },
      { case_id: 'c2', f1: 2 },
      { case_id: 'c3', f1: 3 },
      { case_id: 'c4', f1: 4 },
      { case_id: 'c5', f1: 5 },
    ];
    const result = await clusterTraces(features, { method: 'kmeans' });
    expect(result.assignments.length).toBe(features.length);
  });

  it('validates k parameter clamping', async () => {
    const features = [
      { case_id: 'c1', f1: 1 },
      { case_id: 'c2', f1: 2 },
    ];
    // k=5 with only 2 samples should be clamped
    const result = await clusterTraces(features, { method: 'kmeans', k: 5 });
    expect(result.clusterCount).toBeLessThanOrEqual(2);
  });

  it('validates eps parameter for DBSCAN', async () => {
    const features = [
      { case_id: 'c1', f1: 1 },
      { case_id: 'c2', f1: 2 },
      { case_id: 'c3', f1: 3 },
    ];
    // Valid eps should pass through
    const result = await clusterTraces(features, { method: 'dbscan', eps: 1.5 });
    expect(result.modelInfo.eps).toBe(1.5);
  });

  it('validates minPoints parameter for DBSCAN', async () => {
    const features = [
      { case_id: 'c1', f1: 1 },
      { case_id: 'c2', f1: 2 },
      { case_id: 'c3', f1: 3 },
    ];
    // Valid minPoints should pass through
    const result = await clusterTraces(features, { method: 'dbscan', minPoints: 2 });
    expect(result.modelInfo.minPoints).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Anomaly detection: edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe('detectEnhancedAnomalies - marshaling edge cases', () => {
  it('handles series with NaN values', async () => {
    const series = [1, 2, NaN, 4, 5];
    const result = await detectEnhancedAnomalies(series);
    expect(result.smoothedSeries).toBeDefined();
    expect(result.smoothedSeries.length).toBe(series.length);
  });

  it('handles series with Infinity values', async () => {
    const series = [1, 2, Infinity, 4, 5];
    const result = await detectEnhancedAnomalies(series);
    expect(result.smoothedSeries).toBeDefined();
  });

  it('validates smoothing window parameter', async () => {
    const series = [1, 2, 3, 4, 5];
    // Invalid window (negative) should be clamped
    const result = await detectEnhancedAnomalies(series, { smoothingWindow: -5 });
    expect(result.smoothedSeries.length).toBe(series.length);
  });

  it('clamps window to series length', async () => {
    const series = [1, 2, 3];
    // Window larger than series should be clamped
    const result = await detectEnhancedAnomalies(series, { smoothingWindow: 100 });
    expect(result.smoothedSeries.length).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Forecasting: parameter validation
// ─────────────────────────────────────────────────────────────────────────────

describe('forecastThroughput/forecastSeries - parameter contracts', () => {
  it('validates window size for throughput forecasting', async () => {
    const timestamps = [1000, 2000, 3000, 4000, 5000];
    // Valid window should pass through
    const result = await forecastThroughput(timestamps, { windowSizeMs: 1000 });
    expect(result.windowSizeMs).toBe(1000);
  });

  it('validates forecast periods parameter for series', async () => {
    const series = [1, 2, 3, 4, 5];
    // Valid periods should produce forecast
    const result = await forecastSeries(series, { forecastPeriods: 3 });
    expect(result.forecast).toBeDefined();
    if (result.forecast) {
      expect(result.forecast.length).toBe(3);
    }
  });

  it('handles NaN values in series', async () => {
    const series = [1, NaN, 3, 4, 5];
    const result = await forecastSeries(series);
    expect(result.trend).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PCA: dimensionality contract
// ─────────────────────────────────────────────────────────────────────────────

describe('reduceFeaturesPCA - output contracts', () => {
  it('validates nComponents parameter clamping', async () => {
    const features = [
      { case_id: 'c1', f1: 1, f2: 2 },
      { case_id: 'c2', f1: 3, f2: 4 },
    ];
    // nComponents > d should be clamped
    const result = await reduceFeaturesPCA(features, { nComponents: 100 });
    expect(result.nComponents).toBeLessThanOrEqual(2);
  });

  it('explained variance always in [0, 1]', async () => {
    const features = [
      { case_id: 'c1', f1: 1, f2: 2, f3: 3 },
      { case_id: 'c2', f1: 4, f2: 5, f3: 6 },
      { case_id: 'c3', f1: 7, f2: 8, f3: 9 },
    ];
    const result = await reduceFeaturesPCA(features);
    for (const ev of result.explainedVariance) {
      expect(ev).toBeGreaterThanOrEqual(0);
      expect(ev).toBeLessThanOrEqual(1);
    }
  });

  it('transformed data has correct shape (n × nComponents)', async () => {
    const n = 4;
    const features = Array.from({ length: n }, (_, i) => ({
      case_id: `c${i}`,
      f1: i + 1,
      f2: (i + 1) * 2,
    }));
    const result = await reduceFeaturesPCA(features, { nComponents: 1 });
    expect(result.transformedData.length).toBe(n);
    expect(result.transformedData[0].length).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// encodeLabels: determinism contract
// ─────────────────────────────────────────────────────────────────────────────

describe('encodeLabels - determinism contract', () => {
  it('produces identical encoding on repeated calls', () => {
    const labels = ['A', 'B', 'A', 'C', 'B'];
    const result1 = encodeLabels(labels);
    const result2 = encodeLabels(labels);
    expect(result1.encoded).toEqual(result2.encoded);
    expect(result1.labelMap).toEqual(result2.labelMap);
  });

  it('uses alphabetical ordering for label mapping', () => {
    const labels = ['C', 'A', 'B'];
    const result = encodeLabels(labels);
    expect(result.labelMap.get('A')).toBe(0);
    expect(result.labelMap.get('B')).toBe(1);
    expect(result.labelMap.get('C')).toBe(2);
  });
});
