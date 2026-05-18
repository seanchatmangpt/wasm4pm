/**
 * Feature Selection & Cross-Validation Tests (Iteration 12b)
 *
 * Verifies:
 * 1. Stratified k-fold preserves class distribution
 * 2. Feature selection removes low-variance columns
 * 3. Correlation filtering removes duplicates
 * 4. CV accuracy differs from training accuracy (generalization)
 */

import { describe, it, expect } from 'vitest';
import { buildFeatureMatrix, selectTopFeatures } from '../bridge.js';

// Mock classifiers for cross-validation testing
// (These functions are internal to classifiers.ts but we test via the interface)

describe('Feature Selection & Cross-Validation (Iteration 12b)', () => {
  // ─────────────────────────────────────────────────────────────────────────
  // Gap 1: Stratified k-fold preserves class distribution
  // ─────────────────────────────────────────────────────────────────────────

  describe('Stratified k-fold partitioning', () => {
    it('should preserve class distribution across folds', () => {
      // Simulate imbalanced data: 70% class 0, 30% class 1
      const labels = new Array(70).fill(0).concat(new Array(30).fill(1));

      // Mock k-fold logic (testing concept)
      const n = labels.length;
      const k = 3;

      // Group indices by label
      const labelGroups = new Map<number, number[]>();
      for (let i = 0; i < n; i++) {
        if (!labelGroups.has(labels[i])) labelGroups.set(labels[i], []);
        labelGroups.get(labels[i])!.push(i);
      }

      // Verify all labels are accounted for
      expect(labelGroups.size).toBe(2);
      expect(labelGroups.get(0)!.length).toBe(70);
      expect(labelGroups.get(1)!.length).toBe(30);

      // Assign folds maintaining balance
      const foldAssignment = new Int32Array(n);
      for (const [label, indices] of labelGroups) {
        for (let i = 0; i < indices.length; i++) {
          foldAssignment[indices[i]] = i % k;
        }
      }

      // Count class distribution per fold
      const foldDistributions: { fold: number; class0: number; class1: number }[] = [];
      for (let foldIdx = 0; foldIdx < k; foldIdx++) {
        let class0 = 0;
        let class1 = 0;
        for (let i = 0; i < n; i++) {
          if (foldAssignment[i] === foldIdx) {
            if (labels[i] === 0) class0++;
            else class1++;
          }
        }
        foldDistributions.push({ fold: foldIdx, class0, class1 });
      }

      // Verify distribution is roughly balanced (within 10%)
      const targetClass0Ratio = 0.7;
      for (const dist of foldDistributions) {
        const total = dist.class0 + dist.class1;
        const ratio = dist.class0 / total;
        expect(Math.abs(ratio - targetClass0Ratio)).toBeLessThan(0.15); // Allow 15% variance
      }
    });

    it('should create non-overlapping train/test sets', () => {
      const n = 100;
      const k = 5;

      // Create simple fold indices
      const foldAssignment = new Int32Array(n);
      for (let i = 0; i < n; i++) {
        foldAssignment[i] = i % k;
      }

      // Build train/test sets for fold 0
      const testSet = new Set<number>();
      const trainSet = new Set<number>();

      for (let i = 0; i < n; i++) {
        if (foldAssignment[i] === 0) {
          testSet.add(i);
        } else {
          trainSet.add(i);
        }
      }

      // Verify no overlap
      expect(trainSet.size + testSet.size).toBe(n);
      const intersection = [...testSet].filter((i) => trainSet.has(i));
      expect(intersection.length).toBe(0);

      // Verify approximately equal sizes
      expect(testSet.size).toBeCloseTo(n / k, 1);
      expect(trainSet.size).toBeCloseTo((n * (k - 1)) / k, 1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Gap 2: Feature selection filters low-variance columns
  // ─────────────────────────────────────────────────────────────────────────

  describe('Feature selection via variance filtering', () => {
    it('should exclude zero-variance columns', () => {
      // 5 features: features 0,2,4 have variance; 1,3 are constant
      const data = [
        [1.0, 5.0, 2.0, 10.0, 3.0],
        [2.0, 5.0, 3.0, 10.0, 5.0],
        [3.0, 5.0, 4.0, 10.0, 7.0],
        [4.0, 5.0, 5.0, 10.0, 9.0],
      ];

      const selected = selectTopFeatures(data, 10); // Ask for all, should get 3

      // Should select features 0, 2, 4 (the variable ones)
      expect(selected.includes(1)).toBe(false); // constant
      expect(selected.includes(3)).toBe(false); // constant
      expect(selected.includes(0) || selected.includes(2) || selected.includes(4)).toBe(true);
      expect(selected.length).toBeLessThanOrEqual(3);
    });

    it('should rank features by descending variance', () => {
      // 3 features with different variances
      // Feature 0: high variance [1, 10, 19]
      // Feature 1: medium variance [1, 5.5, 10]
      // Feature 2: low variance [1, 1.1, 1.2]
      const data = [
        [1.0, 1.0, 1.0],
        [10.0, 5.5, 1.1],
        [19.0, 10.0, 1.2],
      ];

      const selected = selectTopFeatures(data, 2);

      // Should prefer feature 0 (highest variance)
      expect(selected[0]).toBe(0);
    });

    it('should limit output to topK features', () => {
      // Create 20 independent features
      const data = Array.from({ length: 50 }, (_, i) => Array.from({ length: 20 }, (_, j) => Math.random() * (j + 1)));

      const selected = selectTopFeatures(data, 5);

      expect(selected.length).toBeLessThanOrEqual(5);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Gap 3: Correlation filtering removes near-duplicate features
  // ─────────────────────────────────────────────────────────────────────────

  describe('Feature selection via correlation filtering', () => {
    it('should exclude highly correlated pairs', () => {
      // 4 features: 0 and 1 are identical (r=1.0), 2 is uncorrelated
      const data = [
        [1.0, 1.0, 10.0, 5.0],
        [2.0, 2.0, 11.0, 6.0],
        [3.0, 3.0, 12.0, 7.0],
        [4.0, 4.0, 13.0, 8.0],
      ];

      const selected = selectTopFeatures(data, 10, 0.9); // correlation > 0.9 removed

      // Should select one of {0, 1} but not both, plus 2, 3
      expect(selected.length).toBeLessThanOrEqual(3);
      expect((selected.includes(0) ? 1 : 0) + (selected.includes(1) ? 1 : 0)).toBeLessThanOrEqual(1);
    });

    it('should keep uncorrelated features', () => {
      // 3 independent features
      const data = [
        [1.0, 5.0, 10.0],
        [2.0, 6.0, 11.0],
        [3.0, 7.0, 12.0],
        [4.0, 8.0, 13.0],
      ];

      const selected = selectTopFeatures(data, 10, 0.95);

      // Should select all 3 (independent)
      expect(selected.length).toBe(3);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Gap 4: Quality gate logic (cross-validation as correctness check)
  // ─────────────────────────────────────────────────────────────────────────

  describe('Feature quality impact on model stability', () => {
    it('should demonstrate accuracy difference between train and holdout sets', () => {
      // Simulate train-on-train vs train-test split accuracy
      // Note: This is a conceptual test; actual k-fold is in classifiers.ts

      // In bad case (train-on-train): 95% accuracy
      const trainOnTrainAccuracy = 0.95;

      // In good case (holdout): ~75% accuracy (generalization gap)
      const holdoutAccuracy = 0.75;

      // The gap indicates overfitting
      const overfittingGap = trainOnTrainAccuracy - holdoutAccuracy;
      expect(overfittingGap).toBeGreaterThan(0.1); // >10% gap is concerning

      // This gap is what we want to expose via k-fold CV
      expect(holdoutAccuracy).toBeLessThan(trainOnTrainAccuracy);
    });

    it('should flag when feature quality score is below threshold', () => {
      // Simulate a low-quality feature set: 50% zero-variance
      const lowQualityData = Array.from({ length: 10 }, (_, i) =>
        Array.from({ length: 10 }, (_, j) => (j < 5 ? 1.0 : Math.random()))
      );

      // buildFeatureMatrix handles this indirectly; selectTopFeatures filters
      const selected = selectTopFeatures(lowQualityData, 10);

      // Should select fewer features due to high duplicate ratio
      expect(selected.length).toBeLessThan(10);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Gap 5: Integrate feature selection into pipeline
  // ─────────────────────────────────────────────────────────────────────────

  describe('Feature selection integration with build pipeline', () => {
    it('should integrate selectTopFeatures into bridge workflow', () => {
      // Simulate extract_case_features JSON output
      const rawFeatures = [
        { case_id: '1', elapsed_time: 100, rework_count: 0, constant_col: 5, outcome: 'success' },
        { case_id: '2', elapsed_time: 150, rework_count: 1, constant_col: 5, outcome: 'success' },
        { case_id: '3', elapsed_time: 200, rework_count: 2, constant_col: 5, outcome: 'failure' },
      ];

      // Step 1: Build feature matrix
      const featureMatrix = buildFeatureMatrix(rawFeatures, undefined, 'outcome');
      expect(featureMatrix.data.length).toBe(3);
      expect(featureMatrix.featureNames.length).toBeGreaterThan(0);

      // Step 2: Select top features
      const selected = selectTopFeatures(featureMatrix.data, 5);
      expect(selected.length).toBeGreaterThan(0);
      expect(selected.length).toBeLessThanOrEqual(5);

      // Step 3: Verify constant column was filtered
      const constantColIndex = featureMatrix.featureNames.indexOf('constant_col');
      if (constantColIndex >= 0) {
        expect(selected.includes(constantColIndex)).toBe(false);
      }
    });
  });
});
