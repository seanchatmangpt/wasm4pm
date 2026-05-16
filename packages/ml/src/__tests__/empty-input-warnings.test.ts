/**
 * Rank-2 (domain-contract) tests for empty-input refusal metadata.
 *
 * Contract: When an `@wasm4pm/ml` public function receives empty / below-
 * threshold input, the result MUST carry `metadata.warning` with stable
 * `code`, human `message`, `inputLength`, and `minRequired`. Backward-compat
 * sentinel fields (peakIndices, predictions, assignments, ...) stay `[]`/`0`.
 * PCA already throws — pinned below.
 *
 * Also pins a Rank-1 regression: kmeans branchless argmin produced NaN with
 * bestDist=Infinity, collapsing every point into cluster 0. Fix used branched.
 */

import { describe, it, expect } from 'vitest';
import { buildFeatureMatrix } from '../bridge.js';
import { detectEnhancedAnomalies } from '../anomaly.js';
import { forecastSeries, forecastThroughput } from '../forecasting.js';
import { classifyTraces } from '../classifiers.js';
import { clusterTraces } from '../clustering.js';
import { reduceFeaturesPCA } from '../reduction.js';
import type { EmptyInputWarning } from '../types.js';

const ALLOWED = new Set<EmptyInputWarning['code']>([
  'empty_input',
  'insufficient_samples',
  'short_series',
  'no_valid_features',
  'no_labels',
]);

function checkW(
  w: EmptyInputWarning | undefined,
  code: EmptyInputWarning['code'],
  inputLength: number,
  minRequired: number
): void {
  expect(w).toBeDefined();
  if (!w) return;
  expect(w.code).toBe(code);
  expect(w.inputLength).toBe(inputLength);
  expect(w.minRequired).toBe(minRequired);
  expect(w.message.length).toBeGreaterThan(0);
  expect(ALLOWED.has(w.code)).toBe(true);
}

describe('@wasm4pm/ml — empty input refusal metadata', () => {
  it('buildFeatureMatrix: empty + null-rows + valid', () => {
    checkW(buildFeatureMatrix([]).metadata?.warning, 'empty_input', 0, 1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    checkW(buildFeatureMatrix([null as any, undefined as any]).metadata?.warning,
      'no_valid_features', 2, 1);
    expect(buildFeatureMatrix([{ case_id: 'c1', x: 1 }]).metadata).toBeUndefined();
  });

  it('detectEnhancedAnomalies: empty + n<3 warn; n>=3 does not', async () => {
    const empty = await detectEnhancedAnomalies([]);
    checkW(empty.metadata?.warning, 'empty_input', 0, 3);
    expect(empty.peakIndices).toEqual([]);
    expect(empty.smoothedSeries).toEqual([]);
    checkW((await detectEnhancedAnomalies([0.5])).metadata?.warning, 'short_series', 1, 3);
    checkW((await detectEnhancedAnomalies([0.1, 0.2])).metadata?.warning, 'short_series', 2, 3);
    expect((await detectEnhancedAnomalies([0.1, 0.2, 0.3])).metadata).toBeUndefined();
  });

  it('forecastSeries: empty + n<3 warn; n>=3 does not', async () => {
    const empty = await forecastSeries([]);
    checkW(empty.metadata?.warning, 'empty_input', 0, 3);
    expect(empty.seriesLength).toBe(0);
    expect(empty.trend.direction).toBe('unknown');
    checkW((await forecastSeries([1, 2])).metadata?.warning, 'short_series', 2, 3);
    expect((await forecastSeries([1, 2, 3])).metadata).toBeUndefined();
  });

  it('forecastThroughput: no timestamps + bins<3', async () => {
    const empty = await forecastThroughput([]);
    checkW(empty.metadata?.warning, 'empty_input', 0, 3);
    expect(empty.eventCounts).toEqual([]);
    // 2 timestamps in distinct 1s windows → 2 bins → short_series
    const short = await forecastThroughput([1000, 2000], { windowSizeMs: 1000 });
    checkW(short.metadata?.warning, 'short_series', 2, 3);
    expect(short.forecast).toBeUndefined();
  });

  it('classifyTraces: empty warns; valid input does not', async () => {
    const empty = await classifyTraces([]);
    checkW(empty.metadata?.warning, 'empty_input', 0, 1);
    expect(empty.predictions).toEqual([]);
    const valid = await classifyTraces(
      [
        { case_id: 'c1', x: 1, outcome: 'A' },
        { case_id: 'c2', x: 2, outcome: 'B' },
        { case_id: 'c3', x: 3, outcome: 'A' },
      ],
      { method: 'knn', k: 1 }
    );
    expect(valid.metadata).toBeUndefined();
    expect(valid.predictions).toHaveLength(3);
  });

  it('clusterTraces: empty warns', async () => {
    const r = await clusterTraces([]);
    checkW(r.metadata?.warning, 'empty_input', 0, 1);
    expect(r.assignments).toEqual([]);
    expect(r.clusterCount).toBe(0);
  });

  it('reduceFeaturesPCA: still throws (existing contract pinned)', async () => {
    await expect(reduceFeaturesPCA([])).rejects.toThrow(
      'Need at least 2 traces and 2 features'
    );
  });

  // Rank-1 regression for branchless argmin NaN bug.
  it('clusterTraces kmeans: well-separated data → distinct, finite clusters', async () => {
    const r = await clusterTraces(
      [
        { case_id: 'c1', a: 1, b: 100 },
        { case_id: 'c2', a: 2, b: 150 },
        { case_id: 'c3', a: 1, b: 120 },
        { case_id: 'c4', a: 100, b: 10000 },
        { case_id: 'c5', a: 99, b: 9500 },
        { case_id: 'c6', a: 101, b: 10200 },
      ],
      { method: 'kmeans', k: 2 }
    );
    const s = r.assignments.find((x) => x.caseId === 'c1')!.cluster;
    const l = r.assignments.find((x) => x.caseId === 'c4')!.cluster;
    expect(s).not.toBe(l);
    for (const a of r.assignments) {
      expect(Number.isFinite(a.cluster)).toBe(true);
      expect(a.cluster).toBeGreaterThanOrEqual(0);
    }
  });
});
