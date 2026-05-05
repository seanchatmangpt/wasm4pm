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
});
