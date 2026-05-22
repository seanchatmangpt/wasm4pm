/**
 * Exhaustive tests for validatePlanDAG() — packages/contracts/src/plan.ts
 *
 * Oracle hierarchy:
 *   Rank 1 — Mathematical: properties that hold for any correct graph implementation
 *   Rank 2 — Domain contract: design-decided semantics of the Plan DSL
 *   Rank 3 — Metamorphic: controlled input perturbation → predictable output direction
 *
 * Implementation notes (from reading plan.ts before writing tests):
 *   - validatePlanDAG() returns string[] (empty = valid, non-empty = invalid)
 *   - Cycle detection: Kahn's topological sort — visited !== nodeCount → "Plan contains a cycle"
 *   - Duplicate IDs detected before cycle check
 *   - Dangling edges filtered out before cycle check (so both defects are reported independently)
 *   - Requires at least one 'source' node and at least one 'sink' node
 *   - Self-loops on a single node are detected as "Self-loop detected on node: <id>"
 *   - validatePlanDAG does NOT inspect node.config contents (no per-node config validation)
 */

import { describe, it, expect } from 'vitest';
import { validatePlanDAG } from '../plan';
import type { Plan, PlanNode, PlanEdge } from '../plan';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeMeta(): Plan['metadata'] {
  return { planner: 'test-planner', planner_version: '1.0.0' };
}

function makeNode(
  id: string,
  kind: PlanNode['kind'],
  overrides: Partial<PlanNode> = {}
): PlanNode {
  return {
    id,
    kind,
    label: `${kind}-${id}`,
    config: {},
    version: '1.0.0',
    ...overrides,
  };
}

function makeEdge(from: string, to: string, label?: string): PlanEdge {
  return label ? { from, to, label } : { from, to };
}

function makePlan(
  nodes: PlanNode[],
  edges: PlanEdge[],
  overrides: Partial<Plan> = {}
): Plan {
  return {
    schema_version: '1.0',
    plan_id: 'test-plan-id',
    created_at: '2026-05-17T00:00:00.000Z',
    nodes,
    edges,
    metadata: makeMeta(),
    ...overrides,
  };
}

/** The minimal admissible plan: source → algorithm → sink */
function makeMinimalValidPlan(): Plan {
  return makePlan(
    [makeNode('src', 'source'), makeNode('algo', 'algorithm'), makeNode('snk', 'sink')],
    [makeEdge('src', 'algo'), makeEdge('algo', 'snk')]
  );
}

// ── Group 1 — Rank 1 (mathematical): Valid DAG invariants ─────────────────────

