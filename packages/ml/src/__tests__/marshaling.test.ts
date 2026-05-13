/**
 * Marshaling contract tests for @wasm4pm/ml
 */

import { describe, it, expect } from 'vitest';
import { buildFeatureMatrix, encodeLabels } from '../bridge.js';
import { classifyTraces, regressRemainingTime } from '../classifiers.js';
import { clusterTraces } from '../clustering.js';
import { detectEnhancedAnomalies } from '../anomaly.js';
import { forecastThroughput, forecastSeries } from '../forecasting.js';
import { reduceFeaturesPCA } from '../reduction.js';

describe('buildFeatureMatrix - marshaling contracts', () => {
  it('handles all edge cases: empty, valid elements, NaN/Infinity/non-numeric coercion, and targets', () => {
    const empty = buildFeatureMatrix([]);
    expect(empty.data).toEqual([]);
    expect(empty.caseIds).toEqual([]);

    const valid = buildFeatureMatrix([
      { case_id: 'c1', value: 10 }, { case_id: 'c2', value: 20 }, { case_id: 'c3', value: 30 },
    ]);
    expect(valid.caseIds).toEqual(['c1', 'c2', 'c3']);
    expect(valid.data.length).toBe(3);

    // NaN and Infinity in numeric column: first row types as numeric, rest coerce to 0
    const nanFeatures = [
      { case_id: 'c1', value: 10 }, { case_id: 'c2', value: NaN }, { case_id: 'c3', value: 30 },
    ];
    expect(buildFeatureMatrix(nanFeatures).data.length).toBe(3);

    const infFeatures = [
      { case_id: 'c1', value: 10 }, { case_id: 'c2', value: Infinity }, { case_id: 'c3', value: -Infinity },
    ];
    expect(buildFeatureMatrix(infFeatures).data.length).toBe(3);

    const nonNumeric = [
      { case_id: 'c1', value: 10 }, { case_id: 'c2', value: 'invalid' }, { case_id: 'c3', value: {} },
    ];
    const nonNumericResult = buildFeatureMatrix(nonNumeric);
    expect(nonNumericResult.data[1][0]).toBe(0);
    expect(nonNumericResult.data[2][0]).toBe(0);

    const withId = buildFeatureMatrix([{ case_id: 'id1', value: 10 }, { case_id: 'id2', value: 20 }]);
    expect(withId.caseIds[0]).toBe('id1');
    expect(withId.caseIds[1]).toBe('id2');

    const oneHot = buildFeatureMatrix([
      { case_id: 'c1', category: 'A' }, { case_id: 'c2', category: '' }, { case_id: 'c3', category: null },
    ]);
    expect(oneHot.featureNames).toContain('category=');
    expect(oneHot.featureNames).toContain('category=A');

    const withNullTarget = buildFeatureMatrix([
      { case_id: 'c1', value: 10, target: 100 },
      { case_id: 'c2', value: 20, target: null },
      { case_id: 'c3', value: 30, target: undefined },
    ], 'target');
    expect(withNullTarget.targets).toEqual([100, 0, 0]);

    const finiteTarget = buildFeatureMatrix([
      { case_id: 'c1', value: 10, target: 100 }, { case_id: 'c2', value: 20, target: 200 }, { case_id: 'c3', value: 30, target: 300 },
    ], 'target');
    expect(finiteTarget.targets.every(Number.isFinite)).toBe(true);
  });
});

describe('classifyTraces - output contracts', () => {
  it('clamps confidence, serializes weights, and handles k/maxDepth parameters', async () => {
    const features = [
      { case_id: 'c1', f1: 1, outcome: 'A' }, { case_id: 'c2', f1: 2, outcome: 'B' }, { case_id: 'c3', f1: 3, outcome: 'A' },
    ];

    const knnResult = await classifyTraces(features, { targetKey: 'outcome', method: 'knn' });
    for (const pred of knnResult.predictions) {
      expect(pred.confidence).toBeGreaterThanOrEqual(0);
      expect(pred.confidence).toBeLessThanOrEqual(1);
    }

    const lrResult = await classifyTraces(features, { targetKey: 'outcome', method: 'logistic_regression' });
    const serialized = JSON.stringify(lrResult.modelInfo);
    expect(serialized).toBeDefined();
    const deserialized = JSON.parse(serialized);
    expect(Array.isArray(deserialized.weights)).toBe(true);

    const k2Result = await classifyTraces(features, { targetKey: 'outcome', method: 'knn', k: 2 });
    expect(k2Result.modelInfo.k).toBe(2);

    const dtResult = await classifyTraces(features, { targetKey: 'outcome', method: 'decision_tree', maxDepth: 0 });
    expect(dtResult.modelInfo.depth).toBeGreaterThanOrEqual(0);
  });
});

describe('regressRemainingTime - metric contracts', () => {
  it('returns R² in [-1,1], MAE >= 0, handles degenerate data, and validates polynomial degree', async () => {
    const features = [
      { case_id: 'c1', idx: 1, remaining_time: 100 },
      { case_id: 'c2', idx: 2, remaining_time: 200 },
      { case_id: 'c3', idx: 3, remaining_time: 300 },
    ];

    const r2Result = await regressRemainingTime(features, { targetKey: 'remaining_time' });
    expect(r2Result.rSquared).toBeGreaterThanOrEqual(-1);
    expect(r2Result.rSquared).toBeLessThanOrEqual(1);

    const maeResult = await regressRemainingTime(features);
    expect(maeResult.mae).toBeGreaterThanOrEqual(0);

    const degenerate = [
      { case_id: 'c1', idx: 1, remaining_time: 100 }, { case_id: 'c2', idx: 2, remaining_time: 100 }, { case_id: 'c3', idx: 3, remaining_time: 100 },
    ];
    const degResult = await regressRemainingTime(degenerate);
    expect(degResult.rSquared).toBeGreaterThanOrEqual(-1);
    expect(degResult.rSquared).toBeLessThanOrEqual(1);

    const polyResult = await regressRemainingTime(features, { method: 'polynomial_regression', degree: 2 });
    expect(polyResult.degree).toBe(2);
  });
});

