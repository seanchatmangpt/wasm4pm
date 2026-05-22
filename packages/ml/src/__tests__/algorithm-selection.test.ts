/**
 * Algorithm Selection Tests
 *
 * Tier 3 AUTOML Gap-14: Data-driven algorithm selection via heuristics
 *
 * Test coverage:
 * - Classification algorithm selection (n_features, n_samples heuristics)
 * - Clustering algorithm selection (dimensionality heuristic)
 * - Forecasting algorithm selection (trend strength heuristic)
 * - Regression algorithm selection (multicollinearity heuristic)
 * - PCA dimensionality selection (n_samples/3 rule)
 * - Master selectAlgorithm() router
 * - Edge cases (empty data, single sample)
 */

import { describe, it, expect } from 'vitest';
import {
  selectAlgorithm,
  selectClassificationAlgorithm,
  selectClusteringAlgorithm,
  selectForecastingAlgorithm,
  selectRegressionAlgorithm,
  selectPcaDimensionality,
  computeMulticollinearity,
  type AlgorithmRecommendation,
  type FeatureMatrixCharacteristics,
} from '../algorithm-selection.js';

describe('Algorithm Selection (Gap-14)', () => {
  // ─────────────────────────────────────────────────────────────────────
  // Classification Algorithm Selection
  // ─────────────────────────────────────────────────────────────────────

  describe('selectClassificationAlgorithm', () => {
    it('should select k-NN for small datasets (n_features < 10, n_samples < 1K)', () => {
      const data = Array(500)
        .fill(null)
        .map(() => Array(5).fill(0.5));
      const labels = Array(500)
        .fill(null)
        .map((_, i) => i % 2);

      const result = selectClassificationAlgorithm(data, labels);

      expect(result.algorithm).toBe('knn');
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
      expect(result.rationale).toContain('Few features');
    });

    it('should select random_forest for large datasets', () => {
      const data = Array(5000)
        .fill(null)
        .map(() => Array(25).fill(0.5));
      const labels = Array(5000)
        .fill(null)
        .map((_, i) => i % 3);

      const result = selectClassificationAlgorithm(data, labels);

      expect(result.algorithm).toBe('random_forest');
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
      expect(result.rationale).toContain('ensemble');
    });

    it('should provide alternatives', () => {
      const data = Array(100)
        .fill(null)
        .map(() => Array(8).fill(0.5));
      const labels = Array(100)
        .fill(null)
        .map((_, i) => i % 2);

      const result = selectClassificationAlgorithm(data, labels);

      expect(result.alternatives).toBeDefined();
      expect(result.alternatives!.length).toBeGreaterThan(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Clustering Algorithm Selection
  // ─────────────────────────────────────────────────────────────────────

  describe('selectClusteringAlgorithm', () => {
    it('should select k-means for low dimensionality', () => {
      const data = Array(1000)
        .fill(null)
        .map(() => Array(8).fill(0.5));

      const result = selectClusteringAlgorithm(data);

      expect(result.algorithm).toBe('kmeans');
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
      expect(result.rationale).toContain('Moderate dimensionality');
    });

    it('should select pca_then_kmeans for high dimensionality', () => {
      const data = Array(1000)
        .fill(null)
        .map(() => Array(30).fill(0.5));

      const result = selectClusteringAlgorithm(data);

      expect(result.algorithm).toBe('pca_then_kmeans');
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
      expect(result.rationale).toContain('High dimensionality');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Forecasting Algorithm Selection
  // ─────────────────────────────────────────────────────────────────────

  describe('selectForecastingAlgorithm', () => {
    it('should select exponential_smoothing for strong trends', () => {
      const result = selectForecastingAlgorithm(0.8);

      expect(result.algorithm).toBe('exponential_smoothing');
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
      expect(result.rationale).toContain('Strong trend');
    });

    it('should select ARIMA for weak trends', () => {
      const result = selectForecastingAlgorithm(0.3);

      expect(result.algorithm).toBe('arima');
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
      expect(result.rationale).toContain('Weak/no trend');
    });

    it('should handle default trend_strength', () => {
      const result = selectForecastingAlgorithm();

      expect(result.algorithm).toBeDefined();
      expect(['exponential_smoothing', 'arima']).toContain(result.algorithm);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Regression Algorithm Selection
  // ─────────────────────────────────────────────────────────────────────

  describe('selectRegressionAlgorithm', () => {
    it('should select ridge for high multicollinearity', () => {
      // Create highly correlated features
      const data = Array(100)
        .fill(null)
        .map((_, i) => {
          const x = i / 100;
          return [x, x + 0.01, x - 0.01]; // Highly correlated
        });

      const result = selectRegressionAlgorithm(data);

      expect(result.algorithm).toBe('ridge');
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
      expect(result.rationale).toContain('multicollinearity');
    });

    it('should select lasso for low multicollinearity', () => {
      // Create independent features
      const data = Array(100)
        .fill(null)
        .map((_, i) => [i / 100, Math.sin(i), Math.cos(i)]);

      const result = selectRegressionAlgorithm(data);

      expect(result.algorithm).toBe('lasso');
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // PCA Dimensionality Selection
  // ─────────────────────────────────────────────────────────────────────

  describe('selectPcaDimensionality', () => {
    it('should reduce to min(n_samples/3, n_features)', () => {
      const data = Array(30).fill(null).map(() => Array(20).fill(0.5)); // n_samples=30, n_features=20
      // Expected: min(30/3, 20) = min(10, 20) = 10

      const result = selectPcaDimensionality(data);

      expect(result.n_components).toBe(10);
      expect(result.rationale).toContain('10');
    });

    it('should enforce minimum of 2 components', () => {
      const data = Array(2).fill(null).map(() => Array(5).fill(0.5)); // n_samples=2, n_features=5
      // Expected: max(2, min(2/3, 5)) = max(2, 0) = 2

      const result = selectPcaDimensionality(data);

      expect(result.n_components).toBeGreaterThanOrEqual(2);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Multicollinearity Computation
  // ─────────────────────────────────────────────────────────────────────

  describe('computeMulticollinearity', () => {
    it('should return 0 for independent features', () => {
      const data = [
        [1, 0],
        [0, 1],
        [-1, 0],
        [0, -1],
      ];

      const mc = computeMulticollinearity(data);

      expect(mc).toBeLessThan(0.1); // Nearly independent
    });

    it('should return ~1 for perfectly correlated features', () => {
      const data = Array(10)
        .fill(null)
        .map((_, i) => [i, i]); // Perfectly correlated

      const mc = computeMulticollinearity(data);

      expect(mc).toBeGreaterThan(0.99);
    });

    it('should handle zero-variance columns', () => {
      const data = [[1, 5], [1, 5], [1, 5]]; // First column is constant

      const mc = computeMulticollinearity(data);

      expect(mc).toBeGreaterThanOrEqual(0); // Should not crash
      expect(mc).toBeLessThanOrEqual(1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Master selectAlgorithm() Router
  // ─────────────────────────────────────────────────────────────────────

  describe('selectAlgorithm (master router)', () => {
    it('should route classify task to classification selector', () => {
      const data = Array(100)
        .fill(null)
        .map(() => Array(8).fill(0.5));
      const labels = Array(100)
        .fill(null)
        .map((_, i) => i % 2);

      const result = selectAlgorithm('classify', data, labels);

      expect(result.algorithm).toBeDefined();
      expect(['knn', 'random_forest']).toContain(result.algorithm);
    });

    it('should route cluster task to clustering selector', () => {
      const data = Array(100)
        .fill(null)
        .map(() => Array(15).fill(0.5));

      const result = selectAlgorithm('cluster', data);

      expect(result.algorithm).toBeDefined();
      expect(['kmeans', 'pca_then_kmeans']).toContain(result.algorithm);
    });

    it('should route forecast task to forecasting selector', () => {
      const result = selectAlgorithm('forecast', [], [], 0.6);

      expect(['exponential_smoothing', 'arima']).toContain(result.algorithm);
    });

    it('should route regress task to regression selector', () => {
      const data = Array(100)
        .fill(null)
        .map(() => Array(5).fill(0.5));

      const result = selectAlgorithm('regress', data);

      expect(['ridge', 'lasso']).toContain(result.algorithm);
    });

    it('should route pca task to dimensionality selector', () => {
      const data = Array(100)
        .fill(null)
        .map(() => Array(30).fill(0.5));

      const result = selectAlgorithm('pca', data);

      expect(result.algorithm).toMatch(/^pca_n\d+$/);
      expect(result.confidence).toBe(0.9);
    });

    it('should accept FeatureMatrixCharacteristics as data parameter', () => {
      const chars: FeatureMatrixCharacteristics = {
        n_samples: 100,
        n_features: 8,
        trend_strength: 0.5,
      };

      const result = selectAlgorithm('classify', chars, []);

      expect(result.algorithm).toBeDefined();
      expect(['knn', 'random_forest']).toContain(result.algorithm);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Edge Cases
  // ─────────────────────────────────────────────────────────────────────

  describe('Edge cases', () => {
    it('should handle single-sample dataset', () => {
      const data = [[1, 2, 3]];

      const result = selectPcaDimensionality(data);

      expect(result.n_components).toBeGreaterThanOrEqual(2);
      expect(Number.isNaN(result.n_components)).toBe(false);
    });

    it('should handle single-feature dataset', () => {
      const data = Array(100)
        .fill(null)
        .map(() => [0.5]);
      const labels = Array(100)
        .fill(null)
        .map((_, i) => i % 2);

      const result = selectClassificationAlgorithm(data, labels);

      expect(result.algorithm).toBeDefined();
    });

    it('should handle empty labels array', () => {
      const data = Array(10)
        .fill(null)
        .map(() => Array(5).fill(0.5));

      const result = selectClassificationAlgorithm(data, []);

      expect(result.algorithm).toBeDefined();
    });

    it('should be deterministic across calls', () => {
      const data = Array(100)
        .fill(null)
        .map(() => Array(5).fill(0.5));
      const labels = Array(100)
        .fill(null)
        .map((_, i) => i % 2);

      const result1 = selectClassificationAlgorithm(data, labels);
      const result2 = selectClassificationAlgorithm(data, labels);

      expect(result1.algorithm).toBe(result2.algorithm);
      expect(result1.confidence).toBe(result2.confidence);
    });
  });
});