describe('Group 1 — Rank 1: Valid DAG invariants', () => {
  it('minimal valid plan (source → algorithm → sink) returns no errors', () => {
    const errors = validatePlanDAG(makeMinimalValidPlan());
    expect(errors).toHaveLength(0);
  });

  it('plan with multiple algorithms in linear sequence returns no errors', () => {
    // source → algo1 → algo2 → algo3 → sink
    const plan = makePlan(
      [
        makeNode('src', 'source'),
        makeNode('a1', 'algorithm'),
        makeNode('a2', 'algorithm'),
        makeNode('a3', 'algorithm'),
        makeNode('snk', 'sink'),
      ],
      [
        makeEdge('src', 'a1'),
        makeEdge('a1', 'a2'),
        makeEdge('a2', 'a3'),
        makeEdge('a3', 'snk'),
      ]
    );
    expect(validatePlanDAG(plan)).toHaveLength(0);
  });

  it('plan with diamond-shaped DAG (fan-out then fan-in) returns no errors', () => {
    // source → left → sink
    //        ↘ right ↗
    const plan = makePlan(
      [
        makeNode('src', 'source'),
        makeNode('left', 'algorithm'),
        makeNode('right', 'algorithm'),
        makeNode('snk', 'sink'),
      ],
      [
        makeEdge('src', 'left'),
        makeEdge('src', 'right'),
        makeEdge('left', 'snk'),
        makeEdge('right', 'snk'),
      ]
    );
    expect(validatePlanDAG(plan)).toHaveLength(0);
  });

  it('plan with correct node kinds (source, algorithm, sink) returns no errors', () => {
    const plan = makeMinimalValidPlan();
    const kinds = new Set(plan.nodes.map((n) => n.kind));
    expect(kinds).toContain('source');
    expect(kinds).toContain('algorithm');
    expect(kinds).toContain('sink');
    expect(validatePlanDAG(plan)).toHaveLength(0);
  });

  it('plan with multiple source nodes and one sink node is valid (fan-in topology)', () => {
    // source1 → algo → sink
    // source2 ↗
    const plan = makePlan(
      [
        makeNode('s1', 'source'),
        makeNode('s2', 'source'),
        makeNode('a1', 'algorithm'),
        makeNode('snk', 'sink'),
      ],
      [makeEdge('s1', 'a1'), makeEdge('s2', 'a1'), makeEdge('a1', 'snk')]
    );
    expect(validatePlanDAG(plan)).toHaveLength(0);
  });

  it('plan with one source and multiple sink nodes is valid (fan-out topology)', () => {
    // source → algo → sink1
    //               → sink2
    const plan = makePlan(
      [
        makeNode('src', 'source'),
        makeNode('a1', 'algorithm'),
        makeNode('snk1', 'sink'),
        makeNode('snk2', 'sink'),
      ],
      [makeEdge('src', 'a1'), makeEdge('a1', 'snk1'), makeEdge('a1', 'snk2')]
    );
    expect(validatePlanDAG(plan)).toHaveLength(0);
  });

  it('plan with source directly connected to sink (no algorithm) is valid — only source+sink required', () => {
    // validatePlanDAG only requires ≥1 source and ≥1 sink, not an algorithm node
    const plan = makePlan(
      [makeNode('src', 'source'), makeNode('snk', 'sink')],
      [makeEdge('src', 'snk')]
    );
    expect(validatePlanDAG(plan)).toHaveLength(0);
  });

  it('valid plan with edge labels returns no errors', () => {
    const plan = makePlan(
      [makeNode('src', 'source'), makeNode('algo', 'algorithm'), makeNode('snk', 'sink')],
      [makeEdge('src', 'algo', 'raw-events'), makeEdge('algo', 'snk', 'discovered-model')]
    );
    expect(validatePlanDAG(plan)).toHaveLength(0);
  });
});

// ── Group 2 — Rank 1 (mathematical): Structural violations rejected ───────────

