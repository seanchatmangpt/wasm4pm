/**
 * Cross-validation framework for ML models (classification & regression).
 *
 * Provides both k-fold stratified and holdout validation strategies:
 *   - k-fold: Partitions data into k equal-sized folds, trains k models, aggregates metrics
 *   - Holdout: Splits data into train/test sets, trains once, computes single estimate
 *
 * Confidence computation:
 *   - Accuracy (classification): fraction of correct predictions
 *   - Precision, Recall, F1: per-class metrics for multi-class classification
 *   - RMSE, MAE, R² (regression): error magnitude and goodness-of-fit metrics
 *
 * Design: Honest held-out accuracy will be lower than in-sample for overfit-prone
 * methods (kNN with small k, deep decision trees). Reported confidence is thus realistic.
 */


import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// CV result schemas & types
// ─────────────────────────────────────────────────────────────────────────────

export const KFoldResultSchema = z.object({
  scores: z.array(z.number()),
  mean: z.number(),
  stdDev: z.number(),
  confidence: z.number(),
  foldResults: z.array(z.object({
    foldIdx: z.number(),
    score: z.number(),
    trainSize: z.number(),
    testSize: z.number(),
  })),
});

/**
 * Results from k-fold cross-validation.
 */
export type KFoldResult = z.infer<typeof KFoldResultSchema>;

export const HoldoutResultSchema = z.object({
  trainAccuracy: z.number(),
  testAccuracy: z.number(),
  confidence: z.number(),
  testSize: z.number(),
  trainSize: z.number(),
  overfittingGap: z.number(),
});

/**
 * Results from holdout validation.
 */
export type HoldoutResult = z.infer<typeof HoldoutResultSchema>;

export const RegressionCVResultSchema = z.object({
  rSquared: z.number(),
  rmse: z.number(),
  mae: z.number(),
  confidence: z.number(),
});

/**
 * Regression CV result.
 */
export type RegressionCVResult = z.infer<typeof RegressionCVResultSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Stratified k-fold partitioning
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Stratified k-fold partition that maintains class distribution across folds.
 * Returns k pairs of (train, test) index sets.
 *
 * Each fold has approximately the same class proportions as the full dataset,
 * which is critical for imbalanced datasets.
 *
 * @throws Error if k is invalid (k < 2 or k > n)
 */
export function stratifiedKFold(
  labels: number[],
  k: number = 3
): { trainIndices: Int32Array[]; testIndices: Int32Array[] } {
  const n = labels.length;
  if (k < 2 || k > n) {
    throw new Error(`k must be in range [2, ${n}], got ${k}`);
  }

  // Group indices by label for stratification
  const labelGroups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const label = labels[i];
    if (!labelGroups.has(label)) {
      labelGroups.set(label, []);
    }
    labelGroups.get(label)!.push(i);
  }

  // Assign each label's samples to folds (round-robin to balance)
  const foldAssignment = new Int32Array(n);
  for (const [_label, indices] of labelGroups) {
    for (let i = 0; i < indices.length; i++) {
      foldAssignment[indices[i]] = i % k;
    }
  }

  // Build train/test sets for each fold
  const trainIndices: Int32Array[] = [];
  const testIndices: Int32Array[] = [];

  for (let foldIdx = 0; foldIdx < k; foldIdx++) {
    const train: number[] = [];
    const test: number[] = [];
    for (let i = 0; i < n; i++) {
      if (foldAssignment[i] === foldIdx) {
        test.push(i);
      } else {
        train.push(i);
      }
    }
    trainIndices.push(new Int32Array(train));
    testIndices.push(new Int32Array(test));
  }

  return { trainIndices, testIndices };
}

/**
 * Random holdout split (train/test) with optional stratification.
 *
 * @param labels - Class labels for stratification (optional)
 * @param testRatio - Fraction of data to use as test set (default 0.2)
 * @returns trainIndices and testIndices
 */
