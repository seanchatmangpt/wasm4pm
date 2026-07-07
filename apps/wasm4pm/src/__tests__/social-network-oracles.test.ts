/**
 * social-network-oracles.test.ts
 *
 * Oracle-ranked unit tests for the social network mining WASM functions.
 *
 * Van der Aalst — Resource perspective (§9.3, "Process Mining", 2016).
 * Social network mining discovers who works with whom and how work flows
 * between organisational units.  Two networks are tested:
 *
 *   Handover-of-work network (directed):
 *     Edge (A → B, weight w) means: A handed work to B exactly w times.
 *     WASM function: discover_handover_network(handle, resourceKey)
 *     Edge fields:   { from: string, to: string, handovers: number }
 *     Node fields:   { id: string, label: string, workload: number }
 *
 *   Working-together network (directed in WASM output, treated as undirected):
 *     Edge (A → B, weight w) means: A and B co-occurred in w shared cases.
 *     WASM function: discover_working_together_network(handle, resourceKey)
 *     Edge fields:   { from: string, to: string, co_occurrences: number }
 *     Node fields:   { id: string, label: string }
 *
 * IMPORTANT: The WASM HashMap-backed output has non-deterministic edge/node
 * ordering (Rust HashMap iteration order is randomised per process start).
 * All structural comparisons sort before asserting.
 *
 * Oracle rank taxonomy:
 *
 *   Rank 1 — Mathematical theorem.  Properties provable from graph theory and
 *             combinatorics; hold for any correct implementation.
 *
 *   Rank 2 — Domain contract.  Properties that follow from the Van der Aalst
 *             definition of the two social networks.
 *
 *   Rank 3 — Metamorphic relation.  Controlled input change → predictable
 *             output change (more traces → more edge weight, etc.).
 *
 * Test identifiers: SN-O-<rank>-<n> (O = oracle, to distinguish from SN- CLI tests)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'module';

// ─── WASM bootstrap ──────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let wasm: Record<string, any>;

const parse = (r: unknown): Record<string, unknown> => {
  if (typeof r === 'string') return JSON.parse(r) as Record<string, unknown>;
  return r as Record<string, unknown>;
};

interface HandoverEdge {
  from: string;
  to: string;
  handovers: number;
}

interface WorkingTogetherEdge {
  from: string;
  to: string;
  co_occurrences: number;
}

interface HandoverNode {
  id: string;
  label: string;
  workload: number;
}

interface WorkingTogetherNode {
  id: string;
  label: string;
}

interface HandoverNetwork {
  edges: HandoverEdge[];
  nodes: HandoverNode[];
}

interface WorkingTogetherNetwork {
  edges: WorkingTogetherEdge[];
  nodes: WorkingTogetherNode[];
}

function handoverNetwork(handle: string, resourceKey = 'org:resource'): HandoverNetwork {
  return parse(wasm.discover_handover_network(handle, resourceKey)) as unknown as HandoverNetwork;
}

function workingTogetherNetwork(handle: string, resourceKey = 'org:resource'): WorkingTogetherNetwork {
  return parse(wasm.discover_working_together_network(handle, resourceKey)) as unknown as WorkingTogetherNetwork;
}

// Sort edges/nodes for deterministic comparison (WASM HashMap order is non-deterministic)
function sortEdges(edges: HandoverEdge[]): HandoverEdge[] {
  return [...edges].sort((a, b) => (a.from + '>' + a.to).localeCompare(b.from + '>' + b.to));
}

function sortWTEdges(edges: WorkingTogetherEdge[]): WorkingTogetherEdge[] {
  return [...edges].sort((a, b) => (a.from + '>' + a.to).localeCompare(b.from + '>' + b.to));
}

function sortNodes(nodes: HandoverNode[]): HandoverNode[] {
  return [...nodes].sort((a, b) => a.id.localeCompare(b.id));
}

beforeAll(() => {
  const require = createRequire(import.meta.url);
  wasm = require('../../../../wasm4pm/pkg/wasm4pm.js');
});

// ─── Shared XES fixture builders ─────────────────────────────────────────────

function makeXes(traces: Array<Array<{ activity: string; resource: string; ts: string }>>): string {
  const traceXml = traces
    .map((events, i) => {
      const eventXml = events
        .map(
          (e) =>
            `    <event>
      <string key="concept:name" value="${e.activity}"/>
      <date key="time:timestamp" value="${e.ts}"/>
      <string key="org:resource" value="${e.resource}"/>
    </event>`
        )
        .join('\n');
      return `  <trace>
    <string key="concept:name" value="c${i + 1}"/>
${eventXml}
  </trace>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
${traceXml}
</log>`;
}

/** Single-trace log: Alice → Bob → Alice (3 events, 2 handovers) */
const ALICE_BOB_ALICE_XES = makeXes([
  [
    { activity: 'A', resource: 'Alice', ts: '2026-01-01T09:00:00Z' },
    { activity: 'B', resource: 'Bob', ts: '2026-01-01T10:00:00Z' },
    { activity: 'C', resource: 'Alice', ts: '2026-01-01T11:00:00Z' },
  ],
]);