describe('Group 2 — Rank 1: Structural violations are rejected', () => {
  it('empty node list returns errors (missing source and sink)', () => {
    const plan = makePlan([], []);
    const errors = validatePlanDAG(plan);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('missing source node returns an error mentioning "source"', () => {
    const plan = makePlan(
      [makeNode('algo', 'algorithm'), makeNode('snk', 'sink')],
      [makeEdge('algo', 'snk')]
    );
    const errors = validatePlanDAG(plan);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.toLowerCase().includes('source'))).toBe(true);
  });

  it('missing sink node returns an error mentioning "sink"', () => {
    const plan = makePlan(
      [makeNode('src', 'source'), makeNode('algo', 'algorithm')],
      [makeEdge('src', 'algo')]
    );
    const errors = validatePlanDAG(plan);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.toLowerCase().includes('sink'))).toBe(true);
  });

  it('plan with ONLY source returns errors for missing sink', () => {
    const plan = makePlan([makeNode('src', 'source')], []);
    const errors = validatePlanDAG(plan);
    expect(errors.some((e) => e.toLowerCase().includes('sink'))).toBe(true);
  });

  it('plan with ONLY sink returns errors for missing source', () => {
    const plan = makePlan([makeNode('snk', 'sink')], []);
    const errors = validatePlanDAG(plan);
    expect(errors.some((e) => e.toLowerCase().includes('source'))).toBe(true);
  });

  it('edge referencing unknown source node is rejected', () => {
    const plan = makePlan(
      [makeNode('src', 'source'), makeNode('snk', 'sink')],
      [makeEdge('ghost', 'snk'), makeEdge('src', 'snk')]
    );
    const errors = validatePlanDAG(plan);
    expect(errors.some((e) => e.includes('ghost'))).toBe(true);
  });

  it('edge referencing unknown target node is rejected', () => {
    const plan = makePlan(
      [makeNode('src', 'source'), makeNode('snk', 'sink')],
      [makeEdge('src', 'nowhere'), makeEdge('src', 'snk')]
    );
    const errors = validatePlanDAG(plan);
    expect(errors.some((e) => e.includes('nowhere'))).toBe(true);
  });

  it('self-loop edge (from === to) is rejected with a message naming the node', () => {
    const plan = makePlan(
      [makeNode('src', 'source'), makeNode('algo', 'algorithm'), makeNode('snk', 'sink')],
      [makeEdge('src', 'algo'), makeEdge('algo', 'algo'), makeEdge('algo', 'snk')]
    );
    const errors = validatePlanDAG(plan);
    expect(errors.some((e) => e.toLowerCase().includes('self-loop') || e.includes('algo'))).toBe(
      true
    );
  });

  it('duplicate node IDs are detected', () => {
    const plan = makePlan(
      [
        makeNode('src', 'source'),
        makeNode('snk', 'sink'),
        makeNode('snk', 'algorithm'), // duplicate id
      ],
      [makeEdge('src', 'snk')]
    );
    const errors = validatePlanDAG(plan);
    expect(errors.some((e) => e.toLowerCase().includes('duplicate'))).toBe(true);
  });

  it('cycle of two nodes (A → B → A) is detected', () => {
    // Minimal cycle: source → A → B → A (B back-edges to A)
    // Also add a sink so we get a clean signal about the cycle
    const plan = makePlan(
      [
        makeNode('src', 'source'),
        makeNode('A', 'algorithm'),
        makeNode('B', 'algorithm'),
        makeNode('snk', 'sink'),
      ],
      [
        makeEdge('src', 'A'),
        makeEdge('A', 'B'),
        makeEdge('B', 'A'), // back-edge creates cycle
        makeEdge('B', 'snk'),
      ]
    );
    const errors = validatePlanDAG(plan);
    expect(errors.some((e) => e.toLowerCase().includes('cycle'))).toBe(true);
  });

  it('cycle of three nodes (A → B → C → A) is detected', () => {
    const plan = makePlan(
      [
        makeNode('src', 'source'),
        makeNode('A', 'algorithm'),
        makeNode('B', 'algorithm'),
        makeNode('C', 'algorithm'),
        makeNode('snk', 'sink'),
      ],
      [
        makeEdge('src', 'A'),
        makeEdge('A', 'B'),
        makeEdge('B', 'C'),
        makeEdge('C', 'A'), // back-edge
        makeEdge('C', 'snk'),
      ]
    );
    const errors = validatePlanDAG(plan);
    expect(errors.some((e) => e.toLowerCase().includes('cycle'))).toBe(true);
  });

  it('dangling edge AND cycle both produce errors (independent detection)', () => {
    // Dangling: edge from 'ghost' (not a node)
    // Cycle: A → B → A
    const plan = makePlan(
      [
        makeNode('src', 'source'),
        makeNode('A', 'algorithm'),
        makeNode('B', 'algorithm'),
        makeNode('snk', 'sink'),
      ],
      [
        makeEdge('ghost', 'A'), // dangling
        makeEdge('src', 'A'),
        makeEdge('A', 'B'),
        makeEdge('B', 'A'), // cycle
        makeEdge('B', 'snk'),
      ]
    );
    const errors = validatePlanDAG(plan);
    // Both defects should be reported
    expect(errors.some((e) => e.includes('ghost'))).toBe(true);
    expect(errors.some((e) => e.toLowerCase().includes('cycle'))).toBe(true);
  });
});

// ── Group 3 — Rank 2 (domain contract): Node kind constraints ────────────────

