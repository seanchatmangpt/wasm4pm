/**
 * parameter-suggestions-enhanced.test.ts
 *
 * Tests for enhanced ML parameter suggestion system with log characteristics detection.
 * Rank-1 and Rank-2 domain-theory oracles.
 */

import { describe, it, expect } from 'vitest';
import {
  suggestClusteringK,
  suggestPCAComponents,
  suggestAnomalyThreshold,
  detectLogCharacteristics,
  type LogCharacteristicsDetection,
} from '../parameter-suggestions';

describe('LogCharacteristics Detection', () => {
  describe('detectLogCharacteristics — basic detection', () => {
    it('Rank-1: Detects high variance (>70% unique traces)', () => {
      // 100 traces, 75 variants = 75% variant ratio
      const result = detectLogCharacteristics(100, 75, 20, 0.1);
      expect(result.variantRatio).toBe(0.75);
      expect(result.isHighVariance).toBe(true);
    });

    it('Rank-1: Detects low variance (≤70% unique traces)', () => {
      // 100 traces, 50 variants = 50% variant ratio
      const result = detectLogCharacteristics(100, 50, 20, 0.1);
      expect(result.variantRatio).toBe(0.5);
      expect(result.isHighVariance).toBe(false);
    });

    it('Rank-1: Detects high activity (>50 distinct activities)', () => {
      const result = detectLogCharacteristics(100, 50, 60, 0.1);
      expect(result.activityCount).toBe(60);
      expect(result.isHighActivity).toBe(true);
    });

    it('Rank-1: Detects low activity (≤50 distinct activities)', () => {
      const result = detectLogCharacteristics(100, 50, 30, 0.1);
      expect(result.activityCount).toBe(30);
      expect(result.isHighActivity).toBe(false);
    });

    it('Rank-1: Detects noisy logs (>30% estimated noise)', () => {
      const result = detectLogCharacteristics(100, 50, 20, 0.4);
      expect(result.estimatedNoiseLevel).toBe(0.4);
      expect(result.isNoisy).toBe(true);
    });

    it('Rank-1: Detects clean logs (≤30% estimated noise)', () => {
      const result = detectLogCharacteristics(100, 50, 20, 0.2);
      expect(result.estimatedNoiseLevel).toBe(0.2);
      expect(result.isNoisy).toBe(false);
    });

    it('Rank-1: Detects time-trending logs (>30s average trace duration)', () => {
      const result = detectLogCharacteristics(100, 50, 20, 0.1, 35000);
      expect(result.averageTraceLengthMs).toBe(35000);
      expect(result.isTimeTrending).toBe(true);
    });

    it('Rank-1: Handles edge case: zero traces', () => {
      const result = detectLogCharacteristics(0, 0, 0);
      expect(result.variantRatio).toBe(0);
      expect(result.isHighVariance).toBe(false);
    });
  });

  describe('detectLogCharacteristics — real-world scenarios', () => {
    it('Rank-2: BPI Challenge 2013 scenario (medium variance, high activity)', () => {
      // ~7,000 traces, ~2,000 variants, ~25 activities, low noise
      const result = detectLogCharacteristics(7000, 2000, 25, 0.05);
      expect(result.variantRatio).toBeCloseTo(0.286, 2); // ~29% unique
      expect(result.isHighVariance).toBe(false);
      expect(result.isHighActivity).toBe(false);
      expect(result.isNoisy).toBe(false);
    });

    it('Rank-2: Medical IT system scenario (high variance, medium activity, noisy)', () => {
      // ~1,000 traces, ~900 variants, ~40 activities, 35% noise
      const result = detectLogCharacteristics(1000, 900, 40, 0.35);
      expect(result.variantRatio).toBe(0.9);
      expect(result.isHighVariance).toBe(true);
      expect(result.isHighActivity).toBe(false);
      expect(result.isNoisy).toBe(true);
    });

    it('Rank-2: Structured manufacturing scenario (low variance, many activities, clean)', () => {
      // ~5,000 traces, ~100 variants, ~150 activities, 2% noise
      const result = detectLogCharacteristics(5000, 100, 150, 0.02);
      expect(result.variantRatio).toBeCloseTo(0.02, 2);
      expect(result.isHighVariance).toBe(false);
      expect(result.isHighActivity).toBe(true);
      expect(result.isNoisy).toBe(false);
    });
  });
});

