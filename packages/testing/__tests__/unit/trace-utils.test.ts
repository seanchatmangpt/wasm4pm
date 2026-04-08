/**
 * Unit tests for trace utilities
 */

import { describe, it, expect } from 'vitest';
import {
  compareTraces,
  areTracesIdentical,
  areTracesPermutation,
  findTracePermutation,
  isTraceComplete,
  validateTraceTimestamps,
  hasDuplicateConsecutiveActivities,
  hasSelfLoops,
  computeTraceStatistics,
  getUniqueActivities,
  computeActivityFrequency,
  findMostCommonVariant,
  createTestTrace,
  createTestTraces,
  formatTrace,
  formatTraceComparison,
  traceToArray,
  arrayToTrace,
  isSubsequence,
  longestCommonSubsequence,
  traceSimilarity,
  type Trace,
} from '@pictl/testing';

describe('Trace Utilities', () => {
  describe('compareTraces', () => {
    it('should detect identical traces', () => {
      const trace1 = ['A', 'B', 'C'];
      const trace2 = ['A', 'B', 'C'];
      const result = compareTraces(trace1, trace2);

      expect(result.equal).toBe(true);
      expect(result.type).toBe('identical');
      expect(result.differences).toHaveLength(0);
    });

    it('should detect permutation', () => {
      const trace1 = ['A', 'B', 'C'];
      const trace2 = ['C', 'B', 'A'];
      const result = compareTraces(trace1, trace2);

      expect(result.equal).toBe(true);
      expect(result.type).toBe('permutation');
    });

    it('should detect different traces', () => {
      const trace1 = ['A', 'B', 'C'];
      const trace2 = ['A', 'B', 'D'];
      const result = compareTraces(trace1, trace2);

      expect(result.equal).toBe(false);
      expect(result.type).toBe('different');
      expect(result.differences.length).toBeGreaterThan(0);
    });

    it('should work with Trace objects', () => {
      const trace1: Trace = { caseId: '1', activities: ['A', 'B'] };
      const trace2: Trace = { caseId: '2', activities: ['A', 'B'] };
      const result = compareTraces(trace1, trace2);

      expect(result.equal).toBe(true);
    });
  });

  describe('areTracesIdentical', () => {
    it('should return true for identical traces', () => {
      expect(areTracesIdentical(['A', 'B'], ['A', 'B'])).toBe(true);
    });

    it('should return false for different order', () => {
      expect(areTracesIdentical(['A', 'B'], ['B', 'A'])).toBe(false);
    });

    it('should return false for permutation', () => {
      expect(areTracesIdentical(['A', 'B', 'C'], ['C', 'B', 'A'])).toBe(false);
    });
  });

  describe('areTracesPermutation', () => {
    it('should return true for permutation', () => {
      expect(areTracesPermutation(['A', 'B', 'C'], ['C', 'B', 'A'])).toBe(true);
    });

    it('should return false for different activities', () => {
      expect(areTracesPermutation(['A', 'B'], ['A', 'C'])).toBe(false);
    });

    it('should return false for different lengths', () => {
      expect(areTracesPermutation(['A', 'B'], ['A', 'B', 'C'])).toBe(false);
    });
  });

  describe('findTracePermutation', () => {
    it('should find permutation sequence', () => {
      const result = findTracePermutation(['A', 'B', 'C'], ['C', 'A', 'B']);

      expect(result.isPermutation).toBe(true);
      expect(result.permutations.length).toBeGreaterThan(0);
    });

    it('should detect non-permutation', () => {
      const result = findTracePermutation(['A', 'B'], ['A', 'C']);

      expect(result.isPermutation).toBe(false);
    });
  });

  describe('isTraceComplete', () => {
    it('should pass complete trace', () => {
      const trace = createTestTrace(['A', 'B', 'C']);
      expect(isTraceComplete(trace)).toBe(true);
    });

    it('should require start activity when specified', () => {
      const trace = createTestTrace(['A', 'B', 'C']);
      expect(isTraceComplete(trace, { requireStart: 'A' })).toBe(true);
      expect(isTraceComplete(trace, { requireStart: 'B' })).toBe(false);
    });

    it('should require end activity when specified', () => {
      const trace = createTestTrace(['A', 'B', 'C']);
      expect(isTraceComplete(trace, { requireEnd: 'C' })).toBe(true);
      expect(isTraceComplete(trace, { requireEnd: 'B' })).toBe(false);
    });

    it('should fail empty trace', () => {
      const trace: Trace = { caseId: 'empty', activities: [] };
      expect(isTraceComplete(trace)).toBe(false);
    });
  });

  describe('validateTraceTimestamps', () => {
    it('should pass valid timestamps', () => {
      const trace = createTestTrace(['A', 'B', 'C']);
      const result = validateTraceTimestamps(trace);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect out-of-order timestamps', () => {
      const trace: Trace = {
        caseId: 'test',
        activities: ['A', 'B'],
        timestamps: ['2026-01-01T10:00:00Z', '2026-01-01T09:00:00Z'],
      };
      const result = validateTraceTimestamps(trace);

      expect(result.valid).toBe(false);
    });

    it('should detect mismatched array lengths', () => {
      const trace: Trace = {
        caseId: 'test',
        activities: ['A', 'B', 'C'],
        timestamps: ['2026-01-01T09:00:00Z'],
      };
      const result = validateTraceTimestamps(trace);

      expect(result.valid).toBe(false);
    });
  });

  describe('hasDuplicateConsecutiveActivities', () => {
    it('should detect consecutive duplicates', () => {
      const trace = createTestTrace(['A', 'A', 'B']);
      const result = hasDuplicateConsecutiveActivities(trace);

      expect(result.hasDuplicates).toBe(true);
      expect(result.positions).toContain(1);
    });

    it('should pass trace without duplicates', () => {
      const trace = createTestTrace(['A', 'B', 'C']);
      const result = hasDuplicateConsecutiveActivities(trace);

      expect(result.hasDuplicates).toBe(false);
    });
  });

  describe('hasSelfLoops', () => {
    it('should detect self-loops', () => {
      const trace = createTestTrace(['A', 'B', 'A', 'C']);
      const result = hasSelfLoops(trace);

      expect(result.hasLoops).toBe(true);
      expect(result.loops.some(l => l.activity === 'A')).toBe(true);
    });

    it('should not detect consecutive duplicates as loops', () => {
      const trace = createTestTrace(['A', 'A', 'B']);
      const result = hasSelfLoops(trace);

      expect(result.hasLoops).toBe(false);
    });
  });

  describe('computeTraceStatistics', () => {
    it('should compute statistics', () => {
      const traces = [
        createTestTrace(['A', 'B']),
        createTestTrace(['A', 'B', 'C']),
        createTestTrace(['A', 'B', 'C', 'D']),
      ];
      const stats = computeTraceStatistics(traces);

      expect(stats.count).toBe(3);
      expect(stats.minLength).toBe(2);
      expect(stats.maxLength).toBe(4);
      expect(stats.avgLength).toBeCloseTo(3);
    });

    it('should handle empty array', () => {
      const stats = computeTraceStatistics([]);

      expect(stats.count).toBe(0);
      expect(stats.minLength).toBe(0);
    });
  });

  describe('getUniqueActivities', () => {
    it('should extract unique activities', () => {
      const traces = [
        createTestTrace(['A', 'B', 'C']),
        createTestTrace(['B', 'C', 'D']),
      ];
      const activities = getUniqueActivities(traces);

      expect(activities).toEqual(['A', 'B', 'C', 'D']);
    });
  });

  describe('computeActivityFrequency', () => {
    it('should count activity occurrences', () => {
      const traces = [
        createTestTrace(['A', 'B']),
        createTestTrace(['A', 'B', 'A']),
      ];
      const frequency = computeActivityFrequency(traces);

      expect(frequency.get('A')).toBe(3);
      expect(frequency.get('B')).toBe(2);
    });
  });

  describe('findMostCommonVariant', () => {
    it('should find most common trace', () => {
      const traces = [
        createTestTrace(['A', 'B', 'C'], 'case-1'),
        createTestTrace(['A', 'B', 'C'], 'case-2'),
        createTestTrace(['A', 'C'], 'case-3'),
      ];
      const result = findMostCommonVariant(traces);

      expect(result).not.toBeNull();
      expect(result?.trace).toEqual(['A', 'B', 'C']);
      expect(result?.count).toBe(2);
    });

    it('should return null for empty array', () => {
      expect(findMostCommonVariant([])).toBeNull();
    });
  });

  describe('isSubsequence', () => {
    it('should detect subsequence', () => {
      expect(isSubsequence(['A', 'B'], ['X', 'A', 'Y', 'B', 'Z'])).toBe(true);
    });

    it('should reject non-subsequence', () => {
      expect(isSubsequence(['A', 'B'], ['B', 'A'])).toBe(false);
    });

    it('should handle empty subsequence', () => {
      expect(isSubsequence([], ['A', 'B', 'C'])).toBe(true);
    });
  });

  describe('longestCommonSubsequence', () => {
    it('should find LCS', () => {
      const lcs = longestCommonSubsequence(['A', 'B', 'C'], ['A', 'C', 'B']);

      // Possible LCS: ['A', 'B'] or ['A', 'C']
      expect(lcs.length).toBeGreaterThanOrEqual(2);
      expect(lcs[0]).toBe('A');
    });

    it('should handle one empty sequence', () => {
      const lcs = longestCommonSubsequence(['A', 'B'], []);
      expect(lcs).toEqual([]);
    });
  });

  describe('traceSimilarity', () => {
    it('should compute similarity based on LCS', () => {
      const sim = traceSimilarity(['A', 'B', 'C'], ['A', 'B', 'C']);
      expect(sim).toBe(1);
    });

    it('should compute similarity for different traces', () => {
      const sim = traceSimilarity(['A', 'B', 'C'], ['A', 'C', 'B']);
      expect(sim).toBeGreaterThan(0);
      expect(sim).toBeLessThan(1);
    });
  });

  describe('traceToArray / arrayToTrace', () => {
    it('should convert trace to array', () => {
      const trace = createTestTrace(['A', 'B']);
      expect(traceToArray(trace)).toEqual(['A', 'B']);
    });

    it('should convert array to trace', () => {
      const trace = arrayToTrace(['A', 'B'], 'test');
      expect(trace.activities).toEqual(['A', 'B']);
      expect(trace.caseId).toBe('test');
    });
  });

  describe('Test Fixtures', () => {
    it('should create test traces', () => {
      const fixtures = createTestTraces();

      expect(fixtures.sequential).toHaveLength(2);
      expect(fixtures.parallel).toHaveLength(2);
      expect(fixtures.choice).toHaveLength(2);
      expect(fixtures.loop).toHaveLength(3);
    });
  });

  describe('formatTrace', () => {
    it('should format trace as readable string', () => {
      const trace = createTestTrace(['A', 'B', 'C'], 'case-1');
      const formatted = formatTrace(trace);

      expect(formatted).toContain('case-1');
      expect(formatted).toContain('A -> B -> C');
    });
  });

  describe('formatTraceComparison', () => {
    it('should format comparison as readable string', () => {
      const comparison = compareTraces(['A', 'B'], ['A', 'C']);
      const formatted = formatTraceComparison(comparison);

      expect(formatted).toContain('DIFFERENT');
    });
  });
});
