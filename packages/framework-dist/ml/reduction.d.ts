/**
 * PCA feature reduction — hyper-optimized native implementation.
 *
 * Performance techniques:
 *   - Columnar Float64Array layout (cache-friendly covariance computation)
 *   - Covariance computed directly without transpose + matmul (single-pass per pair)
 *   - Jacobi eigendecomposition with in-place rotation (no matrix copy per iteration)
 *   - Pre-allocated eigenvector matrix
 *   - Float64Array for centered data
 *
 * Defensive hardening:
 *   - Parameter validation (nComponents)
 *   - Guard against division by zero in variance computation
 *   - Clamp explained variance to [0, 1]
 *   - Error on insufficient data
 */
import type { PCAResult } from './types.js';
/**
 * Reduce feature dimensionality using Principal Component Analysis.
 *
 * Algorithm:
 *   1. Min-max normalise each feature column (skipped if `normalize: false`).
 *   2. Centre columns and build the covariance matrix in a single pass.
 *   3. Solve the symmetric eigenproblem with cyclic Jacobi rotations.
 *   4. Sort eigenvectors by `|eigenvalue|` descending, project the centred data.
 *
 * `explainedVariance[i]` is the share of total positive variance carried by
 * the i-th component, clamped to `[0, 1]` to absorb floating-point noise.
 *
 * @param featuresJson - Per-case feature objects (must yield >=2 numeric columns).
 * @param options.nComponents - Number of components to keep (default 2, capped at d).
 * @param options.normalize - Min-max normalise columns first (default true).
 * @throws Error when fewer than 2 traces or 2 features are available.
 */
export declare function reduceFeaturesPCA(featuresJson: Array<Record<string, unknown>>, options?: {
    nComponents?: number;
    normalize?: boolean;
}): Promise<PCAResult>;
//# sourceMappingURL=reduction.d.ts.map