/**
 * Feature Scaling and Normalization — Iteration 20b
 *
 * Implements 4 scaling methods to prepare features for ML algorithms:
 * 1. **Standardization (Z-score)**: zero-mean, unit-variance — best for linear models
 * 2. **Min-Max Scaling**: [0,1] range — best for distance-based algorithms
 * 3. **Robust Scaling**: median/IQR-based — resistant to outliers
 * 4. **Mean Normalization**: (x - mean) / (max - min) — alternative normalization
 *
 * All methods return scaling parameters for inverse transformation.
 * No external dependencies — pure TypeScript implementation.
 */
import { z } from 'zod';
export declare const ScaleParamsSchema: z.ZodObject<{
    /** Scaling method used: 'standardize' | 'minmax' | 'robust' | 'mean' */
    method: z.ZodEnum<["standardize", "minmax", "robust", "mean"]>;
    means: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
    stds: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
    mins: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
    maxs: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
    medians: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
    iqrs: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
}, "strip", z.ZodTypeAny, {
    method: "standardize" | "minmax" | "robust" | "mean";
    means?: number[] | undefined;
    stds?: number[] | undefined;
    mins?: number[] | undefined;
    maxs?: number[] | undefined;
    medians?: number[] | undefined;
    iqrs?: number[] | undefined;
}, {
    method: "standardize" | "minmax" | "robust" | "mean";
    means?: number[] | undefined;
    stds?: number[] | undefined;
    mins?: number[] | undefined;
    maxs?: number[] | undefined;
    medians?: number[] | undefined;
    iqrs?: number[] | undefined;
}>;
/**
 * Parameters needed to inverse-transform scaled data back to original scale.
 * Structure varies by scaling method.
 */
