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
 *
 * Defensive hardening:
 *   - Parameter validation (k, eps, minPoints)
 *   - Guard against division by zero in centroid updates
 *   - Clamp cluster assignments to valid range
 */
import type { ClusteringMethod, ClusteringResult } from './types.js';
/**
 * Cluster traces by feature similarity.
 *
 * Methods:
 *   - `'kmeans'` — k-means++ initialisation, columnar squared-distance loop.
 *     Convergence is deterministic for identical input.
 *   - `'dbscan'` — density-based clustering. Points with fewer than `minPoints`
 *     within `eps` distance are labelled as noise (cluster `-1`, standard DBSCAN convention).
 *
 * Returns `{ assignments: [] }` for empty input — does not throw.
 *
 * @param featuresJson - Per-case feature objects.
 * @param options.method - `'kmeans'` (default) or `'dbscan'`.
 * @param options.k - k-means cluster count (default 3, capped at sample count).
 * @param options.eps - DBSCAN neighbourhood radius (default 1.0).
 * @param options.minPoints - DBSCAN min cluster density (default 3).
 */
export declare function clusterTraces(featuresJson: Array<Record<string, unknown>>, options?: {
    method?: ClusteringMethod;
    k?: number;
    eps?: number;
    minPoints?: number;
}): Promise<ClusteringResult>;
//# sourceMappingURL=clustering.d.ts.map