describe('Group 3 — Rank 2: Domain contract — node kind requirements', () => {
  it('plan with only algorithm nodes (no source, no sink) fails both checks', () => {
    const plan = makePlan(
      [makeNode('a1', 'algorithm'), makeNode('a2', 'algorithm')],
      [makeEdge('a1', 'a2')]
    );
    const errors = validatePlanDAG(plan);
    const hasSourceError = errors.some((e) => e.toLowerCase().includes('source'));
    const hasSinkError = errors.some((e) => e.toLowerCase().includes('sink'));
    expect(hasSourceError).toBe(true);
    expect(hasSinkError).toBe(true);
  });

  it('error message for missing source explicitly says "source"', () => {
    const plan = makePlan(
      [makeNode('snk', 'sink')],
      []
    );
    const errors = validatePlanDAG(plan);
    const sourceError = errors.find((e) => e.toLowerCase().includes('source'));
    expect(sourceError).toBeDefined();
    expect(sourceError!.length).toBeGreaterThan(0);
  });

  it('error message for missing sink explicitly says "sink"', () => {
    const plan = makePlan(
      [makeNode('src', 'source')],
      []
    );
    const errors = validatePlanDAG(plan);
    const sinkError = errors.find((e) => e.toLowerCase().includes('sink'));
    expect(sinkError).toBeDefined();
    expect(sinkError!.length).toBeGreaterThan(0);
  });

  it('error message for dangling edge includes the unknown node id', () => {
    const plan = makePlan(
      [makeNode('src', 'source'), makeNode('snk', 'sink')],
      [makeEdge('src', 'unknownXYZ'), makeEdge('src', 'snk')]
    );
    const errors = validatePlanDAG(plan);
    expect(errors.some((e) => e.includes('unknownXYZ'))).toBe(true);
  });

  it('validatePlanDAG does NOT inspect config contents — node with empty config is valid', () => {
    // Domain contract: config validation is the caller's responsibility
    const plan = makePlan(
      [
        makeNode('src', 'source', { config: {} }),
        makeNode('algo', 'algorithm', { config: {} }),
        makeNode('snk', 'sink', { config: {} }),
      ],
      [makeEdge('src', 'algo'), makeEdge('algo', 'snk')]
    );
    expect(validatePlanDAG(plan)).toHaveLength(0);
  });

  it('validatePlanDAG does NOT inspect algorithmId field — algorithm node with empty config passes', () => {
    // validatePlanDAG only checks graph structure, not semantic content of nodes
    const plan = makePlan(
      [
        makeNode('src', 'source'),
        makeNode('algo', 'algorithm', { config: { algorithmId: '' } }),
        makeNode('snk', 'sink'),
      ],
      [makeEdge('src', 'algo'), makeEdge('algo', 'snk')]
    );
    // Structural validation passes — empty algorithmId is a semantic concern, not graph concern
    expect(validatePlanDAG(plan)).toHaveLength(0);
  });
});

// ── Group 4 — Rank 3 (metamorphic): Controlled perturbations ─────────────────

