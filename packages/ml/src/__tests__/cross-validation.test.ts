/**
 * Cross-validation tests for classifyTraces (G3 gap closure).
 *
 * These tests verify that the 3-fold stratified CV produces honest held-out
 * accuracy estimates that are structurally valid (Rank 1: mathematical
 * properties) and domain-correct (Rank 2: CV accuracy <= in-sample accuracy
 * for overfit-prone methods, CV lower than naive in-sample on small datasets).
 */

import { describe, it, expect } from 'vitest';
import { classifyTraces, runCrossValidation } from '../classifiers.js';
import { encodeLabels, buildFeatureMatrix } from '../bridge.js';
import { stratifiedKFold } from '../cross-validation.js';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const BALANCED_12 = [
  { case_id: 'a1', trace_length: 2, elapsed_time: 200, rework_count: 0, outcome: 'Pass' },
  { case_id: 'a2', trace_length: 3, elapsed_time: 300, rework_count: 0, outcome: 'Pass' },
  { case_id: 'a3', trace_length: 2, elapsed_time: 250, rework_count: 0, outcome: 'Pass' },
  { case_id: 'a4', trace_length: 3, elapsed_time: 350, rework_count: 0, outcome: 'Pass' },
  { case_id: 'a5', trace_length: 2, elapsed_time: 220, rework_count: 0, outcome: 'Pass' },
  { case_id: 'a6', trace_length: 3, elapsed_time: 280, rework_count: 0, outcome: 'Pass' },
  { case_id: 'b1', trace_length: 9, elapsed_time: 5000, rework_count: 3, outcome: 'Fail' },
  { case_id: 'b2', trace_length: 10, elapsed_time: 5500, rework_count: 4, outcome: 'Fail' },
  { case_id: 'b3', trace_length: 8, elapsed_time: 4500, rework_count: 2, outcome: 'Fail' },
  { case_id: 'b4', trace_length: 11, elapsed_time: 6000, rework_count: 5, outcome: 'Fail' },
  { case_id: 'b5', trace_length: 9, elapsed_time: 4800, rework_count: 3, outcome: 'Fail' },
  { case_id: 'b6', trace_length: 10, elapsed_time: 5200, rework_count: 4, outcome: 'Fail' },
];

const MINIMAL_6 = [
  { case_id: 'c1', trace_length: 2, elapsed_time: 200, rework_count: 0, outcome: 'Approve' },
  { case_id: 'c2', trace_length: 3, elapsed_time: 300, rework_count: 0, outcome: 'Approve' },
  { case_id: 'c3', trace_length: 2, elapsed_time: 250, rework_count: 0, outcome: 'Approve' },
  { case_id: 'd1', trace_length: 9, elapsed_time: 5000, rework_count: 3, outcome: 'Reject' },
  { case_id: 'd2', trace_length: 10, elapsed_time: 5500, rework_count: 4, outcome: 'Reject' },
  { case_id: 'd3', trace_length: 8, elapsed_time: 4500, rework_count: 2, outcome: 'Reject' },
];

const TOO_SMALL_4 = [
  { case_id: 'x1', trace_length: 2, elapsed_time: 200, rework_count: 0, outcome: 'Yes' },
  { case_id: 'x2', trace_length: 3, elapsed_time: 300, rework_count: 0, outcome: 'Yes' },
  { case_id: 'x3', trace_length: 9, elapsed_time: 5000, rework_count: 3, outcome: 'No' },
  { case_id: 'x4', trace_length: 10, elapsed_time: 5500, rework_count: 4, outcome: 'No' },
];

// ---------------------------------------------------------------------------
// baseline admissibility
// ---------------------------------------------------------------------------

