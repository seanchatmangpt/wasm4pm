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
 *
 * Defensive bridge hardening:
 *   - Parameter validation on entry points (k, maxDepth, etc.)
 *   - Guard against division by zero in all statistics
 *   - Safely serialize Float64Array/typed arrays to plain JSON
 *   - Null-safe metric computation (RMSE, MAE, R²)
 */
import type { ClassificationMethod, ClassificationResult, RegressionMethod, RegressionResult } from './types.js';
/**
 * Run stratified k-fold cross-validation for a given classifier.
 *
 * Trains and evaluates using the same algorithm as classifyTraces so CV accuracy
 * is directly comparable to in-sample accuracy. Honest estimates will be lower
 * than in-sample for overfit-prone methods on small datasets.
 *
 * Returns empty scores (mean=0, stdDev=0) when n < 2*cvFolds rather than
 * throwing, allowing callers to degrade gracefully.
 */
export declare function runCrossValidation(data: number[][], encoded: number[], method: ClassificationMethod, cvFolds?: number, knnK?: number, maxDepth?: number): {
    scores: number[];
    mean: number;
    stdDev: number;
};
/**
 * Classify traces by a categorical target (e.g., process outcome).
 *
 * Supports four methods:
 *   - `'knn'` — k-nearest neighbours (inverse-distance weighted vote, leave-one-out)
 *   - `'logistic_regression'` — multinomial softmax with batch gradient descent
 *   - `'decision_tree'` — CART (Gini, configurable max depth)
 *   - `'naive_bayes'` — Gaussian, single-pass mean/variance training
 *
 * The function consumes the JSON output of `wasm.extract_case_features()`.
 * Empty input returns `{ predictions: [] }` rather than throwing — callers must
 * handle the empty case.
 *
 * @param featuresJson - Per-case feature objects (must include `case_id`).
 * @param options.targetKey - Categorical target column. Default `'outcome'`.
 * @param options.method - Classifier method. Default `'knn'`.
 * @param options.k - Neighbours for k-NN. Default `5`.
 * @param options.maxDepth - Max depth for decision tree. Default `5`.
 * @returns ClassificationResult with per-case predictions and confidence in [0, 1].
 */
export declare function classifyTraces(featuresJson: Array<Record<string, unknown>>, options?: {
    targetKey?: string;
    method?: ClassificationMethod;
    k?: number;
    maxDepth?: number;
    /** When true, run stratified CV and attach cv_accuracy/cv_std_dev/cv_folds. */
    crossValidate?: boolean;
    /** Number of CV folds. Default 3. Minimum 2. */
    cvFolds?: number;
    /** Number of boosting iterations for gradient_boosting. Default 100. */
    numIterations?: number;
    /** Learning rate for gradient_boosting. Default 0.1. */
    learningRate?: number;
}): Promise<ClassificationResult>;
/**
 * Predict remaining case time using regression on trace features.
 *
 * NOTE: This is a univariate regression — only the first feature column is used
 * as the independent variable. For multi-feature regression, project features
 * with PCA or pre-aggregate before calling.
 *
 * Methods:
 *   - `'linear_regression'` — least-squares slope/intercept (default)
 *   - `'polynomial_regression'` — Vandermonde + Gauss–Jordan, configurable `degree`
 *   - `'exponential_regression'` — log-linear fit `y = a · e^(b·x)`
 *
 * @throws Error if fewer than 2 traces are supplied (`'Not enough traces ...'`).
 */
export declare function regressRemainingTime(featuresJson: Array<Record<string, unknown>>, options?: {
    targetKey?: string;
    method?: RegressionMethod;
    degree?: number;
}): Promise<RegressionResult>;
//# sourceMappingURL=classifiers.d.ts.map