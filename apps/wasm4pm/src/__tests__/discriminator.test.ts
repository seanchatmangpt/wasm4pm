/**
 * Discriminator unit tests — Rank 1 oracle.
 *
 * The discriminator is a pure function over discovery payloads. The oracle is
 * mathematical: each known discovery shape has a closed-form classification,
 * unknown shapes must throw DiscoveryShapeError. No WASM is involved.
 */
import { describe, it, expect } from 'vitest';
import {
  discriminate,
  toUniformStats,
  DiscoveryShapeError,
  type DiscoveryShape,
} from '../discriminator.js';

describe('discriminator — Rank 1 (mathematical oracle)', () => {
  it("classifies inductive miner output (root + nodes:number) as kind='tree' with matching nodeCount", () => {
    const raw = {
      root: { type: 'sequence', children: [] },
      nodes: 7,
      handle: 'tree_h',
    };
    const shape = discriminate(raw, 'inductive');
    expect(shape.kind).toBe('tree');
    if (shape.kind === 'tree') {
      expect(shape.nodeCount).toBe(7);
      expect(shape.root).toBe('sequence');
    }
  });

  it("classifies DFG payload (parallel nodes/edges arrays) as kind='dfg'", () => {
    const raw = {
      nodes: [{ id: 'A' }, { id: 'B' }, { id: 'C' }],
      edges: [
        { from: 'A', to: 'B', count: 2 },
        { from: 'B', to: 'C', count: 1 },
      ],
    };
    const shape = discriminate(raw, 'dfg');
    expect(shape.kind).toBe('dfg');
    if (shape.kind === 'dfg') {
      expect(shape.nodes).toBe(3);
      expect(shape.edges).toBe(2);
    }
  });

  it("classifies Petri net (places + transitions arrays) as kind='petrinet' with arc count", () => {
    const raw = {
      places: [{ id: 'p1' }, { id: 'p2' }],
      transitions: [{ id: 't1' }, { id: 't2' }, { id: 't3' }],
      arcs: [
        { from: 'p1', to: 't1' },
        { from: 't1', to: 'p2' },
      ],
    };
    const shape = discriminate(raw, 'ilp');
    expect(shape.kind).toBe('petrinet');
    if (shape.kind === 'petrinet') {
      expect(shape.places).toBe(2);
      expect(shape.transitions).toBe(3);
      expect(shape.arcs).toBe(2);
    }
  });

  it("classifies Declare model (constraints array) as kind='declare'", () => {
    const raw = {
      constraints: [
        { template: 'response', a: 'A', b: 'B' },
        { template: 'precedence', a: 'C', b: 'D' },
        { template: 'exists', a: 'E' },
      ],
    };
    const shape = discriminate(raw, 'declare');
    expect(shape.kind).toBe('declare');
    if (shape.kind === 'declare') {
      expect(shape.constraints).toBe(3);
    }
  });

  it('throws DiscoveryShapeError naming the algorithm and listing keys for unknown shape', () => {
    const raw = { foo: 1, bar: 2 };
    let thrown: unknown = null;
    try {
      discriminate(raw, 'mystery_algo');
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(DiscoveryShapeError);
    if (thrown instanceof DiscoveryShapeError) {
      expect(thrown.algorithm).toBe('mystery_algo');
      expect(thrown.keys.sort()).toEqual(['bar', 'foo']);
    }
  });

  it('parses JSON-string input before discrimination (DFG case)', () => {
    const json = JSON.stringify({
      nodes: [{ id: 'A' }],
      edges: [],
    });
    const shape = discriminate(json, 'dfg');
    expect(shape.kind).toBe('dfg');
    if (shape.kind === 'dfg') {
      expect(shape.nodes).toBe(1);
      expect(shape.edges).toBe(0);
    }
  });

  it('throws DiscoveryShapeError when given malformed JSON', () => {
    expect(() => discriminate('{not-json', 'dfg')).toThrow(DiscoveryShapeError);
  });

  it('throws DiscoveryShapeError when given a non-object primitive', () => {
    expect(() => discriminate(42, 'dfg')).toThrow(DiscoveryShapeError);
    expect(() => discriminate(null, 'dfg')).toThrow(DiscoveryShapeError);
  });

  it('toUniformStats projects each shape kind to {nodes, edges} consistently', () => {
    const dfg: DiscoveryShape = { kind: 'dfg', nodes: 5, edges: 9, raw: {} };
    expect(toUniformStats(dfg)).toEqual({ nodes: 5, edges: 9 });

    const pn: DiscoveryShape = {
      kind: 'petrinet',
      places: 3,
      transitions: 4,
      arcs: 8,
      raw: {},
    };
    expect(toUniformStats(pn)).toEqual({ nodes: 7, edges: 8 });

    const tree: DiscoveryShape = { kind: 'tree', nodeCount: 11, root: 'sequence', raw: {} };
    expect(toUniformStats(tree)).toEqual({ nodes: 11, edges: 0 });

    const declare: DiscoveryShape = { kind: 'declare', constraints: 6, raw: {} };
    expect(toUniformStats(declare)).toEqual({ nodes: 0, edges: 6 });
  });

  it('prefers Petri net over DFG when payload has both places and nodes/edges (specific > general)', () => {
    // A Petri net with a parallel node/edge visualisation must NOT be misclassified
    // as a DFG. Detection order: petrinet checked before dfg.
    const raw = {
      places: [{ id: 'p1' }],
      transitions: [{ id: 't1' }],
      arcs: [],
      nodes: [{ id: 'p1' }, { id: 't1' }],
      edges: [],
    };
    const shape = discriminate(raw, 'ilp');
    expect(shape.kind).toBe('petrinet');
  });

  it("prefers tree over DFG when 'nodes' is a number (inductive miner shape)", () => {
    // The inductive miner emits `nodes: <number>` alongside edges. Without a
    // specific check, this would mismatch the DFG branch (which expects an array).
    const raw = {
      root: { type: 'xor' },
      nodes: 3,
      edges: [],
    };
    const shape = discriminate(raw, 'inductive');
    expect(shape.kind).toBe('tree');
  });
});
