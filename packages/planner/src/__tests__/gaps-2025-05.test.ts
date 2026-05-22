/**
 * Gap-closure tests for @wasm4pm/planner — 2026-05-17
 *
 * Three concrete gaps found during audit of explain-parity, profile-policy,
 * and plan DAG validation coverage:
 *
 *   GAP-1  validateDAG() did not detect orphan nodes (nodes with no incoming
 *          AND no outgoing edges in a multi-node graph).
 *
 *   GAP-2  selectAlgorithmByBudget() fell through to `['dfg']` for
 *          (low_ms, quality), (low_ms, research), (sub_ms, quality), and
 *          (sub_ms, research) — combinations missing from the decision table.
 *          Returning dfg for a quality/research floor is a silent contradiction.
 *
 *   GAP-3  validatePlan() did not detect orphan nodes in the plan graph —
 *          a step that existed in graph.nodes but had no edges connecting it
 *          to the rest of the DAG passed validation with zero errors.
 *
 * Oracle rank: 1 (mathematical/structural) for DAG properties;
 *              2 (domain contract) for budget decision table.
 */

import { describe, it, expect } from 'vitest';
import { plan, type Config, type ExecutionPlan } from '../planner.js';
import { validateDAG, type DAG } from '../dag.js';
import { validatePlan, assertPlanValid } from '../validation.js';
import { selectAlgorithmByBudget } from '../policy.js';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    version: '1.0',
    source: { format: 'xes' },
    execution: { profile: 'fast' },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// GAP-1: validateDAG() — orphan node detection (Rank 1 — structural)
// ---------------------------------------------------------------------------

describe('GAP-1: validateDAG() — orphan node detection', () => {
  it('returns an error when a multi-node DAG contains an orphan node (no edges)', () => {
    const dag: DAG = {
      nodes: ['bootstrap', 'orphan', 'cleanup'],
      edges: [['bootstrap', 'cleanup']], // 'orphan' has no edges at all
    };
    const errors = validateDAG(dag);
    expect(errors.length).toBeGreaterThan(0);
    const orphanError = errors.find((e) => e.includes('orphan') && e.includes('Orphan'));
    expect(orphanError).toBeDefined();
  });

  it('does not flag an orphan when every node participates in at least one edge', () => {
    const dag: DAG = {
      nodes: ['bootstrap', 'mid', 'cleanup'],
      edges: [
        ['bootstrap', 'mid'],
        ['mid', 'cleanup'],
      ],
    };
    const errors = validateDAG(dag);
    expect(errors.filter((e) => e.includes('Orphan'))).toHaveLength(0);
  });

  it('does not flag an orphan for a single-node DAG with no edges (trivially valid)', () => {
    const dag: DAG = {
      nodes: ['bootstrap'],
      edges: [],
    };
    const errors = validateDAG(dag);
    expect(errors.filter((e) => e.includes('Orphan'))).toHaveLength(0);
  });

  it('flags every orphan when multiple disconnected nodes exist', () => {
    const dag: DAG = {
      nodes: ['bootstrap', 'orphan_a', 'orphan_b', 'cleanup'],
      edges: [['bootstrap', 'cleanup']],
    };
    const errors = validateDAG(dag);
    const orphanErrors = errors.filter((e) => e.includes('Orphan'));
    // Both orphan_a and orphan_b should be reported
    expect(orphanErrors.length).toBe(2);
  });

  it('a node that is only a source (outgoing edge only) is NOT an orphan', () => {
    const dag: DAG = {
      nodes: ['source_only', 'target'],
      edges: [['source_only', 'target']],
    };
    const errors = validateDAG(dag);
    expect(errors.filter((e) => e.includes('Orphan'))).toHaveLength(0);
  });

  it('a node that is only a target (incoming edge only) is NOT an orphan', () => {
    const dag: DAG = {
      nodes: ['source', 'target_only'],
      edges: [['source', 'target_only']],
    };
    const errors = validateDAG(dag);
    expect(errors.filter((e) => e.includes('Orphan'))).toHaveLength(0);
  });

  it('real plan DAGs pass orphan detection (all nodes have at least one edge)', () => {
    for (const profile of ['fast', 'balanced', 'quality', 'stream']) {
      const p = plan(makeConfig({ execution: { profile } }));
      const errors = validateDAG(p.graph);
      const orphanErrors = errors.filter((e) => e.includes('Orphan'));
      expect(
        orphanErrors,
        `profile="${profile}" plan has orphan nodes: ${orphanErrors.join('; ')}`
      ).toHaveLength(0);
    }
  });
});

