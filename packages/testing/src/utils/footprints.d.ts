/**
 * Footprint Utilities
 *
 * Footprints (behavioral profiles) capture ordering relationships between activities.
 * Used for process model comparison and conformance checking.
 */
export interface FootprintMatrix {
  activities: string[];
  matrix: Map<string, Map<string, FootprintRelation>>;
}
export type FootprintRelation = 'sequence' | 'parallel' | 'choice' | 'no_relation';
export interface FootprintComparison {
  equivalent: boolean;
  relationMatches: number;
  relationMismatches: number;
  missingInFirst: Array<{
    a: string;
    b: string;
    relation: FootprintRelation;
  }>;
  missingInSecond: Array<{
    a: string;
    b: string;
    relation: FootprintRelation;
  }>;
}
/**
 * Extract footprints from an event log.
 *
 * The footprint matrix captures the ordering relationships between activities.
 */
export declare function extractFootprintsFromLog(
  eventLog: Array<{
    activities: string[];
  }>
): FootprintMatrix;
/**
 * Extract footprints from a DFG.
 *
 * DFG provides sequence relations directly.
 */
export declare function extractFootprintsFromDFG(dfg: {
  nodes: string[];
  edges: Array<{
    source: string;
    target: string;
  }>;
}): FootprintMatrix;
/**
 * Compare two footprint matrices.
 */
export declare function compareFootprints(
  fp1: FootprintMatrix,
  fp2: FootprintMatrix
): FootprintComparison;
/**
 * Check if two footprint matrices are equivalent.
 */
export declare function areFootprintsEquivalent(
  fp1: FootprintMatrix,
  fp2: FootprintMatrix
): boolean;
/**
 * Format footprint matrix as human-readable string.
 */
export declare function formatFootprints(fp: FootprintMatrix): string;
/**
 * Format footprint comparison as human-readable string.
 */
export declare function formatFootprintComparison(comparison: FootprintComparison): string;
/**
 * Create test footprint matrix for sequential process A -> B -> C.
 */
export declare function createSequentialFootprint(): FootprintMatrix;
/**
 * Create test footprint matrix for parallel process A -> (B || C) -> D.
 */
export declare function createParallelFootprint(): FootprintMatrix;
/**
 * Create test footprint matrix for exclusive choice A -> (B # C) -> D.
 */
export declare function createChoiceFootprint(): FootprintMatrix;
/**
 * Serialize footprint matrix to JSON string.
 */
export declare function serializeFootprints(fp: FootprintMatrix): string;
/**
 * Deserialize footprint matrix from JSON string.
 */
export declare function deserializeFootprints(json: string): FootprintMatrix;
/**
 * Compute footprint entropy (measure of process complexity).
 */
export declare function computeFootprintEntropy(fp: FootprintMatrix): number;
//# sourceMappingURL=footprints.d.ts.map