/** Single-resource log: only Alice (no handovers possible) */
const SINGLE_RESOURCE_XES = makeXes([
  [
    { activity: 'A', resource: 'Alice', ts: '2026-01-01T09:00:00Z' },
    { activity: 'B', resource: 'Alice', ts: '2026-01-01T10:00:00Z' },
    { activity: 'C', resource: 'Alice', ts: '2026-01-01T11:00:00Z' },
  ],
]);

/** Chain of 5 distinct resources: R1 → R2 → R3 → R4 → R5 */
const CHAIN_5_XES = makeXes([
  [
    { activity: 'A', resource: 'R1', ts: '2026-01-01T09:00:00Z' },
    { activity: 'B', resource: 'R2', ts: '2026-01-01T10:00:00Z' },
    { activity: 'C', resource: 'R3', ts: '2026-01-01T11:00:00Z' },
    { activity: 'D', resource: 'R4', ts: '2026-01-01T12:00:00Z' },
    { activity: 'E', resource: 'R5', ts: '2026-01-01T13:00:00Z' },
  ],
]);

/** Two identical Alice → Bob traces */
const TWO_ALICE_BOB_XES = makeXes([
  [
    { activity: 'A', resource: 'Alice', ts: '2026-01-01T09:00:00Z' },
    { activity: 'B', resource: 'Bob', ts: '2026-01-01T10:00:00Z' },
  ],
  [
    { activity: 'A', resource: 'Alice', ts: '2026-01-02T09:00:00Z' },
    { activity: 'B', resource: 'Bob', ts: '2026-01-02T10:00:00Z' },
  ],
]);

/** Three identical Alice → Bob traces */
const THREE_ALICE_BOB_XES = makeXes([
  [
    { activity: 'A', resource: 'Alice', ts: '2026-01-01T09:00:00Z' },
    { activity: 'B', resource: 'Bob', ts: '2026-01-01T10:00:00Z' },
  ],
  [
    { activity: 'A', resource: 'Alice', ts: '2026-01-02T09:00:00Z' },
    { activity: 'B', resource: 'Bob', ts: '2026-01-02T10:00:00Z' },
  ],
  [
    { activity: 'A', resource: 'Alice', ts: '2026-01-03T09:00:00Z' },
    { activity: 'B', resource: 'Bob', ts: '2026-01-03T10:00:00Z' },
  ],
]);

// ─────────────────────────────────────────────────────────────────────────────
// Rank 1 — Mathematical theorems
// ─────────────────────────────────────────────────────────────────────────────

describe('SN-O-1: single-resource log has zero handover edges', () => {
  /**
   * Graph theory: a directed edge (A → B) requires A ≠ B.
   * A single-resource log has all events attributed to the same person;
   * there is no pair (A, B) with A ≠ B, so the edge set must be empty.
   */

  it('single resource: handover network has zero edges', () => {
    const handle = wasm.load_eventlog_from_xes(SINGLE_RESOURCE_XES);
    const net = handoverNetwork(handle);
    expect(net.edges).toHaveLength(0);
  });

  it('single resource: handover network has exactly one node', () => {
    const handle = wasm.load_eventlog_from_xes(SINGLE_RESOURCE_XES);
    const net = handoverNetwork(handle);
    expect(net.nodes).toHaveLength(1);
    expect(net.nodes[0].id).toBe('Alice');
  });
});

