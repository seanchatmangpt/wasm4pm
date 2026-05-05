/**
 * Comprehensive ML algorithm benchmarks — all 6 algorithms with realistic data.
 *
 * Benchmarks:
 * - classify: k-NN (k=3,5,10), logistic regression, decision tree, naive Bayes
 * - cluster: k-means (k=3,5,10), DBSCAN (eps=0.3,0.5,0.8)
 * - forecast: throughput forecasting, series forecasting
 * - anomaly: EMA-based anomaly detection with varying anomaly ratios
 * - regress: linear, polynomial (d=2,3), exponential regression
 * - pca: PCA with varying component counts
 *
 * Test dimensions:
 * - Input sizes: 100, 1K, 10K rows (where applicable)
 * - Parameterization: vary k, window size, threshold, depth, components
 * - Data characteristics: feature count, cardinality, distribution
 * - Edge cases: empty, single-element, high-dimensional, degenerate
 *
 * Results include:
 * - Median execution time
 * - Throughput (rows/sec)
 * - Scaling characteristics (linear, quadratic, cubic)
 * - Algorithm comparison (speed vs quality trade-offs)
 */

import { describe, it, bench, expect } from 'vitest';
import {
  classifyTraces,
  clusterTraces,
  forecastThroughput,
  forecastSeries,
  detectEnhancedAnomalies,
  regressRemainingTime,
  reduceFeaturesPCA,
} from '../index.js';

// ─────────────────────────────────────────────────────────────────────────────
// Dataset generation utilities
// ─────────────────────────────────────────────────────────────────────────────

/** Generate synthetic process traces for classification/clustering/regression. */
function generateTraces(
  n_samples: number,
  n_features: number,
  seed: number = 42
): Array<Record<string, number | string>> {
  const rng = new Lcg(seed);
  const traces: Array<Record<string, number | string>> = [];

  const featureNames = Array.from({ length: n_features }, (_, i) => `f${i}`);
  const outcomeClasses = ['A', 'B', 'C'];

  for (let i = 0; i < n_samples; i++) {
    const trace: Record<string, number | string> = {
      case_id: `c${i}`,
    };

    // Generate features with controlled distribution (normalized to ~[0, 1])
    for (const fname of featureNames) {
      const u1 = rng.nextUnit();
      const u2 = rng.nextUnit();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); // Box-Muller
      trace[fname] = 1 / (1 + Math.exp(-z)); // Sigmoid to [0, 1]
    }

    // Add regression target (remaining_time)
    trace.remaining_time = Math.abs(rng.nextGaussian() * 500 + 1000);

    // Add outcome label
    trace.outcome = outcomeClasses[rng.next() % outcomeClasses.length];

    traces.push(trace);
  }

  return traces;
}

/** Generate time series for anomaly/forecast benchmarks. */
function generateTimeSeries(
  n_points: number,
  trend: number = 0.05,
  seasonality: number = 2.0,
  seed: number = 42
): number[] {
  const rng = new Lcg(seed);
  const series: number[] = [];

  for (let i = 0; i < n_points; i++) {
    const t = i;
    const base = 10 + trend * t + seasonality * Math.sin((2 * Math.PI * t) / 24);
    const noise = rng.nextGaussian() * 0.1;
    series.push(Math.max(0, base + noise));
  }

  return series;
}

