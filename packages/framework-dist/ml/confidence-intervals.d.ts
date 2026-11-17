/**
 * Bootstrap Confidence Intervals
 *
 * Nonparametric confidence interval estimation via bootstrap resampling.
 * Rank-1 Oracle: Deterministic via seeded RNG; no parametric assumptions.
 *
 * Usage:
 *   const ci = bootstrapCI(predictions, truth, 10000, 0.95);
 *   console.log(`Accuracy: ${ci.point} [${ci.lower}, ${ci.upper}]`);
 *
 * Resamples data with replacement, computes metric on each sample,
 * and extracts percentile bounds.
 */
import { z } from 'zod';
export declare const BootstrapCIResultSchema: z.ZodObject<{
    /** Metric name */
    metric: z.ZodEnum<["accuracy", "mae", "rmse", "f1"]>;
    /** Point estimate (mean of bootstrap samples) */
    point: z.ZodNumber;
    /** Lower bound (percentile) */
    lower: z.ZodNumber;
    /** Upper bound (percentile) */
    upper: z.ZodNumber;
    /** Confidence level used (e.g., 0.95 for 95% CI) */
    confidenceLevel: z.ZodNumber;
    /** Bootstrap samples (for advanced analysis) */
    samples: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
}, "strip", z.ZodTypeAny, {
    metric: "rmse" | "mae" | "accuracy" | "f1";
    point: number;
    lower: number;
    upper: number;
    confidenceLevel: number;
    samples?: number[] | undefined;
}, {
    metric: "rmse" | "mae" | "accuracy" | "f1";
    point: number;
    lower: number;
    upper: number;
    confidenceLevel: number;
    samples?: number[] | undefined;
}>;
/**
 * Confidence interval result with point estimate and bounds.
 */
export type BootstrapCIResult = z.infer<typeof BootstrapCIResultSchema>;
/**
 * Seeded random number generator for deterministic bootstrap.
 * Park-Miller LCG (Linear Congruential Generator).
 *
 * @param seed - Initial seed
 * @returns Function that returns next random number in [0, 1)
 */
export declare function seededRng(seed: number): () => number;
/**
 * Compute accuracy: fraction of correct predictions.
 *
 * @param truth - True labels
 * @param predictions - Predicted labels
 * @returns Accuracy in [0, 1]
 */
export declare function accuracy(truth: number[], predictions: number[]): number;
/**
 * Compute MAE (mean absolute error).
 *
 * @param truth - True values
 * @param predictions - Predicted values
 * @returns MAE
 */
export declare function mae(truth: number[], predictions: number[]): number;
/**
 * Compute RMSE (root mean squared error).
 *
 * @param truth - True values
 * @param predictions - Predicted values
 * @returns RMSE
 */
export declare function rmse(truth: number[], predictions: number[]): number;
/**
 * Compute F1 score (harmonic mean of precision and recall).
 * For multi-class, macro-average over classes.
 *
 * @param truth - True labels
 * @param predictions - Predicted labels
 * @returns F1 score in [0, 1]
 */
export declare function f1(truth: number[], predictions: number[]): number;
/**
 * Bootstrap confidence interval for classification metrics.
 *
 * Resamples data with replacement, computes metric on each bootstrap sample,
 * and extracts percentile-based confidence bounds.
 *
 * Rank-1 Oracle: Deterministic via seeded RNG.
 *
 * @param predictions - Predicted labels
 * @param truth - True labels
 * @param nResamples - Number of bootstrap samples (default 10000)
 * @param confidenceLevel - CI level, e.g., 0.95 for 95% CI (default 0.95)
 * @param seed - Random seed for determinism (optional)
 * @returns Bootstrap CI result
 */
export declare function bootstrapCI(predictions: number[], truth: number[], nResamples?: number, confidenceLevel?: number, seed?: number): BootstrapCIResult;
/**
 * Bootstrap CI for regression metrics (MAE, RMSE).
 *
 * @param predictions - Predicted values
 * @param truth - True values
 * @param metricType - Which metric to compute ('mae' or 'rmse')
 * @param nResamples - Number of bootstrap samples (default 10000)
 * @param confidenceLevel - CI level (default 0.95)
 * @param seed - Random seed for determinism
 * @returns Bootstrap CI result
 */
export declare function bootstrapRegressionCI(predictions: number[], truth: number[], metricType?: 'mae' | 'rmse', nResamples?: number, confidenceLevel?: number, seed?: number): BootstrapCIResult;
//# sourceMappingURL=confidence-intervals.d.ts.map