describe('Group 4 — Rank 3: Metamorphic relations — perturbation preserves/breaks validity', () => {
  it('adding a properly-connected algorithm node to a valid plan keeps it valid', () => {
    const base = makeMinimalValidPlan(); // src → algo → snk
    // Insert a new algorithm node between algo and snk
    const extended = makePlan(
      [...base.nodes, makeNode('algo2', 'algorithm')],
      [
        makeEdge('src', 'algo'),
        makeEdge('algo', 'algo2'), // new edge: algo → algo2
        makeEdge('algo2', 'snk'), // new edge: algo2 → snk
      ]
    );
    expect(validatePlanDAG(extended)).toHaveLength(0);
  });

  it('adding a back-edge to a valid plan makes it invalid (cycle introduced)', () => {
    const base = makeMinimalValidPlan(); // src → algo → snk
    const withCycle = makePlan(base.nodes, [
      ...base.edges,
      makeEdge('algo', 'src'), // introduces cycle: src → algo → src
    ]);
    const errors = validatePlanDAG(withCycle);
    expect(errors.some((e) => e.toLowerCase().includes('cycle'))).toBe(true);
  });

  it('removing source node from valid plan invalidates it', () => {
    const base = makeMinimalValidPlan();
    const withoutSource = makePlan(
      base.nodes.filter((n) => n.kind !== 'source'),
      base.edges.filter((e) => e.from !== 'src')
    );
    const errors = validatePlanDAG(withoutSource);
    expect(errors.some((e) => e.toLowerCase().includes('source'))).toBe(true);
  });

  it('removing sink node from valid plan invalidates it', () => {
    const base = makeMinimalValidPlan();
    const withoutSink = makePlan(
      base.nodes.filter((n) => n.kind !== 'sink'),
      base.edges.filter((e) => e.to !== 'snk')
    );
    const errors = validatePlanDAG(withoutSink);
    expect(errors.some((e) => e.toLowerCase().includes('sink'))).toBe(true);
  });

  it('changing a valid edge to reference a non-existent node invalidates the plan', () => {
    const base = makeMinimalValidPlan();
    // Replace the algo→snk edge with algo→nowhere
    const corrupted = makePlan(base.nodes, [
      makeEdge('src', 'algo'),
      makeEdge('algo', 'nowhere'), // dangling
    ]);
    const errors = validatePlanDAG(corrupted);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes('nowhere'))).toBe(true);
  });

  it('parallel valid plans are independently valid (no shared state contamination)', () => {
    const plan1 = makeMinimalValidPlan();
    const plan2 = makePlan(
      [makeNode('p2-src', 'source'), makeNode('p2-snk', 'sink')],
      [makeEdge('p2-src', 'p2-snk')]
    );
    expect(validatePlanDAG(plan1)).toHaveLength(0);
    expect(validatePlanDAG(plan2)).toHaveLength(0);
    // Calling them again must produce same results (pure function)
    expect(validatePlanDAG(plan1)).toHaveLength(0);
    expect(validatePlanDAG(plan2)).toHaveLength(0);
  });
});

// ── Group 5 — Rank 2 (domain contract): Error message quality ────────────────

