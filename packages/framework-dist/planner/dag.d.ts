/**
 * Directed Acyclic Graph (DAG) for execution planning
 */
import { z } from 'zod';
/**
 * Represents a directed acyclic graph for plan execution
 */
export declare const DAGSchema: z.ZodObject<{
    /** List of node identifiers */
    nodes: z.ZodArray<z.ZodString, "many">;
    /** List of directed edges as [source, target] pairs */
    edges: z.ZodArray<z.ZodTuple<[z.ZodString, z.ZodString], null>, "many">;
}, "strip", z.ZodTypeAny, {
    nodes: string[];
    edges: [string, string][];
}, {
    nodes: string[];
    edges: [string, string][];
}>;
export type DAG = z.infer<typeof DAGSchema>;
/**
 * Detects if a graph contains a cycle using depth-first search
 *
 * @param dag - The DAG to check
 * @returns true if a cycle is detected, false otherwise
 * @throws Error if a node is referenced in edges but not in nodes list
 */
export declare function hasCycle(dag: DAG): boolean;
/**
 * Performs topological sort on a DAG using Kahn's algorithm
 *
 * @param dag - The DAG to sort
 * @returns Array of nodes in topological order
 * @throws Error if the graph contains a cycle
 */
export declare function topologicalSort(dag: DAG): string[];
/**
 * Finds all nodes that a given node depends on (transitive closure of dependencies)
 *
 * @param dag - The DAG
 * @param node - The target node
 * @returns Set of all nodes that must complete before the target node
 */
export declare function getDependencies(dag: DAG, node: string): Set<string>;
/**
 * Finds all nodes that depend on a given node (transitive dependents)
 *
 * @param dag - The DAG
 * @param node - The source node
 * @returns Set of all nodes that depend on the source node
 */
export declare function getDependents(dag: DAG, node: string): Set<string>;
/**
 * Validates DAG structure
 *
 * @param dag - The DAG to validate
 * @returns Array of validation errors (empty if valid)
 */
export declare function validateDAG(dag: DAG): string[];
//# sourceMappingURL=dag.d.ts.map