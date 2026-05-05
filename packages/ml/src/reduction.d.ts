/**
 * PCA feature reduction — hyper-optimized native implementation.
 *
 * Performance techniques:
 *   - Columnar Float64Array layout (cache-friendly covariance computation)
 *   - Covariance computed directly without transpose + matmul (single-pass per pair)
 *   - Jacobi eigendecomposition with in-place rotation (no matrix copy per iteration)
 *   - Pre-allocated eigenvector matrix
 *   - Float64Array for centered data
 */
import type { PCAResult } from './types.js';
/**
 * Reduce feature dimensionality using PCA.
 */
export declare function reduceFeaturesPCA(
  featuresJson: Array<Record<string, unknown>>,
  options?: {
    nComponents?: number;
    normalize?: boolean;
  }
): Promise<PCAResult>;
//# sourceMappingURL=reduction.d.ts.map
