/**
 * DFG (Directly-Follows Graph) Utilities
 *
 * Utilities for creating, comparing, and validating DFGs.
 * DFGs represent the frequency of activity transitions in event logs.
 */

// ─── Types ────────────────────────────────────────────────────────────────

export interface DFGEdge {
  source: string;
  target: string;
  count: number;
}

export interface DFG {
  nodes: string[];
  edges: DFGEdge[];
  startActivities: Map<string, number>;
  endActivities: Map<string, number>;
  totalEvents: number;
  totalTraces: number;
}

export interface DFGComparison {
  identical: boolean;
  nodeIntersection: string[];
  nodeUnion: string[];
  edgeIntersection: DFGEdge[];
  edgeUnion: DFGEdge[];
  nodeJaccard: number; // 0-1, 1 = identical nodes
  edgeJaccard: number; // 0-1, 1 = identical edges
  missingInFirst: { nodes: string[]; edges: DFGEdge[] };
  missingInSecond: { nodes: string[]; edges: DFGEdge[] };
}

// ─── DFG Creation ─────────────────────────────────────────────────────────

/**
 * Create a DFG from an event log.
 *
 * The DFG captures all directly-follows relationships and their frequencies.
 */
export function createDFG(eventLog: Array<{ activities: string[] }>): DFG {
  const nodes = new Set<string>();
  const edges = new Map<string, DFGEdge>();
  const startActivities = new Map<string, number>();
  const endActivities = new Map<string, number>();
  let totalEvents = 0;
  let totalTraces = eventLog.length;

  for (const trace of eventLog) {
    const { activities } = trace;

    if (activities.length === 0) {
      continue;
    }

    // Record start activity
    startActivities.set(activities[0], (startActivities.get(activities[0]) || 0) + 1);

    // Record end activity
    endActivities.set(activities[activities.length - 1], (endActivities.get(activities[activities.length - 1]) || 0) + 1);

    // Add all activities to nodes
    for (const activity of activities) {
      nodes.add(activity);
    }

    // Add edges for directly-follows relationships
    for (let i = 0; i < activities.length - 1; i++) {
      const source = activities[i];
      const target = activities[i + 1];
      const key = `${source}->${target}`;

      const existing = edges.get(key);
      if (existing) {
        existing.count++;
      } else {
        edges.set(key, { source, target, count: 1 });
      }
    }

    totalEvents += activities.length;
  }

  return {
    nodes: Array.from(nodes).sort(),
    edges: Array.from(edges.values()).sort((a, b) => {
      if (a.source !== b.source) return a.source.localeCompare(b.source);
      return a.target.localeCompare(b.target);
    }),
    startActivities,
    endActivities,
    totalEvents,
    totalTraces,
  };
}

/**
 * Create a DFG from a simple edge list.
 *
 * Useful for creating test fixtures.
 */
export function createDFGFromEdges(
  edges: Array<{ source: string; target: string; count: number }>,
  options: { startActivities?: string[]; endActivities?: string[] } = {},
): DFG {
  const nodes = new Set<string>();
  const edgeMap = new Map<string, DFGEdge>();
  const startActivities = new Map<string, number>();
  const endActivities = new Map<string, number>();

  for (const edge of edges) {
    nodes.add(edge.source);
    nodes.add(edge.target);

    const key = `${edge.source}->${edge.target}`;
    const existing = edgeMap.get(key);
    if (existing) {
      existing.count += edge.count;
    } else {
      edgeMap.set(key, { ...edge });
    }
  }

  // Set start/end activities if provided
  if (options.startActivities) {
    for (const activity of options.startActivities) {
      startActivities.set(activity, 1);
    }
  }
  if (options.endActivities) {
    for (const activity of options.endActivities) {
      endActivities.set(activity, 1);
    }
  }

  return {
    nodes: Array.from(nodes).sort(),
    edges: Array.from(edgeMap.values()),
    startActivities,
    endActivities,
    totalEvents: edges.reduce((sum, e) => sum + e.count, 0),
    totalTraces: 1, // Unknown, default to 1
  };
}

// ─── DFG Comparison ───────────────────────────────────────────────────────

/**
 * Compare two DFGs.
 *
 * Computes similarity metrics and identifies differences.
 */