describe('Clustering K Parameter Suggestion', () => {
  describe('suggestClusteringK — base elbow heuristic', () => {
    it('Rank-1: Returns minimum 2 for small logs', () => {
      const k = suggestClusteringK(16, 5);
      expect(k).toBeGreaterThanOrEqual(2);
      expect(k).toBeLessThanOrEqual(20);
    });

    it('Rank-1: Formula matches sqrt(n/2) baseline', () => {
      const baseK = suggestClusteringK(100, 15); // sqrt(50) ≈ 7.07
      expect(baseK).toBeCloseTo(7, 0);
    });

    it('Rank-1: Returns maximum 20 for baseline', () => {
      const k = suggestClusteringK(10000, 30);
      expect(k).toBeLessThanOrEqual(20);
    });
  });

  describe('suggestClusteringK — with high-variance logs', () => {
    it('Rank-2: High-variance logs get 20% more clusters (variance multiplier)', () => {
      const baseK = suggestClusteringK(100, 15);
      const variantK = suggestClusteringK(100, 15, { isHighVariance: true });
      expect(variantK).toBeCloseTo(baseK * 1.2, 0);
    });

    it('Rank-2: High-variance refinement still respects max bound', () => {
      // 1000 traces → sqrt(500) ≈ 22.4 → capped at 20 baseline
      // With variance boost: 22.4 * 1.2 ≈ 27 → capped at 20
      const variantK = suggestClusteringK(1000, 30, { isHighVariance: true });
      expect(variantK).toBeLessThanOrEqual(20);
    });
  });

  describe('suggestClusteringK — with noisy logs', () => {
    it('Rank-2: Noisy logs get 10% fewer clusters (noise resistance)', () => {
      const baseK = suggestClusteringK(100, 15);
      const noisyK = suggestClusteringK(100, 15, { isNoisy: true });
      expect(noisyK).toBeCloseTo(baseK * 0.9, 0);
    });

    it('Rank-2: Noise adjustment never drops below 2', () => {
      const noisyK = suggestClusteringK(4, 3, { isNoisy: true }); // very small log
      expect(noisyK).toBeGreaterThanOrEqual(2);
    });
  });

  describe('suggestClusteringK — with high-activity logs', () => {
    it('Rank-2: High-activity logs are capped at 15 (not 20)', () => {
      const baseK = suggestClusteringK(10000, 30);
      const activityK = suggestClusteringK(10000, 60, { isHighActivity: true });
      expect(activityK).toBeLessThanOrEqual(15);
      expect(baseK).toBeLessThanOrEqual(20); // baseline could reach 20
    });

    it('Rank-2: High-activity cap enforces at extreme scales', () => {
      // 100,000 traces, sqrt(50000) ≈ 224, normally capped at 20, but 15 for activity
      const activityK = suggestClusteringK(100000, 100, { isHighActivity: true });
      expect(activityK).toBeLessThanOrEqual(15);
    });
  });

  describe('suggestClusteringK — combined characteristics', () => {
    it('Rank-3: High variance + noisy = +20% * 0.9 = +8%', () => {
      const baseK = suggestClusteringK(100, 15);
      const combinedK = suggestClusteringK(100, 15, {
        isHighVariance: true,
        isNoisy: true,
      });
      // base * 1.2 * 0.9 = base * 1.08
      expect(combinedK).toBeCloseTo(baseK * 1.08, 0);
    });

    it('Rank-3: High activity + variance = variance boost + activity cap', () => {
      // sqrt(50) ≈ 7, * 1.2 = 8.4, capped at 15 for activity
      const k = suggestClusteringK(100, 15, {
        isHighVariance: true,
        isHighActivity: true,
      });
      expect(k).toBeCloseTo(8, 0);
      expect(k).toBeLessThanOrEqual(15);
    });
  });
});

describe('PCA Components Suggestion', () => {
  describe('suggestPCAComponents — base logic', () => {
    it('Rank-1: Retains 95% of features', () => {
      // 0.95 * 8 = 7.6 → ceil = 8
      const components = suggestPCAComponents(8);
      expect(components).toBe(8);
    });

    it('Rank-1: Caps at 10 by default', () => {
      // 0.95 * 100 = 95 → capped at 10
      const components = suggestPCAComponents(100);
      expect(components).toBe(10);
    });

    it('Rank-1: Returns minimum 1', () => {
      const components = suggestPCAComponents(0);
      expect(components).toBe(1);
    });

    it('Rank-1: Rounds up 95% threshold', () => {
      // 0.95 * 12 = 11.4 → ceil = 12, but default cap at 10
      const components = suggestPCAComponents(12);
      expect(components).toBe(10);
    });
  });

  describe('suggestPCAComponents — with high-activity logs', () => {
    it('Rank-2: High-activity logs cap at 15 (not 10)', () => {
      // 0.95 * 20 = 19 → capped at 15 for activity
      const components = suggestPCAComponents(20, { isHighActivity: true });
      expect(components).toBe(15);
    });

    it('Rank-2: High-activity cap is respected at scale', () => {
      const components = suggestPCAComponents(100, { isHighActivity: true });
      expect(components).toBe(15);
    });
  });

  describe('suggestPCAComponents — with high-variance logs', () => {
    it('Rank-2: High-variance logs cap at 12 (between base 10 and activity 15)', () => {
      // 0.95 * 20 = 19 → capped at 12 for variance
      const components = suggestPCAComponents(20, { isHighVariance: true });
      expect(components).toBe(12);
    });
  });

  describe('suggestPCAComponents — with noisy logs', () => {
    it('Rank-2: Noisy logs cap at 8 (most conservative)', () => {
      // 0.95 * 15 = 14.25 → capped at 8 for noise
      const components = suggestPCAComponents(15, { isNoisy: true });
      expect(components).toBe(8);
    });

    it('Rank-2: Noisy cap never drops below 1', () => {
      const components = suggestPCAComponents(1, { isNoisy: true });
      expect(components).toBe(1);
    });
  });
});

