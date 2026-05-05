/**
 * Classification and regression — hyper-optimized native implementations.
 *
 * Performance techniques (mirroring wasm4pm Rust patterns):
 *   - Columnar Float64Array layout (cache-friendly, zero GC pressure in hot loops)
 *   - Pre-allocated arrays (no .push() in inner loops)
 *   - Squared-distance (avoid sqrt until output boundary)
 *   - Single-pass mean/variance aggregation
 *   - Early termination in tree split search
 *   - Log-sum-exp numerically stable softmax
 */
import type {
  ClassificationMethod,
  ClassificationResult,
  RegressionMethod,
  RegressionResult,
} from './types.js';
/**
 * Classify traces using k-NN, logistic regression, decision tree, or naive Bayes.
 */
export declare function classifyTraces(
  featuresJson: Array<Record<string, unknown>>,
  options?: {
    targetKey?: string;
    method?: ClassificationMethod;
    k?: number;
    maxDepth?: number;
  }
): Promise<ClassificationResult>;
/**
 * Predict remaining case time using regression on trace features.
 */
export declare function regressRemainingTime(
  featuresJson: Array<Record<string, unknown>>,
  options?: {
    targetKey?: string;
    method?: RegressionMethod;
    degree?: number;
  }
): Promise<RegressionResult>;
//# sourceMappingURL=classifiers.d.ts.map