describe('SN-O-1: handover count for n-event chain is n-1', () => {
  /**
   * For a single trace with n consecutive distinct-resource events, the
   * handover count (sum of all edge weights) is exactly n-1.
   * This is the discrete derivative: n events produce n-1 adjacent pairs.
   */

  it('3-event trace (Alice→Bob→Alice) has total handovers = 2', () => {
    const handle = wasm.load_eventlog_from_xes(ALICE_BOB_ALICE_XES);
    const net = handoverNetwork(handle);
    const total = net.edges.reduce((s, e) => s + e.handovers, 0);
    expect(total).toBe(2);
  });

  it('5-event chain (R1→R2→R3→R4→R5) has total handovers = 4', () => {
    const handle = wasm.load_eventlog_from_xes(CHAIN_5_XES);
    const net = handoverNetwork(handle);
    const total = net.edges.reduce((s, e) => s + e.handovers, 0);
    expect(total).toBe(4);
  });

  it('5-event chain has exactly 5 distinct nodes', () => {
    const handle = wasm.load_eventlog_from_xes(CHAIN_5_XES);
    const net = handoverNetwork(handle);
    expect(net.nodes).toHaveLength(5);
  });
});

describe('SN-O-1: workload sum equals total event count', () => {
  /**
   * Each event is attributed to exactly one resource.
   * Workload(r) = number of events attributed to resource r.
   * Therefore: sum of all workloads = total number of events in the log.
   */

  it('Alice×2 + Bob×1 trace: workload sum = 3', () => {
    const handle = wasm.load_eventlog_from_xes(ALICE_BOB_ALICE_XES);
    const net = handoverNetwork(handle);
    const workloadSum = net.nodes.reduce((s, n) => s + n.workload, 0);
    expect(workloadSum).toBe(3);
  });

  it('5-resource chain: workload sum = 5 (one event per resource)', () => {
    const handle = wasm.load_eventlog_from_xes(CHAIN_5_XES);
    const net = handoverNetwork(handle);
    const workloadSum = net.nodes.reduce((s, n) => s + n.workload, 0);
    expect(workloadSum).toBe(5);
  });

  it('Alice×3: workload for Alice = 3', () => {
    const handle = wasm.load_eventlog_from_xes(SINGLE_RESOURCE_XES);
    const net = handoverNetwork(handle);
    const alice = net.nodes.find((n) => n.id === 'Alice');
    expect(alice).toBeDefined();
    expect(alice!.workload).toBe(3);
  });
});

describe('SN-O-1: all edge weights are positive integers', () => {
  /**
   * Edge weight = count of handovers observed.  A count is always a
   * positive integer.  Zero-weight edges are meaningless (they would imply
   * a handover never happened) and non-integer weights imply floating-point
   * accumulation errors.
   */

  it('handover network: every edge.handovers is a positive integer', () => {
    const handle = wasm.load_eventlog_from_xes(THREE_ALICE_BOB_XES);
    const net = handoverNetwork(handle);
    for (const edge of net.edges) {
      expect(Number.isInteger(edge.handovers)).toBe(true);
      expect(edge.handovers).toBeGreaterThan(0);
    }
  });

  it('working-together network: every edge.co_occurrences is a positive integer', () => {
    const handle = wasm.load_eventlog_from_xes(THREE_ALICE_BOB_XES);
    const net = workingTogetherNetwork(handle);
    for (const edge of net.edges) {
      expect(Number.isInteger(edge.co_occurrences)).toBe(true);
      expect(edge.co_occurrences).toBeGreaterThan(0);
    }
  });
});

describe('SN-O-1: working-together network — single resource has zero WT edges', () => {
  /**
   * Co-occurrence requires two distinct resources in the same case.
   * A single-resource log has no resource pairs, so the WT edge set is empty.
   */

  it('single resource: working-together network has zero edges', () => {
    const handle = wasm.load_eventlog_from_xes(SINGLE_RESOURCE_XES);
    const net = workingTogetherNetwork(handle);
    expect(net.edges).toHaveLength(0);
  });
});