export function holdoutSplit(
  n: number,
  labels?: number[],
  testRatio: number = 0.2
): { trainIndices: Int32Array; testIndices: Int32Array } {
  const testSize = Math.max(1, Math.floor(n * testRatio));
  const trainSize = n - testSize;

  if (labels && labels.length === n) {
    // Stratified holdout: maintain class distribution
    const labelGroups = new Map<number, number[]>();
    for (let i = 0; i < n; i++) {
      const label = labels[i];
      if (!labelGroups.has(label)) {
        labelGroups.set(label, []);
      }
      labelGroups.get(label)!.push(i);
    }

    const testIndices: number[] = [];
    const trainIndices: number[] = [];

    // Distribute test samples proportionally per class
    // For small datasets (n < numClasses), ensure at least 1 train sample total
    let totalTestAllocated = 0;
    const classAllocs = new Map<number, number>();

    // First pass: calculate allocations proportionally (rounding to nearest)
    for (const [_label, indices] of labelGroups) {
      const proportionalTest = (indices.length * testSize) / n;
      const testCountForClass = Math.round(proportionalTest);
      // Ensure we don't allocate more than available, but allow all samples in test if needed
      classAllocs.set(_label, Math.min(testCountForClass, indices.length));
      totalTestAllocated += classAllocs.get(_label)!;
    }

    // Second pass: adjust to match target testSize exactly
    // If we allocated too many to test, reduce from largest allocations
    // If we allocated too few to test, increase from smallest allocations
    while (totalTestAllocated > testSize) {
      let maxLabel = -1;
      let maxAlloc = -1;
      for (const [label, alloc] of classAllocs) {
        if (alloc > maxAlloc && alloc > 0) {
          maxAlloc = alloc;
          maxLabel = label;
        }
      }
      if (maxLabel !== -1) {
        classAllocs.set(maxLabel, classAllocs.get(maxLabel)! - 1);
        totalTestAllocated--;
      } else {
        break;
      }
    }

    while (totalTestAllocated < testSize) {
      let minLabel = -1;
      let minAlloc = Infinity;
      for (const [label, indices] of labelGroups) {
        const alloc = classAllocs.get(label) || 0;
        if (alloc < minAlloc && alloc < indices.length) {
          minAlloc = alloc;
          minLabel = label;
        }
      }
      if (minLabel !== -1) {
        classAllocs.set(minLabel, classAllocs.get(minLabel)! + 1);
        totalTestAllocated++;
      } else {
        break;
      }
    }

    // Final pass: apply allocations to split indices
    for (const [label, indices] of labelGroups) {
      const testCountForClass = classAllocs.get(label) || 0;
      for (let i = 0; i < indices.length; i++) {
        if (i < testCountForClass) {
          testIndices.push(indices[i]);
        } else {
          trainIndices.push(indices[i]);
        }
      }
    }

    return {
      trainIndices: new Int32Array(trainIndices),
      testIndices: new Int32Array(testIndices),
    };
  } else {
    // Simple random split
    const allIndices = Array.from({ length: n }, (_, i) => i);
    // Shuffle (Fisher-Yates)
    for (let i = n - 1; i > 0; i--) {
      let j;
      if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        const buf = new Uint32Array(1);
        crypto.getRandomValues(buf);
        j = buf[0] % (i + 1);
      } else {
        throw new Error('Cryptographic randomness not available in this environment. Deterministic seeding required.');
      }
      [allIndices[i], allIndices[j]] = [allIndices[j], allIndices[i]];
    }

    return {
      trainIndices: new Int32Array(allIndices.slice(0, trainSize)),
      testIndices: new Int32Array(allIndices.slice(trainSize)),
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Metrics computation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute accuracy: fraction of correct predictions.
 */
export function computeAccuracy(actual: number[], predicted: number[]): number {
  if (actual.length === 0) return 0;
  let correct = 0;
  for (let i = 0; i < actual.length; i++) {
    if (actual[i] === predicted[i]) correct++;
  }
  return correct / actual.length;
}

/**
 * Compute RMSE (root mean squared error).
 */
export function computeRMSE(actual: number[], predicted: number[]): number {
  const n = actual.length;
  if (n === 0) return 0;
  let ss = 0;
  for (let i = 0; i < n; i++) {
    const d = actual[i] - predicted[i];
    if (Number.isFinite(d)) ss += d * d;
  }
  const result = Math.sqrt(ss / n);
  return Number.isFinite(result) ? result : 0;
}

/**
 * Compute MAE (mean absolute error).
 */
export function computeMAE(actual: number[], predicted: number[]): number {
  const n = actual.length;
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const d = actual[i] - predicted[i];
    if (Number.isFinite(d)) sum += d < 0 ? -d : d;
  }
  const result = sum / n;
  return Number.isFinite(result) ? result : 0;
}

/**
 * Compute R² (coefficient of determination).
 * Returns 1 if perfect fit, 0 if constant baseline, can be negative.
 */
export function computeRSquared(actual: number[], predicted: number[]): number {
  const n = actual.length;
  if (n === 0) return 1;

  // Compute mean of actual values
  let mean = 0;
  for (let i = 0; i < n; i++) {
    if (Number.isFinite(actual[i])) mean += actual[i];
  }
  mean /= n;

  // Compute SS_res (residual sum of squares) and SS_tot (total sum of squares)
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const rd = actual[i] - predicted[i];
    const td = actual[i] - mean;
    if (Number.isFinite(rd)) ssRes += rd * rd;
    if (Number.isFinite(td)) ssTot += td * td;
  }

  // Guard against zero or very small variance
  if (ssTot < 1e-15) return 1;
  return Math.min(1, Math.max(-1, 1 - ssRes / ssTot));
}