// ---------------------------------------------------------------------------
// GAP-2: selectAlgorithmByBudget() — missing decision table rows (Rank 2)
// ---------------------------------------------------------------------------

describe('GAP-2: selectAlgorithmByBudget() — previously missing decision table combinations', () => {
  it('(sub_ms, quality) returns a non-empty array (latency constraint wins over quality floor)', () => {
    const result = selectAlgorithmByBudget('sub_ms', 'quality');
    expect(result.length).toBeGreaterThan(0);
  });

  it('(sub_ms, quality) returns DFG-class algorithms (latency wins at sub_ms)', () => {
    const result = selectAlgorithmByBudget('sub_ms', 'quality');
    // At sub_ms the only realistic algorithms are dfg and simd_streaming_dfg
    const allAreFast = result.every((id) => ['dfg', 'simd_streaming_dfg'].includes(id));
    expect(allAreFast).toBe(true);
  });

  it('(sub_ms, research) returns a non-empty array', () => {
    const result = selectAlgorithmByBudget('sub_ms', 'research');
    expect(result.length).toBeGreaterThan(0);
  });

  it('(low_ms, quality) returns a non-empty array', () => {
    const result = selectAlgorithmByBudget('low_ms', 'quality');
    expect(result.length).toBeGreaterThan(0);
  });

  it('(low_ms, quality) returns at least one mid-to-high-tier algorithm (not just dfg)', () => {
    const result = selectAlgorithmByBudget('low_ms', 'quality');
    // inductive_miner is the best quality algorithm that fits in low_ms
    const hasMidOrHighTier = result.some((id) =>
      ['inductive_miner', 'heuristic_miner', 'simulated_annealing'].includes(id)
    );
    expect(hasMidOrHighTier).toBe(true);
  });

  it('(low_ms, research) returns a non-empty array', () => {
    const result = selectAlgorithmByBudget('low_ms', 'research');
    expect(result.length).toBeGreaterThan(0);
  });

  it('(low_ms, research) returns inductive_miner (best WASM algorithm at low_ms)', () => {
    const result = selectAlgorithmByBudget('low_ms', 'research');
    expect(result).toContain('inductive_miner');
  });

  it('returns at least one algorithm for ALL (latency, quality) combinations in the full matrix', () => {
    const latencies = ['sub_ms', 'low_ms', 'high_ms', 'seconds', 'minutes'] as const;
    const qualities = ['fast', 'balanced', 'quality', 'research'] as const;

    for (const lat of latencies) {
      for (const q of qualities) {
        const result = selectAlgorithmByBudget(lat, q);
        expect(
          result.length,
          `selectAlgorithmByBudget("${lat}", "${q}") returned empty array — no algorithm for this combination`
        ).toBeGreaterThan(0);
      }
    }
  });

  it('Rank 3 metamorphic: upgrading latency budget at quality floor never reduces candidates to zero', () => {
    // sub_ms → low_ms → high_ms → seconds should all return ≥1 algorithm
    const floors = ['fast', 'balanced', 'quality', 'research'] as const;
    const latencies = ['sub_ms', 'low_ms', 'high_ms', 'seconds'] as const;

    for (const floor of floors) {
      for (const lat of latencies) {
        expect(
          selectAlgorithmByBudget(lat, floor).length,
          `selectAlgorithmByBudget("${lat}", "${floor}") returned empty array`
        ).toBeGreaterThan(0);
      }
    }
  });

  it('Rank 3 metamorphic: (low_ms, quality) returns strictly different candidates than (sub_ms, fast)', () => {
    const subMsFast = selectAlgorithmByBudget('sub_ms', 'fast');
    const lowMsQuality = selectAlgorithmByBudget('low_ms', 'quality');
    // They must differ — upgrading the quality floor at higher latency should yield different algorithms
    expect(subMsFast).not.toEqual(lowMsQuality);
  });
});

