import { describe, it, expect } from 'vitest';
import {
  suggestAlgorithm,
  suggestClassificationMethod,
  suggestClusteringMethod,
  suggestRegressionMethod,
  validateAndNormalizeK,
  validateClassificationTarget,
} from '../algorithm-selector';

const smallLog = {
  traceCount: 10,
  eventCount: 50,
  activityCount: 5,
  avgTraceLength: 5,
  maxTraceLength: 10,
};

const largeLog = {
  traceCount: 1000,
  eventCount: 10000,
  activityCount: 50,
  avgTraceLength: 10,
  maxTraceLength: 100,
};

describe('algorithm-selector', () => {
  describe('suggestAlgorithm (unified interface)', () => {
    it('dispatches classify task correctly', () => {
      const rec = suggestAlgorithm('classify', smallLog);
      expect(rec.algorithm).toBe('naive_bayes');
      expect(rec.confidence).toBeGreaterThan(0);
      expect(rec.confidence).toBeLessThanOrEqual(1);
      expect(rec.rationale).toBeTruthy();
    });

    it('dispatches cluster task correctly', () => {
      const rec = suggestAlgorithm('cluster', smallLog);
      expect(rec.algorithm).toBe('kmeans');
      expect(rec.confidence).toBeGreaterThan(0);
    });

    it('dispatches forecast task correctly', () => {
      const rec = suggestAlgorithm('forecast', smallLog);
      expect(rec.algorithm).toBe('linear');
      expect(rec.confidence).toBeGreaterThan(0);
    });

    it('dispatches regress task correctly', () => {
      const rec = suggestAlgorithm('regress', smallLog);
      expect(rec.algorithm).toBe('linear_regression');
      expect(rec.confidence).toBeGreaterThan(0);
    });

    it('dispatches pca task correctly', () => {
      const rec = suggestAlgorithm('pca', smallLog);
      expect(rec.algorithm).toBe('svd');
      expect(rec.confidence).toBeGreaterThan(0);
    });

    it('respects user choice via suggestAlgorithm', () => {
      const rec = suggestAlgorithm('classify', smallLog, 'decision_tree');
      expect(rec.algorithm).toBe('decision_tree');
      expect(rec.confidence).toBe(1.0);
    });

    it('includes confidence score in [0, 1]', () => {
      const tasks: Array<'classify' | 'cluster' | 'forecast' | 'regress' | 'pca'> = [
        'classify',
        'cluster',
        'forecast',
        'regress',
        'pca',
      ];
      tasks.forEach((task) => {
        const rec = suggestAlgorithm(task, smallLog);
        expect(rec.confidence).toBeGreaterThanOrEqual(0);
        expect(rec.confidence).toBeLessThanOrEqual(1);
      });
    });

    it('includes rationale for every recommendation', () => {
      const tasks: Array<'classify' | 'cluster' | 'forecast' | 'regress' | 'pca'> = [
        'classify',
        'cluster',
        'forecast',
        'regress',
        'pca',
      ];
      tasks.forEach((task) => {
        const rec = suggestAlgorithm(task, smallLog);
        expect(rec.rationale).toBeTruthy();
        expect(rec.rationale.length).toBeGreaterThan(0);
      });
    });
  });

  describe('suggestClassificationMethod', () => {
    it('prefers naive_bayes for small logs', () => {
      const result = suggestClassificationMethod(smallLog);
      expect(result).toBe('naive_bayes');
    });

    it('prefers decision_tree for high-cardinality logs', () => {
      const result = suggestClassificationMethod({
        ...smallLog,
        traceCount: 50, // Must be >= 20 and have activityCount > 30
        activityCount: 50,
      });
      expect(result).toBe('decision_tree');
    });

    it('uses knn as default for medium logs', () => {
      const result = suggestClassificationMethod({
        ...smallLog,
        traceCount: 100,
      });
      expect(result).toBe('knn');
    });

    it('respects user choice if valid', () => {
      const result = suggestClassificationMethod(smallLog, 'decision_tree');
      expect(result).toBe('decision_tree');
    });

    it('ignores invalid user choice and uses heuristic', () => {
      const result = suggestClassificationMethod(smallLog, 'invalid-method');
      expect(result).not.toBe('invalid-method');
    });
  });

  describe('suggestClusteringMethod', () => {
    it('returns kmeans for small logs (hierarchical removed)', () => {
      const result = suggestClusteringMethod({
        ...smallLog,
        traceCount: 8,
      });
      // Updated: hierarchical no longer in valid list
      expect(result).toBe('kmeans');
    });

    it('prefers dbscan for sparse high-dimensional data', () => {
      const result = suggestClusteringMethod({
        traceCount: 50,
        eventCount: 200,
        activityCount: 60,
        avgTraceLength: 4,
        maxTraceLength: 20,
      });
      expect(result).toBe('dbscan');
    });

    it('uses kmeans as default', () => {
      const result = suggestClusteringMethod(largeLog);
      expect(result).toBe('kmeans');
    });

    it('respects user choice if valid', () => {
      const result = suggestClusteringMethod(smallLog, 'dbscan');
      expect(result).toBe('dbscan');
    });
  });

  describe('suggestRegressionMethod', () => {
    it('prefers linear_regression for small logs', () => {
      const result = suggestRegressionMethod(smallLog);
      expect(result).toBe('linear_regression');
    });

    it('prefers polynomial_regression for high-variance logs', () => {
      const result = suggestRegressionMethod({
        ...smallLog,
        traceCount: 100,
        avgTraceLength: 150,
      });
      expect(result).toBe('polynomial_regression');
    });

    it('respects user choice', () => {
      const result = suggestRegressionMethod(smallLog, 'exponential_regression');
      expect(result).toBe('exponential_regression');
    });
  });

  describe('validateAndNormalizeK', () => {
    it('uses sqrt(n) heuristic when k undefined', () => {
      const result = validateAndNormalizeK(undefined, 100);
      expect(result).toBe(Math.ceil(Math.sqrt(100))); // 10
    });

    it('clamps k to [1, traceCount]', () => {
      expect(validateAndNormalizeK(0, 100)).toBe(1);
      expect(validateAndNormalizeK(200, 100)).toBe(100);
    });

    it('returns k as-is when valid', () => {
      expect(validateAndNormalizeK(5, 100)).toBe(5);
    });

    it('ensures minimum k=2 when using heuristic', () => {
      const result = validateAndNormalizeK(undefined, 2);
      expect(result).toBeGreaterThanOrEqual(2);
    });
  });

  describe('validateClassificationTarget', () => {
    const availableKeys = ['concept:name', 'lifecycle:transition', 'org:resource'];

    it('accepts valid target key', () => {
      const result = validateClassificationTarget('concept:name', availableKeys);
      expect(result.valid).toBe(true);
    });

    it('rejects missing target key', () => {
      const result = validateClassificationTarget(undefined, availableKeys);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('required');
    });

    it('rejects unavailable target key', () => {
      const result = validateClassificationTarget('missing:key', availableKeys);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('includes available keys in error message', () => {
      const result = validateClassificationTarget('missing:key', availableKeys);
      expect(result.error).toContain('concept:name');
      expect(result.error).toContain('lifecycle:transition');
    });
  });
});
