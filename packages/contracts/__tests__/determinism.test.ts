/**
 * Determinism tests — same input → same hash, always
 */
import { describe, it, expect } from 'vitest';
import { normalizeForHashing, hashData, hashConfig } from '../src/hash';
import { normalizePlan, sortNodes, sortEdges, type Plan, type PlanNode, type PlanEdge } from '../src/plan';

describe('BLAKE3 hashing determinism', () => {
  it('hashData produces identical hash for identical objects', () => {
    const obj = { algorithm: 'alpha', threshold: 0.5, filters: ['a', 'b'] };
    const h1 = hashData(obj);
    const h2 = hashData(obj);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('hashData produces identical hash regardless of key order', () => {
    const a = { z: 1, a: 2, m: 3 };
    const b = { a: 2, m: 3, z: 1 };
    expect(hashData(a)).toBe(hashData(b));
  });

  it('hashConfig produces identical hash for nested objects with different key order', () => {
    const config1 = { source: { path: '/data.xes', format: 'xes' }, algorithm: 'alpha' };
    const config2 = { algorithm: 'alpha', source: { format: 'xes', path: '/data.xes' } };
    expect(hashConfig(config1)).toBe(hashConfig(config2));
  });

  it('hashData produces different hash for different values', () => {
    const a = { value: 1 };
    const b = { value: 2 };
    expect(hashData(a)).not.toBe(hashData(b));
  });

  it('hashData is deterministic across 100 iterations', () => {
    const data = { traces: [1, 2, 3], config: { nested: { deep: true } } };
    const reference = hashData(data);
    for (let i = 0; i < 100; i++) {
      expect(hashData(data)).toBe(reference);
    }
  });
});

describe('normalizeForHashing determinism', () => {
  it('sorts keys recursively', () => {
    const input = { c: { z: 1, a: 2 }, a: 1, b: [3, 2, 1] };
    const normalized = normalizeForHashing(input);
    const parsed = JSON.parse(normalized);
    expect(Object.keys(parsed)).toEqual(['a', 'b', 'c']);
    expect(Object.keys(parsed.c)).toEqual(['a', 'z']);
  });

  it('preserves array order (arrays are not sorted)', () => {
    const input = { items: [3, 1, 2] };
    const normalized = normalizeForHashing(input);
    expect(JSON.parse(normalized).items).toEqual([3, 1, 2]);
  });

  it('handles null and primitive values', () => {
    expect(normalizeForHashing(null)).toBe('null');
    expect(normalizeForHashing(42)).toBe('42');
    expect(normalizeForHashing('hello')).toBe('"hello"');
  });
});

describe('Plan normalization determinism', () => {
  const makeNode = (id: string, kind: 'source' | 'algorithm' | 'sink'): PlanNode => ({
    id,
    kind,
    label: `Node ${id}`,
    config: {},
    version: '1.0.0',
  });

  const basePlan: Plan = {
    schema_version: '1.0',
    plan_id: 'test-plan',
    created_at: '2026-04-04T00:00:00Z',
    nodes: [
      makeNode('sink-1', 'sink'),
      makeNode('algo-1', 'algorithm'),
      makeNode('src-1', 'source'),
    ],
    edges: [
      { from: 'algo-1', to: 'sink-1' },
      { from: 'src-1', to: 'algo-1' },
    ],
    metadata: {
      planner: 'test',
      planner_version: '1.0.0',
    },
  };

  it('sortNodes sorts by id', () => {
    const sorted = sortNodes(basePlan.nodes);
    expect(sorted.map((n) => n.id)).toEqual(['algo-1', 'sink-1', 'src-1']);
  });

  it('sortEdges sorts by (from, to)', () => {
    const sorted = sortEdges(basePlan.edges);
    expect(sorted).toEqual([
      { from: 'algo-1', to: 'sink-1' },
      { from: 'src-1', to: 'algo-1' },
    ]);
  });

  it('normalizePlan produces identical output for differently-ordered inputs', () => {
    const plan1 = { ...basePlan };
    const plan2: Plan = {
      ...basePlan,
      nodes: [...basePlan.nodes].reverse(),
      edges: [...basePlan.edges].reverse(),
    };

    const norm1 = normalizePlan(plan1);
    const norm2 = normalizePlan(plan2);

    expect(JSON.stringify(norm1)).toBe(JSON.stringify(norm2));
  });

  it('normalizePlan sorts config keys within nodes', () => {
    const plan: Plan = {
      ...basePlan,
      nodes: [
        { ...makeNode('src-1', 'source'), config: { z_param: 1, a_param: 2 } },
        makeNode('algo-1', 'algorithm'),
        makeNode('sink-1', 'sink'),
      ],
    };

    const normalized = normalizePlan(plan);
    const srcNode = normalized.nodes.find((n) => n.id === 'src-1')!;
    expect(Object.keys(srcNode.config)).toEqual(['a_param', 'z_param']);
  });

  it('normalized plan hashes identically regardless of input order', () => {
    const plan1 = normalizePlan(basePlan);
    const plan2 = normalizePlan({
      ...basePlan,
      nodes: [...basePlan.nodes].reverse(),
      edges: [...basePlan.edges].reverse(),
    });

    expect(hashData(plan1)).toBe(hashData(plan2));
  });
});
