/**
 * DFG (Directly-Follows Graph) Utilities
 *
 * Utilities for creating, comparing, and validating DFGs.
 * DFGs represent the frequency of activity transitions in event logs.
 */
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
    nodeJaccard: number;
    edgeJaccard: number;
    missingInFirst: {
        nodes: string[];
        edges: DFGEdge[];
    };
    missingInSecond: {
        nodes: string[];
        edges: DFGEdge[];
    };
}
/**
 * Create a DFG from an event log.
 *
 * The DFG captures all directly-follows relationships and their frequencies.
 */
export declare function createDFG(eventLog: Array<{
    activities: string[];
}>): DFG;
/**
 * Create a DFG from a simple edge list.
 *
 * Useful for creating test fixtures.
 */
export declare function createDFGFromEdges(edges: Array<{
    source: string;
    target: string;
    count: number;
}>, options?: {
    startActivities?: string[];
    endActivities?: string[];
}): DFG;
/**
 * Compare two DFGs.
 *
 * Computes similarity metrics and identifies differences.
 */
export declare function compareDFGs(df1: DFG, df2: DFG): DFGComparison;
/**
 * Check if two DFGs are equivalent (same nodes and edges).
 */
export declare function areDFGsEquivalent(df1: DFG, df2: DFG): boolean;
/**
 * Validate DFG structure.
 */
export declare function validateDFG(dfg: DFG): {
    valid: boolean;
    errors: string[];
};
/**
 * Check if DFG is consistent with event log.
 *
 * Verifies that DFG statistics match the event log.
 */
export declare function validateDFGConsistency(dfg: DFG, eventLog: Array<{
    activities: string[];
}>): {
    consistent: boolean;
    errors: string[];
};
/**
 * Compute DFG density (actual edges / possible edges).
 */
export declare function computeDFGDensity(dfg: DFG): number;
/**
 * Compute average node degree (average in + out edges per node).
 */
export declare function computeAverageNodeDegree(dfg: DFG): number;
/**
 * Find longest path in DFG (by number of edges).
 */
export declare function findLongestPath(dfg: DFG): string[];
/**
 * Create a test DFG with a simple sequential process.
 */
export declare function createSequentialTestDFG(): DFG;
/**
 * Create a test DFG with parallel branching.
 */
export declare function createParallelTestDFG(): DFG;
/**
 * Create a test DFG with exclusive choice.
 */
export declare function createChoiceTestDFG(): DFG;
/**
 * Create test event log for DFG testing.
 */
export declare function createTestEventLogForDFG(): Array<{
    activities: string[];
}>;
/**
 * Format DFG as human-readable string.
 */
export declare function formatDFG(dfg: DFG): string;
/**
 * Format DFG comparison as human-readable string.
 */
export declare function formatDFGComparison(comparison: DFGComparison): string;
/**
 * Serialize DFG to JSON string.
 */
export declare function serializeDFG(dfg: DFG): string;
/**
 * Deserialize DFG from JSON string.
 */
export declare function deserializeDFG(json: string): DFG;
//# sourceMappingURL=dfg.d.ts.map