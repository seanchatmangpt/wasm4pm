/**
 * Directed Acyclic Graph (DAG) for execution planning
 */
/**
 * Detects if a graph contains a cycle using depth-first search
 *
 * @param dag - The DAG to check
 * @returns true if a cycle is detected, false otherwise
 * @throws Error if a node is referenced in edges but not in nodes list
 */
export function hasCycle(dag) {
    const nodeSet = new Set(dag.nodes);
    // Validate all edges reference existing nodes
    for (const [source, target] of dag.edges) {
        if (!nodeSet.has(source) || !nodeSet.has(target)) {
            throw new Error(`Edge references non-existent node: ${source} -> ${target}`);
        }
    }
    // Build adjacency list
    const adjacencyList = new Map();
    for (const node of dag.nodes) {
        adjacencyList.set(node, []);
    }
    for (const [source, target] of dag.edges) {
        adjacencyList.get(source).push(target);
    }
    // Color-based cycle detection: white=0, gray=1, black=2
    const colors = new Map();
    for (const node of dag.nodes) {
        colors.set(node, 0);
    }
    const hasCycleDFS = (node) => {
        colors.set(node, 1); // Mark as gray (in progress)
        const neighbors = adjacencyList.get(node) || [];
        for (const neighbor of neighbors) {
            const color = colors.get(neighbor);
            if (color === 1) {
                // Back edge found
                return true;
            }
            if (color === 0 && hasCycleDFS(neighbor)) {
                return true;
            }
        }
        colors.set(node, 2); // Mark as black (complete)
        return false;
    };
    // Check all nodes (in case of disconnected components)
    for (const node of dag.nodes) {
        if (colors.get(node) === 0) {
            if (hasCycleDFS(node)) {
                return true;
            }
        }
    }
    return false;
}
/**
 * Performs topological sort on a DAG using Kahn's algorithm
 *
 * @param dag - The DAG to sort
 * @returns Array of nodes in topological order
 * @throws Error if the graph contains a cycle
 */
export function topologicalSort(dag) {
    if (hasCycle(dag)) {
        throw new Error('Cannot perform topological sort on a graph with cycles');
    }
    // Calculate in-degrees
    const inDegree = new Map();
    const adjacencyList = new Map();
    for (const node of dag.nodes) {
        inDegree.set(node, 0);
        adjacencyList.set(node, []);
    }
    for (const [source, target] of dag.edges) {
        adjacencyList.get(source).push(target);
        inDegree.set(target, (inDegree.get(target) ?? 0) + 1);
    }
    // Find all nodes with in-degree 0
    const queue = [];
    for (const node of dag.nodes) {
        if (inDegree.get(node) === 0) {
            queue.push(node);
        }
    }
    const result = [];
    while (queue.length > 0) {
        const node = queue.shift();
        result.push(node);
        const neighbors = adjacencyList.get(node) || [];
        for (const neighbor of neighbors) {
            inDegree.set(neighbor, inDegree.get(neighbor) - 1);
            if (inDegree.get(neighbor) === 0) {
                queue.push(neighbor);
            }
        }
    }
    return result;
}
/**
 * Finds all nodes that a given node depends on (transitive closure of dependencies)
 *
 * @param dag - The DAG
 * @param node - The target node
 * @returns Set of all nodes that must complete before the target node
 */
export function getDependencies(dag, node) {
    const dependencies = new Set();
    // Build reverse adjacency list (who points to this node)
    const reverseAdjacency = new Map();
    for (const n of dag.nodes) {
        reverseAdjacency.set(n, []);
    }
    for (const [source, target] of dag.edges) {
        reverseAdjacency.get(target).push(source);
    }
    // BFS to find all transitive dependencies
    const queue = [...(reverseAdjacency.get(node) || [])];
    while (queue.length > 0) {
        const current = queue.shift();
        if (!dependencies.has(current)) {
            dependencies.add(current);
            const predecessors = reverseAdjacency.get(current) || [];
            queue.push(...predecessors);
        }
    }
    return dependencies;
}
/**
 * Finds all nodes that depend on a given node (transitive dependents)
 *
 * @param dag - The DAG
 * @param node - The source node
 * @returns Set of all nodes that depend on the source node
 */
export function getDependents(dag, node) {
    const dependents = new Set();
    // Build adjacency list
    const adjacencyList = new Map();
    for (const n of dag.nodes) {
        adjacencyList.set(n, []);
    }
    for (const [source, target] of dag.edges) {
        adjacencyList.get(source).push(target);
    }
    // BFS to find all transitive dependents
    const queue = [...(adjacencyList.get(node) || [])];
    while (queue.length > 0) {
        const current = queue.shift();
        if (!dependents.has(current)) {
            dependents.add(current);
            const successors = adjacencyList.get(current) || [];
            queue.push(...successors);
        }
    }
    return dependents;
}
/**
 * Validates DAG structure
 *
 * @param dag - The DAG to validate
 * @returns Array of validation errors (empty if valid)
 */
export function validateDAG(dag) {
    const errors = [];
    const nodeSet = new Set(dag.nodes);
    // Check for duplicate nodes
    if (new Set(dag.nodes).size !== dag.nodes.length) {
        errors.push('DAG contains duplicate node identifiers');
    }
    // Check all edges reference existing nodes
    for (const [source, target] of dag.edges) {
        if (!nodeSet.has(source)) {
            errors.push(`Edge references non-existent source node: ${source}`);
        }
        if (!nodeSet.has(target)) {
            errors.push(`Edge references non-existent target node: ${target}`);
        }
        if (source === target) {
            errors.push(`Self-loop detected on node: ${source}`);
        }
    }
    // Check for duplicate edges
    const edgeSet = new Set();
    for (const [source, target] of dag.edges) {
        const edgeKey = `${source}->${target}`;
        if (edgeSet.has(edgeKey)) {
            errors.push(`Duplicate edge found: ${edgeKey}`);
        }
        edgeSet.add(edgeKey);
    }
    // Check for cycles
    if (dag.edges.length > 0) {
        try {
            if (hasCycle(dag)) {
                errors.push('DAG contains a cycle');
            }
        }
        catch (err) {
            errors.push(`Cycle detection error: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    return errors;
}
//# sourceMappingURL=dag.js.map