// ---------------------------------------------------------------------------
// GAP-3: validatePlan() — orphan graph node detection (Rank 1 — structural)
// ---------------------------------------------------------------------------

describe('GAP-3: validatePlan() — orphan graph node detection', () => {
  /**
   * Creates a handcrafted plan from a real plan() output but with one node
   * fully disconnected from the graph (no edges touch it).
   */
  function makePlanWithOrphan(): ExecutionPlan {
    const base = plan(makeConfig());
    // Clone and inject an orphan node: add it to graph.nodes but give it no edges
    const clone: ExecutionPlan = {
      ...base,
      graph: {
        nodes: [...base.graph.nodes, 'orphan_injected'],
        edges: [...base.graph.edges],
        // NOTE: no edges for 'orphan_injected'
      },
      steps: [
        ...base.steps,
        {
          id: 'orphan_injected',
          type: 'analyze_statistics' as never, // reuse a known type to pass type validation
          description: 'Orphan step with no dependencies or dependents',
          required: false,
          parameters: {},
          dependsOn: [], // intentionally isolated — not wired into the graph
          parallelizable: true,
        },
      ],
    };
    return clone;
  }

  it('flags an orphan step in the plan graph as an error', () => {
    const badPlan = makePlanWithOrphan();
    const errors = validatePlan(badPlan);
    const orphanErrors = errors.filter(
      (e) => e.severity === 'error' && e.message.includes('Orphan')
    );
    expect(orphanErrors.length).toBeGreaterThan(0);
  });

  it('orphan error path is "graph.nodes"', () => {
    const badPlan = makePlanWithOrphan();
    const errors = validatePlan(badPlan);
    const orphanErrors = errors.filter(
      (e) => e.path === 'graph.nodes' && e.message.includes('orphan_injected')
    );
    expect(orphanErrors.length).toBeGreaterThan(0);
  });

  it('assertPlanValid() throws when orphan nodes are present', () => {
    const badPlan = makePlanWithOrphan();
    expect(() => assertPlanValid(badPlan)).toThrow(/Invalid execution plan/);
  });

  it('real plans from plan() pass orphan-node validation for all profiles', () => {
    for (const profile of ['fast', 'balanced', 'quality', 'stream']) {
      const p = plan(makeConfig({ execution: { profile } }));
      const errors = validatePlan(p);
      const orphanErrors = errors.filter(
        (e) => e.severity === 'error' && e.message.includes('Orphan')
      );
      expect(
        orphanErrors,
        `profile="${profile}" plan has orphan nodes: ${orphanErrors.map((e) => e.message).join('; ')}`
      ).toHaveLength(0);
    }
  });

  it('plan with output section (write_sink step) still passes orphan validation', () => {
    const p = plan(makeConfig({ output: { format: 'json' } }));
    const errors = validatePlan(p);
    const orphanErrors = errors.filter(
      (e) => e.severity === 'error' && e.message.includes('Orphan')
    );
    expect(orphanErrors).toHaveLength(0);
  });

  it('plan with explicit ML steps passes orphan validation', () => {
    const p = plan(makeConfig({ ml: { enabled: true, tasks: ['cluster', 'anomaly'] } }));
    const errors = validatePlan(p);
    const orphanErrors = errors.filter(
      (e) => e.severity === 'error' && e.message.includes('Orphan')
    );
    expect(orphanErrors).toHaveLength(0);
  });
});