export type ScaleParams = z.infer<typeof ScaleParamsSchema>;
export declare const ScaledResultSchema: z.ZodObject<{
    /** Scaled feature matrix (same shape as input) */
    scaled: z.ZodArray<z.ZodArray<z.ZodNumber, "many">, "many">;
    /** Per-feature scaling parameters (for inverse transform) */
    scaleParams: z.ZodObject<{
        /** Scaling method used: 'standardize' | 'minmax' | 'robust' | 'mean' */
        method: z.ZodEnum<["standardize", "minmax", "robust", "mean"]>;
        means: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
        stds: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
        mins: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
        maxs: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
        medians: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
        iqrs: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
    }, "strip", z.ZodTypeAny, {
        method: "standardize" | "minmax" | "robust" | "mean";
        means?: number[] | undefined;
        stds?: number[] | undefined;
        mins?: number[] | undefined;
        maxs?: number[] | undefined;
        medians?: number[] | undefined;
        iqrs?: number[] | undefined;
    }, {
        method: "standardize" | "minmax" | "robust" | "mean";
        means?: number[] | undefined;
        stds?: number[] | undefined;
        mins?: number[] | undefined;
        maxs?: number[] | undefined;
        medians?: number[] | undefined;
        iqrs?: number[] | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    scaled: number[][];
    scaleParams: {
        method: "standardize" | "minmax" | "robust" | "mean";
        means?: number[] | undefined;
        stds?: number[] | undefined;
        mins?: number[] | undefined;
        maxs?: number[] | undefined;
        medians?: number[] | undefined;
        iqrs?: number[] | undefined;
    };
}, {
    scaled: number[][];
    scaleParams: {
        method: "standardize" | "minmax" | "robust" | "mean";
        means?: number[] | undefined;
        stds?: number[] | undefined;
        mins?: number[] | undefined;
        maxs?: number[] | undefined;
        medians?: number[] | undefined;
        iqrs?: number[] | undefined;
    };
}>;
/**
 * Result of a scaling operation: scaled data + inverse transform parameters.
 */
export type ScaledResult = z.infer<typeof ScaledResultSchema>;
/**
 * Standardize features to zero-mean, unit-variance (Z-score normalization).
 *
 * Formula: x_scaled = (x - mean) / std
 *
 * Benefits:
 *   - Suitable for linear regression, logistic regression, SVM
 *   - Centers distribution at 0
 *   - Assumes roughly normal distribution
 *
 * Limitations:
 *   - Sensitive to outliers (mean and std are outlier-sensitive)
 *   - Unbounded range (can extend beyond [-3, 3])
 *
 * @param data - Numeric feature matrix (rows = samples, cols = features)
 * @returns Scaled data with means and stds for inverse transform
 */
export declare function standardizeFeatures(data: number[][]): ScaledResult;
/**
 * Scale features to [0, 1] range using min-max normalization.
 *
 * Formula: x_scaled = (x - min) / (max - min)
 *
 * Benefits:
 *   - Bounded output range [0, 1]
 *   - Preserves zero values (if 0 is in the original range)
 *   - Good for algorithms sensitive to feature magnitude (k-NN, SVM)
 *
 * Limitations:
 *   - Sensitive to outliers (one extreme value distorts the whole range)
 *   - New data outside training range may scale outside [0, 1]
 *
 * @param data - Numeric feature matrix
 * @returns Scaled data with mins and maxs for inverse transform
 */
export declare function minMaxScale(data: number[][]): ScaledResult;
/**
 * Scale features using robust scaling (median and IQR-based).
 *
 * Formula: x_scaled = (x - median) / IQR
 * where IQR = Q3 - Q1 (interquartile range)
 *
 * Benefits:
 *   - Robust to outliers (uses median and IQR, not mean/std)
 *   - Good for data with extreme outliers
 *   - Suitable for models sensitive to outliers (linear regression)
 *
 * Limitations:
 *   - Unbounded output range (like standardization)
 *   - May not scale as tightly as min-max for clean data
 *
 * @param data - Numeric feature matrix
 * @returns Scaled data with medians and IQRs for inverse transform
 */
export declare function robustScale(data: number[][]): ScaledResult;
/**
 * Scale features using mean normalization.
 *
 * Formula: x_scaled = (x - mean) / (max - min)
 *
 * Benefits:
 *   - Centers values around 0 with bounded magnitude
 *   - Less aggressive than min-max, more centered than standardization
 *   - Good middle-ground for algorithms sensitive to both scale and centering
 *
 * Limitations:
 *   - Still sensitive to outliers (mean and max/min are outlier-sensitive)
 *   - Range approximately [-1, 1] but depends on data distribution
 *
 * @param data - Numeric feature matrix
 * @returns Scaled data with means, mins, maxs for inverse transform
 */
export declare function meanNormalize(data: number[][]): ScaledResult;
/**
 * Inverse transform scaled data back to original scale.
 *
 * @param scaledData - Scaled feature matrix from one of the scaling functions
 * @param scaleParams - Scale parameters returned from scaling function
 * @returns Original-scale feature matrix
 */
export declare function inverseTransform(scaledData: number[][], scaleParams: ScaleParams): number[][];
/**
 * Compare different scaling methods and return statistics.
 *
 * Useful for understanding which method best suits your data distribution.
 *
 * @param data - Numeric feature matrix
 * @returns Statistics for all 4 scaling methods
 */
export declare const ScalingComparisonSchema: z.ZodObject<{
    standardize_means: z.ZodArray<z.ZodNumber, "many">;
    standardize_stds: z.ZodArray<z.ZodNumber, "many">;
    minmax_mins: z.ZodArray<z.ZodNumber, "many">;
    minmax_maxs: z.ZodArray<z.ZodNumber, "many">;
    robust_medians: z.ZodArray<z.ZodNumber, "many">;
    robust_iqrs: z.ZodArray<z.ZodNumber, "many">;
    recommendedMethod: z.ZodEnum<["standardize", "minmax", "robust", "mean"]>;
    reason: z.ZodString;
}, "strip", z.ZodTypeAny, {
    reason: string;
    standardize_means: number[];
    standardize_stds: number[];
    minmax_mins: number[];
    minmax_maxs: number[];
    robust_medians: number[];
    robust_iqrs: number[];
    recommendedMethod: "standardize" | "minmax" | "robust" | "mean";
}, {
    reason: string;
    standardize_means: number[];
    standardize_stds: number[];
    minmax_mins: number[];
    minmax_maxs: number[];
    robust_medians: number[];
    robust_iqrs: number[];
    recommendedMethod: "standardize" | "minmax" | "robust" | "mean";
}>;
export type ScalingComparison = z.infer<typeof ScalingComparisonSchema>;
export declare function compareScalingMethods(data: number[][]): ScalingComparison;
//# sourceMappingURL=feature-scaling.d.ts.map