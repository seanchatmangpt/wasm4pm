/**
 * Feature importance ranking tests for Cycle 42.
 *
 * Validates:
 *   - Importance scores are computed correctly per method
 *   - Top/bottom features are identified accurately
 *   - Importance determinism (same data → same rankings)
 *   - Edge cases (all zeros, single feature, uniform data)
 */

import { describe, it, expect } from 'vitest';
import {
  rankFeatureImportance,
  computeCorrelationImportance,
  computeMutualInformationImportance,
  type FeatureImportanceResult,
} from '../feature-importance.js';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const SYNTHETIC_DATA = [
  [1, 5, 100], // Feature 0: low, Feature 1: high, Feature 2: very high
  [2, 6, 110],
  [3, 7, 105],
  [4, 8, 115],
  [5, 9, 120],
  [10, 5, 50], // Feature 0: high, Feature 1: low, Feature 2: low
  [11, 4, 45],
  [12, 3, 55],
  [13, 2, 48],
  [14, 1, 52],
];

const TARGETS = [0, 0, 0, 0, 0, 1, 1, 1, 1, 1]; // Clear class separation

const FEATURE_NAMES = ['activity_count', 'rework_ratio', 'elapsed_time'];

describe('Feature Importance Ranking', () => {
  describe('Correlation-based importance', () => {
    it('computes importance scores in [0, 1]', () => {
      const result = rankFeatureImportance(SYNTHETIC_DATA, TARGETS, FEATURE_NAMES, 'correlation');

      for (const fi of result.importances) {
        expect(fi.importance).toBeGreaterThanOrEqual(0);
        expect(fi.importance).toBeLessThanOrEqual(1);
      }
    });

    it('ranks features by importance (highest first)', () => {
      const result = rankFeatureImportance(SYNTHETIC_DATA, TARGETS, FEATURE_NAMES, 'correlation');

      // Features should be sorted descending
      for (let i = 0; i < result.importances.length - 1; i++) {
        expect(result.importances[i].importance).toBeGreaterThanOrEqual(
          result.importances[i + 1].importance
        );
      }
    });

    it('assigns correct ranks (1, 2, 3, ...)', () => {
      const result = rankFeatureImportance(SYNTHETIC_DATA, TARGETS, FEATURE_NAMES, 'correlation');

      for (let i = 0; i < result.importances.length; i++) {
        expect(result.importances[i].rank).toBe(i + 1);
      }
    });

    it('populates top features (up to 3)', () => {
      const result = rankFeatureImportance(SYNTHETIC_DATA, TARGETS, FEATURE_NAMES, 'correlation');

      expect(result.topFeatures.length).toBeLessThanOrEqual(3);
      if (result.topFeatures.length > 0) {
        expect(result.topFeatures[0].rank).toBe(1);
      }
    });

    it('populates bottom features (up to 3)', () => {
      const result = rankFeatureImportance(SYNTHETIC_DATA, TARGETS, FEATURE_NAMES, 'correlation');

      expect(result.bottomFeatures.length).toBeLessThanOrEqual(3);
      if (result.bottomFeatures.length > 0) {
        // bottomFeatures is reversed, so first element is the least important
        expect(result.bottomFeatures[0].rank).toBe(
          result.importances.length
        );
      }
    });
  });

  describe('Mutual information importance', () => {
    it('computes MI importance scores in [0, 1]', () => {
      const result = rankFeatureImportance(SYNTHETIC_DATA, TARGETS, FEATURE_NAMES, 'mutual_information');

      for (const fi of result.importances) {
        expect(fi.importance).toBeGreaterThanOrEqual(0);
        expect(fi.importance).toBeLessThanOrEqual(1);
      }
    });

    it('identifies feature correlations via mutual information', () => {
      const result = rankFeatureImportance(SYNTHETIC_DATA, TARGETS, FEATURE_NAMES, 'mutual_information');

      // At least one feature should have non-zero MI (data is not random)
      const hasNonZeroMI = result.importances.some((fi) => fi.importance > 0.01);
      expect(hasNonZeroMI).toBe(true);
    });

    it('returns method=mutual_information in result', () => {
      const result = rankFeatureImportance(SYNTHETIC_DATA, TARGETS, FEATURE_NAMES, 'mutual_information');

      expect(result.method).toBe('mutual_information');
    });
  });

  describe('Determinism (Rank-1 oracle: same input → same ranking)', () => {
    it('produces same rankings on repeated calls (correlation)', () => {
      const result1 = rankFeatureImportance(SYNTHETIC_DATA, TARGETS, FEATURE_NAMES, 'correlation');
      const result2 = rankFeatureImportance(SYNTHETIC_DATA, TARGETS, FEATURE_NAMES, 'correlation');

      // Compare importances (should be identical)
      expect(result1.importances.length).toBe(result2.importances.length);
      for (let i = 0; i < result1.importances.length; i++) {
        expect(result1.importances[i].feature).toBe(result2.importances[i].feature);
        expect(result1.importances[i].importance).toBeCloseTo(result2.importances[i].importance, 6);
        expect(result1.importances[i].rank).toBe(result2.importances[i].rank);
      }
    });

    it('produces same rankings on repeated calls (MI)', () => {
      const result1 = rankFeatureImportance(SYNTHETIC_DATA, TARGETS, FEATURE_NAMES, 'mutual_information');
      const result2 = rankFeatureImportance(SYNTHETIC_DATA, TARGETS, FEATURE_NAMES, 'mutual_information');

      expect(result1.importances.length).toBe(result2.importances.length);
      for (let i = 0; i < result1.importances.length; i++) {
        expect(result1.importances[i].feature).toBe(result2.importances[i].feature);
        expect(result1.importances[i].importance).toBeCloseTo(result2.importances[i].importance, 6);
      }
    });
  });

  describe('Edge cases', () => {
    it('handles constant feature (zero variance)', () => {
      const dataWithConstant = SYNTHETIC_DATA.map((row) => [row[0], 0, row[2]]); // Middle feature is all 0s
      const result = rankFeatureImportance(dataWithConstant, TARGETS, FEATURE_NAMES, 'correlation');

      // Constant feature should have lowest importance
      const constantFeature = result.importances.find((fi) => fi.feature === 'rework_ratio');
      expect(constantFeature).toBeDefined();
      expect(constantFeature!.importance).toBeLessThanOrEqual(0.01); // Very low or zero
    });

    it('handles single feature', () => {
      const singleFeature = SYNTHETIC_DATA.map((row) => [row[0]]);
      const singleName = ['only_feature'];
      const result = rankFeatureImportance(singleFeature, TARGETS, singleName, 'correlation');

      expect(result.importances.length).toBe(1);
      expect(result.importances[0].feature).toBe('only_feature');
      expect(result.importances[0].rank).toBe(1);
    });

    it('handles small dataset (n < 5)', () => {
      const smallData = SYNTHETIC_DATA.slice(0, 3);
      const smallTargets = TARGETS.slice(0, 3);
      const result = rankFeatureImportance(smallData, smallTargets, FEATURE_NAMES, 'correlation');

      expect(result.importances.length).toBe(3);
      for (const fi of result.importances) {
        expect(fi.importance).toBeGreaterThanOrEqual(0);
        expect(fi.importance).toBeLessThanOrEqual(1);
      }
    });

    it('handles continuous targets (regression)', () => {
      const continuousTargets = [1.5, 2.1, 1.9, 3.2, 2.8, 5.1, 5.5, 4.9, 6.1, 5.8];
      const result = rankFeatureImportance(SYNTHETIC_DATA, continuousTargets, FEATURE_NAMES, 'mutual_information');

      expect(result.importances.length).toBe(3);
      for (const fi of result.importances) {
        expect(Number.isFinite(fi.importance)).toBe(true);
      }
    });
  });

  describe('Total variance tracking', () => {
    it('computes totalVariance as sum of all importances', () => {
      const result = rankFeatureImportance(SYNTHETIC_DATA, TARGETS, FEATURE_NAMES, 'correlation');

      const sumImportances = result.importances.reduce((sum, fi) => sum + fi.importance, 0);
      expect(result.totalVariance).toBeCloseTo(sumImportances, 6);
    });

    it('totalVariance is non-negative', () => {
      const result = rankFeatureImportance(SYNTHETIC_DATA, TARGETS, FEATURE_NAMES, 'mutual_information');

      expect(result.totalVariance).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Feature name preservation', () => {
    it('preserves feature names in importances', () => {
      const result = rankFeatureImportance(SYNTHETIC_DATA, TARGETS, FEATURE_NAMES, 'correlation');

      const resultNames = result.importances.map((fi) => fi.feature);
      expect(resultNames).toEqual(expect.arrayContaining(FEATURE_NAMES));
    });

    it('top features include feature names', () => {
      const result = rankFeatureImportance(SYNTHETIC_DATA, TARGETS, FEATURE_NAMES, 'correlation');

      if (result.topFeatures.length > 0) {
        expect(result.topFeatures[0].feature).toBeDefined();
        expect(FEATURE_NAMES).toContain(result.topFeatures[0].feature);
      }
    });
  });

  describe('Method field in result', () => {
    it('sets method=correlation when requested', () => {
      const result = rankFeatureImportance(SYNTHETIC_DATA, TARGETS, FEATURE_NAMES, 'correlation');
      expect(result.method).toBe('correlation');
    });

    it('sets method=mutual_information when requested', () => {
      const result = rankFeatureImportance(SYNTHETIC_DATA, TARGETS, FEATURE_NAMES, 'mutual_information');
      expect(result.method).toBe('mutual_information');
    });

    it('defaults to correlation when method not specified', () => {
      const result = rankFeatureImportance(SYNTHETIC_DATA, TARGETS, FEATURE_NAMES);
      expect(result.method).toBe('correlation');
    });
  });
});