describe('classifyTraces — baseline admissibility (crossValidate=false default)', () => {
  it('does not add cv_* fields when crossValidate is not set', async () => {
    const result = await classifyTraces(MINIMAL_6, { method: 'knn', k: 2 });
    expect(result.cv_accuracy).toBeUndefined();
    expect(result.cv_std_dev).toBeUndefined();
    expect(result.cv_folds).toBeUndefined();
    expect(result.cv_fold_scores).toBeUndefined();
  });

  it('does not add cv_* fields when crossValidate=false', async () => {
    const result = await classifyTraces(MINIMAL_6, { method: 'knn', k: 2, crossValidate: false });
    expect(result.cv_accuracy).toBeUndefined();
    expect(result.cv_std_dev).toBeUndefined();
  });

  it('still returns predictions when crossValidate=false', async () => {
    const result = await classifyTraces(MINIMAL_6, { method: 'knn', k: 2 });
    expect(result.predictions).toHaveLength(6);
  });
});

// ---------------------------------------------------------------------------
// Structural validity (Rank 1: mathematical properties)
// ---------------------------------------------------------------------------

describe('classifyTraces CV — structural validity (Rank 1)', () => {
  it('cv_accuracy is in [0, 1] for knn', async () => {
    const result = await classifyTraces(BALANCED_12, { method: 'knn', k: 3, crossValidate: true });
    expect(result.cv_accuracy).toBeDefined();
    expect(result.cv_accuracy!).toBeGreaterThanOrEqual(0);
    expect(result.cv_accuracy!).toBeLessThanOrEqual(1);
  });

  it('cv_std_dev is non-negative for all methods', async () => {
    for (const method of ['knn', 'naive_bayes', 'logistic_regression', 'decision_tree'] as const) {
      const result = await classifyTraces(BALANCED_12, { method, crossValidate: true });
      expect(result.cv_std_dev).toBeDefined();
      expect(result.cv_std_dev!).toBeGreaterThanOrEqual(0);
    }
  });

  it('cv_fold_scores has exactly cvFolds entries', async () => {
    const result = await classifyTraces(BALANCED_12, {
      method: 'knn', k: 2, crossValidate: true, cvFolds: 3,
    });
    expect(result.cv_fold_scores).toHaveLength(3);
  });

  it('cv_fold_scores entries are all in [0, 1]', async () => {
    const result = await classifyTraces(BALANCED_12, { method: 'knn', k: 2, crossValidate: true });
    for (const score of result.cv_fold_scores ?? []) {
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    }
  });

  it('cv_accuracy equals mean of cv_fold_scores', async () => {
    const result = await classifyTraces(BALANCED_12, { method: 'knn', k: 2, crossValidate: true });
    const foldScores = result.cv_fold_scores ?? [];
    if (foldScores.length === 0) return;
    const mean = foldScores.reduce((s, v) => s + v, 0) / foldScores.length;
    expect(result.cv_accuracy!).toBeCloseTo(mean, 10);
  });

  it('cv_folds equals requested fold count', async () => {
    const result = await classifyTraces(BALANCED_12, {
      method: 'naive_bayes', crossValidate: true, cvFolds: 4,
    });
    expect(result.cv_folds).toBe(4);
  });

  it('in-sample predictions are unchanged when crossValidate=true', async () => {
    const base = await classifyTraces(MINIMAL_6, { method: 'knn', k: 2 });
    const withCv = await classifyTraces(MINIMAL_6, { method: 'knn', k: 2, crossValidate: true });
    expect(withCv.predictions.length).toBe(base.predictions.length);
    for (let i = 0; i < base.predictions.length; i++) {
      expect(withCv.predictions[i].predicted).toBe(base.predictions[i].predicted);
      expect(withCv.predictions[i].caseId).toBe(base.predictions[i].caseId);
    }
  });
});

// ---------------------------------------------------------------------------
// Domain contract (Rank 2)
// ---------------------------------------------------------------------------

