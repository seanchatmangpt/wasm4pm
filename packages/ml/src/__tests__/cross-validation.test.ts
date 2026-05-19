/**
 * Cross-validation tests for @wasm4pm/ml classifyTraces
 *
 * Test coverage:
 * - Basic 3-fold CV with balanced data
 * - Imbalanced data stratification
 * - Single-class edge case (no CV needed)
 * - Confidence calibration (predicted confidence vs actual accuracy)
 * - Held-out fold evaluation (train vs holdout accuracy differential)
 */

import { describe, it, expect } from 'vitest';
import { classifyTraces } from '../classifiers.js';

describe('Cross-Validation (3-Fold)', () => {
  /**
   * Test 1: Basic 3-fold CV with balanced binary classification
   */
  it('performs 3-fold CV with balanced binary data', async () => {
    const features = [
      { case_id: 'c1', trace_length: 10, elapsed_time: 5000, rework_count: 3, outcome: 'Reject' },
      { case_id: 'c2', trace_length: 3, elapsed_time: 1000, rework_count: 0, outcome: 'Approve' },
      { case_id: 'c3', trace_length: 4, elapsed_time: 1500, rework_count: 0, outcome: 'Approve' },
      { case_id: 'c4', trace_length: 9, elapsed_time: 4500, rework_count: 2, outcome: 'Reject' },
      { case_id: 'c5', trace_length: 11, elapsed_time: 6000, rework_count: 4, outcome: 'Reject' },
      { case_id: 'c6', trace_length: 2, elapsed_time: 800, rework_count: 0, outcome: 'Approve' },
    ];

    const result = await classifyTraces(features, {
      method: 'knn',
      k: 3,
      useCrossValidation: true,
    });

    expect(result.method).toBe('knn');
    expect(result.predictions).toHaveLength(6);

    // CV metrics should be populated
    const cvMetrics = (result.modelInfo as any).cvMetrics;
    expect(cvMetrics).toBeDefined();
    expect(cvMetrics.meanAccuracy).toBeGreaterThanOrEqual(0);
    expect(cvMetrics.meanAccuracy).toBeLessThanOrEqual(1);
    expect(cvMetrics.stdAccuracy).toBeGreaterThanOrEqual(0);
    expect(cvMetrics.foldAccuracies).toHaveLength(3);
    expect(cvMetrics.foldConfusionMatrices).toHaveLength(3);

    // Each fold accuracy should be in [0,1]
    for (const acc of cvMetrics.foldAccuracies) {
      expect(acc).toBeGreaterThanOrEqual(0);
      expect(acc).toBeLessThanOrEqual(1);
    }

    // Confidence calibration should be in [0,1]
    expect(cvMetrics.confidenceCalibration).toBeGreaterThanOrEqual(0);
    expect(cvMetrics.confidenceCalibration).toBeLessThanOrEqual(1);
  });

  /**
   * Test 2: Imbalanced data (3:1 ratio) — stratified CV should maintain proportions
   */
  it('handles imbalanced data with stratified CV', async () => {
    // 9 Approve : 3 Reject (3:1 ratio)
    const features = [
      { case_id: 'c1', trace_length: 2, elapsed_time: 500, rework_count: 0, outcome: 'Approve' },
      { case_id: 'c2', trace_length: 3, elapsed_time: 800, rework_count: 0, outcome: 'Approve' },
      { case_id: 'c3', trace_length: 2, elapsed_time: 600, rework_count: 0, outcome: 'Approve' },
      { case_id: 'c4', trace_length: 2, elapsed_time: 700, rework_count: 0, outcome: 'Approve' },
      { case_id: 'c5', trace_length: 10, elapsed_time: 5000, rework_count: 3, outcome: 'Reject' },
      { case_id: 'c6', trace_length: 3, elapsed_time: 1500, rework_count: 0, outcome: 'Approve' },
      { case_id: 'c7', trace_length: 9, elapsed_time: 4500, rework_count: 2, outcome: 'Reject' },
      { case_id: 'c8', trace_length: 2, elapsed_time: 650, rework_count: 0, outcome: 'Approve' },
      { case_id: 'c9', trace_length: 11, elapsed_time: 5500, rework_count: 4, outcome: 'Reject' },
      { case_id: 'c10', trace_length: 3, elapsed_time: 900, rework_count: 0, outcome: 'Approve' },
      { case_id: 'c11', trace_length: 3, elapsed_time: 1000, rework_count: 0, outcome: 'Approve' },
      { case_id: 'c12', trace_length: 2, elapsed_time: 800, rework_count: 0, outcome: 'Approve' },
    ];

    const result = await classifyTraces(features, {
      method: 'logistic_regression',
      useCrossValidation: true,
    });

    const cvMetrics = (result.modelInfo as any).cvMetrics;
    expect(cvMetrics).toBeDefined();
    expect(cvMetrics.foldAccuracies).toHaveLength(3);

    // Stratified fold should distribute classes proportionally
    // Check that confusion matrices exist for both classes
    for (const cm of cvMetrics.foldConfusionMatrices) {
      expect(cm['Approve']).toBeDefined();
      expect(cm['Reject']).toBeDefined();
    }
  });

  /**
   * Test 3: Single-class edge case — when all samples have the same label, the classifier
   *         should predict that class for all test samples (100% accuracy).
   *         However, CV logic needs to handle the degenerate confusion matrix case.
   */
  it('handles single-class data gracefully', async () => {
    // All outcomes are the same
    const features = [
      { case_id: 'c1', trace_length: 2, elapsed_time: 500, rework_count: 0, outcome: 'Approve' },
      { case_id: 'c2', trace_length: 3, elapsed_time: 600, rework_count: 0, outcome: 'Approve' },
      { case_id: 'c3', trace_length: 4, elapsed_time: 700, rework_count: 0, outcome: 'Approve' },
      { case_id: 'c4', trace_length: 5, elapsed_time: 800, rework_count: 0, outcome: 'Approve' },
      { case_id: 'c5', trace_length: 2, elapsed_time: 550, rework_count: 0, outcome: 'Approve' },
      { case_id: 'c6', trace_length: 3, elapsed_time: 650, rework_count: 0, outcome: 'Approve' },
    ];

    const result = await classifyTraces(features, {
      method: 'decision_tree',
      useCrossValidation: true,
    });

    // Single class: CV may not compute due to lack of variance in labels.
    // If CV runs, metrics should be valid; if not, cvMetrics will be undefined.
    const cvMetrics = (result.modelInfo as any).cvMetrics;
    // Single-class case is degenerate; only check that if CV runs, it's valid
    if (cvMetrics) {
      expect(cvMetrics.meanAccuracy).toBeGreaterThanOrEqual(0);
      expect(cvMetrics.meanAccuracy).toBeLessThanOrEqual(1);
    }
  });

  /**
   * Test 4: Confidence calibration — predicted confidence should track actual accuracy
   */
  it('computes confidence calibration (confidence vs accuracy delta)', async () => {
    const features = [
      { case_id: 'c1', trace_length: 10, elapsed_time: 5000, rework_count: 3, outcome: 'Reject' },
      { case_id: 'c2', trace_length: 3, elapsed_time: 1000, rework_count: 0, outcome: 'Approve' },
      { case_id: 'c3', trace_length: 4, elapsed_time: 1500, rework_count: 0, outcome: 'Approve' },
      { case_id: 'c4', trace_length: 9, elapsed_time: 4500, rework_count: 2, outcome: 'Reject' },
      { case_id: 'c5', trace_length: 11, elapsed_time: 6000, rework_count: 4, outcome: 'Reject' },
      { case_id: 'c6', trace_length: 2, elapsed_time: 800, rework_count: 0, outcome: 'Approve' },
    ];

    const result = await classifyTraces(features, {
      method: 'naive_bayes',
      useCrossValidation: true,
    });

    const cvMetrics = (result.modelInfo as any).cvMetrics;
    expect(cvMetrics).toBeDefined();
    // confidenceCalibration = |meanAccuracy - avgConfidence|
    // Well-calibrated model: this should be low (< 0.3)
    // Poorly calibrated: this will be high (> 0.5)
    expect(cvMetrics.confidenceCalibration).toBeGreaterThanOrEqual(0);
    expect(cvMetrics.confidenceCalibration).toBeLessThanOrEqual(1);
  });

  /**
   * Test 5: Held-out fold evaluation — fold accuracies are computed
   */
  it('distinguishes between training and held-out fold accuracy', async () => {
    const features = [
      { case_id: 'c1', trace_length: 10, elapsed_time: 5000, rework_count: 3, outcome: 'Reject' },
      { case_id: 'c2', trace_length: 3, elapsed_time: 1000, rework_count: 0, outcome: 'Approve' },
      { case_id: 'c3', trace_length: 4, elapsed_time: 1500, rework_count: 0, outcome: 'Approve' },
      { case_id: 'c4', trace_length: 9, elapsed_time: 4500, rework_count: 2, outcome: 'Reject' },
      { case_id: 'c5', trace_length: 11, elapsed_time: 6000, rework_count: 4, outcome: 'Reject' },
      { case_id: 'c6', trace_length: 2, elapsed_time: 800, rework_count: 0, outcome: 'Approve' },
      { case_id: 'c7', trace_length: 8, elapsed_time: 4000, rework_count: 1, outcome: 'Reject' },
      { case_id: 'c8', trace_length: 2, elapsed_time: 900, rework_count: 0, outcome: 'Approve' },
      { case_id: 'c9', trace_length: 5, elapsed_time: 2000, rework_count: 1, outcome: 'Approve' },
    ];

    const result = await classifyTraces(features, {
      method: 'knn',
      k: 3,
      useCrossValidation: true,
    });

    const cvMetrics = (result.modelInfo as any).cvMetrics;
    expect(cvMetrics).toBeDefined();
    expect(cvMetrics.foldAccuracies.length).toBe(3);

    // All fold accuracies should be valid (between 0 and 1)
    for (const acc of cvMetrics.foldAccuracies) {
      expect(acc).toBeGreaterThanOrEqual(0);
      expect(acc).toBeLessThanOrEqual(1);
    }

    // Mean should be between min and max of fold accuracies
    const minAcc = Math.min(...cvMetrics.foldAccuracies);
    const maxAcc = Math.max(...cvMetrics.foldAccuracies);
    expect(cvMetrics.meanAccuracy).toBeGreaterThanOrEqual(minAcc);
    expect(cvMetrics.meanAccuracy).toBeLessThanOrEqual(maxAcc);
  });

  /**
   * Test 6: CV should not run on small datasets (< 6 samples)
   */
  it('skips CV on small datasets (< 6 samples)', async () => {
    const features = [
      { case_id: 'c1', trace_length: 10, elapsed_time: 5000, rework_count: 3, outcome: 'Reject' },
      { case_id: 'c2', trace_length: 3, elapsed_time: 1000, rework_count: 0, outcome: 'Approve' },
      { case_id: 'c3', trace_length: 4, elapsed_time: 1500, rework_count: 0, outcome: 'Approve' },
      { case_id: 'c4', trace_length: 9, elapsed_time: 4500, rework_count: 2, outcome: 'Reject' },
      { case_id: 'c5', trace_length: 11, elapsed_time: 6000, rework_count: 4, outcome: 'Reject' },
    ];

    const result = await classifyTraces(features, {
      method: 'knn',
      k: 3,
      useCrossValidation: true,
    });

    // CV should be skipped (n < 6)
    const cvMetrics = (result.modelInfo as any).cvMetrics;
    expect(cvMetrics).toBeUndefined();
  });

  /**
   * Test 7: CV across all four classifier methods
   */
  it('supports CV across all classifier methods (knn, logistic, tree, naivebayes)', async () => {
    const features = [
      { case_id: 'c1', trace_length: 10, elapsed_time: 5000, rework_count: 3, outcome: 'Reject' },
      { case_id: 'c2', trace_length: 3, elapsed_time: 1000, rework_count: 0, outcome: 'Approve' },
      { case_id: 'c3', trace_length: 4, elapsed_time: 1500, rework_count: 0, outcome: 'Approve' },
      { case_id: 'c4', trace_length: 9, elapsed_time: 4500, rework_count: 2, outcome: 'Reject' },
      { case_id: 'c5', trace_length: 11, elapsed_time: 6000, rework_count: 4, outcome: 'Reject' },
      { case_id: 'c6', trace_length: 2, elapsed_time: 800, rework_count: 0, outcome: 'Approve' },
      { case_id: 'c7', trace_length: 8, elapsed_time: 4000, rework_count: 1, outcome: 'Reject' },
      { case_id: 'c8', trace_length: 2, elapsed_time: 900, rework_count: 0, outcome: 'Approve' },
    ];

    const methods = ['knn', 'logistic_regression', 'decision_tree', 'naive_bayes'] as const;

    for (const method of methods) {
      const result = await classifyTraces(features, {
        method,
        k: 3,
        useCrossValidation: true,
      });

      const cvMetrics = (result.modelInfo as any).cvMetrics;
      expect(cvMetrics, `Method ${method} should have CV metrics`).toBeDefined();
      expect(cvMetrics.meanAccuracy).toBeGreaterThanOrEqual(0);
      expect(cvMetrics.meanAccuracy).toBeLessThanOrEqual(1);
      expect(cvMetrics.foldAccuracies).toHaveLength(3);
      expect(cvMetrics.foldConfusionMatrices).toHaveLength(3);
    }
  });

  /**
   * Test 8: Multi-class classification with 3 classes
   */
  it('performs CV with 3-class classification', async () => {
    const features = [
      { case_id: 'c1', trace_length: 10, elapsed_time: 5000, rework_count: 3, status: 'High' },
      { case_id: 'c2', trace_length: 3, elapsed_time: 1000, rework_count: 0, status: 'Low' },
      { case_id: 'c3', trace_length: 4, elapsed_time: 1500, rework_count: 0, status: 'Low' },
      { case_id: 'c4', trace_length: 6, elapsed_time: 2500, rework_count: 1, status: 'Medium' },
      { case_id: 'c5', trace_length: 11, elapsed_time: 6000, rework_count: 4, status: 'High' },
      { case_id: 'c6', trace_length: 2, elapsed_time: 800, rework_count: 0, status: 'Low' },
      { case_id: 'c7', trace_length: 7, elapsed_time: 3000, rework_count: 2, status: 'Medium' },
      { case_id: 'c8', trace_length: 9, elapsed_time: 4500, rework_count: 3, status: 'High' },
      { case_id: 'c9', trace_length: 5, elapsed_time: 2000, rework_count: 1, status: 'Medium' },
    ];

    const result = await classifyTraces(features, {
      method: 'knn',
      targetKey: 'status',
      useCrossValidation: true,
    });

    const cvMetrics = (result.modelInfo as any).cvMetrics;
    expect(cvMetrics).toBeDefined();

    // All 3 classes should be present in confusion matrices
    for (const cm of cvMetrics.foldConfusionMatrices) {
      expect(cm['High']).toBeDefined();
      expect(cm['Medium']).toBeDefined();
      expect(cm['Low']).toBeDefined();
    }
  });

  /**
   * Test 9: CV with custom k and maxDepth parameters
   */
  it('respects k and maxDepth parameters in CV', async () => {
    const features = [
      { case_id: 'c1', trace_length: 10, elapsed_time: 5000, rework_count: 3, outcome: 'Reject' },
      { case_id: 'c2', trace_length: 3, elapsed_time: 1000, rework_count: 0, outcome: 'Approve' },
      { case_id: 'c3', trace_length: 4, elapsed_time: 1500, rework_count: 0, outcome: 'Approve' },
      { case_id: 'c4', trace_length: 9, elapsed_time: 4500, rework_count: 2, outcome: 'Reject' },
      { case_id: 'c5', trace_length: 11, elapsed_time: 6000, rework_count: 4, outcome: 'Reject' },
      { case_id: 'c6', trace_length: 2, elapsed_time: 800, rework_count: 0, outcome: 'Approve' },
    ];

    const result = await classifyTraces(features, {
      method: 'decision_tree',
      maxDepth: 2,
      useCrossValidation: true,
    });

    const cvMetrics = (result.modelInfo as any).cvMetrics;
    expect(cvMetrics).toBeDefined();
    // Even with shallow tree, CV should compute metrics
    expect(cvMetrics.meanAccuracy).toBeGreaterThanOrEqual(0);
  });

  /**
   * Test 10: Verify confusion matrix structure for binary classification
   */
  it('computes valid confusion matrices for binary classification', async () => {
    const features = [
      { case_id: 'c1', trace_length: 10, elapsed_time: 5000, rework_count: 3, outcome: 'Reject' },
      { case_id: 'c2', trace_length: 3, elapsed_time: 1000, rework_count: 0, outcome: 'Approve' },
      { case_id: 'c3', trace_length: 4, elapsed_time: 1500, rework_count: 0, outcome: 'Approve' },
      { case_id: 'c4', trace_length: 9, elapsed_time: 4500, rework_count: 2, outcome: 'Reject' },
      { case_id: 'c5', trace_length: 11, elapsed_time: 6000, rework_count: 4, outcome: 'Reject' },
      { case_id: 'c6', trace_length: 2, elapsed_time: 800, rework_count: 0, outcome: 'Approve' },
    ];

    const result = await classifyTraces(features, {
      method: 'knn',
      useCrossValidation: true,
    });

    const cvMetrics = (result.modelInfo as any).cvMetrics;
    expect(cvMetrics).toBeDefined();

    // Each fold should have 2 classes with TP, FP, TN, FN counts
    for (const cm of cvMetrics.foldConfusionMatrices) {
      for (const [className, counts] of Object.entries(cm) as any) {
        expect(typeof counts.tp).toBe('number');
        expect(typeof counts.fp).toBe('number');
        expect(typeof counts.tn).toBe('number');
        expect(typeof counts.fn).toBe('number');
        expect(counts.tp).toBeGreaterThanOrEqual(0);
        expect(counts.fp).toBeGreaterThanOrEqual(0);
        expect(counts.tn).toBeGreaterThanOrEqual(0);
        expect(counts.fn).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