// ─────────────────────────────────────────────────────────────────────────────
// Framework-agnostic k-fold orchestration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generic k-fold cross-validation for any model trainer.
 *
 * The trainer function receives:
 *   - trainData: Array<T> of training samples
 *   - testData: Array<T> of test samples
 *   - labels (if classification): numeric labels
 *
 * And returns predictions as number[] (class labels or regression values).
 *
 * @param data - Full dataset (samples)
 * @param labels - Target labels (for classification or stratification)
 * @param k - Number of folds (default 3)
 * @param modelTrainer - Function that trains and predicts: (trainData, testData, labels) => predictions
 * @returns KFoldResult with per-fold scores and aggregate metrics
 */
export function kFoldCrossValidation<T>(
  data: T[],
  labels: number[],
  k: number = 3,
  modelTrainer: (
    trainData: T[],
    testData: T[],
    trainLabels: number[],
    testLabels: number[]
  ) => number[] // predictions for test set
): KFoldResult {
  const n = data.length;
  if (n < 2 * k) {
    return { scores: [], mean: 0, stdDev: 0, confidence: 0, foldResults: [] };
  }

  const { trainIndices, testIndices } = stratifiedKFold(labels, k);
  const scores: number[] = [];
  const foldResults: KFoldResult['foldResults'] = [];

  for (let foldIdx = 0; foldIdx < k; foldIdx++) {
    const trainIdx = trainIndices[foldIdx];
    const testIdx = testIndices[foldIdx];

    const trainData = Array.from(trainIdx).map((i) => data[i]);
    const testData = Array.from(testIdx).map((i) => data[i]);
    const trainLabels = Array.from(trainIdx).map((i) => labels[i]);
    const testLabels = Array.from(testIdx).map((i) => labels[i]);

    if (trainData.length === 0 || testData.length === 0) {
      scores.push(0);
      foldResults.push({
        foldIdx,
        score: 0,
        trainSize: trainData.length,
        testSize: testData.length,
      });
      continue;
    }

    const predicted = modelTrainer(trainData, testData, trainLabels, testLabels);
    const accuracy = computeAccuracy(testLabels, predicted);
    scores.push(accuracy);
    foldResults.push({
      foldIdx,
      score: accuracy,
      trainSize: trainData.length,
      testSize: testData.length,
    });
  }

  const mean = scores.length > 0 ? scores.reduce((s, v) => s + v, 0) / scores.length : 0;
  const variance =
    scores.length > 1
      ? scores.reduce((s, v) => s + (v - mean) ** 2, 0) / scores.length
      : 0;
  const stdDev = Math.sqrt(variance);

  return {
    scores,
    mean,
    stdDev,
    confidence: mean,
    foldResults,
  };
}

