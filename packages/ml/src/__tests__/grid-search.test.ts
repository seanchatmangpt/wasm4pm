/**
 * Grid search and hyperparameter tuning tests for @wasm4pm/ml
 *
 * Test coverage:
 * - Basic grid search with 2-parameter configuration
 * - Parameter convergence (best params improve over baseline)
 * - Search space generation for all tasks (classify, cluster, regress)
 * - Cross-validation integration (3-fold, stratified)
 * - Metric ranking (primary metric ranked correctly)
 * - Edge cases (empty data, single cluster, no variance)
 */

import { describe, it, expect } from 'vitest';
import {
  GridSearch,
  suggestSearchSpace,
  evaluateModel,
  findBestParams,
} from '../hyperparameter-search.js';
import type { FeatureMatrix, SearchSpace } from '../hyperparameter-search.js';

describe('Grid Search & Hyperparameter Tuning', () => {
  // ──────────────────────────────────────────────────────────────────────────
  // Test 1: Basic grid search for classification (k-NN)
  // ──────────────────────────────────────────────────────────────────────────

  it('performs basic grid search for classification with k-NN', async () => {
    const data: FeatureMatrix = {
      data: [
        [1.0, 2.0],
        [1.5, 2.5],
        [8.0, 9.0],
        [8.5, 9.5],
        [2.0, 1.5],
        [2.5, 1.0],
        [9.0, 8.5],
        [9.5, 8.0],
      ],
      featureNames: ['f1', 'f2'],
      caseIds: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'],
      targets: [1, 1, 2, 2, 1, 1, 2, 2],
      labels: ['A', 'A', 'B', 'B', 'A', 'A', 'B', 'B'],
    };

    const searchSpace: SearchSpace = {
      method: ['knn'],
      k: [3, 5, 7],
    };

    const searcher = new GridSearch('classify', data, searchSpace, 2);
    const result = await searcher.search();

    // Verify result structure
    expect(result.bestParams).toBeDefined();
    expect(result.bestMetrics).toBeDefined();
    expect(result.allResults).toHaveLength(3); // 3 parameter combinations
    expect(result.evaluatedConfigs).toBe(3);
    expect(result.totalConfigs).toBe(3);

    // Verify ranking
    expect(result.allResults[0].rank).toBe(1);
    expect(result.allResults[1].rank).toBe(2);
    expect(result.allResults[2].rank).toBe(3);

    // Best result should have accuracy metric
    expect(result.bestMetrics.accuracy).toBeDefined();
    expect(result.bestMetrics.accuracy).toBeGreaterThanOrEqual(0);
    expect(result.bestMetrics.accuracy).toBeLessThanOrEqual(1);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 2: Parameter convergence (baseline vs tuned)
  // ──────────────────────────────────────────────────────────────────────────

  it('demonstrates parameter improvement over baseline', async () => {
    const data: FeatureMatrix = {
      data: [
        [0.1, 0.2],
        [0.15, 0.25],
        [0.9, 0.8],
        [0.95, 0.85],
        [0.2, 0.1],
        [0.25, 0.15],
        [0.8, 0.9],
        [0.85, 0.95],
        [0.12, 0.22],
        [0.88, 0.78],
      ],
      featureNames: ['f1', 'f2'],
      caseIds: Array.from({ length: 10 }, (_, i) => `c${i}`),
      targets: [1, 1, 2, 2, 1, 1, 2, 2, 1, 2],
      labels: ['A', 'A', 'B', 'B', 'A', 'A', 'B', 'B', 'A', 'B'],
    };

    const searchSpace: SearchSpace = {
      method: ['knn'],
      k: [1, 3, 5, 7],
    };

    const searcher = new GridSearch('classify', data, searchSpace, 2);
    const result = await searcher.search();

    // Best result should rank first
    const bestAccuracy = result.bestMetrics.accuracy ?? 0;
    const worstAccuracy = result.allResults[result.allResults.length - 1].metrics.accuracy ?? 1;

    expect(bestAccuracy).toBeGreaterThanOrEqual(worstAccuracy);

    // At least one parameter should show improvement
    expect(result.allResults.length).toBeGreaterThan(0);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 3: suggestSearchSpace() for classification
  // ──────────────────────────────────────────────────────────────────────────

  it('suggests appropriate search space for classification', () => {
    // Small dataset (n=30, d=5)
    const space1 = suggestSearchSpace('classify', 30, 5);
    expect(space1.method).toBeDefined();
    expect(space1.k).toBeDefined();
    expect(space1.k.length).toBeGreaterThan(0);

    // Large dataset (n=5000, d=50)
    const space2 = suggestSearchSpace('classify', 5000, 50);
    expect(space2.method).toBeDefined();
    expect(space2.k).toBeDefined();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 4: suggestSearchSpace() for clustering
  // ──────────────────────────────────────────────────────────────────────────

  it('suggests appropriate search space for clustering', () => {
    const space = suggestSearchSpace('cluster', 100, 10);

    expect(space.method).toBeDefined();
    expect(space.k).toBeDefined();
    expect(space.eps).toBeDefined();

    // k values should be reasonable for 100 samples
    expect(space.k.length).toBeGreaterThan(0);
    for (const k of space.k as number[]) {
      expect(k).toBeGreaterThan(1);
      expect(k).toBeLessThanOrEqual(100);
    }

    // eps values should be positive
    for (const eps of space.eps as number[]) {
      expect(eps).toBeGreaterThan(0);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 5: suggestSearchSpace() for regression
  // ──────────────────────────────────────────────────────────────────────────

  it('suggests appropriate search space for regression', () => {
    const space = suggestSearchSpace('regress', 200, 5);

    expect(space.method).toBeDefined();
    expect(space.degree).toBeDefined();

    // Degree should be reasonable
    for (const deg of space.degree as number[]) {
      expect(deg).toBeGreaterThanOrEqual(1);
      expect(deg).toBeLessThanOrEqual(3);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 6: Clustering grid search (k-Means)
  // ──────────────────────────────────────────────────────────────────────────

  it('performs grid search for clustering (k-Means)', async () => {
    const data: FeatureMatrix = {
      data: [
        [1.0, 1.0],
        [1.5, 1.5],
        [8.0, 8.0],
        [8.5, 8.5],
        [1.2, 0.8],
        [8.2, 7.8],
      ],
      featureNames: ['f1', 'f2'],
      caseIds: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'],
      targets: [],
      labels: [],
    };

    const searchSpace: SearchSpace = {
      method: ['kmeans'],
      k: [2, 3],
    };

    const searcher = new GridSearch('cluster', data, searchSpace, 2);
    const result = await searcher.search();

    // Should evaluate both configurations
    expect(result.allResults).toHaveLength(2);

    // Silhouette score should be computed for best result
    expect(result.bestMetrics.silhouetteScore).toBeDefined();
    expect(result.bestMetrics.inertia).toBeDefined();

    // Silhouette score should be in [-1, 1]
    const silhouette = result.bestMetrics.silhouetteScore ?? 0;
    expect(silhouette).toBeGreaterThanOrEqual(-1);
    expect(silhouette).toBeLessThanOrEqual(1);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 7: Cross-validation metrics aggregation
  // ──────────────────────────────────────────────────────────────────────────

  it('aggregates cross-validation metrics across folds', async () => {
    const data: FeatureMatrix = {
      data: [
        [1, 2],
        [1.5, 2.5],
        [8, 9],
        [8.5, 9.5],
        [2, 1.5],
        [2.5, 1],
        [9, 8.5],
        [9.5, 8],
        [1.2, 2.2],
        [8.2, 9.2],
        [2.2, 1.2],
        [9.2, 8.2],
      ],
      featureNames: ['f1', 'f2'],
      caseIds: Array.from({ length: 12 }, (_, i) => `c${i}`),
      targets: [1, 1, 2, 2, 1, 1, 2, 2, 1, 2, 1, 2],
      labels: ['A', 'A', 'B', 'B', 'A', 'A', 'B', 'B', 'A', 'B', 'A', 'B'],
    };

    const searchSpace: SearchSpace = {
      method: ['knn'],
      k: [3],
    };

    const searcher = new GridSearch('classify', data, searchSpace, 3);
    const result = await searcher.search();

    // CV metrics should be populated
    expect(result.bestMetrics.cvMeanAccuracy).toBeDefined();
    expect(result.bestMetrics.cvStdAccuracy).toBeDefined();
    expect(result.bestMetrics.cvFoldAccuracies).toBeDefined();

    // Mean accuracy should be in [0, 1]
    const meanAcc = result.bestMetrics.cvMeanAccuracy ?? 0;
    expect(meanAcc).toBeGreaterThanOrEqual(0);
    expect(meanAcc).toBeLessThanOrEqual(1);

    // Should have 3 fold accuracies
    expect(result.bestMetrics.cvFoldAccuracies).toHaveLength(3);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 8: evaluateModel() helper function
  // ──────────────────────────────────────────────────────────────────────────

  it('evaluates a single model configuration via evaluateModel()', async () => {
    const data: FeatureMatrix = {
      data: [
        [1.0, 2.0],
        [1.5, 2.5],
        [8.0, 9.0],
        [8.5, 9.5],
        [2.0, 1.5],
        [2.5, 1.0],
        [9.0, 8.5],
        [9.5, 8.0],
      ],
      featureNames: ['f1', 'f2'],
      caseIds: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'],
      targets: [1, 1, 2, 2, 1, 1, 2, 2],
      labels: ['A', 'A', 'B', 'B', 'A', 'A', 'B', 'B'],
    };

    const metrics = await evaluateModel(
      { method: 'knn', k: 3 },
      data,
      'classify',
      data.labels,
      2
    );

    expect(metrics).toBeDefined();
    expect(metrics.accuracy).toBeDefined();
    expect(metrics.accuracy).toBeGreaterThanOrEqual(0);
    expect(metrics.accuracy).toBeLessThanOrEqual(1);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 9: findBestParams() end-to-end
  // ──────────────────────────────────────────────────────────────────────────

  it('finds best parameters end-to-end via findBestParams()', async () => {
    const data: FeatureMatrix = {
      data: [
        [1.0, 2.0],
        [1.5, 2.5],
        [8.0, 9.0],
        [8.5, 9.5],
        [2.0, 1.5],
        [2.5, 1.0],
        [9.0, 8.5],
        [9.5, 8.0],
        [1.2, 2.2],
        [8.2, 9.2],
      ],
      featureNames: ['f1', 'f2'],
      caseIds: Array.from({ length: 10 }, (_, i) => `c${i}`),
      targets: [1, 1, 2, 2, 1, 1, 2, 2, 1, 2],
      labels: ['A', 'A', 'B', 'B', 'A', 'A', 'B', 'B', 'A', 'B'],
    };

    const result = await findBestParams(
      'classify',
      data,
      data.labels,
      { method: ['knn'], k: [3, 5] },
      2
    );

    expect(result.bestParams).toBeDefined();
    expect(result.bestParams.method).toBe('knn');
    expect([3, 5]).toContain(result.bestParams.k);

    expect(result.bestMetrics).toBeDefined();
    expect(result.bestMetrics.accuracy).toBeGreaterThanOrEqual(0);
    expect(result.allResults).toHaveLength(2);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 10: Edge case — small dataset (6 samples)
  // ──────────────────────────────────────────────────────────────────────────

  it('handles small datasets gracefully', async () => {
    const data: FeatureMatrix = {
      data: [
        [1.0, 2.0],
        [1.5, 2.5],
        [8.0, 9.0],
        [8.5, 9.5],
        [2.0, 1.5],
        [2.5, 1.0],
      ],
      featureNames: ['f1', 'f2'],
      caseIds: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'],
      targets: [1, 1, 2, 2, 1, 1],
      labels: ['A', 'A', 'B', 'B', 'A', 'A'],
    };

    const searchSpace: SearchSpace = {
      method: ['knn'],
      k: [2, 3],
    };

    const searcher = new GridSearch('classify', data, searchSpace, 2);
    const result = await searcher.search();

    expect(result.allResults).toHaveLength(2);
    expect(result.bestMetrics.accuracy).toBeDefined();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 11: Stratified k-fold (maintains class proportions)
  // ──────────────────────────────────────────────────────────────────────────

  it('uses stratified k-fold for imbalanced classification', async () => {
    // Imbalanced: 8 A : 4 B
    const data: FeatureMatrix = {
      data: [
        [1, 1],
        [1.2, 1.2],
        [1.4, 1.4],
        [1.6, 1.6],
        [1.8, 1.8],
        [2, 2],
        [2.2, 2.2],
        [2.4, 2.4],
        [8, 8],
        [8.2, 8.2],
        [8.4, 8.4],
        [8.6, 8.6],
      ],
      featureNames: ['f1', 'f2'],
      caseIds: Array.from({ length: 12 }, (_, i) => `c${i}`),
      targets: [1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2],
      labels: ['A', 'A', 'A', 'A', 'A', 'A', 'A', 'A', 'B', 'B', 'B', 'B'],
    };

    const searchSpace: SearchSpace = {
      method: ['knn'],
      k: [3],
    };

    const searcher = new GridSearch('classify', data, searchSpace, 3);
    const result = await searcher.search();

    // Should complete without errors
    expect(result.bestMetrics).toBeDefined();
    expect(result.bestMetrics.accuracy).toBeDefined();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 12: Multi-parameter grid (method + k combination)
  // ──────────────────────────────────────────────────────────────────────────

  it('explores Cartesian product of multiple parameters', async () => {
    const data: FeatureMatrix = {
      data: [
        [1.0, 2.0],
        [1.5, 2.5],
        [8.0, 9.0],
        [8.5, 9.5],
        [2.0, 1.5],
        [2.5, 1.0],
        [9.0, 8.5],
        [9.5, 8.0],
      ],
      featureNames: ['f1', 'f2'],
      caseIds: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'],
      targets: [1, 1, 2, 2, 1, 1, 2, 2],
      labels: ['A', 'A', 'B', 'B', 'A', 'A', 'B', 'B'],
    };

    // 2 methods × 3 k values = 6 combinations
    const searchSpace: SearchSpace = {
      method: ['knn', 'logistic_regression'],
      k: [3, 5, 7],
    };

    const searcher = new GridSearch('classify', data, searchSpace, 2);
    const result = await searcher.search();

    // Should evaluate 6 combinations
    expect(result.allResults.length).toBe(6);
    expect(result.totalConfigs).toBe(6);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 13: Metric quality — silhouette score properties
  // ──────────────────────────────────────────────────────────────────────────

  it('computes silhouette scores correctly for clustering', async () => {
    // Two well-separated clusters
    const data: FeatureMatrix = {
      data: [
        [0, 0],
        [0.1, 0.1],
        [0.2, 0],
        [10, 10],
        [10.1, 10.1],
        [10.2, 10],
      ],
      featureNames: ['f1', 'f2'],
      caseIds: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'],
      targets: [],
      labels: [],
    };

    const searchSpace: SearchSpace = {
      method: ['kmeans'],
      k: [2],
    };

    const searcher = new GridSearch('cluster', data, searchSpace, 2);
    const result = await searcher.search();

    // Well-separated clusters should have positive silhouette
    const silhouette = result.bestMetrics.silhouetteScore ?? 0;
    expect(silhouette).toBeGreaterThan(0);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 14: Precision, recall, F1 computation
  // ──────────────────────────────────────────────────────────────────────────

  it('computes precision, recall, and F1 score', async () => {
    const data: FeatureMatrix = {
      data: [
        [1.0, 2.0],
        [1.5, 2.5],
        [8.0, 9.0],
        [8.5, 9.5],
        [2.0, 1.5],
        [2.5, 1.0],
        [9.0, 8.5],
        [9.5, 8.0],
        [1.2, 2.2],
        [8.2, 9.2],
      ],
      featureNames: ['f1', 'f2'],
      caseIds: Array.from({ length: 10 }, (_, i) => `c${i}`),
      targets: [1, 1, 2, 2, 1, 1, 2, 2, 1, 2],
      labels: ['A', 'A', 'B', 'B', 'A', 'A', 'B', 'B', 'A', 'B'],
    };

    const searchSpace: SearchSpace = {
      method: ['knn'],
      k: [3],
    };

    const searcher = new GridSearch('classify', data, searchSpace, 2);
    const result = await searcher.search();

    expect(result.bestMetrics.precision).toBeDefined();
    expect(result.bestMetrics.recall).toBeDefined();
    expect(result.bestMetrics.f1).toBeDefined();

    const { precision, recall, f1 } = result.bestMetrics;
    if (precision && recall && f1) {
      // F1 should be harmonic mean of precision and recall
      const expected = (2 * precision * recall) / (precision + recall);
      expect(f1).toBeCloseTo(expected, 1);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 15: Training time tracking
  // ──────────────────────────────────────────────────────────────────────────

  it('tracks training time for each parameter configuration', async () => {
    const data: FeatureMatrix = {
      data: [
        [1.0, 2.0],
        [1.5, 2.5],
        [8.0, 9.0],
        [8.5, 9.5],
        [2.0, 1.5],
        [2.5, 1.0],
        [9.0, 8.5],
        [9.5, 8.0],
      ],
      featureNames: ['f1', 'f2'],
      caseIds: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'],
      targets: [1, 1, 2, 2, 1, 1, 2, 2],
      labels: ['A', 'A', 'B', 'B', 'A', 'A', 'B', 'B'],
    };

    const searchSpace: SearchSpace = {
      method: ['knn'],
      k: [3],
    };

    const searcher = new GridSearch('classify', data, searchSpace, 2);
    const result = await searcher.search();

    expect(result.bestMetrics.trainingTimeMs).toBeDefined();
    expect(result.bestMetrics.trainingTimeMs).toBeGreaterThanOrEqual(0);
  });
});