describe('clusterTraces - assignment contracts', () => {
  it('returns correct assignment length, clamps k, and passes eps/minPoints through', async () => {
    const fiveFeatures = [
      { case_id: 'c1', f1: 1 }, { case_id: 'c2', f1: 2 }, { case_id: 'c3', f1: 3 },
      { case_id: 'c4', f1: 4 }, { case_id: 'c5', f1: 5 },
    ];
    const assignResult = await clusterTraces(fiveFeatures, { method: 'kmeans' });
    expect(assignResult.assignments.length).toBe(fiveFeatures.length);

    const twoFeatures = [{ case_id: 'c1', f1: 1 }, { case_id: 'c2', f1: 2 }];
    const clampResult = await clusterTraces(twoFeatures, { method: 'kmeans', k: 5 });
    expect(clampResult.clusterCount).toBeLessThanOrEqual(2);

    const threeFeatures = [{ case_id: 'c1', f1: 1 }, { case_id: 'c2', f1: 2 }, { case_id: 'c3', f1: 3 }];
    const epsResult = await clusterTraces(threeFeatures, { method: 'dbscan', eps: 1.5 });
    expect(epsResult.modelInfo.eps).toBe(1.5);

    const minPtsResult = await clusterTraces(threeFeatures, { method: 'dbscan', minPoints: 2 });
    expect(minPtsResult.modelInfo.minPoints).toBe(2);
  });
});

describe('detectEnhancedAnomalies - marshaling edge cases', () => {
  it('handles NaN, Infinity, negative window, and oversized window', async () => {
    const nanResult = await detectEnhancedAnomalies([1, 2, NaN, 4, 5]);
    expect(nanResult.smoothedSeries).toBeDefined();
    expect(nanResult.smoothedSeries.length).toBe(5);

    const infResult = await detectEnhancedAnomalies([1, 2, Infinity, 4, 5]);
    expect(infResult.smoothedSeries).toBeDefined();

    const negWindow = await detectEnhancedAnomalies([1, 2, 3, 4, 5], { smoothingWindow: -5 });
    expect(negWindow.smoothedSeries.length).toBe(5);

    const largeWindow = await detectEnhancedAnomalies([1, 2, 3], { smoothingWindow: 100 });
    expect(largeWindow.smoothedSeries.length).toBe(3);
  });
});

describe('forecastThroughput/forecastSeries - parameter contracts', () => {
  it('validates window size, forecast periods, and handles NaN values in series', async () => {
    const timestamps = [1000, 2000, 3000, 4000, 5000];
    const throughputResult = await forecastThroughput(timestamps, { windowSizeMs: 1000 });
    expect(throughputResult.windowSizeMs).toBe(1000);

    const series = [1, 2, 3, 4, 5];
    const seriesResult = await forecastSeries(series, { forecastPeriods: 3 });
    expect(seriesResult.forecast).toBeDefined();
    if (seriesResult.forecast) {
      expect(seriesResult.forecast.length).toBe(3);
    }

    const nanSeriesResult = await forecastSeries([1, NaN, 3, 4, 5]);
    expect(nanSeriesResult.trend).toBeDefined();
  });
});

describe('reduceFeaturesPCA - output contracts', () => {
  it('clamps nComponents, keeps explained variance in [0,1], and produces correct shape', async () => {
    const twoFeatures = [{ case_id: 'c1', f1: 1, f2: 2 }, { case_id: 'c2', f1: 3, f2: 4 }];
    const clampResult = await reduceFeaturesPCA(twoFeatures, { nComponents: 100 });
    expect(clampResult.nComponents).toBeLessThanOrEqual(2);

    const threeFeatures = [
      { case_id: 'c1', f1: 1, f2: 2, f3: 3 }, { case_id: 'c2', f1: 4, f2: 5, f3: 6 }, { case_id: 'c3', f1: 7, f2: 8, f3: 9 },
    ];
    const varianceResult = await reduceFeaturesPCA(threeFeatures);
    for (const ev of varianceResult.explainedVariance) {
      expect(ev).toBeGreaterThanOrEqual(0);
      expect(ev).toBeLessThanOrEqual(1);
    }

    const n = 4;
    const nFeatures = Array.from({ length: n }, (_, i) => ({ case_id: `c${i}`, f1: i + 1, f2: (i + 1) * 2 }));
    const shapeResult = await reduceFeaturesPCA(nFeatures, { nComponents: 1 });
    expect(shapeResult.transformedData.length).toBe(n);
    expect(shapeResult.transformedData[0].length).toBe(1);
  });
});

describe('encodeLabels - determinism contract', () => {
  it('produces identical encoding on repeated calls and uses alphabetical ordering', () => {
    const labels = ['A', 'B', 'A', 'C', 'B'];
    const result1 = encodeLabels(labels);
    const result2 = encodeLabels(labels);
    expect(result1.encoded).toEqual(result2.encoded);
    expect(result1.labelMap).toEqual(result2.labelMap);

    const alphaLabels = ['C', 'A', 'B'];
    const alphaResult = encodeLabels(alphaLabels);
    expect(alphaResult.labelMap.get('A')).toBe(0);
    expect(alphaResult.labelMap.get('B')).toBe(1);
    expect(alphaResult.labelMap.get('C')).toBe(2);
  });
});
