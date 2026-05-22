/**
 * Public API surface tests for @wasm4pm/ml.
 *
 * Locks the published export shape so accidental renames or removals fail at
 * the package boundary, not deep inside consumer code.
 */
import { describe, it, expect } from 'vitest';
import * as ml from '../index.js';

describe('@wasm4pm/ml public API', () => {
  it('exports every documented function', () => {
    const expected = [
      'buildFeatureMatrix',
      'encodeLabels',
      'classifyTraces',
      'regressRemainingTime',
      'clusterTraces',
      'forecastThroughput',
      'forecastSeries',
      'buildThroughputSeries',
      'detectEnhancedAnomalies',
      'reduceFeaturesPCA',
    ] as const;
    for (const name of expected) {
      expect(typeof (ml as Record<string, unknown>)[name]).toBe('function');
    }
  });

  it('all 10 exports are callable functions', () => {
    const allExports = Object.values(ml);
    const functions = allExports.filter((v) => typeof v === 'function');
    expect(functions.length).toBeGreaterThanOrEqual(10);
  });

  it('classifyTraces signature: (featuresJson, options?) → ClassificationResult', async () => {
    const features = [
      { case_id: 'a1', x: 1, outcome: 'A' },
      { case_id: 'a2', x: 2, outcome: 'A' },
      { case_id: 'b1', x: 100, outcome: 'B' },
      { case_id: 'b2', x: 101, outcome: 'B' },
    ];
    const result = await ml.classifyTraces(features, { method: 'knn', k: 1 });
    expect(result).toHaveProperty('method');
    expect(result).toHaveProperty('predictions');
    expect(result).toHaveProperty('modelInfo');
  });

  it('clusterTraces signature: (featuresJson, options?) → ClusteringResult', async () => {
    const features = [
      { case_id: 'a1', x: 1, y: 1 },
      { case_id: 'a2', x: 2, y: 2 },
      { case_id: 'b1', x: 10, y: 10 },
    ];
    const result = await ml.clusterTraces(features, { method: 'kmeans', k: 2 });
    expect(result).toHaveProperty('method', 'kmeans');
    expect(result).toHaveProperty('clusterCount');
    expect(result).toHaveProperty('assignments');
  });

  it('regressRemainingTime signature: (featuresJson, options?) → RegressionResult', async () => {
    const features = [
      { case_id: 'c1', x: 1, remaining_time: 10 },
      { case_id: 'c2', x: 2, remaining_time: 20 },
      { case_id: 'c3', x: 3, remaining_time: 30 },
    ];
    const result = await ml.regressRemainingTime(features);
    expect(result).toHaveProperty('method');
    expect(result).toHaveProperty('rSquared');
    expect(result).toHaveProperty('rmse');
    expect(result).toHaveProperty('mae');
    expect(result).toHaveProperty('predictions');
  });

  it('forecastThroughput signature: (timestamps, options?) → ThroughputForecastResult', async () => {
    const base = 1_700_000_000_000;
    const hour = 3_600_000;
    const timestamps = Array.from({ length: 9 }, (_, i) => base + i * hour);
    const result = await ml.forecastThroughput(timestamps, { forecastPeriods: 3 });
    expect(result).toHaveProperty('trend');
    expect(result).toHaveProperty('windowCount');
    expect(result).toHaveProperty('eventCounts');
  });

  it('forecastSeries signature: (series, options?) → SeriesForecastResult', async () => {
    const series = [1, 2, 3, 4, 5, 6];
    const result = await ml.forecastSeries(series, { forecastPeriods: 2 });
    expect(result).toHaveProperty('trend');
    expect(result).toHaveProperty('seriesLength');
  });

  it('detectEnhancedAnomalies signature: (distances, options?) → EnhancedAnomalyResult', async () => {
    const result = await ml.detectEnhancedAnomalies([0.1, 0.2, 0.9, 0.1, 0.1]);
    expect(result).toHaveProperty('peakIndices');
    expect(result).toHaveProperty('peakValues');
    expect(result).toHaveProperty('smoothedSeries');
    expect(result).toHaveProperty('originalLength');
  });

  it('reduceFeaturesPCA signature: (featuresJson, options?) → PCAResult', async () => {
    const features = [
      { case_id: '1', a: 1, b: 2 },
      { case_id: '2', a: 3, b: 4 },
      { case_id: '3', a: 5, b: 6 },
    ];
    const result = await ml.reduceFeaturesPCA(features, { nComponents: 1 });
    expect(result).toHaveProperty('nComponents');
    expect(result).toHaveProperty('explainedVariance');
    expect(result).toHaveProperty('transformedData');
    expect(result).toHaveProperty('components');
    expect(result).toHaveProperty('originalFeatureCount');
    expect(result).toHaveProperty('featureNames');
  });

  it('buildFeatureMatrix signature: (featuresJson) → FeatureMatrix', () => {
    const features = [
      { case_id: 'c1', x: 1 },
      { case_id: 'c2', x: 2 },
    ];
    const result = ml.buildFeatureMatrix(features);
    expect(result).toHaveProperty('data');
    expect(result).toHaveProperty('featureNames');
    expect(result).toHaveProperty('caseIds');
    expect(result).toHaveProperty('targets');
    expect(result).toHaveProperty('labels');
  });

  it('encodeLabels signature: (labels) → LabelEncoding', () => {
    const result = ml.encodeLabels(['A', 'B', 'A']);
    expect(result).toHaveProperty('encoded');
    expect(result).toHaveProperty('labelMap');
    expect(result).toHaveProperty('reverseMap');
  });

  it('classification methods are end-to-end callable from index export', async () => {
    const features = [
      { case_id: 'a1', x: 1, outcome: 'A' },
      { case_id: 'a2', x: 2, outcome: 'A' },
      { case_id: 'b1', x: 100, outcome: 'B' },
      { case_id: 'b2', x: 101, outcome: 'B' },
    ];
    const result = await ml.classifyTraces(features, { method: 'knn', k: 1 });
    expect(result.predictions).toHaveLength(4);
  });

  it('classifyTraces returns confidence in [0, 1] for every prediction', async () => {
    const features = [
      { case_id: 'a1', x: 1, outcome: 'A' },
      { case_id: 'a2', x: 2, outcome: 'A' },
      { case_id: 'b1', x: 10, outcome: 'B' },
    ];
    const result = await ml.classifyTraces(features, { method: 'knn', k: 1 });
    for (const pred of result.predictions) {
      expect(pred.confidence).toBeGreaterThanOrEqual(0);
      expect(pred.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('clusterTraces: assignment count equals input count', async () => {
    const features = Array.from({ length: 5 }, (_, i) => ({
      case_id: `c${i}`,
      x: i,
      y: i,
    }));
    const result = await ml.clusterTraces(features, { k: 2 });
    expect(result.assignments).toHaveLength(5);
  });

  it('forecast/anomaly/PCA produce structurally valid results from index export', async () => {
    const series = Array.from({ length: 12 }, (_, i) => i + 1);
    const fc = await ml.forecastSeries(series, { forecastPeriods: 2 });
    expect(fc.forecast).toHaveLength(2);

    const an = await ml.detectEnhancedAnomalies([1, 1, 1, 1, 9, 1, 1, 1]);
    expect(an.peakIndices).toContain(4);

    const pca = await ml.reduceFeaturesPCA(
      [
        { case_id: '1', a: 1, b: 2 },
        { case_id: '2', a: 2, b: 4 },
        { case_id: '3', a: 3, b: 6 },
      ],
      { nComponents: 1 }
    );
    expect(pca.transformedData).toHaveLength(3);
    expect(pca.transformedData[0]).toHaveLength(1);
  });

  it('empty arrays are handled gracefully by classifyTraces (no throw)', async () => {
    const result = await ml.classifyTraces([]);
    expect(result.predictions).toHaveLength(0);
  });

  it('empty arrays are handled gracefully by clusterTraces (no throw)', async () => {
    const result = await ml.clusterTraces([]);
    expect(result.assignments).toHaveLength(0);
  });

  it('empty arrays are handled gracefully by detectEnhancedAnomalies (no throw)', async () => {
    const result = await ml.detectEnhancedAnomalies([]);
    expect(result.peakIndices).toHaveLength(0);
    expect(result.originalLength).toBe(0);
  });

  it('empty arrays are handled gracefully by forecastSeries (no throw)', async () => {
    const result = await ml.forecastSeries([]);
    expect(result.seriesLength).toBe(0);
    expect(result.trend.direction).toBe('unknown');
  });

  it('empty arrays are handled gracefully by buildFeatureMatrix (no throw)', () => {
    const result = ml.buildFeatureMatrix([]);
    expect(result.data).toHaveLength(0);
    expect(result.featureNames).toHaveLength(0);
  });

  it('forecastSeries forecast length matches requested periods', async () => {
    const series = [10, 20, 30, 40, 50];
    const result = await ml.forecastSeries(series, { forecastPeriods: 4 });
    expect(result.forecast).toHaveLength(4);
  });

  it('forecastSeries trend direction is one of up/down/flat/unknown', async () => {
    const result = await ml.forecastSeries([1, 2, 3, 4, 5]);
    expect(['up', 'down', 'flat', 'unknown']).toContain(result.trend.direction);
  });

  it('reduceFeaturesPCA throws when fewer than 2 features', async () => {
    await expect(
      ml.reduceFeaturesPCA([{ case_id: 'c1', f1: 1 }, { case_id: 'c2', f1: 2 }])
    ).rejects.toThrow('Need at least 2 traces and 2 features');
  });

  it('buildThroughputSeries returns series with correct window count', () => {
    const base = 1_700_000_000_000;
    const hour = 3_600_000;
    const timestamps = [base, base + hour, base + 2 * hour];
    const result = ml.buildThroughputSeries(timestamps, hour);
    expect(result.series).toBeDefined();
    expect(result.windowStarts).toHaveLength(result.series.length);
  });
});