describe('Anomaly Threshold Suggestion', () => {
  describe('suggestAnomalyThreshold — base log-size logic', () => {
    it('Rank-1: Small logs (<1K) use threshold 0.6 (sensitive)', () => {
      const threshold = suggestAnomalyThreshold(500);
      expect(threshold).toBe(0.6);
    });

    it('Rank-1: Medium logs (1K-10K) use threshold 0.65', () => {
      const threshold = suggestAnomalyThreshold(5000);
      expect(threshold).toBe(0.65);
    });

    it('Rank-1: Large logs (10K-100K) use threshold 0.7', () => {
      const threshold = suggestAnomalyThreshold(50000);
      expect(threshold).toBe(0.7);
    });

    it('Rank-1: Very large logs (>100K) use threshold 0.75 (conservative)', () => {
      const threshold = suggestAnomalyThreshold(200000);
      expect(threshold).toBe(0.75);
    });

    it('Rank-1: Empty/unknown logs default to 0.65', () => {
      const threshold = suggestAnomalyThreshold(0);
      expect(threshold).toBe(0.65);
    });
  });

  describe('suggestAnomalyThreshold — with noisy logs', () => {
    it('Rank-2: Noisy logs lower threshold by 0.05 (increase sensitivity)', () => {
      const baseThreshold = suggestAnomalyThreshold(5000);
      const noisyThreshold = suggestAnomalyThreshold(5000, { isNoisy: true });
      expect(noisyThreshold).toBe(baseThreshold - 0.05);
      expect(noisyThreshold).toBeCloseTo(0.6, 2);
    });
  });

  describe('suggestAnomalyThreshold — with high-variance logs', () => {
    it('Rank-2: High-variance logs raise threshold by 0.05 (reduce false positives)', () => {
      const baseThreshold = suggestAnomalyThreshold(5000);
      const varianceThreshold = suggestAnomalyThreshold(5000, { isHighVariance: true });
      expect(varianceThreshold).toBe(baseThreshold + 0.05);
      expect(varianceThreshold).toBeCloseTo(0.7, 2);
    });
  });

  describe('suggestAnomalyThreshold — with high-activity logs', () => {
    it('Rank-2: High-activity logs raise threshold by 0.03 (more baseline noise)', () => {
      const baseThreshold = suggestAnomalyThreshold(5000);
      const activityThreshold = suggestAnomalyThreshold(5000, { isHighActivity: true });
      expect(activityThreshold).toBe(baseThreshold + 0.03);
      expect(activityThreshold).toBeCloseTo(0.68, 2);
    });
  });

  describe('suggestAnomalyThreshold — combined characteristics', () => {
    it('Rank-3: Noisy + high-activity = -0.05 + 0.03 = -0.02', () => {
      const baseThreshold = suggestAnomalyThreshold(5000);
      const combinedThreshold = suggestAnomalyThreshold(5000, {
        isNoisy: true,
        isHighActivity: true,
      });
      expect(combinedThreshold).toBe(baseThreshold - 0.02);
      expect(combinedThreshold).toBeCloseTo(0.63, 2);
    });

    it('Rank-3: High-variance + high-activity = +0.05 + 0.03 = +0.08', () => {
      const baseThreshold = suggestAnomalyThreshold(5000);
      const combinedThreshold = suggestAnomalyThreshold(5000, {
        isHighVariance: true,
        isHighActivity: true,
      });
      expect(combinedThreshold).toBeCloseTo(baseThreshold + 0.08, 10);
      expect(combinedThreshold).toBeCloseTo(0.73, 2);
    });
  });

  describe('suggestAnomalyThreshold — boundary clamping', () => {
    it('Rank-2: Result never drops below 0.5', () => {
      // Very small noisy log: 0.6 - 0.05 = 0.55 (OK)
      // But with extreme adjustments, it should clamp at 0.5
      const threshold = suggestAnomalyThreshold(100, { isNoisy: true, isHighVariance: false });
      expect(threshold).toBeGreaterThanOrEqual(0.5);
    });

    it('Rank-2: Result never exceeds 0.85', () => {
      // Very large high-variance high-activity log: 0.75 + 0.05 + 0.03 = 0.83 (OK)
      // But with extreme adjustments, it should clamp at 0.85
      const threshold = suggestAnomalyThreshold(500000, {
        isHighVariance: true,
        isHighActivity: true,
      });
      expect(threshold).toBeLessThanOrEqual(0.85);
    });
  });
});