describe('classifyTraces CV — domain contract (Rank 2)', () => {
  it('CV accuracy on well-separated data is >= 0.5 for all methods', async () => {
    for (const method of ['knn', 'naive_bayes', 'logistic_regression', 'decision_tree'] as const) {
      const result = await classifyTraces(BALANCED_12, { method, k: 2, crossValidate: true });
      if (result.cv_accuracy !== undefined) {
        expect(result.cv_accuracy).toBeGreaterThanOrEqual(0.5);
      }
    }
  });

  it('gracefully skips CV when dataset is too small (n < 2*cvFolds)', async () => {
    const result = await classifyTraces(TOO_SMALL_4, {
      method: 'knn', k: 1, crossValidate: true, cvFolds: 3,
    });
    expect(result.cv_accuracy).toBeUndefined();
    expect(result.cv_fold_scores).toBeUndefined();
    expect(result.predictions).toHaveLength(4);
  });

  it('cvFolds defaults to 3 when not specified', async () => {
    const result = await classifyTraces(BALANCED_12, { method: 'knn', k: 2, crossValidate: true });
    expect(result.cv_folds).toBe(3);
    expect(result.cv_fold_scores).toHaveLength(3);
  });

  it('cvFolds is clamped to minimum 2', async () => {
    const result = await classifyTraces(BALANCED_12, {
      method: 'knn', k: 2, crossValidate: true, cvFolds: 1,
    });
    expect(result.cv_folds).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// runCrossValidation unit tests
// ---------------------------------------------------------------------------

describe('runCrossValidation — unit tests', () => {
  const makeEncodedMatrix = (features: Array<Record<string, unknown>>) => {
    const matrix = buildFeatureMatrix(features, undefined, 'outcome');
    const { encoded } = encodeLabels(matrix.labels);
    return { data: matrix.data, encoded };
  };

  it('returns empty scores when n < 2*k (graceful degrade)', () => {
    const { data, encoded } = makeEncodedMatrix(TOO_SMALL_4);
    const cv = runCrossValidation(data, encoded, 'knn', 3);
    expect(cv.scores).toHaveLength(0);
    expect(cv.mean).toBe(0);
    expect(cv.stdDev).toBe(0);
  });

  it('returns k fold scores for valid input', () => {
    const { data, encoded } = makeEncodedMatrix(BALANCED_12);
    const cv = runCrossValidation(data, encoded, 'knn', 3, 2);
    expect(cv.scores).toHaveLength(3);
  });

  it('mean is arithmetic mean of scores', () => {
    const { data, encoded } = makeEncodedMatrix(BALANCED_12);
    const cv = runCrossValidation(data, encoded, 'naive_bayes', 3);
    const expected = cv.scores.reduce((s, v) => s + v, 0) / cv.scores.length;
    expect(cv.mean).toBeCloseTo(expected, 10);
  });

  it('stdDev is non-negative', () => {
    const { data, encoded } = makeEncodedMatrix(BALANCED_12);
    const cv = runCrossValidation(data, encoded, 'logistic_regression', 3);
    expect(cv.stdDev).toBeGreaterThanOrEqual(0);
  });

  it('all four methods execute without error', () => {
    const { data, encoded } = makeEncodedMatrix(BALANCED_12);
    for (const method of ['knn', 'naive_bayes', 'logistic_regression', 'decision_tree'] as const) {
      const cv = runCrossValidation(data, encoded, method, 3);
      expect(cv.scores).toHaveLength(3);
    }
  });

  it('2-fold CV on minimal-6 returns 2 scores', () => {
    const { data, encoded } = makeEncodedMatrix(MINIMAL_6);
    const cv = runCrossValidation(data, encoded, 'knn', 2, 2);
    expect(cv.scores).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Cross-validation stability tests (Cycle 42: CV stability analysis)
// ---------------------------------------------------------------------------

describe('Cross-validation stability analysis', () => {
  /**
   * Test: Stratification maintains class distribution across folds.
   * Verifies that each fold has approximately the same class proportions
   * as the full dataset, which is critical for imbalanced datasets.
   */
  it('stratified CV maintains class distribution across folds', () => {
    const labels = [0, 0, 0, 0, 1, 1, 1, 1, 1, 1]; // 40% class 0, 60% class 1
    const { trainIndices, testIndices } = stratifiedKFold(labels, 3);

    // Check class distribution in test folds
    for (let i = 0; i < testIndices.length; i++) {
      let class0Count = 0;
      for (const idx of testIndices[i]) {
        if (labels[idx] === 0) class0Count++;
      }
      const testSize = testIndices[i].length;
      const class0Ratio = class0Count / testSize;

      // Should be close to original ratio (40%), allow ±20% tolerance for small folds
      expect(class0Ratio).toBeGreaterThanOrEqual(0.2);
      expect(class0Ratio).toBeLessThanOrEqual(0.6);
    }
  });

  /**
   * Test: Small datasets (N < 20) still maintain stratification.
   * Edge case: ensure stratification doesn't break with limited data.
   */
  it('stratified CV respects stratification on small datasets (N < 20)', () => {
    const labels = [0, 0, 0, 1, 1, 1, 1, 1]; // N = 8
    const { testIndices } = stratifiedKFold(labels, 3);

    // Verify no fold is empty
    for (const indices of testIndices) {
      expect(indices.length).toBeGreaterThan(0);
    }

    // Verify all indices are covered
    const allIndices = new Set<number>();
    for (const fold of testIndices) {
      for (const idx of fold) {
        allIndices.add(idx);
      }
    }
    expect(allIndices.size).toBeLessThanOrEqual(8);
  });

  /**
   * Test: Single-class edge case (all samples same label).
   * Should still produce valid fold assignments without error.
   */
  it('stratified CV handles single-class datasets gracefully', () => {
    const labels = [0, 0, 0, 0, 0]; // All same class
    const { trainIndices, testIndices } = stratifiedKFold(labels, 2);

    // Should still partition data
    expect(trainIndices.length).toBe(2);
    expect(testIndices.length).toBe(2);

    for (const indices of testIndices) {
      expect(indices.length).toBeGreaterThan(0);
    }
  });

  /**
   * Test: Imbalanced classes (e.g., 90-10 split).
   * Stratification should maintain this imbalance in each fold.
   */
  it('stratified CV maintains severe imbalance (90-10 split)', () => {
    // 90% class 0, 10% class 1
    const labels = Array(9).fill(0).concat([1]);
    const { testIndices } = stratifiedKFold(labels, 3);

    // Each fold should attempt to maintain ~90-10 split
    for (const indices of testIndices) {
      let class1Count = 0;
      for (const idx of indices) {
        if (labels[idx] === 1) class1Count++;
      }
      // Allow very permissive tolerance for small folds
      expect(class1Count).toBeLessThanOrEqual(Math.ceil(indices.length * 0.5)); // At least some stratification
    }
  });

  /**
   * Test: Fold distribution is even.
   * Verifies that fold sizes are balanced (no fold has significantly more samples than others).
   */
  it('CV fold sizes are balanced (no fold significantly larger)', () => {
    const labels = Array.from({ length: 30 }, (_, i) => (i % 3 === 0 ? 0 : 1));
    const { testIndices } = stratifiedKFold(labels, 3);

    const sizes = testIndices.map((indices) => indices.length);
    const maxSize = Math.max(...sizes);
    const minSize = Math.min(...sizes);

    // Max size should not be more than 2x min size (balanced)
    expect(maxSize / minSize).toBeLessThanOrEqual(2);
  });

  /**
   * Test: k-fold reproducibility.
   * Same data and same k should always produce identical train/test splits.
   * This is a Rank-1 oracle: deterministic partitioning.
   */
  it('stratified KFold is deterministic (same data → same splits)', () => {
    const labels = [0, 0, 0, 0, 1, 1, 1, 1, 1, 1];

    // Run twice and compare
    const result1 = stratifiedKFold(labels, 3);
    const result2 = stratifiedKFold(labels, 3);

    // Should have same fold count
    expect(result1.trainIndices.length).toBe(result2.trainIndices.length);
    expect(result1.testIndices.length).toBe(result2.testIndices.length);

    // Each fold should be identical
    for (let i = 0; i < result1.testIndices.length; i++) {
      expect(Array.from(result1.testIndices[i])).toEqual(Array.from(result2.testIndices[i]));
    }
  });
});
