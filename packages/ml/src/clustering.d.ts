/**
 * Trace clustering — hyper-optimized k-means and DBSCAN.
 *
 * Performance techniques:
 *   - Columnar Float64Array layout (cache-line friendly)
 *   - Squared-distance throughout (sqrt only at output boundary)
 *   - Pre-allocated Int32Array for labels/assignments
 *   - k-means++ init with deterministic seeding
 *   - DBSCAN region-query with early exit on sorted distances
 *   - Single-pass centroid update
 */
import type { ClusteringMethod, ClusteringResult } from './types.js';
/**
 * Cluster traces by similarity using ML algorithms.
 */
export declare function clusterTraces(featuresJson: Array<Record<string, unknown>>, options?: {
    method?: ClusteringMethod;
    k?: number;
    eps?: number;
    minPoints?: number;
}): Promise<ClusteringResult>;
//# sourceMappingURL=clustering.d.ts.map