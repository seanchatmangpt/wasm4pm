/**
 * Plan Schema - DAG representation for execution plans
 * Schema version 1.0
 *
 * A Plan is a directed acyclic graph (DAG) where nodes are processing
 * steps (source, algorithm, sink) and edges define data flow.
 * Deterministic serialization ensures identical plans produce identical hashes.
 */
/**
 * Sort nodes by id for deterministic serialization
 */
export function sortNodes(nodes) {
    return [...nodes].sort((a, b) => a.id.localeCompare(b.id));
}
/**
 * Sort edges by (from, to) for deterministic serialization
 */
export function sortEdges(edges) {
    return [...edges].sort((a, b) => {
        const fromCmp = a.from.localeCompare(b.from);
        return fromCmp !== 0 ? fromCmp : a.to.localeCompare(b.to);
    });
}
/**
 * Normalize a plan for deterministic hashing:
 * sorts nodes by id, edges by (from, to), and config keys recursively
 */
export function normalizePlan(plan) {
    return {
        ...plan,
        nodes: sortNodes(plan.nodes).map((node) => ({
            ...node,
            config: sortObjectKeys(node.config),
        })),
        edges: sortEdges(plan.edges),
        metadata: sortObjectKeys(plan.metadata),
    };
}
/**
 * Recursively sort object keys
 */
function sortObjectKeys(obj) {
    const sorted = {};
    for (const key of Object.keys(obj).sort()) {
        const val = obj[key];
        if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
            sorted[key] = sortObjectKeys(val);
        }
        else {
            sorted[key] = val;
        }
    }
    return sorted;
}
/**
 * Validate that a plan forms a valid DAG (no cycles, all edge refs valid)
 */
export function validatePlanDAG(plan) {
    const errors = [];
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
        const inDegree = new Map();
        const adj = new Map();
        for (const id of nodeIds) {
            inDegree.set(id, 0);
            adj.set(id, []);
        }
        for (const edge of plan.edges) {
            adj.get(edge.from).push(edge.to);
            inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
        }
        const queue = [];
        for (const [id, deg] of inDegree) {
            if (deg === 0)
                queue.push(id);
        }
        let visited = 0;
        while (queue.length > 0) {
            const node = queue.shift();
            visited++;
            for (const neighbor of adj.get(node) ?? []) {
                const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
                inDegree.set(neighbor, newDeg);
                if (newDeg === 0)
                    queue.push(neighbor);
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
export function isPlan(value) {
    if (!value || typeof value !== 'object')
        return false;
    const p = value;
    return (p.schema_version === '1.0' &&
        typeof p.plan_id === 'string' &&
        typeof p.created_at === 'string' &&
        Array.isArray(p.nodes) &&
        Array.isArray(p.edges) &&
        typeof p.metadata === 'object' &&
        p.metadata !== null);
}
/**
 * JSON Schema for Plan (for external validation)
 */
export const PLAN_JSON_SCHEMA = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://wasm4pm.dev/schemas/plan/1.0',
    title: 'Plan',
    description: 'Execution plan DAG',
    type: 'object',
    required: ['schema_version', 'plan_id', 'created_at', 'nodes', 'edges', 'metadata'],
    properties: {
        schema_version: { type: 'string', const: '1.0' },
        plan_id: { type: 'string' },
        created_at: { type: 'string', format: 'date-time' },
        nodes: {
            type: 'array',
            items: {
                type: 'object',
                required: ['id', 'kind', 'label', 'config', 'version'],
                properties: {
                    id: { type: 'string' },
                    kind: { type: 'string', enum: ['source', 'algorithm', 'sink'] },
                    label: { type: 'string' },
                    config: { type: 'object' },
                    version: { type: 'string' },
                },
                additionalProperties: false,
            },
        },
        edges: {
            type: 'array',
            items: {
                type: 'object',
                required: ['from', 'to'],
                properties: {
                    from: { type: 'string' },
                    to: { type: 'string' },
                    label: { type: 'string' },
                },
                additionalProperties: false,
            },
        },
        metadata: {
            type: 'object',
            required: ['planner', 'planner_version'],
            properties: {
                planner: { type: 'string' },
                planner_version: { type: 'string' },
                estimated_duration_ms: { type: 'number', minimum: 0 },
            },
            additionalProperties: false,
        },
    },
    additionalProperties: false,
};
//# sourceMappingURL=plan.js.map