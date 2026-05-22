/**
 * Cycle 43: Feature Importance Ranking, Algorithm Selection Stability, Cross-Validation Edge Cases
 *
 * Tests for:
 * 1. Feature importance ranking implementation and ranking determinism
 * 2. Algorithm selection stability (determinism across multiple runs)
 * 3. Cross-validation edge cases (empty dataset, single sample, k > n, imbalanced folds)
 */

import { describe, it, expect } from 'vitest';
import { rankFeatureImportance } from '../feature-importance.js';
import { suggestAlgorithmWithScaling } from '../algorithm-selection-extended.js';
import { 
  stratifiedKFold, 
  holdoutSplit, 
  kFoldCrossValidation, 
  holdoutValidation 
} from '../cross-validation.js';
import { detectLogCharacteristics } from '../parameter-suggestions.js';

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: Feature Importance Ranking Implementation
// ─────────────────────────────────────────────────────────────────────────────

describe('Feature Importance Ranking (Gap 1)', () => {
  describe('Ranking determinism', () => {
    it('rankFeatureImportance produces deterministic rankings across multiple calls', () => {
      const data = [
        [1, 5, 100],
        [2, 6, 110],
        [3, 7, 105],
        [4, 8, 115],
        [5, 9, 120],
      ];
      const targets = [0, 0, 0, 1, 1];
      const features = ['f1', 'f2', 'f3'];

      // Call rankFeatureImportance twice on the same data
      const result1 = rankFeatureImportance(data, targets, features, 'correlation');
      const result2 = rankFeatureImportance(data, targets, features, 'correlation');

      // Verify rankings are identical
      expect(result1.importances).toHaveLength(result2.importances.length);
      for (let i = 0; i < result1.importances.length; i++) {
        expect(result1.importances[i].feature).toBe(result2.importances[i].feature);
        expect(result1.importances[i].importance).toBeCloseTo(result2.importances[i].importance, 10);
        expect(result1.importances[i].rank).toBe(result2.importances[i].rank);
      }
    });

    it('ranks features by importance (descending)', () => {
      const data = [
        [1, 100], // f1 has low variance, f2 has high variance
        [2, 105],
        [3, 110],
        [4, 100],
        [5, 120],
      ];
      const targets = [0, 0, 1, 1, 1];
      const features = ['low_var', 'high_var'];

      const result = rankFeatureImportance(data, targets, features, 'correlation');
      
      // Verify ordering
      for (let i = 0; i < result.importances.length - 1; i++) {
        expect(result.importances[i].importance).toBeGreaterThanOrEqual(
          result.importances[i + 1].importance
        );
      }
    });

    it('all three importance methods work and produce valid rankings', () => {
      const data = [[1, 2, 3], [4, 5, 6], [7, 8, 9]];
      const targets = [0, 1, 0];
      const features = ['a', 'b', 'c'];

      const resultCorr = rankFeatureImportance(data, targets, features, 'correlation');
      const resultMI = rankFeatureImportance(data, targets, features, 'mutual_information');
      const resultPerm = rankFeatureImportance(data, targets, features, 'permutation');

      expect(resultCorr.importances).toHaveLength(3);
      expect(resultMI.importances).toHaveLength(3);
      expect(resultPerm.importances).toHaveLength(3);

      // All should have ranks 1, 2, 3
      for (const result of [resultCorr, resultMI, resultPerm]) {
        const ranks = result.importances.map(fi => fi.rank).sort();
        expect(ranks).toEqual([1, 2, 3]);
      }
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: Algorithm Selection Stability
// ─────────────────────────────────────────────────────────────────────────────

describe('Algorithm Selection Stability (Gap 2)', () => {
  describe('Algorithm selection determinism', () => {
    it('suggestAlgorithmWithScaling returns same algorithm for same input across 10 runs', () => {
      const characteristics = detectLogCharacteristics(
        Array.from({ length: 100 }, (_, i) => ({
          caseId: String(i),
          timestamp: Date.now() + i * 1000,
          activity: `A${i % 5}`,
          resource: `R${i % 3}`,
        }))
      );

      const results: string[] = [];
      for (let i = 0; i < 10; i++) {
        const suggestion = suggestAlgorithmWithScaling('classify', characteristics);
        results.push(suggestion.algorithm);
      }

      // All results should be identical
      const firstResult = results[0];
      for (const result of results) {
        expect(result).toBe(firstResult);
      }
    });

    it('algorithm selection is based on data characteristics, not randomness', () => {
      // Small dataset should prefer k-NN
      const smallCharacteristics = detectLogCharacteristics(
        Array.from({ length: 20 }, (_, i) => ({
          caseId: String(i),
          timestamp: Date.now() + i * 1000,
          activity: `A${i % 2}`,
          resource: `R${i % 2}`,
        }))
      );

      const resultSmall = suggestAlgorithmWithScaling('classify', smallCharacteristics);
      expect(resultSmall.algorithm).toBe('knn');

      // Large dataset should prefer logistic_regression or similar
      const largeCharacteristics = detectLogCharacteristics(
        Array.from({ length: 500 }, (_, i) => ({
          caseId: String(i),
          timestamp: Date.now() + i * 100,
          activity: `A${i % 10}`,
          resource: `R${i % 5}`,
        }))
      );

      const resultLarge = suggestAlgorithmWithScaling('classify', largeCharacteristics);
      expect(['logistic_regression', 'knn']).toContain(resultLarge.algorithm);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 3: Cross-Validation Edge Cases
// ─────────────────────────────────────────────────────────────────────────────

describe('Cross-Validation Edge Cases (Gap 3)', () => {
  describe('stratifiedKFold edge cases', () => {
    it('handles k > n gracefully with error', () => {
      const labels = [0, 1]; // Only 2 samples
      expect(() => stratifiedKFold(labels, 5)).toThrow(); // k=5 > n=2
    });

    it('handles single-class dataset (all labels same)', () => {
      const labels = [0, 0, 0, 0]; // All same class
      const { trainIndices, testIndices } = stratifiedKFold(labels, 2);
      
      expect(trainIndices.length).toBe(2);
      expect(testIndices.length).toBe(2);
      expect(trainIndices[0].length + testIndices[0].length).toBe(4);
    });

    it('maintains stratification even with imbalanced classes', () => {
      const labels = [0, 0, 0, 0, 1]; // 4:1 imbalance
      const { trainIndices, testIndices } = stratifiedKFold(labels, 3);

      expect(trainIndices.length).toBe(3);
      expect(testIndices.length).toBe(3);

      // Each fold should have at least one sample
      for (let i = 0; i < 3; i++) {
        expect(trainIndices[i].length).toBeGreaterThan(0);
        expect(testIndices[i].length).toBeGreaterThan(0);
      }
    });
  });

  describe('holdoutSplit edge cases', () => {
    it('handles n=1 with single sample', () => {
      const { trainIndices, testIndices } = holdoutSplit(1, undefined, 0.2);
      
      // With 1 sample, test set should be at least 1
      expect(trainIndices.length + testIndices.length).toBe(1);
      expect(testIndices.length).toBeGreaterThanOrEqual(1);
    });

    it('handles very small n=3 with small test ratio', () => {
      const { trainIndices, testIndices } = holdoutSplit(3, [0, 1, 0], 0.2);
      
      expect(trainIndices.length + testIndices.length).toBe(3);
      expect(testIndices.length).toBeGreaterThanOrEqual(1);
    });

    it('stratifies even with extreme imbalance (2:1 split)', () => {
      const labels = [0, 0, 1];
      const { trainIndices, testIndices } = holdoutSplit(3, labels, 0.33);

      // At least one sample in each split
      expect(trainIndices.length).toBeGreaterThan(0);
      expect(testIndices.length).toBeGreaterThan(0);
    });
  });

  describe('kFoldCrossValidation edge cases', () => {
    it('returns empty scores when n < 2*k', () => {
      const data = [1, 2]; // Only 2 samples
      const labels = [0, 1];
      
      const result = kFoldCrossValidation(
        data, 
        labels, 
        5, // k=5, but 2*5=10 > n=2
        (trainData, testData, trainLabels, testLabels) => testLabels
      );

      expect(result.scores.length).toBe(0);
      expect(result.mean).toBe(0);
      expect(result.confidence).toBe(0);
    });

    it('handles k=2 (minimum valid k)', () => {
      const data = [1, 2, 3, 4]; // 4 samples
      const labels = [0, 1, 0, 1];

      const result = kFoldCrossValidation(
        data,
        labels,
        2, // k=2 is minimum
        (trainData, testData, trainLabels, testLabels) => {
          // Simple majority predictor
          return testLabels.map(() => 0);
        }
      );

      expect(result.scores.length).toBe(2);
      expect(result.mean).toBeGreaterThanOrEqual(0);
      expect(result.mean).toBeLessThanOrEqual(1);
    });

    it('handles single-class dataset gracefully', () => {
      const data = [1, 2, 3, 4];
      const labels = [0, 0, 0, 0]; // All same class

      const result = kFoldCrossValidation(
        data,
        labels,
        2,
        (trainData, testData, trainLabels, testLabels) => {
          return testLabels.map(() => 0); // Always predict 0
        }
      );

      // Should produce valid folds despite single class
      expect(result.scores.length).toBe(2);
      expect(result.mean).toBe(1.0); // Perfect accuracy on constant predictor
    });
  });

  describe('holdoutValidation edge cases', () => {
    it('handles n < 2 with proper bounds', () => {
      const data = [1];
      const labels = [0];

      const result = holdoutValidation(
        data,
        labels,
        0.2,
        (trainData, testData, trainLabels, testLabels) => ({
          train: trainLabels,
          test: testLabels,
        })
      );

      expect(result.trainAccuracy).toBe(0);
      expect(result.testAccuracy).toBe(0);
      expect(result.confidence).toBe(0);
    });

    it('handles n=2 (minimal for train+test split)', () => {
      const data = [1, 2];
      const labels = [0, 1];

      const result = holdoutValidation(
        data,
        labels,
        0.5, // 50% split: 1 train, 1 test
        (trainData, testData, trainLabels, testLabels) => ({
          train: trainLabels,
          test: testLabels,
        })
      );

      expect(result.trainSize + result.testSize).toBe(2);
      expect(result.trainSize).toBeGreaterThan(0);
      expect(result.testSize).toBeGreaterThan(0);
    });
  });
});