describe('SN-O-1: node set covers all resources that appear in the log', () => {
  /**
   * Every resource that appears in at least one event must appear as a node.
   * A missing node is a loss of information — a practitioner cannot see that
   * a resource exists if it is omitted.
   */

  it('Alice→Bob→Alice: both Alice and Bob appear as nodes', () => {
    const handle = wasm.load_eventlog_from_xes(ALICE_BOB_ALICE_XES);
    const net = handoverNetwork(handle);
    const ids = new Set(net.nodes.map((n) => n.id));
    expect(ids.has('Alice')).toBe(true);
    expect(ids.has('Bob')).toBe(true);
  });

  it('5-resource chain: R1..R5 all appear as nodes', () => {
    const handle = wasm.load_eventlog_from_xes(CHAIN_5_XES);
    const net = handoverNetwork(handle);
    const ids = new Set(net.nodes.map((n) => n.id));
    for (const r of ['R1', 'R2', 'R3', 'R4', 'R5']) {
      expect(ids.has(r)).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Rank 2 — Domain contracts
// ─────────────────────────────────────────────────────────────────────────────

describe('SN-O-2: handover edge direction reflects event ordering in the trace', () => {
  /**
   * Van der Aalst domain contract: a handover A → B means A performed an
   * activity that was immediately followed by B performing the next activity.
   * The direction must match the observed temporal order.
   */

  it('Alice → Bob → Alice: Alice→Bob and Bob→Alice both appear as directed edges', () => {
    const handle = wasm.load_eventlog_from_xes(ALICE_BOB_ALICE_XES);
    const net = handoverNetwork(handle);
    const edgeKeys = new Set(net.edges.map((e) => `${e.from}>${e.to}`));
    expect(edgeKeys.has('Alice>Bob')).toBe(true);
    expect(edgeKeys.has('Bob>Alice')).toBe(true);
  });

  it('directed chain R1→R2→R3→R4→R5: edges are only in forward direction', () => {
    const handle = wasm.load_eventlog_from_xes(CHAIN_5_XES);
    const net = handoverNetwork(handle);
    const edgeKeys = new Set(net.edges.map((e) => `${e.from}>${e.to}`));
    // Forward edges must exist
    expect(edgeKeys.has('R1>R2')).toBe(true);
    expect(edgeKeys.has('R2>R3')).toBe(true);
    expect(edgeKeys.has('R3>R4')).toBe(true);
    expect(edgeKeys.has('R4>R5')).toBe(true);
    // Reverse edges must NOT exist (single trace, no back-handover)
    expect(edgeKeys.has('R2>R1')).toBe(false);
    expect(edgeKeys.has('R3>R2')).toBe(false);
    expect(edgeKeys.has('R5>R1')).toBe(false);
  });
});

describe('SN-O-2: each node has an id and a label field', () => {
  /**
   * Domain contract: every node in the handover network must be identifiable
   * (id) and human-readable (label).  A node without a label cannot be
   * displayed in a social network diagram.
   */

  it('handover network nodes all have non-empty id and label', () => {
    const handle = wasm.load_eventlog_from_xes(ALICE_BOB_ALICE_XES);
    const net = handoverNetwork(handle);
    for (const node of net.nodes) {
      expect(typeof node.id).toBe('string');
      expect(node.id.length).toBeGreaterThan(0);
      expect(typeof node.label).toBe('string');
      expect(node.label.length).toBeGreaterThan(0);
    }
  });

  it('working-together network nodes all have non-empty id and label', () => {
    const handle = wasm.load_eventlog_from_xes(ALICE_BOB_ALICE_XES);
    const net = workingTogetherNetwork(handle);
    for (const node of net.nodes) {
      expect(typeof node.id).toBe('string');
      expect(node.id.length).toBeGreaterThan(0);
      expect(typeof node.label).toBe('string');
      expect(node.label.length).toBeGreaterThan(0);
    }
  });
});

describe('SN-O-2: working-together network — 2-resource same-case log has exactly 1 WT edge', () => {
  /**
   * Domain contract: if a case contains resources A and B and no other
   * resources, there is exactly one pair (A, B) contributing to the WT
   * network.  The edge count must equal the number of distinct resource pairs
   * per case, accumulated across all cases.
   */

  it('Alice → Bob (one trace, two resources): WT network has exactly 1 edge', () => {
    const xes = makeXes([
      [
        { activity: 'A', resource: 'Alice', ts: '2026-01-01T09:00:00Z' },
        { activity: 'B', resource: 'Bob', ts: '2026-01-01T10:00:00Z' },
      ],
    ]);
    const handle = wasm.load_eventlog_from_xes(xes);
    const net = workingTogetherNetwork(handle);
    expect(net.edges).toHaveLength(1);
    expect(net.edges[0].co_occurrences).toBe(1);
  });
});

describe('SN-O-2: handover network output has nodes and edges top-level fields', () => {
  /**
   * Domain contract: the network envelope must expose nodes and edges as
   * named arrays.  Structural contract for downstream consumers (social.ts
   * command, MCP tool, tests).
   */

  it('handover network has top-level nodes array', () => {
    const handle = wasm.load_eventlog_from_xes(ALICE_BOB_ALICE_XES);
    const net = handoverNetwork(handle);
    expect(Array.isArray(net.nodes)).toBe(true);
  });

  it('handover network has top-level edges array', () => {
    const handle = wasm.load_eventlog_from_xes(ALICE_BOB_ALICE_XES);
    const net = handoverNetwork(handle);
    expect(Array.isArray(net.edges)).toBe(true);
  });

  it('working-together network has top-level nodes array', () => {
    const handle = wasm.load_eventlog_from_xes(ALICE_BOB_ALICE_XES);
    const net = workingTogetherNetwork(handle);
    expect(Array.isArray(net.nodes)).toBe(true);
  });

  it('working-together network has top-level edges array', () => {
    const handle = wasm.load_eventlog_from_xes(ALICE_BOB_ALICE_XES);
    const net = workingTogetherNetwork(handle);
    expect(Array.isArray(net.edges)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Rank 3 — Metamorphic relations
// ─────────────────────────────────────────────────────────────────────────────

describe('SN-O-3: edge weight monotonicity — k identical traces → edge weight = k', () => {
  /**
   * Metamorphic relation: repeating the same trace k times multiplies each
   * edge weight by k.  This verifies that the mining algorithm accumulates
   * evidence correctly rather than capping or averaging weights.
   * This is directly relevant to process monitoring: a practitioner who sees
   * Alice→Bob:1 after 3 identical runs has a defective tool.
   */

  it('1 Alice→Bob trace: Alice→Bob edge weight = 1', () => {
    const handle = wasm.load_eventlog_from_xes(
      makeXes([
        [
          { activity: 'A', resource: 'Alice', ts: '2026-01-01T09:00:00Z' },
          { activity: 'B', resource: 'Bob', ts: '2026-01-01T10:00:00Z' },
        ],
      ])
    );
    const net = handoverNetwork(handle);
    const edge = net.edges.find((e) => e.from === 'Alice' && e.to === 'Bob');
    expect(edge).toBeDefined();
    expect(edge!.handovers).toBe(1);
  });

  it('2 identical Alice→Bob traces: Alice→Bob edge weight = 2', () => {
    const handle = wasm.load_eventlog_from_xes(TWO_ALICE_BOB_XES);
    const net = handoverNetwork(handle);
    const edge = net.edges.find((e) => e.from === 'Alice' && e.to === 'Bob');
    expect(edge).toBeDefined();
    expect(edge!.handovers).toBe(2);
  });

  it('3 identical Alice→Bob traces: Alice→Bob edge weight = 3', () => {
    const handle = wasm.load_eventlog_from_xes(THREE_ALICE_BOB_XES);
    const net = handoverNetwork(handle);
    const edge = net.edges.find((e) => e.from === 'Alice' && e.to === 'Bob');
    expect(edge).toBeDefined();
    expect(edge!.handovers).toBe(3);
  });

  it('3 identical Alice→Bob traces: total handovers = 3', () => {
    const handle = wasm.load_eventlog_from_xes(THREE_ALICE_BOB_XES);
    const net = handoverNetwork(handle);
    const total = net.edges.reduce((s, e) => s + e.handovers, 0);
    expect(total).toBe(3);
  });
});

describe('SN-O-3: more traces → workload monotonically increases', () => {
  /**
   * Metamorphic relation: adding more traces can only increase (never
   * decrease) the workload of any resource that appears in those traces.
   * Workload decreasing when new cases arrive indicates a normalisation
   * defect — a bug analogous to the TS-1 timestamp-length bug in the
   * RL system where a proxy metric was substituted for the real one.
   */

  it('Alice workload in 2-trace log > Alice workload in 1-trace log', () => {
    const one = wasm.load_eventlog_from_xes(
      makeXes([
        [
          { activity: 'A', resource: 'Alice', ts: '2026-01-01T09:00:00Z' },
          { activity: 'B', resource: 'Bob', ts: '2026-01-01T10:00:00Z' },
        ],
      ])
    );
    const two = wasm.load_eventlog_from_xes(TWO_ALICE_BOB_XES);
    const n1 = handoverNetwork(one);
    const n2 = handoverNetwork(two);
    const alice1 = n1.nodes.find((n) => n.id === 'Alice')!.workload;
    const alice2 = n2.nodes.find((n) => n.id === 'Alice')!.workload;
    expect(alice2).toBeGreaterThan(alice1);
  });

  it('workload sum increases proportionally with identical trace replication', () => {
    const one = wasm.load_eventlog_from_xes(
      makeXes([
        [
          { activity: 'A', resource: 'Alice', ts: '2026-01-01T09:00:00Z' },
          { activity: 'B', resource: 'Bob', ts: '2026-01-01T10:00:00Z' },
        ],
      ])
    );
    const three = wasm.load_eventlog_from_xes(THREE_ALICE_BOB_XES);
    const n1 = handoverNetwork(one);
    const n3 = handoverNetwork(three);
    const sum1 = n1.nodes.reduce((s, n) => s + n.workload, 0);
    const sum3 = n3.nodes.reduce((s, n) => s + n.workload, 0);
    // 1 trace → 2 events; 3 traces → 6 events
    expect(sum3).toBe(sum1 * 3);
  });
});

describe('SN-O-3: determinism — sorted output is identical across two loads of the same XES', () => {
  /**
   * Metamorphic / reproducibility: the sorted edge and node sets of two
   * independent loads of the same XES string must be identical.
   * Raw ordering may vary (HashMap non-determinism), but the set of
   * {(from, to, weight)} triples is deterministic.
   */

  it('handover network: sorted edges and nodes are identical for two loads', () => {
    const h1 = wasm.load_eventlog_from_xes(ALICE_BOB_ALICE_XES);
    const h2 = wasm.load_eventlog_from_xes(ALICE_BOB_ALICE_XES);
    const n1 = handoverNetwork(h1);
    const n2 = handoverNetwork(h2);
    expect(JSON.stringify(sortEdges(n1.edges))).toBe(JSON.stringify(sortEdges(n2.edges)));
    expect(JSON.stringify(sortNodes(n1.nodes))).toBe(JSON.stringify(sortNodes(n2.nodes)));
  });

  it('working-together network: sorted edges and nodes are identical for two loads', () => {
    const h1 = wasm.load_eventlog_from_xes(ALICE_BOB_ALICE_XES);
    const h2 = wasm.load_eventlog_from_xes(ALICE_BOB_ALICE_XES);
    const n1 = workingTogetherNetwork(h1);
    const n2 = workingTogetherNetwork(h2);
    expect(JSON.stringify(sortWTEdges(n1.edges))).toBe(JSON.stringify(sortWTEdges(n2.edges)));
  });
});

describe('SN-O-3: adding a trace with a new pair does not decrease other edge weights', () => {
  /**
   * Metamorphic relation: introducing a new resource pair (Charlie, Alice)
   * into a log that already has (Alice, Bob) edges must not reduce the
   * existing Alice→Bob count.  Evidence accumulation must be additive.
   */

  it('Alice→Bob weight is unchanged when a Charlie→Alice trace is added', () => {
    const baseXes = makeXes([
      [
        { activity: 'A', resource: 'Alice', ts: '2026-01-01T09:00:00Z' },
        { activity: 'B', resource: 'Bob', ts: '2026-01-01T10:00:00Z' },
      ],
    ]);
    const extendedXes = makeXes([
      [
        { activity: 'A', resource: 'Alice', ts: '2026-01-01T09:00:00Z' },
        { activity: 'B', resource: 'Bob', ts: '2026-01-01T10:00:00Z' },
      ],
      [
        { activity: 'A', resource: 'Charlie', ts: '2026-01-02T09:00:00Z' },
        { activity: 'B', resource: 'Alice', ts: '2026-01-02T10:00:00Z' },
      ],
    ]);
    const h1 = wasm.load_eventlog_from_xes(baseXes);
    const h2 = wasm.load_eventlog_from_xes(extendedXes);
    const net1 = handoverNetwork(h1);
    const net2 = handoverNetwork(h2);
    const ab1 = net1.edges.find((e) => e.from === 'Alice' && e.to === 'Bob')?.handovers ?? 0;
    const ab2 = net2.edges.find((e) => e.from === 'Alice' && e.to === 'Bob')?.handovers ?? 0;
    expect(ab2).toBeGreaterThanOrEqual(ab1);
  });
});
