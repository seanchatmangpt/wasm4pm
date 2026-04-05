/**
 * Plan Schema - DAG representation for execution plans
 * Schema version 1.0
 *
 * A Plan is a directed acyclic graph (DAG) where nodes are processing
 * steps (source, algorithm, sink) and edges define data flow.
 * Deterministic serialization ensures identical plans produce identical hashes.
 */

/**
 * Node types in the execution DAG
 */
export type PlanNodeKind = 'source' | 'algorithm' | 'sink';

/**
 * A single node in the execution plan DAG
 */
export interface PlanNode {
  /** Unique node identifier within this plan */
  id: string;

  /** Node type */
  kind: PlanNodeKind;

  /** Human-readable label */
  label: string;

  /** Configuration specific to this node */
  config: Record<string, unknown>;

  /** Semantic version of the node's implementation */
  version: string;
}

/**
 * A directed edge in the execution plan DAG
 */
export interface PlanEdge {
  /** Source node ID */
  from: string;

  /** Target node ID */
  to: string;

  /** Optional label describing the data flowing on this edge */
  label?: string;
}

/**
 * Execution plan — a DAG of processing steps
 */
export interface Plan {
  /** Schema version for forward compatibility */
  schema_version: '1.0';

  /** Unique plan identifier */
  plan_id: string;

  /** ISO 8601 timestamp of plan creation */
  created_at: string;

  /** Nodes in the DAG, sorted by id for determinism */
  nodes: PlanNode[];

  /** Edges in the DAG, sorted by (from, to) for determinism */
  edges: PlanEdge[];

  /** Plan metadata */
  metadata: {
    /** Name of the planner that generated this plan */
    planner: string;
    /** Planner version */
    planner_version: string;
    /** Estimated execution time in ms (if available) */
    estimated_duration_ms?: number;
  };
}

/**
 * Sort nodes by id for deterministic serialization
 */
export function sortNodes(nodes: PlanNode[]): PlanNode[] {
  return [...nodes].sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Sort edges by (from, to) for deterministic serialization
 */
export function sortEdges(edges: PlanEdge[]): PlanEdge[] {
  return [...edges].sort((a, b) => {
    const fromCmp = a.from.localeCompare(b.from);
    return fromCmp !== 0 ? fromCmp : a.to.localeCompare(b.to);
  });
}

/**
 * Normalize a plan for deterministic hashing:
 * sorts nodes by id, edges by (from, to), and config keys recursively
 */
export function normalizePlan(plan: Plan): Plan {
  return {
    ...plan,
    nodes: sortNodes(plan.nodes).map((node) => ({
      ...node,
      config: sortObjectKeys(node.config),
    })),
    edges: sortEdges(plan.edges),
    metadata: sortObjectKeys(plan.metadata) as Plan['metadata'],
  };
}

/**
 * Recursively sort object keys
 */
function sortObjectKeys(obj: Record<string, unknown>): Record<string, unknown> {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    const val = obj[key];
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      sorted[key] = sortObjectKeys(val as Record<string, unknown>);
    } else {
      sorted[key] = val;
    }
  }
  return sorted;
}

/**
 * Validate that a plan forms a valid DAG (no cycles, all edge refs valid)
 */
export function validatePlanDAG(plan: Plan): string[] {
  const errors: string[] = [];
  const nodeIds = new Set(plan.nodes.map((n) => n.id));

  // Check for duplicate node ids
  if (nodeIds.size !== plan.nodes.length) {
    errors.push('Duplicate node IDs detected');
  }

  // Check all edge references are valid
  for (const edge of plan.edges) {
    if (!nodeIds.has(edge.from)) {
      errors.push(`Edge references unknown source node: ${edge.from}`);
    }
    if (!nodeIds.has(edge.to)) {
      errors.push(`Edge references unknown target node: ${edge.to}`);
    }
    if (edge.from === edge.to) {
      errors.push(`Self-loop detected on node: ${edge.from}`);
    }
  }

  // Cycle detection via topological sort (Kahn's algorithm)
  if (errors.length === 0) {
    const inDegree = new Map<string, number>();
    const adj = new Map<string, string[]>();
    for (const id of nodeIds) {
      inDegree.set(id, 0);
      adj.set(id, []);
    }
    for (const edge of plan.edges) {
      adj.get(edge.from)!.push(edge.to);
      inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
    }

    const queue: string[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id);
    }

    let visited = 0;
    while (queue.length > 0) {
      const node = queue.shift()!;
      visited++;
      for (const neighbor of adj.get(node) ?? []) {
        const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
        inDegree.set(neighbor, newDeg);
        if (newDeg === 0) queue.push(neighbor);
      }
    }

    if (visited !== nodeIds.size) {
      errors.push('Plan contains a cycle');
    }
  }

  // Validate node kinds: must have at least one source and one sink
  const kinds = new Set(plan.nodes.map((n) => n.kind));
  if (!kinds.has('source')) {
    errors.push('Plan must contain at least one source node');
  }
  if (!kinds.has('sink')) {
    errors.push('Plan must contain at least one sink node');
  }

  return errors;
}

/**
 * Type guard for Plan objects
 */
export function isPlan(value: unknown): value is Plan {
  if (!value || typeof value !== 'object') return false;
  const p = value as Record<string, unknown>;
  return (
    p.schema_version === '1.0' &&
    typeof p.plan_id === 'string' &&
    typeof p.created_at === 'string' &&
    Array.isArray(p.nodes) &&
    Array.isArray(p.edges) &&
    typeof p.metadata === 'object' &&
    p.metadata !== null
  );
}

/**
 * JSON Schema for Plan (for external validation)
 */
export const PLAN_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://wasm4pm.dev/schemas/plan/1.0',
  title: 'Plan',
  description: 'Execution plan DAG',
  type: 'object' as const,
  required: ['schema_version', 'plan_id', 'created_at', 'nodes', 'edges', 'metadata'],
  properties: {
    schema_version: { type: 'string' as const, const: '1.0' },
    plan_id: { type: 'string' as const },
    created_at: { type: 'string' as const, format: 'date-time' },
    nodes: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        required: ['id', 'kind', 'label', 'config', 'version'],
        properties: {
          id: { type: 'string' as const },
          kind: { type: 'string' as const, enum: ['source', 'algorithm', 'sink'] },
          label: { type: 'string' as const },
          config: { type: 'object' as const },
          version: { type: 'string' as const },
        },
        additionalProperties: false,
      },
    },
    edges: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        required: ['from', 'to'],
        properties: {
          from: { type: 'string' as const },
          to: { type: 'string' as const },
          label: { type: 'string' as const },
        },
        additionalProperties: false,
      },
    },
    metadata: {
      type: 'object' as const,
      required: ['planner', 'planner_version'],
      properties: {
        planner: { type: 'string' as const },
        planner_version: { type: 'string' as const },
        estimated_duration_ms: { type: 'number' as const, minimum: 0 },
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
} as const;
