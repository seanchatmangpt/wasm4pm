/**
 * Tests for DAG utilities
 */

import { describe, it, expect } from 'vitest';
import { topologicalSort, hasCycle, getDependencies, getDependents, validateDAG, type DAG } from '../src/dag';

describe('DAG Utilities', () => {
  describe('hasCycle()', () => {
    it('should detect no cycle in simple DAG', () => {
      const dag: DAG = {
        nodes: ['a', 'b', 'c'],
        edges: [['a', 'b'], ['b', 'c']],
      };

      expect(hasCycle(dag)).toBe(false);
    });

    it('should detect no cycle in empty graph', () => {
      const dag: DAG = {
        nodes: [],
        edges: [],
      };

      expect(hasCycle(dag)).toBe(false);
    });

    it('should detect no cycle in disconnected graph', () => {
      const dag: DAG = {
        nodes: ['a', 'b', 'c', 'd'],
        edges: [['a', 'b'], ['c', 'd']],
      };

      expect(hasCycle(dag)).toBe(false);
    });

    it('should detect simple cycle', () => {
      const dag: DAG = {
        nodes: ['a', 'b', 'c'],
        edges: [['a', 'b'], ['b', 'c'], ['c', 'a']],
      };

      expect(hasCycle(dag)).toBe(true);
    });

    it('should detect self-loop as cycle', () => {
      const dag: DAG = {
        nodes: ['a', 'b'],
        edges: [['a', 'a'], ['a', 'b']],
      };

      expect(hasCycle(dag)).toBe(true);
    });

    it('should detect complex cycle', () => {
      const dag: DAG = {
        nodes: ['a', 'b', 'c', 'd'],
        edges: [['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'b']],
      };

      expect(hasCycle(dag)).toBe(true);
    });

    it('should throw on edge with non-existent node', () => {
      const dag: DAG = {
        nodes: ['a', 'b'],
        edges: [['a', 'c']],
      };

      expect(() => hasCycle(dag)).toThrow();
    });
  });

  describe('topologicalSort()', () => {
    it('should sort simple linear DAG', () => {
      const dag: DAG = {
        nodes: ['a', 'b', 'c'],
        edges: [['a', 'b'], ['b', 'c']],
      };

      const result = topologicalSort(dag);

      expect(result).toEqual(['a', 'b', 'c']);
    });

    it('should sort diamond DAG', () => {
      const dag: DAG = {
        nodes: ['a', 'b', 'c', 'd'],
        edges: [['a', 'b'], ['a', 'c'], ['b', 'd'], ['c', 'd']],
      };

      const result = topologicalSort(dag);

      expect(result[0]).toBe('a');
      expect(result[3]).toBe('d');
      expect(result.indexOf('b')).toBeLessThan(result.indexOf('d'));
      expect(result.indexOf('c')).toBeLessThan(result.indexOf('d'));
    });

    it('should sort empty graph', () => {
      const dag: DAG = {
        nodes: [],
        edges: [],
      };

      const result = topologicalSort(dag);

      expect(result).toEqual([]);
    });

    it('should sort disconnected components', () => {
      const dag: DAG = {
        nodes: ['a', 'b', 'c', 'd'],
        edges: [['a', 'b'], ['c', 'd']],
      };

      const result = topologicalSort(dag);

      expect(result.indexOf('a')).toBeLessThan(result.indexOf('b'));
      expect(result.indexOf('c')).toBeLessThan(result.indexOf('d'));
    });

    it('should throw on cyclic graph', () => {
      const dag: DAG = {
        nodes: ['a', 'b', 'c'],
        edges: [['a', 'b'], ['b', 'c'], ['c', 'a']],
      };

      expect(() => topologicalSort(dag)).toThrow();
    });

    it('should handle single node', () => {
      const dag: DAG = {
        nodes: ['a'],
        edges: [],
      };

      const result = topologicalSort(dag);

      expect(result).toEqual(['a']);
    });
  });

  describe('getDependencies()', () => {
    it('should return direct dependencies', () => {
      const dag: DAG = {
        nodes: ['a', 'b', 'c'],
        edges: [['a', 'b'], ['a', 'c']],
      };

      const deps = getDependencies(dag, 'b');

      expect(deps).toContain('a');
      expect(deps.size).toBe(1);
    });

    it('should return transitive dependencies', () => {
      const dag: DAG = {
        nodes: ['a', 'b', 'c'],
        edges: [['a', 'b'], ['b', 'c']],
      };

      const deps = getDependencies(dag, 'c');

      expect(deps).toContain('a');
      expect(deps).toContain('b');
      expect(deps.size).toBe(2);
    });

    it('should return empty for source node', () => {
      const dag: DAG = {
        nodes: ['a', 'b', 'c'],
        edges: [['a', 'b'], ['b', 'c']],
      };

      const deps = getDependencies(dag, 'a');

      expect(deps.size).toBe(0);
    });

    it('should handle diamond dependencies', () => {
      const dag: DAG = {
        nodes: ['a', 'b', 'c', 'd'],
        edges: [['a', 'b'], ['a', 'c'], ['b', 'd'], ['c', 'd']],
      };

      const deps = getDependencies(dag, 'd');

      expect(deps).toContain('a');
      expect(deps).toContain('b');
      expect(deps).toContain('c');
      expect(deps.size).toBe(3);
    });
  });

  describe('getDependents()', () => {
    it('should return direct dependents', () => {
      const dag: DAG = {
        nodes: ['a', 'b', 'c'],
        edges: [['a', 'b'], ['a', 'c']],
      };

      const deps = getDependents(dag, 'a');

      expect(deps).toContain('b');
      expect(deps).toContain('c');
      expect(deps.size).toBe(2);
    });

    it('should return transitive dependents', () => {
      const dag: DAG = {
        nodes: ['a', 'b', 'c'],
        edges: [['a', 'b'], ['b', 'c']],
      };

      const deps = getDependents(dag, 'a');

      expect(deps).toContain('b');
      expect(deps).toContain('c');
      expect(deps.size).toBe(2);
    });

    it('should return empty for sink node', () => {
      const dag: DAG = {
        nodes: ['a', 'b', 'c'],
        edges: [['a', 'b'], ['b', 'c']],
      };

      const deps = getDependents(dag, 'c');

      expect(deps.size).toBe(0);
    });

    it('should handle diamond dependents', () => {
      const dag: DAG = {
        nodes: ['a', 'b', 'c', 'd'],
        edges: [['a', 'b'], ['a', 'c'], ['b', 'd'], ['c', 'd']],
      };

      const deps = getDependents(dag, 'a');

      expect(deps).toContain('b');
      expect(deps).toContain('c');
      expect(deps).toContain('d');
      expect(deps.size).toBe(3);
    });
  });

  describe('validateDAG()', () => {
    it('should validate correct DAG', () => {
      const dag: DAG = {
        nodes: ['a', 'b', 'c'],
        edges: [['a', 'b'], ['b', 'c']],
      };

      const errors = validateDAG(dag);

      expect(errors).toHaveLength(0);
    });

    it('should catch duplicate nodes', () => {
      const dag: DAG = {
        nodes: ['a', 'b', 'a'],
        edges: [['a', 'b']],
      };

      const errors = validateDAG(dag);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toMatch(/duplicate/i);
    });

    it('should catch non-existent source node', () => {
      const dag: DAG = {
        nodes: ['a', 'b'],
        edges: [['c', 'a']],
      };

      const errors = validateDAG(dag);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toMatch(/non-existent/i);
    });

    it('should catch non-existent target node', () => {
      const dag: DAG = {
        nodes: ['a', 'b'],
        edges: [['a', 'c']],
      };

      const errors = validateDAG(dag);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toMatch(/non-existent/i);
    });

    it('should catch self-loops', () => {
      const dag: DAG = {
        nodes: ['a', 'b'],
        edges: [['a', 'a']],
      };

      const errors = validateDAG(dag);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toMatch(/self-loop/i);
    });

    it('should catch duplicate edges', () => {
      const dag: DAG = {
        nodes: ['a', 'b'],
        edges: [['a', 'b'], ['a', 'b']],
      };

      const errors = validateDAG(dag);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toMatch(/duplicate/i);
    });

    it('should catch cycles', () => {
      const dag: DAG = {
        nodes: ['a', 'b', 'c'],
        edges: [['a', 'b'], ['b', 'c'], ['c', 'a']],
      };

      const errors = validateDAG(dag);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.includes('cycle'))).toBe(true);
    });

    it('should validate empty graph', () => {
      const dag: DAG = {
        nodes: [],
        edges: [],
      };

      const errors = validateDAG(dag);

      expect(errors).toHaveLength(0);
    });
  });
});