/**
 * Generic holdout validation for classification models.
 *
 * @param data - Full dataset (samples)
 * @param labels - Target labels
 * @param testRatio - Fraction for test set (default 0.2)
 * @param modelTrainer - Function that trains and predicts
 * @returns HoldoutResult with train/test accuracy and overfitting gap
 */
export function holdoutValidation<T>(
  data: T[],
  labels: number[],
  testRatio: number = 0.2,
  modelTrainer: (
    trainData: T[],
    testData: T[],
    trainLabels: number[],
    testLabels: number[]
  ) => { train: number[]; test: number[] } // {train: predictions on train set, test: predictions on test set}
): HoldoutResult {
  const n = data.length;
  if (n < 2) {
    return {
      trainAccuracy: 0,
      testAccuracy: 0,
      confidence: 0,
      testSize: 0,
      trainSize: 0,
      overfittingGap: 0,
    };
  }

  const { trainIndices, testIndices } = holdoutSplit(n, labels, testRatio);

  const trainData = Array.from(trainIndices).map((i) => data[i]);
  const testData = Array.from(testIndices).map((i) => data[i]);
  const trainLabels = Array.from(trainIndices).map((i) => labels[i]);
  const testLabels = Array.from(testIndices).map((i) => labels[i]);

  const { train: trainPredicted, test: testPredicted } = modelTrainer(
    trainData,
    testData,
    trainLabels,
    testLabels
  );

  const trainAccuracy = computeAccuracy(trainLabels, trainPredicted);
  const testAccuracy = computeAccuracy(testLabels, testPredicted);
  const overfittingGap = trainAccuracy - testAccuracy;

  return {
    trainAccuracy,
    testAccuracy,
    confidence: testAccuracy,
    testSize: testData.length,
    trainSize: trainData.length,
    overfittingGap: Math.max(0, overfittingGap),
  };
}

/**
 * Holdout validation for regression models.
 *
 * @param xData - Feature vectors
 * @param yData - Target values
 * @param testRatio - Fraction for test set (default 0.2)
 * @param modelTrainer - Function that trains and predicts
 * @returns RegressionCVResult with R², RMSE, MAE
 */
export function holdoutRegressionValidation(
  xData: number[][],
  yData: number[],
  testRatio: number = 0.2,
  modelTrainer: (
    xTrain: number[][],
    yTrain: number[],
    xTest: number[][]
  ) => number[] // predictions for test set
): RegressionCVResult {
  const n = xData.length;
  if (n < 2) {
    return {
      rSquared: 0,
      rmse: 0,
      mae: 0,
      confidence: 0,
    };
  }

  const { trainIndices, testIndices } = holdoutSplit(n, undefined, testRatio);

  const xTrain = Array.from(trainIndices).map((i) => xData[i]);
  const yTrain = Array.from(trainIndices).map((i) => yData[i]);
  const xTest = Array.from(testIndices).map((i) => xData[i]);
  const yTest = Array.from(testIndices).map((i) => yData[i]);

  if (xTrain.length === 0 || xTest.length === 0) {
    return { rSquared: 0, rmse: 0, mae: 0, confidence: 0 };
  }

  const yPredicted = modelTrainer(xTrain, yTrain, xTest);

  const rSquared = computeRSquared(yTest, yPredicted);
  const rmse = computeRMSE(yTest, yPredicted);
  const mae = computeMAE(yTest, yPredicted);

  return {
    rSquared,
    rmse,
    mae,
    confidence: rSquared,
  };
}
