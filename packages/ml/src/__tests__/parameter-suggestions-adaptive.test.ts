/**
 * parameter-suggestions-adaptive.test.ts
 *
 * Tests for adaptive parameter selection functions (Iteration 11b).
 * These functions suggest ML hyperparameters based on data characteristics.
 *
 * Coverage:
 *   - suggestKnnK: adaptive k-NN parameter k
 *   - suggestDecisionTreeDepth: adaptive tree depth
 *   - suggestPolynomialDegree: adaptive polynomial degree
 *   - suggestForecastHorizon: adaptive forecast periods
 */

import { describe, it, expect } from 'vitest';
import {
  suggestKnnK,
  suggestDecisionTreeDepth,
  suggestPolynomialDegree,
  suggestForecastHorizon,
  detectLogCharacteristics,
} from '../parameter-suggestions.js';

describe('suggestKnnK - Adaptive k-NN parameter selection', () => {
  it('small log (<20): returns k=3', () => {
    expect(suggestKnnK(10)).toBe(3);
    expect(suggestKnnK(19)).toBe(3);
  });

  it('medium log (20-100): returns k=5', () => {
    expect(suggestKnnK(20)).toBe(5);
    expect(suggestKnnK(50)).toBe(5);
    expect(suggestKnnK(99)).toBe(5);
  });

  it('large log (>100): returns sqrt(n) capped at 10', () => {
    expect(suggestKnnK(100)).toBe(Math.min(10, Math.ceil(Math.sqrt(100))));
    expect(suggestKnnK(200)).toBe(Math.min(10, Math.ceil(Math.sqrt(200))));
    expect(suggestKnnK(1000)).toBe(10); // sqrt(1000)≈31.6, capped at 10
  });

  it('noisy log: reduces k by 1', () => {
    const base = suggestKnnK(50);
    const noisy = suggestKnnK(50, { isNoisy: true });
    expect(noisy).toBe(Math.max(1, base - 1));
  });

  it('guards: k < n-1 for validity', () => {
    expect(suggestKnnK(2)).toBeLessThan(2);
    expect(suggestKnnK(1)).toBe(1);
  });

  it('edge case: 0 or negative input', () => {
    expect(suggestKnnK(0)).toBe(1);
    expect(suggestKnnK(-5)).toBe(1);
  });
});

describe('suggestDecisionTreeDepth - Adaptive tree depth selection', () => {
  it('returns depth based on min(log2(n), 0.5*d)', () => {
    // 100 samples: log2(100)≈6.6
    // 10 features: 0.5*10 = 5
    // min(6.6, 5) = 5
    expect(suggestDecisionTreeDepth(100, 10)).toBe(5);
  });

  it('small sample, large feature count: clamped to min', () => {
    // 20 samples: log2(20)≈4.3
    // 50 features: 0.5*50 = 25
    // min(4.3, 25) = 4.3, clamped to [2, 10] → 4
    const depth = suggestDecisionTreeDepth(20, 50);
    expect(depth).toBeGreaterThanOrEqual(2);
    expect(depth).toBeLessThanOrEqual(10);
  });

  it('noisy log: reduces depth by 1', () => {
    const base = suggestDecisionTreeDepth(100, 10);
    const noisy = suggestDecisionTreeDepth(100, 10, { isNoisy: true });
    expect(noisy).toBe(Math.max(2, base - 1));
  });

  it('high-variance log: increases depth by 1', () => {
    const base = suggestDecisionTreeDepth(100, 10);
    const variance = suggestDecisionTreeDepth(100, 10, { isHighVariance: true });
    expect(variance).toBe(Math.min(10, base + 1));
  });

  it('always clamps to [2, 10]', () => {
    expect(suggestDecisionTreeDepth(1, 1)).toBeGreaterThanOrEqual(2);
    expect(suggestDecisionTreeDepth(10000, 1000)).toBeLessThanOrEqual(10);
  });

  it('edge case: 0 samples or 0 features', () => {
    const depth = suggestDecisionTreeDepth(0, 10);
    expect(depth).toBeGreaterThanOrEqual(2);
    expect(depth).toBeLessThanOrEqual(10);
  });
});

describe('suggestPolynomialDegree - Adaptive polynomial degree selection', () => {
  it('small feature count: returns low degree', () => {
    // 0.1 * 5 = 0.5 → ceil(max(1, 0.5)) = 1
    expect(suggestPolynomialDegree(5, 20)).toBe(1);
  });

  it('medium feature count: returns degree ~2', () => {
    // 0.1 * 20 = 2
    expect(suggestPolynomialDegree(20, 100)).toBe(2);
  });

  it('large feature count: capped at degree 3', () => {
    // 0.1 * 50 = 5, capped at 3
    expect(suggestPolynomialDegree(50, 100)).toBe(3);
  });

  it('guards: degree <= n-1 to avoid underdetermined system', () => {
    // degree should not exceed traceCount - 1
    const degree = suggestPolynomialDegree(100, 5);
    expect(degree).toBeLessThanOrEqual(4);
  });

  it('always returns [1, 3]', () => {
    expect(suggestPolynomialDegree(0, 0)).toBe(1);
    expect(suggestPolynomialDegree(1000, 1000)).toBe(3);
  });
});

describe('suggestForecastHorizon - Adaptive forecast periods selection', () => {
  it('small window count: returns at least 1', () => {
    expect(suggestForecastHorizon(5)).toBe(1);
  });

  it('medium window count: returns ~20% of windows', () => {
    // 0.2 * 10 = 2
    expect(suggestForecastHorizon(10)).toBe(2);
    // 0.2 * 50 = 10
    expect(suggestForecastHorizon(50)).toBe(10);
  });

  it('horizon capped at 50% of window count', () => {
    // Large window count: 0.2 * 1000 = 200, but capped at 0.5 * 1000 = 500
    const horizon = suggestForecastHorizon(1000);
    expect(horizon).toBeLessThanOrEqual(500);
  });

  it('edge case: 0 or negative window count', () => {
    expect(suggestForecastHorizon(0)).toBe(1);
    expect(suggestForecastHorizon(-10)).toBe(1);
  });
});

describe('Parameter suggestion integration - realistic scenarios', () => {
  it('small noisy log: conservative parameters', () => {
    const k = suggestKnnK(15, { isNoisy: true });
    const depth = suggestDecisionTreeDepth(15, 8, { isNoisy: true });
    // Conservative: lower k, shallower tree
    expect(k).toBeLessThanOrEqual(4);
    expect(depth).toBeLessThanOrEqual(5);
  });

  it('large high-variance log: aggressive parameters', () => {
    const k = suggestKnnK(500, { isHighVariance: true });
    const depth = suggestDecisionTreeDepth(500, 20, { isHighVariance: true });
    // Aggressive: larger k (up to 10), deeper tree
    expect(k).toBeLessThanOrEqual(10);
    expect(depth).toBeGreaterThan(4);
  });

  it('forecasting with medium drift series', () => {
    const horizon = suggestForecastHorizon(25);
    // 0.2 * 25 = 5 periods
    expect(horizon).toBe(5);
  });

  it('regression on small feature set', () => {
    const degree = suggestPolynomialDegree(3, 50);
    // 0.1 * 3 = 0.3 → 1, but guard against n-1=49
    expect(degree).toBe(1);
  });
});
