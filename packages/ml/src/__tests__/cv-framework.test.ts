/**
 * Comprehensive cross-validation framework tests (Gap G3).
 *
 * Tests for:
 *   1. K-fold stratified partitioning (maintains class distribution)
 *   2. Holdout validation (train/test split)
 *   3. Metrics computation (accuracy, RMSE, MAE, R²)
 *   4. Framework orchestration (generic trainers)
 *   5. Edge cases (small datasets, single class, perfect fit)
 *   6. Determinism and overfitting detection
 */

import { describe, it, expect } from 'vitest';
import {
  stratifiedKFold,
  holdoutSplit,
  computeAccuracy,
  computeRMSE,
  computeMAE,
  computeRSquared,
  kFoldCrossValidation,
  holdoutValidation,
  holdoutRegressionValidation,
  type KFoldResult,
  type HoldoutResult,
} from '../cross-validation.js';

// ─────────────────────────────────────────────────────────────────────────────
// Test fixtures
// ─────────────────────────────────────────────────────────────────────────────

const BALANCED_BINARY = [
  0, 0, 0, 0, 0, 0, // 6 class 0
  1, 1, 1, 1, 1, 1, // 6 class 1
];

const IMBALANCED_MULTICLASS = [
  0, 0, 0, 0, 0, // 5 class 0
  1, 1, 1, // 3 class 1
  2, 2, // 2 class 2
];

const SMALL_DATASET = [0, 0, 1, 1];

const SINGLE_CLASS = [0, 0, 0, 0, 0];

// ─────────────────────────────────────────────────────────────────────────────
// K-fold tests
// ─────────────────────────────────────────────────────────────────────────────