export function compareDFGs(df1: DFG, df2: DFG): DFGComparison {
  // Node comparison
  const nodes1 = new Set(df1.nodes);
  const nodes2 = new Set(df2.nodes);

  const nodeIntersection = Array.from(nodes1).filter(n => nodes2.has(n)).sort();
  const nodeUnion = Array.from(new Set([...df1.nodes, ...df2.nodes])).sort();

  // Edge comparison
  const edges1 = new Map(df1.edges.map(e => [`${e.source}->${e.target}`, e]));
  const edges2 = new Map(df2.edges.map(e => [`${e.source}->${e.target}`, e]));

  const edgeIntersection: DFGEdge[] = [];
  const edgeUnion: DFGEdge[] = [];

  // Add edges from first DFG
  for (const edge of df1.edges) {
    const key = `${edge.source}->${edge.target}`;
    edgeUnion.push(edge);

    const edge2 = edges2.get(key);
    if (edge2) {
      edgeIntersection.push(edge);
    }
  }

  // Add edges only in second DFG
  for (const edge of df2.edges) {
    const key = `${edge.source}->${edge.target}`;
    if (!edges1.has(key)) {
      edgeUnion.push(edge);
    }
  }

  // Jaccard similarity
  const nodeJaccard = nodeUnion.length > 0 ? nodeIntersection.length / nodeUnion.length : 1;
  const edgeJaccard = edgeUnion.length > 0 ? edgeIntersection.length / edgeUnion.length : 1;

  // Missing elements
  const missingInFirst = {
    nodes: Array.from(nodes2).filter(n => !nodes1.has(n)),
    edges: df2.edges.filter(e => !edges1.has(`${e.source}->${e.target}`)),
  };

  const missingInSecond = {
    nodes: Array.from(nodes1).filter(n => !nodes2.has(n)),
    edges: df1.edges.filter(e => !edges2.has(`${e.source}->${e.target}`)),
  };

  const identical = nodeJaccard === 1 && edgeJaccard === 1;

  return {
    identical,
    nodeIntersection,
    nodeUnion,
    edgeIntersection,
    edgeUnion,
    nodeJaccard,
    edgeJaccard,
    missingInFirst,
    missingInSecond,
  };
}

/**
 * Check if two DFGs are equivalent (same nodes and edges).
 */
export function areDFGsEquivalent(df1: DFG, df2: DFG): boolean {
  if (df1.nodes.length !== df2.nodes.length) {
    return false;
  }

  if (df1.edges.length !== df2.edges.length) {
    return false;
  }

  const comparison = compareDFGs(df1, df2);
  return comparison.identical;
}

// ─── DFG Validation ───────────────────────────────────────────────────────

/**
 * Validate DFG structure.
 */