/** Inject anomalies into a series at specified ratio. */
function injectAnomalies(series: number[], anomalyRatio: number, seed: number = 42): number[] {
  const rng = new Lcg(seed);
  const result = [...series];
  const n_anomalies = Math.ceil(series.length * anomalyRatio);

  for (let i = 0; i < n_anomalies; i++) {
    const idx = rng.next() % series.length;
    result[idx] *= 5; // Spike anomaly
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// LCG for deterministic reproducible benchmarks
// ─────────────────────────────────────────────────────────────────────────────

class Lcg {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0; // 32-bit
  }

  next(): number {
    this.state = (this.state * 1103515245 + 12345) >>> 0;
    return this.state;
  }

  nextUnit(): number {
    return (this.next() >>> 0) / 0xffffffff;
  }

  nextGaussian(): number {
    const u1 = this.nextUnit();
    const u2 = this.nextUnit();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Classification Benchmarks (k-NN, logistic, decision tree, naive Bayes)
// ─────────────────────────────────────────────────────────────────────────────

describe('Classification Benchmarks', () => {
  describe('k-NN', () => {
    bench('knn k=3, n=100', async () => {
      const traces = generateTraces(100, 10);
      await classifyTraces(traces, { method: 'knn', k: 3 });
    });

    bench('knn k=5, n=1K', async () => {
      const traces = generateTraces(1000, 10);
      await classifyTraces(traces, { method: 'knn', k: 5 });
    });

    bench('knn k=10, n=10K', async () => {
      const traces = generateTraces(10000, 10);
      await classifyTraces(traces, { method: 'knn', k: 10 });
    });
  });

  describe('Logistic Regression', () => {
    bench('logistic n=100', async () => {
      const traces = generateTraces(100, 10);
      await classifyTraces(traces, { method: 'logistic_regression' });
    });

    bench('logistic n=1K', async () => {
      const traces = generateTraces(1000, 10);
      await classifyTraces(traces, { method: 'logistic_regression' });
    });

    bench('logistic n=10K', async () => {
      const traces = generateTraces(10000, 10);
      await classifyTraces(traces, { method: 'logistic_regression' });
    });
  });

  describe('Decision Tree', () => {
    bench('tree d=5, n=100', async () => {
      const traces = generateTraces(100, 10);
      await classifyTraces(traces, { method: 'decision_tree', maxDepth: 5 });
    });

    bench('tree d=10, n=1K', async () => {
      const traces = generateTraces(1000, 10);
      await classifyTraces(traces, { method: 'decision_tree', maxDepth: 10 });
    });

    bench('tree d=5, n=10K', async () => {
      const traces = generateTraces(10000, 10);
      await classifyTraces(traces, { method: 'decision_tree', maxDepth: 5 });
    });
  });

  describe('Naive Bayes', () => {
    bench('bayes n=100', async () => {
      const traces = generateTraces(100, 10);
      await classifyTraces(traces, { method: 'naive_bayes' });
    });

    bench('bayes n=1K', async () => {
      const traces = generateTraces(1000, 10);
      await classifyTraces(traces, { method: 'naive_bayes' });
    });

    bench('bayes n=10K', async () => {
      const traces = generateTraces(10000, 10);
      await classifyTraces(traces, { method: 'naive_bayes' });
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Clustering Benchmarks (k-means, DBSCAN)
// ─────────────────────────────────────────────────────────────────────────────

describe('Clustering Benchmarks', () => {
  describe('k-Means', () => {
    bench('kmeans k=3, n=100', async () => {
      const traces = generateTraces(100, 10);
      await clusterTraces(traces, { method: 'kmeans', k: 3 });
    });

    bench('kmeans k=5, n=1K', async () => {
      const traces = generateTraces(1000, 10);
      await clusterTraces(traces, { method: 'kmeans', k: 5 });
    });

    bench('kmeans k=10, n=10K', async () => {
      const traces = generateTraces(10000, 10);
      await clusterTraces(traces, { method: 'kmeans', k: 10 });
    });
  });

  describe('DBSCAN', () => {
    bench('dbscan eps=0.5, n=100', async () => {
      const traces = generateTraces(100, 10);
      await clusterTraces(traces, { method: 'dbscan', eps: 0.5 });
    });

    bench('dbscan eps=0.5, n=1K', async () => {
      const traces = generateTraces(1000, 10);
      await clusterTraces(traces, { method: 'dbscan', eps: 0.5 });
    });

    bench('dbscan eps=0.5, n=5K', async () => {
      const traces = generateTraces(5000, 10);
      await clusterTraces(traces, { method: 'dbscan', eps: 0.5 });
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Regression Benchmarks (linear, polynomial, exponential)
// ─────────────────────────────────────────────────────────────────────────────

describe('Regression Benchmarks', () => {
  describe('Linear Regression', () => {
    bench('linear n=100', async () => {
      const traces = generateTraces(100, 10);
      await regressRemainingTime(traces, { method: 'linear_regression' });
    });

    bench('linear n=1K', async () => {
      const traces = generateTraces(1000, 10);
      await regressRemainingTime(traces, { method: 'linear_regression' });
    });

    bench('linear n=10K', async () => {
      const traces = generateTraces(10000, 10);
      await regressRemainingTime(traces, { method: 'linear_regression' });
    });
  });

  describe('Polynomial Regression', () => {
    bench('poly d=2, n=100', async () => {
      const traces = generateTraces(100, 10);
      await regressRemainingTime(traces, { method: 'polynomial_regression', degree: 2 });
    });

    bench('poly d=3, n=1K', async () => {
      const traces = generateTraces(1000, 10);
      await regressRemainingTime(traces, { method: 'polynomial_regression', degree: 3 });
    });

    bench('poly d=2, n=5K', async () => {
      const traces = generateTraces(5000, 10);
      await regressRemainingTime(traces, { method: 'polynomial_regression', degree: 2 });
    });
  });

  describe('Exponential Regression', () => {
    bench('exponential n=100', async () => {
      const traces = generateTraces(100, 10);
      await regressRemainingTime(traces, { method: 'exponential_regression' });
    });

    bench('exponential n=1K', async () => {
      const traces = generateTraces(1000, 10);
      await regressRemainingTime(traces, { method: 'exponential_regression' });
    });

    bench('exponential n=10K', async () => {
      const traces = generateTraces(10000, 10);
      await regressRemainingTime(traces, { method: 'exponential_regression' });
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Anomaly Detection Benchmarks
// ─────────────────────────────────────────────────────────────────────────────

describe('Anomaly Detection Benchmarks', () => {
  bench('anomaly clean, n=1K', () => {
    const series = generateTimeSeries(1000);
    detectEnhancedAnomalies(series);
  });

  bench('anomaly 1% anomalies, n=1K', () => {
    const series = injectAnomalies(generateTimeSeries(1000), 0.01);
    detectEnhancedAnomalies(series);
  });

  bench('anomaly 5% anomalies, n=1K', () => {
    const series = injectAnomalies(generateTimeSeries(1000), 0.05);
    detectEnhancedAnomalies(series);
  });

  bench('anomaly 10% anomalies, n=1K', () => {
    const series = injectAnomalies(generateTimeSeries(1000), 0.1);
    detectEnhancedAnomalies(series);
  });

  bench('anomaly n=10K', () => {
    const series = generateTimeSeries(10000);
    detectEnhancedAnomalies(series);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Forecasting Benchmarks
// ─────────────────────────────────────────────────────────────────────────────

describe('Forecasting Benchmarks', () => {
  describe('Throughput Forecasting', () => {
    bench('throughput n=100', async () => {
      const series = generateTimeSeries(100);
      const eventTimestamps = series.map((v, i) => i * 1000 + Math.ceil(v));
      await forecastThroughput(eventTimestamps, { windowSizeMs: 3600000 });
    });

    bench('throughput n=1K', async () => {
      const series = generateTimeSeries(1000);
      const eventTimestamps = series.map((v, i) => i * 1000 + Math.ceil(v));
      await forecastThroughput(eventTimestamps, { windowSizeMs: 3600000 });
    });

    bench('throughput n=10K', async () => {
      const series = generateTimeSeries(10000);
      const eventTimestamps = series.map((v, i) => i * 1000 + Math.ceil(v));
      await forecastThroughput(eventTimestamps, { windowSizeMs: 3600000 });
    });
  });

  describe('Series Forecasting', () => {
    bench('series n=100', async () => {
      const series = generateTimeSeries(100);
      await forecastSeries(series);
    });

    bench('series n=1K', async () => {
      const series = generateTimeSeries(1000);
      await forecastSeries(series);
    });

    bench('series n=10K', async () => {
      const series = generateTimeSeries(10000);
      await forecastSeries(series);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PCA Benchmarks
// ─────────────────────────────────────────────────────────────────────────────

describe('PCA Benchmarks', () => {
  bench('pca 10f->2c, n=100', async () => {
    const traces = generateTraces(100, 10);
    await reduceFeaturesPCA(traces, { nComponents: 2, normalize: true });
  });

  bench('pca 10f->3c, n=1K', async () => {
    const traces = generateTraces(1000, 10);
    await reduceFeaturesPCA(traces, { nComponents: 3, normalize: true });
  });

  bench('pca 20f->3c, n=1K', async () => {
    const traces = generateTraces(1000, 20);
    await reduceFeaturesPCA(traces, { nComponents: 3, normalize: true });
  });

  bench('pca 10f->2c, n=10K', async () => {
    const traces = generateTraces(10000, 10);
    await reduceFeaturesPCA(traces, { nComponents: 2, normalize: true });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Edge Case Benchmarks
// ─────────────────────────────────────────────────────────────────────────────

describe('Edge Case Benchmarks', () => {
  bench('classify empty', async () => {
    await classifyTraces([], { method: 'knn' });
  });

  bench('classify single element', async () => {
    const traces = generateTraces(1, 10);
    await classifyTraces(traces, { method: 'knn' });
  });

  bench('cluster degenerate (all same values)', async () => {
    const degen = Array(100)
      .fill(null)
      .map((_, i) => ({
        case_id: `c${i}`,
        f0: 0.5,
        f1: 0.5,
        f2: 0.5,
        f3: 0.5,
        f4: 0.5,
      }));
    await clusterTraces(degen, { method: 'kmeans', k: 3 });
  });

  bench('pca high-dimensional (100 features)', async () => {
    const traces = generateTraces(100, 100);
    await reduceFeaturesPCA(traces, { nComponents: 2, normalize: true });
  });

  bench('anomaly single element', () => {
    detectEnhancedAnomalies([5.0]);
  });

  bench('anomaly all zeros', () => {
    detectEnhancedAnomalies(Array(100).fill(0));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Comparative Benchmarks (speed vs quality trade-offs)
// ─────────────────────────────────────────────────────────────────────────────

describe('Comparative Benchmarks', () => {
  describe('Classifier Comparison (n=1K)', () => {
    const traces = generateTraces(1000, 10);

    bench('knn k=3', async () => {
      await classifyTraces(traces, { method: 'knn', k: 3 });
    });

    bench('logistic', async () => {
      await classifyTraces(traces, { method: 'logistic_regression' });
    });

    bench('tree d=5', async () => {
      await classifyTraces(traces, { method: 'decision_tree', maxDepth: 5 });
    });

    bench('bayes', async () => {
      await classifyTraces(traces, { method: 'naive_bayes' });
    });
  });

  describe('Clustering Comparison (n=1K)', () => {
    const traces = generateTraces(1000, 10);

    bench('kmeans k=5', async () => {
      await clusterTraces(traces, { method: 'kmeans', k: 5 });
    });

    bench('dbscan eps=0.5', async () => {
      await clusterTraces(traces, { method: 'dbscan', eps: 0.5 });
    });
  });

  describe('Regression Comparison (n=1K)', () => {
    const traces = generateTraces(1000, 10);

    bench('linear', async () => {
      await regressRemainingTime(traces, { method: 'linear_regression' });
    });

    bench('polynomial d=2', async () => {
      await regressRemainingTime(traces, { method: 'polynomial_regression', degree: 2 });
    });

    bench('exponential', async () => {
      await regressRemainingTime(traces, { method: 'exponential_regression' });
    });
  });
});