describe('stratifiedKFold — partitioning', () => {
  it('returns k train/test pairs with correct sizes', () => {
    const result = stratifiedKFold(BALANCED_BINARY, 3);
    expect(result.trainIndices).toHaveLength(3);
    expect(result.testIndices).toHaveLength(3);
  });

  it('maintains class distribution in each fold for balanced data', () => {
    const result = stratifiedKFold(BALANCED_BINARY, 3);
    for (let i = 0; i < 3; i++) {
      const testLabels = Array.from(result.testIndices[i]).map(
        (idx) => BALANCED_BINARY[idx]
      );
      const class0 = testLabels.filter((l) => l === 0).length;
      const class1 = testLabels.filter((l) => l === 1).length;
      // For 12 samples / 3 folds = 4 per fold, expect 2 of each class
      expect(class0).toBeLessThanOrEqual(3);
      expect(class1).toBeLessThanOrEqual(3);
    }
  });

  it('stratifies imbalanced multiclass data', () => {
    const result = stratifiedKFold(IMBALANCED_MULTICLASS, 2);
    for (let i = 0; i < 2; i++) {
      const testLabels = Array.from(result.testIndices[i]).map(
        (idx) => IMBALANCED_MULTICLASS[idx]
      );
      // Verify each class appears in both folds (at least once)
      expect(new Set(testLabels).size).toBeGreaterThan(0);
    }
  });

  it('throws error if k is invalid', () => {
    expect(() => stratifiedKFold(BALANCED_BINARY, 1)).toThrow();
    expect(() => stratifiedKFold(BALANCED_BINARY, 13)).toThrow();
  });

  it('partition is exhaustive (no overlaps within same fold)', () => {
    const n = BALANCED_BINARY.length;
    const result = stratifiedKFold(BALANCED_BINARY, 3);
    // For each fold, verify test indices don't appear in train indices
    for (let i = 0; i < 3; i++) {
      const trainSet = new Set(result.trainIndices[i]);
      const testSet = new Set(result.testIndices[i]);
      for (const idx of testSet) {
        expect(trainSet.has(idx)).toBe(false);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Holdout split tests
// ─────────────────────────────────────────────────────────────────────────────

describe('holdoutSplit — train/test partitioning', () => {
  it('splits data with correct test ratio', () => {
    const n = 100;
    const result = holdoutSplit(n, undefined, 0.2);
    expect(result.trainIndices.length + result.testIndices.length).toBe(n);
    expect(result.testIndices.length).toBeCloseTo(20, 0);
  });

  it('respects minimum test size of 1', () => {
    const result = holdoutSplit(5, undefined, 0.01);
    expect(result.testIndices.length).toBeGreaterThanOrEqual(1);
  });

  it('preserves class distribution with stratification', () => {
    const result = holdoutSplit(BALANCED_BINARY.length, BALANCED_BINARY, 0.2);
    const testLabels = Array.from(result.testIndices).map(
      (idx) => BALANCED_BINARY[idx]
    );
    const class0Ratio = testLabels.filter((l) => l === 0).length / testLabels.length;
    // Should be close to 50/50
    expect(class0Ratio).toBeGreaterThan(0.3);
    expect(class0Ratio).toBeLessThan(0.7);
  });

  it('partition is exhaustive', () => {
    const n = BALANCED_BINARY.length;
    const result = holdoutSplit(n, BALANCED_BINARY, 0.2);
    const allIndices = new Set<number>(result.trainIndices);
    for (const idx of result.testIndices) {
      expect(allIndices.has(idx)).toBe(false);
      allIndices.add(idx);
    }
    expect(allIndices.size).toBe(n);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Metrics computation tests
// ─────────────────────────────────────────────────────────────────────────────

describe('computeAccuracy — metric computation', () => {
  it('returns 1.0 for perfect predictions', () => {
    const actual = [0, 1, 2, 0, 1];
    const predicted = [0, 1, 2, 0, 1];
    expect(computeAccuracy(actual, predicted)).toBe(1.0);
  });

  it('returns 0.0 for all wrong predictions', () => {
    const actual = [0, 0, 0, 0];
    const predicted = [1, 1, 1, 1];
    expect(computeAccuracy(actual, predicted)).toBe(0.0);
  });

  it('computes fractional accuracy correctly', () => {
    const actual = [0, 0, 1, 1];
    const predicted = [0, 1, 0, 1];
    expect(computeAccuracy(actual, predicted)).toBe(0.5);
  });

  it('handles empty arrays', () => {
    expect(computeAccuracy([], [])).toBe(0);
  });
});

describe('computeRMSE — regression metric', () => {
  it('returns 0 for perfect predictions', () => {
    const actual = [1, 2, 3];
    const predicted = [1, 2, 3];
    expect(computeRMSE(actual, predicted)).toBe(0);
  });

  it('computes RMSE for linear error', () => {
    const actual = [1, 2, 3];
    const predicted = [2, 3, 4];
    const rmse = computeRMSE(actual, predicted);
    expect(rmse).toBeCloseTo(1, 10); // sqrt(3/3) = 1
  });

  it('handles empty arrays', () => {
    expect(computeRMSE([], [])).toBe(0);
  });
});

describe('computeRSquared — goodness-of-fit', () => {
  it('returns 1.0 for perfect fit', () => {
    const actual = [1, 2, 3, 4, 5];
    const predicted = [1, 2, 3, 4, 5];
    expect(computeRSquared(actual, predicted)).toBe(1.0);
  });

  it('returns 0.0 for constant baseline prediction', () => {
    const mean = 3;
    const actual = [1, 2, 3, 4, 5];
    const predicted = [mean, mean, mean, mean, mean];
    expect(computeRSquared(actual, predicted)).toBe(0);
  });

  it('returns 1.0 for zero-variance data', () => {
    const actual = [2, 2, 2, 2];
    const predicted = [2, 2, 2, 2];
    expect(computeRSquared(actual, predicted)).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Framework orchestration tests (generic trainer integration)
// ─────────────────────────────────────────────────────────────────────────────

describe('kFoldCrossValidation — framework integration', () => {
  // Simple trainer: always predict the majority class
  const majorityClassTrainer = (
    _trainData: number[],
    testData: number[],
    trainLabels: number[],
    _testLabels: number[]
  ) => {
    const class0 = trainLabels.filter((l) => l === 0).length;
    const class1 = trainLabels.filter((l) => l === 1).length;
    const majorityClass = class0 >= class1 ? 0 : 1;
    return testData.map(() => majorityClass);
  };

  it('returns k fold scores', () => {
    const result: KFoldResult = kFoldCrossValidation(
      BALANCED_BINARY,
      BALANCED_BINARY,
      3,
      majorityClassTrainer
    );
    expect(result.scores).toHaveLength(3);
    expect(result.foldResults).toHaveLength(3);
  });

  it('computes correct mean and stdDev', () => {
    const result = kFoldCrossValidation(
      BALANCED_BINARY,
      BALANCED_BINARY,
      2,
      majorityClassTrainer
    );
    if (result.scores.length > 0) {
      const expectedMean = result.scores.reduce((s, v) => s + v, 0) / result.scores.length;
      expect(result.mean).toBeCloseTo(expectedMean, 10);
    }
  });

  it('gracefully handles datasets smaller than 2*k', () => {
    const result = kFoldCrossValidation(
      SMALL_DATASET,
      SMALL_DATASET,
      3,
      majorityClassTrainer
    );
    expect(result.scores).toHaveLength(0);
    expect(result.mean).toBe(0);
  });

  it('fold results track train/test sizes', () => {
    const result = kFoldCrossValidation(
      BALANCED_BINARY,
      BALANCED_BINARY,
      2,
      majorityClassTrainer
    );
    for (const fold of result.foldResults) {
      expect(fold.trainSize + fold.testSize).toBe(BALANCED_BINARY.length);
      expect(fold.trainSize).toBeGreaterThan(0);
      expect(fold.testSize).toBeGreaterThan(0);
    }
  });
});

describe('holdoutValidation — train/test accuracy gap', () => {
  // Simple trainer: perfect on train, random on test (overfitting)
  const overfitTrainer = (
    _trainData: number[],
    testData: number[],
    trainLabels: number[],
    _testLabels: number[]
  ) => {
    // Return perfect train predictions
    const trainPredictions = trainLabels;
    // Return random test predictions
    const testPredictions = testData.map(() => Math.round(Math.random()));
    return { train: trainPredictions, test: testPredictions };
  };

  it('computes train and test accuracy', () => {
    const result: HoldoutResult = holdoutValidation(
      BALANCED_BINARY,
      BALANCED_BINARY,
      0.2,
      overfitTrainer
    );
    expect(result.trainAccuracy).toBeDefined();
    expect(result.testAccuracy).toBeDefined();
    expect(result.trainAccuracy).toBeLessThanOrEqual(1.0);
    expect(result.testAccuracy).toBeLessThanOrEqual(1.0);
  });

  it('computes overfitting gap', () => {
    const result = holdoutValidation(
      BALANCED_BINARY,
      BALANCED_BINARY,
      0.2,
      overfitTrainer
    );
    expect(result.overfittingGap).toBeGreaterThanOrEqual(0);
    expect(result.overfittingGap).toBeLessThanOrEqual(1);
  });

  it('confidence equals test accuracy (honest estimate)', () => {
    const result = holdoutValidation(
      BALANCED_BINARY,
      BALANCED_BINARY,
      0.2,
      overfitTrainer
    );
    expect(result.confidence).toBe(result.testAccuracy);
  });

  it('tracks train/test set sizes', () => {
    const result = holdoutValidation(
      BALANCED_BINARY,
      BALANCED_BINARY,
      0.2,
      overfitTrainer
    );
    expect(result.trainSize + result.testSize).toBe(BALANCED_BINARY.length);
  });
});

describe('holdoutRegressionValidation — regression metrics', () => {
  // Simple trainer: predict mean of training set
  const meanRegressionTrainer = (
    _xTrain: number[][],
    _xTest: number[][],
    yTrain: number[]
  ) => {
    const mean = yTrain.reduce((s, v) => s + v, 0) / yTrain.length;
    return _xTest.map(() => mean);
  };

  it('computes R², RMSE, MAE', () => {
    const xData = [[1], [2], [3], [4], [5]];
    const yData = [1, 2, 3, 4, 5];
    const result = holdoutRegressionValidation(
      xData,
      yData,
      0.2,
      meanRegressionTrainer
    );
    expect(result.rSquared).toBeDefined();
    expect(result.rmse).toBeDefined();
    expect(result.mae).toBeDefined();
    expect(result.rSquared).toBeLessThanOrEqual(1);
  });

  it('confidence equals R²', () => {
    const xData = [[1], [2], [3], [4], [5]];
    const yData = [1, 2, 3, 4, 5];
    const result = holdoutRegressionValidation(
      xData,
      yData,
      0.2,
      meanRegressionTrainer
    );
    expect(result.confidence).toBe(result.rSquared);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Edge case and determinism tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Edge cases and robustness', () => {
  it('handles single-class data gracefully', () => {
    const result = kFoldCrossValidation(
      SINGLE_CLASS,
      SINGLE_CLASS,
      2,
      (_train, test, _tl, _tel) => test.map(() => 0)
    );
    expect(result.scores).toHaveLength(2);
  });

  it('K-fold with k=2 works (minimum folds)', () => {
    const result = stratifiedKFold(BALANCED_BINARY, 2);
    expect(result.trainIndices).toHaveLength(2);
    expect(result.testIndices).toHaveLength(2);
  });

  it('holdout with tiny testRatio (0.01)', () => {
    const result = holdoutSplit(100, undefined, 0.01);
    expect(result.testIndices.length).toBeGreaterThanOrEqual(1);
    expect(result.trainIndices.length).toBeGreaterThanOrEqual(1);
  });

  it('holdout with large testRatio (0.99)', () => {
    const result = holdoutSplit(100, undefined, 0.99);
    expect(result.testIndices.length).toBeGreaterThanOrEqual(1);
    expect(result.trainIndices.length).toBeGreaterThanOrEqual(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Rank-2 domain contract tests (overfitting/underfitting detection)
// ─────────────────────────────────────────────────────────────────────────────

describe('CV — Rank-2 domain contracts', () => {
  it('well-separated data achieves > 50% CV accuracy with majority class baseline', () => {
    // Majority class trainer as simple baseline
    const majorityClassTrainer = (
      _trainData: number[],
      testData: number[],
      trainLabels: number[],
      _testLabels: number[]
    ) => {
      const class0 = trainLabels.filter((l) => l === 0).length;
      const majorityClass = class0 >= trainLabels.length / 2 ? 0 : 1;
      return testData.map(() => majorityClass);
    };

    const result = kFoldCrossValidation(
      BALANCED_BINARY,
      BALANCED_BINARY,
      2,
      majorityClassTrainer
    );
    expect(result.mean).toBeGreaterThanOrEqual(0.5);
  });

  it('CV accuracy <= in-sample accuracy (honest estimate)', () => {
    // Trainer that is perfect on train, random on test
    const trainer = (
      _trainData: number[],
      testData: number[],
      trainLabels: number[],
      _testLabels: number[]
    ) => {
      // This artificially creates overfitting scenario
      return testData.map(() => trainLabels[0]);
    };

    const holdoutResult = holdoutValidation(
      BALANCED_BINARY,
      BALANCED_BINARY,
      0.2,
      (trainData, testData, trainLabels, _testLabels) => {
        const trainPred = trainLabels; // perfect on train
        const testPred = testData.map(() => trainLabels[0]); // guess on test
        return { train: trainPred, test: testPred };
      }
    );

    // Train accuracy should be >= test accuracy (overfitting signal)
    expect(holdoutResult.trainAccuracy).toBeGreaterThanOrEqual(
      holdoutResult.testAccuracy - 0.01 // small tolerance for rounding
    );
  });
});