export function validateDFG(dfg: DFG): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check nodes
  if (!dfg.nodes || dfg.nodes.length === 0) {
    errors.push('DFG must have at least one node');
  }

  // Check for duplicate nodes
  const nodeSet = new Set(dfg.nodes);
  if (nodeSet.size !== dfg.nodes.length) {
    errors.push('DFG contains duplicate nodes');
  }

  // Check edges
  if (!dfg.edges) {
    errors.push('DFG edges is undefined');
  } else {
    for (const edge of dfg.edges) {
      // Check edge references valid nodes
      if (!nodeSet.has(edge.source)) {
        errors.push(`Edge source '${edge.source}' not in nodes`);
      }
      if (!nodeSet.has(edge.target)) {
        errors.push(`Edge target '${edge.target}' not in nodes`);
      }

      // Check count is non-negative
      if (edge.count < 0) {
        errors.push(`Edge ${edge.source}->${edge.target} has negative count`);
      }
    }
  }

  // Check start activities reference valid nodes
  if (dfg.startActivities) {
    for (const activity of dfg.startActivities.keys()) {
      if (!nodeSet.has(activity)) {
        errors.push(`Start activity '${activity}' not in nodes`);
      }
    }
  }

  // Check end activities reference valid nodes
  if (dfg.endActivities) {
    for (const activity of dfg.endActivities.keys()) {
      if (!nodeSet.has(activity)) {
        errors.push(`End activity '${activity}' not in nodes`);
      }
    }
  }

  // Check counts are non-negative
  if (dfg.totalEvents < 0) {
    errors.push('totalEvents cannot be negative');
  }

  if (dfg.totalTraces < 0) {
    errors.push('totalTraces cannot be negative');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Check if DFG is consistent with event log.
 *
 * Verifies that DFG statistics match the event log.
 */
export function validateDFGConsistency(dfg: DFG, eventLog: Array<{ activities: string[] }>): { consistent: boolean; errors: string[] } {
  const errors: string[] = [];

  // Recompute DFG from log
  const recomputed = createDFG(eventLog);

  // Compare total events
  if (dfg.totalEvents !== recomputed.totalEvents) {
    errors.push(`totalEvents mismatch: expected ${recomputed.totalEvents}, got ${dfg.totalEvents}`);
  }

  // Compare total traces
  if (dfg.totalTraces !== recomputed.totalTraces) {
    errors.push(`totalTraces mismatch: expected ${recomputed.totalTraces}, got ${dfg.totalTraces}`);
  }

  // Compare nodes
  if (dfg.nodes.length !== recomputed.nodes.length) {
    errors.push(`Node count mismatch: expected ${recomputed.nodes.length}, got ${dfg.nodes.length}`);
  }

  // Compare edges (including counts)
  const edges1 = new Map(dfg.edges.map(e => [`${e.source}->${e.target}`, e.count]));
  const edges2 = new Map(recomputed.edges.map(e => [`${e.source}->${e.target}`, e.count]));

  for (const [key, count] of edges2) {
    const count1 = edges1.get(key);
    if (count1 === undefined) {
      errors.push(`Missing edge: ${key}`);
    } else if (count1 !== count) {
      errors.push(`Edge count mismatch for ${key}: expected ${count}, got ${count1}`);
    }
  }

  for (const [key, count] of edges1) {
    if (!edges2.has(key)) {
      errors.push(`Extra edge: ${key} (count=${count})`);
    }
  }

  return {
    consistent: errors.length === 0,
    errors,
  };
}

// ─── DFG Statistics ───────────────────────────────────────────────────────

/**
 * Compute DFG density (actual edges / possible edges).
 */
export function computeDFGDensity(dfg: DFG): number {
  const numNodes = dfg.nodes.length;
  if (numNodes === 0) return 0;

  const possibleEdges = numNodes * numNodes;
  const actualEdges = dfg.edges.length;

  return actualEdges / possibleEdges;
}

/**
 * Compute average node degree (average in + out edges per node).
 */
export function computeAverageNodeDegree(dfg: DFG): number {
  if (dfg.nodes.length === 0) return 0;

  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();

  // Initialize
  for (const node of dfg.nodes) {
    inDegree.set(node, 0);
    outDegree.set(node, 0);
  }

  // Count edges
  for (const edge of dfg.edges) {
    outDegree.set(edge.source, (outDegree.get(edge.source) || 0) + 1);
    inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
  }

  // Sum degrees
  let totalDegree = 0;
  for (const node of dfg.nodes) {
    totalDegree += (inDegree.get(node) || 0) + (outDegree.get(node) || 0);
  }

  return totalDegree / dfg.nodes.length;
}

/**
 * Find longest path in DFG (by number of edges).
 */
export function findLongestPath(dfg: DFG): string[] {
  if (dfg.nodes.length === 0) return [];

  // Build adjacency list
  const adjacency = new Map<string, string[]>();
  for (const node of dfg.nodes) {
    adjacency.set(node, []);
  }

  for (const edge of dfg.edges) {
    const neighbors = adjacency.get(edge.source) || [];
    neighbors.push(edge.target);
    adjacency.set(edge.source, neighbors);
  }

  // DFS from each start node to find longest path
  const startNodes = dfg.startActivities.size > 0
    ? Array.from(dfg.startActivities.keys())
    : dfg.nodes.filter(n => !dfg.edges.some(e => e.target === n));

  let longestPath: string[] = [];

  function dfs(node: string, visited: Set<string>, path: string[]) {
    const newPath = [...path, node];
    visited.add(node);

    if (newPath.length > longestPath.length) {
      longestPath = newPath;
    }

    const neighbors = adjacency.get(node) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        dfs(neighbor, visited, newPath);
      }
    }

    visited.delete(node);
  }

  for (const start of startNodes) {
    dfs(start, new Set(), []);
  }

  return longestPath;
}

// ─── Test Helpers ─────────────────────────────────────────────────────────

/**
 * Create a test DFG with a simple sequential process.
 */
export function createSequentialTestDFG(): DFG {
  return createDFGFromEdges(
    [
      { source: 'A', target: 'B', count: 10 },
      { source: 'B', target: 'C', count: 10 },
      { source: 'C', target: 'D', count: 10 },
    ],
    { startActivities: ['A'], endActivities: ['D'] }
  );
}

/**
 * Create a test DFG with parallel branching.
 */
export function createParallelTestDFG(): DFG {
  return createDFGFromEdges(
    [
      { source: 'A', target: 'B', count: 10 },
      { source: 'A', target: 'C', count: 10 },
      { source: 'B', target: 'D', count: 10 },
      { source: 'C', target: 'D', count: 10 },
      { source: 'D', target: 'E', count: 10 },
    ],
    { startActivities: ['A'], endActivities: ['E'] }
  );
}

/**
 * Create a test DFG with exclusive choice.
 */
