/**
 * gap-fixes.test.ts
 * Tests for AutoML gap fixes
 */
import { describe, it, expect } from 'vitest';
import {
  suggestClassificationAlgorithm,
  normalizeFeatures,
} from '../index.js';

describe('FIX-1: suggestClassificationAlgorithm', () => {
  it('prefers kNN for small datasets', () => {
    const algo = suggestClassificationAlgorithm(20, 6, 0.8);
    expect(algo).toBe('knn');
  });

  it('prefers logistic_regression for large dataset + good features', () => {
    const algo = suggestClassificationAlgorithm(500, 12, 0.85);
    expect(algo).toBe('logistic_regression');
  });
});

describe('FIX-2: normalizeFeatures', () => {
  it('normalizes to [0,1] range', () => {
    const data = [[0, 10], [5, 20], [10, 30]];
    const normalized = normalizeFeatures(data);
    expect(normalized[0][0]).toBeCloseTo(0, 6);
    expect(normalized[1][0]).toBeCloseTo(0.5, 6);
    expect(normalized[2][0]).toBeCloseTo(1, 6);
  });

  it('handles zero-variance columns', () => {
    const data = [[1, 5], [1, 10], [1, 15]];
    const normalized = normalizeFeatures(data);
    expect(normalized[0][0]).toBeCloseTo(0.5, 6);
  });
});
