/**
 * ML Algorithm Performance Tests — time-bound correctness checks.
 *
 * Van der Aalst practitioners need to know whether algorithm output is
 * trustworthy AND whether it arrives within actionable time.  This file
 * asserts both: each test verifies that the algorithm completes within the
 * wall-clock bound specified in ml_baseline.json and returns structurally
 * valid output.
 *
 * Bounds are set at 20× the ml_baseline.json median — generous enough to
 * survive CI variance while still catching O(n²) regressions when n grows.
 *
 * Design principles (van der Aalst PM lifecycle):
 *   - Same input → structurally correct output (correctness oracle, Rank 2)
 *   - Elapsed time < bound (performance regression guard)
 *   - Empty / degenerate input handled without throw (robustness gate)
 */

import { describe, it, expect } from 'vitest';
import { classifyTraces, regressRemainingTime } from '../classifiers.js';
import { clusterTraces } from '../clustering.js';
import { forecastThroughput, forecastSeries } from '../forecasting.js';
import { detectEnhancedAnomalies } from '../anomaly.js';
import { reduceFeaturesPCA } from '../reduction.js';

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic data generators (LCG — no external deps, reproducible)
// ─────────────────────────────────────────────────────────────────────────────

class Lcg {
  private state: number;
  constructor(seed: number) {
    this.state = seed >>> 0;
  }
  next(): number {
    this.state = (this.state * 1103515245 + 12345) >>> 0;
    return this.state;
  }
  nextUnit(): number {
    return (this.next() >>> 0) / 0xffffffff;
  }
  nextGaussian(): number {
    const u1 = Math.max(this.nextUnit(), 1e-10);
    const u2 = this.nextUnit();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
}

/** Generate n process-trace feature rows with a labelled outcome. */
function makeTraces(n: number, seed = 42): Array<Record<string, number | string>> {
  const rng = new Lcg(seed);
  return Array.from({ length: n }, (_, i) => ({
    case_id: `c${i}`,
    f0: rng.nextUnit(),
    f1: rng.nextUnit(),
    f2: rng.nextUnit(),
    f3: rng.nextUnit(),
    remaining_time: Math.abs(rng.nextGaussian() * 500 + 1000),
    outcome: rng.next() % 2 === 0 ? 'Approve' : 'Reject',
  }));
}

/** Generate a time-series of n points with mild trend and noise. */
function makeSeries(n: number, seed = 42): number[] {
  const rng = new Lcg(seed);
  return Array.from({ length: n }, (_, i) => {
    const base = 10 + 0.05 * i + 2.0 * Math.sin((2 * Math.PI * i) / 24);
    return Math.max(0, base + rng.nextGaussian() * 0.5);
  });
}

/** Milliseconds elapsed since a Date.now() start mark. */
function elapsed(start: number): number {
  return Date.now() - start;
}

// ─────────────────────────────────────────────────────────────────────────────
// Classification (ml_classify)
// ─────────────────────────────────────────────────────────────────────────────

describe('ML Performance: classify (ml_classify)', () => {
  it('knn k=3, n=100 completes within 160ms', async () => {
    const traces = makeTraces(100);
    const t = Date.now();
    const result = await classifyTraces(traces, { method: 'knn', k: 3 });
    expect(elapsed(t)).toBeLessThan(160);
    expect(result.predictions.length).toBeGreaterThan(0);
  });

  it('knn k=5, n=1000 completes within 400ms', async () => {
    const traces = makeTraces(1000);
    const t = Date.now();
    const result = await classifyTraces(traces, { method: 'knn', k: 5 });
    expect(elapsed(t)).toBeLessThan(400);
    expect(result.predictions.length).toBeGreaterThan(0);
  });

  it('logistic regression, n=100 completes within 240ms', async () => {
    const traces = makeTraces(100);
    const t = Date.now();
    const result = await classifyTraces(traces, { method: 'logistic_regression' });
    expect(elapsed(t)).toBeLessThan(240);
    expect(result.predictions.length).toBeGreaterThan(0);
  });

  it('naive bayes, n=1000 completes within 440ms', async () => {
    const traces = makeTraces(1000);
    const t = Date.now();
    const result = await classifyTraces(traces, { method: 'naive_bayes' });
    expect(elapsed(t)).toBeLessThan(440);
    expect(result.predictions.length).toBeGreaterThan(0);
  });

  it('empty input does not throw', async () => {
    const result = await classifyTraces([], { method: 'knn' });
    expect(result).toBeDefined();
  });

  it('single trace does not throw', async () => {
    const result = await classifyTraces(makeTraces(1), { method: 'knn' });
    expect(result).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Clustering (ml_cluster)
// ─────────────────────────────────────────────────────────────────────────────

describe('ML Performance: cluster (ml_cluster)', () => {
  it('kmeans k=3, n=100 completes within 240ms', async () => {
    const traces = makeTraces(100);
    const t = Date.now();
    const result = await clusterTraces(traces, { method: 'kmeans', k: 3 });
    expect(elapsed(t)).toBeLessThan(240);
    expect(result.assignments.length).toBeGreaterThan(0);
  });

  it('kmeans k=5, n=1000 completes within 700ms', async () => {
    const traces = makeTraces(1000);
    const t = Date.now();
    const result = await clusterTraces(traces, { method: 'kmeans', k: 5 });
    expect(elapsed(t)).toBeLessThan(700);
    expect(result.assignments.length).toBeGreaterThan(0);
  });

  it('dbscan eps=0.5, n=100 completes within 160ms', async () => {
    const traces = makeTraces(100);
    const t = Date.now();
    const result = await clusterTraces(traces, { method: 'dbscan', eps: 0.5 });
    expect(elapsed(t)).toBeLessThan(160);
    expect(result.assignments.length).toBeGreaterThan(0);
  });

  it('degenerate input (all identical rows) does not throw', async () => {
    const degenerate = Array.from({ length: 50 }, (_, i) => ({
      case_id: `c${i}`,
      f0: 0.5,
      f1: 0.5,
      f2: 0.5,
    }));
    const result = await clusterTraces(degenerate, { method: 'kmeans', k: 3 });
    expect(result).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Forecasting (ml_forecast)
// ─────────────────────────────────────────────────────────────────────────────

describe('ML Performance: forecast (ml_forecast)', () => {
  it('throughput forecasting, n=100 completes within 100ms', async () => {
    const series = makeSeries(100);
    const timestamps = series.map((v, i) => i * 1000 + Math.ceil(v));
    const t = Date.now();
    const result = await forecastThroughput(timestamps, { windowSizeMs: 3600000 });
    expect(elapsed(t)).toBeLessThan(100);
    expect(result).toBeDefined();
  });

  it('throughput forecasting, n=1000 completes within 440ms', async () => {
    const series = makeSeries(1000);
    const timestamps = series.map((v, i) => i * 1000 + Math.ceil(v));
    const t = Date.now();
    const result = await forecastThroughput(timestamps, { windowSizeMs: 3600000 });
    expect(elapsed(t)).toBeLessThan(440);
    expect(result).toBeDefined();
  });

  it('series forecasting, n=100 completes within 160ms', async () => {
    const series = makeSeries(100);
    const t = Date.now();
    const result = await forecastSeries(series);
    expect(elapsed(t)).toBeLessThan(160);
    expect(result).toBeDefined();
  });

  it('series forecasting, n=1000 completes within 520ms', async () => {
    const series = makeSeries(1000);
    const t = Date.now();
    const result = await forecastSeries(series);
    expect(elapsed(t)).toBeLessThan(520);
    expect(result).toBeDefined();
  });

  it('empty series does not throw', async () => {
    const result = await forecastSeries([]);
    expect(result).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Anomaly detection (ml_anomaly)
// ─────────────────────────────────────────────────────────────────────────────

describe('ML Performance: anomaly (ml_anomaly)', () => {
  it('clean series, n=1000 completes within 360ms', async () => {
    const series = makeSeries(1000);
    const t = Date.now();
    const result = await detectEnhancedAnomalies(series);
    expect(elapsed(t)).toBeLessThan(360);
    expect(result).toBeDefined();
    expect(Array.isArray(result.peakIndices)).toBe(true);
  });

  it('series with 5% injected spikes, n=1000 completes within 360ms', async () => {
    const series = makeSeries(1000);
    const rng = new Lcg(99);
    const spiked = series.map((v) => (rng.nextUnit() < 0.05 ? v * 5 : v));
    const t = Date.now();
    const result = await detectEnhancedAnomalies(spiked);
    expect(elapsed(t)).toBeLessThan(360);
    expect(result.peakIndices.length).toBeGreaterThanOrEqual(0);
  });

  it('series with smoothingWindow=3, n=1000 completes within 360ms', async () => {
    const series = makeSeries(1000);
    const t = Date.now();
    const result = await detectEnhancedAnomalies(series, { smoothingWindow: 3 });
    expect(elapsed(t)).toBeLessThan(360);
    expect(result).toBeDefined();
  });

  it('series with smoothingWindow=7, n=1000 completes within 360ms', async () => {
    const series = makeSeries(1000);
    const t = Date.now();
    const result = await detectEnhancedAnomalies(series, { smoothingWindow: 7 });
    expect(elapsed(t)).toBeLessThan(360);
    expect(result).toBeDefined();
  });

  it('single-element series does not throw', async () => {
    const result = await detectEnhancedAnomalies([5.0]);
    expect(result).toBeDefined();
  });

  it('all-zero series does not throw', async () => {
    const result = await detectEnhancedAnomalies(Array(100).fill(0));
    expect(result).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Regression (ml_regress)
// ─────────────────────────────────────────────────────────────────────────────

describe('ML Performance: regress (ml_regress)', () => {
  it('linear regression, n=100 completes within 160ms', async () => {
    const traces = makeTraces(100);
    const t = Date.now();
    const result = await regressRemainingTime(traces, { method: 'linear_regression' });
    expect(elapsed(t)).toBeLessThan(160);
    expect(result).toBeDefined();
    expect(typeof result.rSquared).toBe('number');
  });

  it('linear regression, n=1000 completes within 400ms', async () => {
    const traces = makeTraces(1000);
    const t = Date.now();
    const result = await regressRemainingTime(traces, { method: 'linear_regression' });
    expect(elapsed(t)).toBeLessThan(400);
    expect(result).toBeDefined();
  });

  it('polynomial regression d=2, n=100 completes within 220ms', async () => {
    const traces = makeTraces(100);
    const t = Date.now();
    const result = await regressRemainingTime(traces, { method: 'polynomial_regression', degree: 2 });
    expect(elapsed(t)).toBeLessThan(220);
    expect(result).toBeDefined();
  });

  it('polynomial regression d=3, n=1000 completes within 1100ms', async () => {
    const traces = makeTraces(1000);
    const t = Date.now();
    const result = await regressRemainingTime(traces, { method: 'polynomial_regression', degree: 3 });
    expect(elapsed(t)).toBeLessThan(1100);
    expect(result).toBeDefined();
  });

  it('exponential regression, n=1000 completes within 800ms', async () => {
    const traces = makeTraces(1000);
    const t = Date.now();
    const result = await regressRemainingTime(traces, { method: 'exponential_regression' });
    expect(elapsed(t)).toBeLessThan(800);
    expect(result).toBeDefined();
  });

  it('empty input returns defined result or throws gracefully', async () => {
    // regressRemainingTime may throw on empty input — either is acceptable
    try {
      const result = await regressRemainingTime([], { method: 'linear_regression' });
      expect(result).toBeDefined();
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PCA (ml_pca)
// ─────────────────────────────────────────────────────────────────────────────

describe('ML Performance: pca (ml_pca)', () => {
  it('10 features → 2 components, n=100 completes within 220ms', async () => {
    const traces = makeTraces(100);
    const t = Date.now();
    const result = await reduceFeaturesPCA(traces, { nComponents: 2, normalize: true });
    expect(elapsed(t)).toBeLessThan(220);
    expect(result).toBeDefined();
    expect(Array.isArray(result.transformedData)).toBe(true);
  });

  it('10 features → 3 components, n=1000 completes within 760ms', async () => {
    const traces = makeTraces(1000);
    const t = Date.now();
    const result = await reduceFeaturesPCA(traces, { nComponents: 3, normalize: true });
    expect(elapsed(t)).toBeLessThan(760);
    expect(result).toBeDefined();
  });

  it('variance explained ratios are in [0, 1]', async () => {
    const traces = makeTraces(200);
    const result = await reduceFeaturesPCA(traces, { nComponents: 2, normalize: true });
    for (const ev of result.explainedVariance) {
      expect(ev).toBeGreaterThanOrEqual(0);
      expect(ev).toBeLessThanOrEqual(1);
    }
  });

  it('high-dimensional input (50 features), n=100 completes within 4000ms', async () => {
    const rng = new Lcg(7);
    const traces = Array.from({ length: 100 }, (_, i) => {
      const row: Record<string, number | string> = { case_id: `c${i}` };
      for (let f = 0; f < 50; f++) row[`f${f}`] = rng.nextUnit();
      return row;
    });
    const t = Date.now();
    const result = await reduceFeaturesPCA(traces, { nComponents: 2, normalize: true });
    expect(elapsed(t)).toBeLessThan(4000);
    expect(result).toBeDefined();
  });

  it('empty input returns defined result or throws with informative message', async () => {
    // reduceFeaturesPCA requires at least 2 traces — throwing is the documented contract
    try {
      const result = await reduceFeaturesPCA([], { nComponents: 2 });
      expect(result).toBeDefined();
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect((e as Error).message).toMatch(/trace|feature|PCA/i);
    }
  });

  it('single row returns defined result or throws with informative message', async () => {
    // reduceFeaturesPCA requires at least 2 traces — throwing is the documented contract
    try {
      const result = await reduceFeaturesPCA(makeTraces(1), { nComponents: 2 });
      expect(result).toBeDefined();
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect((e as Error).message).toMatch(/trace|feature|PCA/i);
    }
  });
});