describe('Group 5 — Rank 2: Error messages are non-empty and informative', () => {
  it('every validation error is a non-empty string', () => {
    // Use a worst-case plan (no nodes, guaranteed errors)
    const plan = makePlan([], []);
    const errors = validatePlanDAG(plan);
    expect(errors.length).toBeGreaterThan(0);
    for (const error of errors) {
      expect(typeof error).toBe('string');
      expect(error.trim().length).toBeGreaterThan(0);
    }
  });

  it('missing source error message is non-empty and mentions the constraint', () => {
    const plan = makePlan([makeNode('snk', 'sink')], []);
    const errors = validatePlanDAG(plan);
    const msg = errors.find((e) => e.toLowerCase().includes('source'));
    expect(msg).toBeDefined();
    expect(msg!.trim().length).toBeGreaterThan(5); // Not just "source"
  });

  it('missing sink error message is non-empty and mentions the constraint', () => {
    const plan = makePlan([makeNode('src', 'source')], []);
    const errors = validatePlanDAG(plan);
    const msg = errors.find((e) => e.toLowerCase().includes('sink'));
    expect(msg).toBeDefined();
    expect(msg!.trim().length).toBeGreaterThan(5);
  });

  it('dangling source edge error includes the unknown node id', () => {
    const plan = makePlan(
      [makeNode('src', 'source'), makeNode('snk', 'sink')],
      [makeEdge('GHOST_NODE_99', 'snk'), makeEdge('src', 'snk')]
    );
    const errors = validatePlanDAG(plan);
    expect(errors.some((e) => e.includes('GHOST_NODE_99'))).toBe(true);
  });

  it('dangling target edge error includes the unknown node id', () => {
    const plan = makePlan(
      [makeNode('src', 'source'), makeNode('snk', 'sink')],
      [makeEdge('src', 'MISSING_TARGET_42'), makeEdge('src', 'snk')]
    );
    const errors = validatePlanDAG(plan);
    expect(errors.some((e) => e.includes('MISSING_TARGET_42'))).toBe(true);
  });

  it('self-loop error includes the offending node id', () => {
    const plan = makePlan(
      [makeNode('src', 'source'), makeNode('loop', 'algorithm'), makeNode('snk', 'sink')],
      [makeEdge('src', 'loop'), makeEdge('loop', 'loop'), makeEdge('loop', 'snk')]
    );
    const errors = validatePlanDAG(plan);
    const selfLoopError = errors.find((e) => e.includes('loop'));
    expect(selfLoopError).toBeDefined();
    expect(selfLoopError!.trim().length).toBeGreaterThan(0);
  });

  it('cycle error message mentions "cycle"', () => {
    const plan = makePlan(
      [
        makeNode('src', 'source'),
        makeNode('X', 'algorithm'),
        makeNode('Y', 'algorithm'),
        makeNode('snk', 'sink'),
      ],
      [
        makeEdge('src', 'X'),
        makeEdge('X', 'Y'),
        makeEdge('Y', 'X'), // cycle
        makeEdge('Y', 'snk'),
      ]
    );
    const errors = validatePlanDAG(plan);
    const cycleError = errors.find((e) => e.toLowerCase().includes('cycle'));
    expect(cycleError).toBeDefined();
    expect(cycleError!.trim().length).toBeGreaterThan(5);
  });

  it('valid plan returns an empty errors array — not null or undefined', () => {
    const result = validatePlanDAG(makeMinimalValidPlan());
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it('duplicate node ID error mentions "duplicate"', () => {
    const plan = makePlan(
      [makeNode('src', 'source'), makeNode('snk', 'sink'), makeNode('snk', 'algorithm')],
      [makeEdge('src', 'snk')]
    );
    const errors = validatePlanDAG(plan);
    const dupError = errors.find((e) => e.toLowerCase().includes('duplicate'));
    expect(dupError).toBeDefined();
    expect(dupError!.trim().length).toBeGreaterThan(0);
  });
});

// ── Group 6 — Rank 2 (domain contract): Sink outgoing-edge violations ─────────

describe('Group 6 — Rank 2: Sink nodes must not have outgoing edges', () => {
  it('sink node with an outgoing edge to an algorithm node is rejected', () => {
    // sink → algo is semantically invalid: sinks only receive, never emit
    const plan = makePlan(
      [
        makeNode('src', 'source'),
        makeNode('algo', 'algorithm'),
        makeNode('snk', 'sink'),
      ],
      [
        makeEdge('src', 'algo'),
        makeEdge('algo', 'snk'),
        makeEdge('snk', 'algo'), // sink emitting back — invalid
      ]
    );
    const errors = validatePlanDAG(plan);
    expect(errors.length).toBeGreaterThan(0);
    // Should also detect cycle (sink → algo → snk → algo)
    const hasSinkViolation = errors.some(
      (e) => e.toLowerCase().includes('sink') && (e.includes('→') || e.toLowerCase().includes('outgoing'))
    );
    expect(hasSinkViolation).toBe(true);
  });

  it('sink node with an outgoing edge to a source node is rejected', () => {
    // sink → source creates a cycle of length 2 via back-edge from terminal node
    const plan = makePlan(
      [makeNode('src', 'source'), makeNode('snk', 'sink')],
      [makeEdge('src', 'snk'), makeEdge('snk', 'src')]
    );
    const errors = validatePlanDAG(plan);
    expect(errors.length).toBeGreaterThan(0);
    // Sink outgoing-edge check fires
    const hasSinkViolation = errors.some((e) => e.includes('snk') && (e.includes('→') || e.toLowerCase().includes('outgoing')));
    expect(hasSinkViolation).toBe(true);
  });

  it('error message names the sink node that has the outgoing edge', () => {
    const plan = makePlan(
      [
        makeNode('src', 'source'),
        makeNode('algo', 'algorithm'),
        makeNode('the_sink', 'sink'),
      ],
      [
        makeEdge('src', 'algo'),
        makeEdge('algo', 'the_sink'),
        makeEdge('the_sink', 'algo'), // outgoing from sink
      ]
    );
    const errors = validatePlanDAG(plan);
    expect(errors.some((e) => e.includes('the_sink'))).toBe(true);
  });

  it('sink with no outgoing edges passes the check', () => {
    // Only incoming edges are allowed for sink nodes
    const plan = makePlan(
      [makeNode('src', 'source'), makeNode('algo', 'algorithm'), makeNode('snk', 'sink')],
      [makeEdge('src', 'algo'), makeEdge('algo', 'snk')]
    );
    expect(validatePlanDAG(plan)).toHaveLength(0);
  });

  it('multiple sinks each with no outgoing edges are all valid', () => {
    const plan = makePlan(
      [
        makeNode('src', 'source'),
        makeNode('algo', 'algorithm'),
        makeNode('snk1', 'sink'),
        makeNode('snk2', 'sink'),
      ],
      [makeEdge('src', 'algo'), makeEdge('algo', 'snk1'), makeEdge('algo', 'snk2')]
    );
    expect(validatePlanDAG(plan)).toHaveLength(0);
  });
});

// ── Group 7 — Rank 1 (mathematical): Disconnected (island) node detection ────

describe('Group 7 — Rank 1: Disconnected node detection', () => {
  it('a node with no edges when other nodes have edges is an island', () => {
    // src → snk is valid, but 'orphan' has no edges at all
    const plan = makePlan(
      [
        makeNode('src', 'source'),
        makeNode('snk', 'sink'),
        makeNode('orphan', 'algorithm'), // island
      ],
      [makeEdge('src', 'snk')]
    );
    const errors = validatePlanDAG(plan);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes('orphan'))).toBe(true);
  });

  it('disconnected error message mentions the island node id', () => {
    const plan = makePlan(
      [
        makeNode('src', 'source'),
        makeNode('snk', 'sink'),
        makeNode('FLOATING_NODE', 'algorithm'),
      ],
      [makeEdge('src', 'snk')]
    );
    const errors = validatePlanDAG(plan);
    expect(errors.some((e) => e.includes('FLOATING_NODE'))).toBe(true);
  });

  it('a plan with NO edges and exactly source+sink is valid (both connected via absence of edges)', () => {
    // Edge-free plans are not subject to disconnected-node check
    // because we can't determine reachability without edges
    const plan = makePlan(
      [makeNode('src', 'source'), makeNode('snk', 'sink')],
      []
    );
    // No edges → disconnected check is skipped; only source+sink kind checks apply
    const errors = validatePlanDAG(plan);
    // No error about disconnected nodes (the check only applies when edges > 0)
    expect(errors.every((e) => !e.toLowerCase().includes('disconnected'))).toBe(true);
  });

  it('all nodes connected to the main flow are not flagged as islands', () => {
    const plan = makePlan(
      [
        makeNode('src', 'source'),
        makeNode('a', 'algorithm'),
        makeNode('b', 'algorithm'),
        makeNode('snk', 'sink'),
      ],
      [makeEdge('src', 'a'), makeEdge('a', 'b'), makeEdge('b', 'snk')]
    );
    expect(validatePlanDAG(plan)).toHaveLength(0);
  });

  it('two disconnected islands both appear in error messages', () => {
    const plan = makePlan(
      [
        makeNode('src', 'source'),
        makeNode('snk', 'sink'),
        makeNode('island1', 'algorithm'),
        makeNode('island2', 'algorithm'),
      ],
      [makeEdge('src', 'snk')]
    );
    const errors = validatePlanDAG(plan);
    expect(errors.some((e) => e.includes('island1'))).toBe(true);
    expect(errors.some((e) => e.includes('island2'))).toBe(true);
  });
});
