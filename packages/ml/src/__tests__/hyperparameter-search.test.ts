/**
 * Hyperparameter Search Tests
 *
 * Tier 3 AUTOML Gap-16: Grid search with k-fold CV and t-distribution CI
 *
 * Test coverage:
 * - Grid expansion (cartesian product of parameter values)
 * - Grid search execution with CV folds
 * - Confidence interval computation via t-distribution
 * - Best parameter selection
 * - Edge cases (empty grid, single parameter)
 * - Determinism via seeded CV
 */

import { describe, it, expect } from 'vitest';
import {
  gridSearch,
  expandGrid,
  getBestParams,
  type ParamGrid,
  type GridSearchResult,
} from '../hyperparameter-search.js';

describe('Hyperparameter Search (Gap-16)', () => {
  // ─────────────────────────────────────────────────────────────────────
  // Grid Expansion
  // ─────────────────────────────────────────────────────────────────────

  describe('expandGrid', () => {
    it('should generate cartesian product of parameter values', () => {
      const grid: ParamGrid = {
        k: [3, 5],
        metric: ['euclidean', 'manhattan'],
      };

      const expanded = expandGrid(grid);

      expect(expanded.length).toBe(4); // 2 × 2 combinations
      expect(expanded).toContainEqual({ k: 3, metric: 'euclidean' });
      expect(expanded).toContainEqual({ k: 3, metric: 'manhattan' });
      expect(expanded).toContainEqual({ k: 5, metric: 'euclidean' });
      expect(expanded).toContainEqual({ k: 5, metric: 'manhattan' });
    });

    it('should handle single parameter', () => {
      const grid: ParamGrid = {
        k: [3, 5, 7],
      };

      const expanded = expandGrid(grid);

      expect(expanded.length).toBe(3);
      expect(expanded[0].k).toBe(3);
      expect(expanded[1].k).toBe(5);
      expect(expanded[2].k).toBe(7);
    });

    it('should handle empty grid', () => {
      const grid: ParamGrid = {};

      const expanded = expandGrid(grid);

      expect(expanded.length).toBe(1);
      expect(expanded[0]).toEqual({});
    });

    it('should handle three parameters', () => {
      const grid: ParamGrid = {
        k: [3, 5],
        metric: ['euclidean', 'manhattan'],
        weighted: [true, false],
      };

      const expanded = expandGrid(grid);

      expect(expanded.length).toBe(8); // 2 × 2 × 2
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Grid Search Execution
  // ─────────────────────────────────────────────────────────────────────

  describe('gridSearch', () => {
    it('should search over all parameter combinations', () => {
      const data = Array(100)
        .fill(null)
        .map((_, i) => `sample_${i}`);
      const labels = Array(100)
        .fill(null)
        .map((_, i) => i % 2);

      const paramGrid: ParamGrid = {
        k: [3, 5],
        algorithm: ['simple', 'weighted'],
      };

      const results = gridSearch(
        data,
        labels,
        paramGrid,
        3,
        (train, test, trainLabels, testLabels, params) => {
          // Mock trainer: return all 0s (trivial predictions)
          return Array(test.length).fill(0);
        }
      );

      expect(results.length).toBe(4); // 2 × 2 combinations
      results.forEach((result) => {
        expect(result.params).toBeDefined();
        expect(result.meanScore).toBeGreaterThanOrEqual(0);
        expect(result.meanScore).toBeLessThanOrEqual(1);
        expect(result.stdDev).toBeGreaterThanOrEqual(0);
        expect(result.scores.length).toBe(3); // 3 folds
      });
    });

    it('should compute 95% confidence interval via t-distribution', () => {
      const data = Array(30)
        .fill(null)
        .map((_, i) => `sample_${i}`);
      const labels = Array(30)
        .fill(null)
        .map((_, i) => i % 2);

      const paramGrid: ParamGrid = {
        threshold: [0.5],
      };

      const results = gridSearch(
        data,
        labels,
        paramGrid,
        3,
        (train, test, trainLabels, testLabels, params) => {
          // Perfect predictions
          return testLabels;
        }
      );

      const result = results[0];

      // With perfect predictions, meanScore ≈ 1.0, stdDev ≈ 0.0
      expect(result.meanScore).toBeGreaterThanOrEqual(0.9);
      expect(result.ciLower).toBeLessThanOrEqual(result.meanScore);
      expect(result.ciUpper).toBeGreaterThanOrEqual(result.meanScore);

      // 95% CI should be narrow for perfect predictions
      expect(result.ciUpper - result.ciLower).toBeLessThan(0.2);
    });

    it('should sort results by mean score descending', () => {
      const data = Array(50)
        .fill(null)
        .map((_, i) => `sample_${i}`);
      const labels = Array(50)
        .fill(null)
        .map((_, i) => i % 2);

      const paramGrid: ParamGrid = {
        threshold: [0.3, 0.5, 0.7],
      };

      let callCount = 0;
      const results = gridSearch(
        data,
        labels,
        paramGrid,
        2,
        (train, test, trainLabels, testLabels, params) => {
          // Return predictions based on threshold (mock scoring)
          const threshold = params.threshold as number;
          callCount++;
          return Array(test.length).fill(callCount % 2);
        }
      );

      // Verify sorted by mean score descending
      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i].meanScore).toBeGreaterThanOrEqual(results[i + 1].meanScore);
      }
    });

    it('should return empty results for insufficient data', () => {
      const data = Array(2).fill('sample');
      const labels = [0, 1];
      const paramGrid: ParamGrid = { k: [3, 5] };

      const results = gridSearch(data, labels, paramGrid, 3, () => []);

      expect(results.length).toBe(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Best Parameter Selection
  // ─────────────────────────────────────────────────────────────────────

  describe('getBestParams', () => {
    it('should return highest-scoring parameter combination', () => {
      const results: GridSearchResult[] = [
        {
          params: { k: 5, metric: 'euclidean' },
          meanScore: 0.95,
          stdDev: 0.02,
          ciLower: 0.93,
          ciUpper: 0.97,
          scores: [0.93, 0.95, 0.97],
        },
        {
          params: { k: 3, metric: 'manhattan' },
          meanScore: 0.85,
          stdDev: 0.05,
          ciLower: 0.80,
          ciUpper: 0.90,
          scores: [0.80, 0.85, 0.90],
        },
      ];

      const best = getBestParams(results);

      expect(best.k).toBe(5);
      expect(best.metric).toBe('euclidean');
    });

    it('should handle empty results gracefully', () => {
      const best = getBestParams([]);

      expect(best).toEqual({});
    });

    it('should return first result when all have same score', () => {
      const results: GridSearchResult[] = [
        {
          params: { k: 3 },
          meanScore: 0.9,
          stdDev: 0.01,
          ciLower: 0.89,
          ciUpper: 0.91,
          scores: [0.9, 0.9, 0.9],
        },
        {
          params: { k: 5 },
          meanScore: 0.9,
          stdDev: 0.01,
          ciLower: 0.89,
          ciUpper: 0.91,
          scores: [0.9, 0.9, 0.9],
        },
      ];

      const best = getBestParams(results);

      expect(best.k).toBe(3); // First one wins ties
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Confidence Interval Correctness
  // ─────────────────────────────────────────────────────────────────────

  describe('Confidence intervals', () => {
    it('should have lower < mean < upper', () => {
      const data = Array(100)
        .fill(null)
        .map((_, i) => `sample_${i}`);
      const labels = Array(100)
        .fill(null)
        .map((_, i) => i % 2);

      const paramGrid: ParamGrid = {
        test: [1],
      };

      const results = gridSearch(
        data,
        labels,
        paramGrid,
        5,
        (train, test, trainLabels, testLabels) => {
          // Return mixed correct/incorrect predictions
          return testLabels.map((_, i) => (i % 2 === 0 ? testLabels[i] : 1 - testLabels[i]));
        }
      );

      results.forEach((result) => {
        expect(result.ciLower).toBeLessThanOrEqual(result.meanScore);
        expect(result.meanScore).toBeLessThanOrEqual(result.ciUpper);
        expect(result.ciLower).toBeGreaterThanOrEqual(0);
        expect(result.ciUpper).toBeLessThanOrEqual(1);
      });
    });

    it('should be narrower for consistent performance', () => {
      const data = Array(100)
        .fill(null)
        .map((_, i) => `sample_${i}`);
      const labels = Array(100)
        .fill(null)
        .map((_, i) => i % 2);

      const paramGrid: ParamGrid = {
        consistency: ['high', 'low'],
      };

      const results = gridSearch(
        data,
        labels,
        paramGrid,
        5,
        (train, test, trainLabels, testLabels, params) => {
          if (params.consistency === 'high') {
            // Consistent predictions (high accuracy)
            return testLabels;
          } else {
            // Random predictions (low consistency)
            return testLabels.map(() => Math.random() > 0.5 ? 1 : 0);
          }
        }
      );

      const [highConsistency, lowConsistency] = results;
      const highCI = highConsistency.ciUpper - highConsistency.ciLower;
      const lowCI = lowConsistency.ciUpper - lowConsistency.ciLower;

      // High consistency should have narrower CI
      expect(highCI).toBeLessThan(lowCI);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Determinism and Reproducibility
  // ─────────────────────────────────────────────────────────────────────

  describe('Determinism', () => {
    it('should be deterministic across runs', () => {
      const data = Array(50)
        .fill(null)
        .map((_, i) => `sample_${i}`);
      const labels = Array(50)
        .fill(null)
        .map((_, i) => i % 2);

      const paramGrid: ParamGrid = {
        k: [3, 5],
      };

      const trainer = (train: string[], test: string[], trainLabels: number[], testLabels: number[]) => {
        // Deterministic trainer based on input size
        return Array(test.length).fill(trainLabels[0] ?? 0);
      };

      const results1 = gridSearch(data, labels, paramGrid, 3, trainer);
      const results2 = gridSearch(data, labels, paramGrid, 3, trainer);

      expect(results1.length).toBe(results2.length);
      results1.forEach((r1, i) => {
        const r2 = results2[i];
        expect(r1.meanScore).toBe(r2.meanScore);
        expect(r1.stdDev).toBe(r2.stdDev);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Edge Cases
  // ─────────────────────────────────────────────────────────────────────

  describe('Edge cases', () => {
    it('should handle single fold gracefully', () => {
      const data = Array(20)
        .fill(null)
        .map((_, i) => `sample_${i}`);
      const labels = Array(20)
        .fill(null)
        .map((_, i) => i % 2);

      const paramGrid: ParamGrid = {
        k: [3],
      };

      const results = gridSearch(
        data,
        labels,
        paramGrid,
        2, // 2 folds, small dataset
        (train, test, trainLabels, testLabels) => testLabels
      );

      expect(results.length).toBeGreaterThan(0);
      results.forEach((result) => {
        expect(result.scores.length).toBe(2);
      });
    });

    it('should handle string and numeric parameters', () => {
      const data = Array(30)
        .fill(null)
        .map((_, i) => `sample_${i}`);
      const labels = Array(30)
        .fill(null)
        .map((_, i) => i % 2);

      const paramGrid: ParamGrid = {
        algorithm: ['knn', 'tree'],
        k: [3, 5],
        weighted: [true, false],
      };

      const results = gridSearch(
        data,
        labels,
        paramGrid,
        2,
        (train, test, trainLabels, testLabels, params) => {
          expect(typeof params.algorithm).toBe('string');
          expect(typeof params.k).toBe('number');
          expect(typeof params.weighted).toBe('boolean');
          return testLabels;
        }
      );

      expect(results.length).toBe(8); // 2 × 2 × 2
    });
  });
});