export function createChoiceTestDFG(): DFG {
  return createDFGFromEdges(
    [
      { source: 'A', target: 'B', count: 5 },
      { source: 'A', target: 'C', count: 5 },
      { source: 'B', target: 'D', count: 5 },
      { source: 'C', target: 'D', count: 5 },
      { source: 'D', target: 'E', count: 10 },
    ],
    { startActivities: ['A'], endActivities: ['E'] }
  );
}

/**
 * Create test event log for DFG testing.
 */
export function createTestEventLogForDFG(): Array<{ activities: string[] }> {
  return [
    { activities: ['A', 'B', 'C', 'D'] },
    { activities: ['A', 'B', 'C', 'D'] },
    { activities: ['A', 'B', 'C', 'D'] },
    { activities: ['A', 'B', 'C', 'D'] },
    { activities: ['A', 'B', 'C', 'D'] },
    { activities: ['A', 'B', 'C', 'D'] },
    { activities: ['A', 'B', 'C', 'D'] },
    { activities: ['A', 'B', 'C', 'D'] },
    { activities: ['A', 'B', 'C', 'D'] },
    { activities: ['A', 'B', 'C', 'D'] },
  ];
}

// ─── Utility Functions ─────────────────────────────────────────────────────

/**
 * Format DFG as human-readable string.
 */
export function formatDFG(dfg: DFG): string {
  const lines: string[] = [];

  lines.push('DFG:');
  lines.push(`  Nodes: [${dfg.nodes.join(', ')}]`);
  lines.push(`  Total Events: ${dfg.totalEvents}`);
  lines.push(`  Total Traces: ${dfg.totalTraces}`);
  lines.push('');

  lines.push('  Start Activities:');
  for (const [activity, count] of dfg.startActivities.entries()) {
    lines.push(`    ${activity}: ${count}`);
  }
  lines.push('');

  lines.push('  End Activities:');
  for (const [activity, count] of dfg.endActivities.entries()) {
    lines.push(`    ${activity}: ${count}`);
  }
  lines.push('');

  lines.push('  Edges:');
  for (const edge of dfg.edges) {
    lines.push(`    ${edge.source} -> ${edge.target}: ${edge.count}`);
  }

  return lines.join('\n');
}

/**
 * Format DFG comparison as human-readable string.
 */
export function formatDFGComparison(comparison: DFGComparison): string {
  const lines: string[] = [];

  lines.push(`DFG Comparison: ${comparison.identical ? 'IDENTICAL' : 'DIFFERENT'}`);
  lines.push(`  Node Jaccard: ${comparison.nodeJaccard.toFixed(4)}`);
  lines.push(`  Edge Jaccard: ${comparison.edgeJaccard.toFixed(4)}`);
  lines.push('');

  lines.push(`  Node Intersection: [${comparison.nodeIntersection.join(', ')}]`);
  lines.push(`  Node Union: [${comparison.nodeUnion.join(', ')}]`);
  lines.push('');

  if (comparison.missingInSecond.nodes.length > 0) {
    lines.push(`  Nodes only in first: [${comparison.missingInSecond.nodes.join(', ')}]`);
  }
  if (comparison.missingInFirst.nodes.length > 0) {
    lines.push(`  Nodes only in second: [${comparison.missingInFirst.nodes.join(', ')}]`);
  }
  lines.push('');

  if (comparison.missingInSecond.edges.length > 0) {
    lines.push(`  Edges only in first:`);
    for (const edge of comparison.missingInSecond.edges) {
      lines.push(`    ${edge.source} -> ${edge.target}: ${edge.count}`);
    }
  }
  if (comparison.missingInFirst.edges.length > 0) {
    lines.push(`  Edges only in second:`);
    for (const edge of comparison.missingInFirst.edges) {
      lines.push(`    ${edge.source} -> ${edge.target}: ${edge.count}`);
    }
  }

  return lines.join('\n');
}

/**
 * Serialize DFG to JSON string.
 */
export function serializeDFG(dfg: DFG): string {
  return JSON.stringify({
    nodes: dfg.nodes,
    edges: dfg.edges,
    startActivities: Array.from(dfg.startActivities.entries()),
    endActivities: Array.from(dfg.endActivities.entries()),
    totalEvents: dfg.totalEvents,
    totalTraces: dfg.totalTraces,
  }, null, 2);
}

/**
 * Deserialize DFG from JSON string.
 */
export function deserializeDFG(json: string): DFG {
  const obj = JSON.parse(json);
  return {
    nodes: obj.nodes,
    edges: obj.edges,
    startActivities: new Map(obj.startActivities),
    endActivities: new Map(obj.endActivities),
    totalEvents: obj.totalEvents,
    totalTraces: obj.totalTraces,
  };
}
