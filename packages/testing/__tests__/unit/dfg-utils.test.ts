/**
 * Unit tests for DFG utilities
 */

import { describe, it, expect } from 'vitest';
import {
  createDFG,
  createDFGFromEdges,
  compareDFGs,
  areDFGsEquivalent,
  validateDFG,
  validateDFGConsistency,
  computeDFGDensity,
  computeAverageNodeDegree,
  findLongestPath,
  createSequentialTestDFG,
  createParallelTestDFG,
  createChoiceTestDFG,
  createTestEventLogForDFG,
  formatDFG,
  formatDFGComparison,
  serializeDFG,
  deserializeDFG,
  type DFG,
} from '@wasm4pm/testing';

describe('DFG Utilities', () => {
  describe('createDFG', () => {
    it('should create DFG from event log', () => {
      const eventLog = [
        { activities: ['A', 'B', 'C'] },
        { activities: ['A', 'B', 'C'] },
      ];
      const dfg = createDFG(eventLog);

      expect(dfg.nodes).toEqual(['A', 'B', 'C']);
      expect(dfg.edges).toHaveLength(2);
      expect(dfg.edges[0]).toEqual({ source: 'A', target: 'B', count: 2 });
      expect(dfg.edges[1]).toEqual({ source: 'B', target: 'C', count: 2 });
      expect(dfg.startActivities.get('A')).toBe(2);
      expect(dfg.endActivities.get('C')).toBe(2);
    });

    it('should handle empty event log', () => {
      const dfg = createDFG([]);
      expect(dfg.nodes).toEqual([]);
      expect(dfg.edges).toEqual([]);
      expect(dfg.totalEvents).toBe(0);
      expect(dfg.totalTraces).toBe(0);
    });

    it('should count multiple edges correctly', () => {
      const eventLog = [
        { activities: ['A', 'B', 'C'] },
        { activities: ['A', 'C', 'B'] },
      ];
      const dfg = createDFG(eventLog);

      const aToB = dfg.edges.find(e => e.source === 'A' && e.target === 'B');
      const aToC = dfg.edges.find(e => e.source === 'A' && e.target === 'C');
      const bToC = dfg.edges.find(e => e.source === 'B' && e.target === 'C');
      const cToB = dfg.edges.find(e => e.source === 'C' && e.target === 'B');

      expect(aToB?.count).toBe(1);
      expect(aToC?.count).toBe(1);
      expect(bToC?.count).toBe(1);
      expect(cToB?.count).toBe(1);
    });
  });

  describe('createDFGFromEdges', () => {
    it('should create DFG from edge list', () => {
      const dfg = createDFGFromEdges([
        { source: 'A', target: 'B', count: 5 },
        { source: 'B', target: 'C', count: 3 },
      ]);

      expect(dfg.nodes).toEqual(['A', 'B', 'C']);
      expect(dfg.edges).toHaveLength(2);
    });

    it('should merge duplicate edges', () => {
      const dfg = createDFGFromEdges([
        { source: 'A', target: 'B', count: 2 },
        { source: 'A', target: 'B', count: 3 },
      ]);

      const edge = dfg.edges.find(e => e.source === 'A' && e.target === 'B');
      expect(edge?.count).toBe(5);
    });
  });

  describe('compareDFGs', () => {
    it('should detect identical DFGs', () => {
      const dfg1 = createSequentialTestDFG();
      const dfg2 = createSequentialTestDFG();
      const comparison = compareDFGs(dfg1, dfg2);

      expect(comparison.identical).toBe(true);
      expect(comparison.nodeJaccard).toBe(1);
      expect(comparison.edgeJaccard).toBe(1);
    });

    it('should compare different DFGs', () => {
      const dfg1 = createSequentialTestDFG();
      const dfg2 = createParallelTestDFG();
      const comparison = compareDFGs(dfg1, dfg2);

      expect(comparison.identical).toBe(false);
      expect(comparison.nodeJaccard).toBeGreaterThan(0);
      expect(comparison.nodeJaccard).toBeLessThan(1);
    });

    it('should identify missing nodes and edges', () => {
      const dfg1 = createDFGFromEdges([{ source: 'A', target: 'B', count: 1 }]);
      const dfg2 = createDFGFromEdges([{ source: 'A', target: 'C', count: 1 }]);
      const comparison = compareDFGs(dfg1, dfg2);

      expect(comparison.missingInSecond.nodes).toContain('B');
      expect(comparison.missingInFirst.nodes).toContain('C');
    });
  });

  describe('areDFGsEquivalent', () => {
    it('should return true for equivalent DFGs', () => {
      const dfg1 = createSequentialTestDFG();
      const dfg2 = createSequentialTestDFG();
      expect(areDFGsEquivalent(dfg1, dfg2)).toBe(true);
    });

    it('should return false for different DFGs', () => {
      const dfg1 = createSequentialTestDFG();
      const dfg2 = createParallelTestDFG();
      expect(areDFGsEquivalent(dfg1, dfg2)).toBe(false);
    });
  });

  describe('validateDFG', () => {
    it('should validate correct DFG', () => {
      const dfg = createSequentialTestDFG();
      const result = validateDFG(dfg);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject DFG with negative edge counts', () => {
      const dfg = createDFGFromEdges([{ source: 'A', target: 'B', count: -1 }]);
      const result = validateDFG(dfg);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('negative'))).toBe(true);
    });

    it('should reject edges referencing non-existent nodes', () => {
      const dfg: DFG = {
        nodes: ['A'],
        edges: [{ source: 'A', target: 'B', count: 1 }],
        startActivities: new Map(),
        endActivities: new Map(),
        totalEvents: 1,
        totalTraces: 1,
      };
      const result = validateDFG(dfg);
      expect(result.valid).toBe(false);
    });
  });

  describe('validateDFGConsistency', () => {
    it('should validate consistent DFG', () => {
      const eventLog = createTestEventLogForDFG();
      const dfg = createDFG(eventLog);
      const result = validateDFGConsistency(dfg, eventLog);
      expect(result.consistent).toBe(true);
    });

    it('should detect inconsistent totalEvents', () => {
      const eventLog = createTestEventLogForDFG();
      const dfg = createDFG(createTestEventLogForDFG());
      dfg.totalEvents = 999;
      const result = validateDFGConsistency(dfg, eventLog);
      expect(result.consistent).toBe(false);
    });
  });

  describe('computeDFGDensity', () => {
    it('should compute density for sequential DFG', () => {
      const dfg = createSequentialTestDFG();
      const density = computeDFGDensity(dfg);
      // 4 nodes, 16 possible edges, 3 actual edges
      expect(density).toBeCloseTo(3 / 16);
    });

    it('should return 0 for empty DFG', () => {
      const dfg: DFG = {
        nodes: [],
        edges: [],
        startActivities: new Map(),
        endActivities: new Map(),
        totalEvents: 0,
        totalTraces: 0,
      };
      expect(computeDFGDensity(dfg)).toBe(0);
    });
  });

  describe('computeAverageNodeDegree', () => {
    it('should compute average degree', () => {
      const dfg = createSequentialTestDFG();
      const degree = computeAverageNodeDegree(dfg);
      // A: out-degree 1, B: in-degree 1 + out-degree 1 = 2
      // C: in-degree 1 + out-degree 1 = 2, D: in-degree 1
      // Total: 1 + 2 + 2 + 1 = 6, Average: 6/4 = 1.5
      expect(degree).toBeCloseTo(1.5);
    });
  });

  describe('findLongestPath', () => {
    it('should find longest path in sequential DFG', () => {
      const dfg = createSequentialTestDFG();
      const path = findLongestPath(dfg);
      expect(path).toEqual(['A', 'B', 'C', 'D']);
    });

    it('should find longest path in parallel DFG', () => {
      const dfg = createParallelTestDFG();
      const path = findLongestPath(dfg);
      // Should be A -> B -> D -> E or A -> C -> D -> E
      expect(path.length).toBeGreaterThanOrEqual(4);
      expect(path[0]).toBe('A');
      expect(path[path.length - 1]).toBe('E');
    });
  });

  describe('serializeDFG / deserializeDFG', () => {
    it('should round-trip DFG through JSON', () => {
      const original = createSequentialTestDFG();
      const json = serializeDFG(original);
      const restored = deserializeDFG(json);

      expect(restored.nodes).toEqual(original.nodes);
      expect(restored.edges).toEqual(original.edges);
      expect(restored.totalEvents).toBe(original.totalEvents);
    });
  });

  describe('Test Fixtures', () => {
    it('should create valid sequential test DFG', () => {
      const dfg = createSequentialTestDFG();
      expect(validateDFG(dfg).valid).toBe(true);
    });

    it('should create valid parallel test DFG', () => {
      const dfg = createParallelTestDFG();
      expect(validateDFG(dfg).valid).toBe(true);
    });

    it('should create valid choice test DFG', () => {
      const dfg = createChoiceTestDFG();
      expect(validateDFG(dfg).valid).toBe(true);
    });

    it('should create valid test event log', () => {
      const log = createTestEventLogForDFG();
      expect(log.length).toBe(10);
      expect(log[0].activities).toEqual(['A', 'B', 'C', 'D']);
    });
  });

  describe('formatDFG', () => {
    it('should format DFG as readable string', () => {
      const dfg = createSequentialTestDFG();
      const formatted = formatDFG(dfg);
      expect(formatted).toContain('DFG:');
      expect(formatted).toContain('[A, B, C, D]');
      expect(formatted).toContain('A -> B');
    });
  });

  describe('formatDFGComparison', () => {
    it('should format comparison as readable string', () => {
      const dfg1 = createSequentialTestDFG();
      const dfg2 = createSequentialTestDFG();
      const comparison = compareDFGs(dfg1, dfg2);
      const formatted = formatDFGComparison(comparison);
      expect(formatted).toContain('IDENTICAL');
    });
  });
});
