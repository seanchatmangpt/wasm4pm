/**
 * Preprocessing Guards — 5 Critical Data Validation Checks
 *
 * Before classification/regression/clustering, all raw features must pass:
 * 1. Zero-variance detection and removal
 * 2. Feature scaling (min-max normalization)
 * 3. Missing value imputation (forward-fill or mean)
 * 4. Outlier detection (IQR-based capping)
 * 5. Feature dimension validation (sufficient samples per feature)
 *
 * These guards prevent algorithms from receiving invalid data that would
 * corrupt training (e.g., zero-variance columns waste dimensions, missing values
 * break distance metrics, outliers distort regression).
 */
import { z } from 'zod';
export declare const PreprocessingReportSchema: z.ZodObject<{
    /** Pass/fail status */
    status: z.ZodEnum<["pass", "fail"]>;
    /** Count of zero-variance columns removed */
    zeroVarianceColumnsRemoved: z.ZodNumber;
    /** Count of rows with missing values imputed */
    rowsWithMissingValuesImputed: z.ZodNumber;
    /** Count of outliers detected and capped */
    outliersDetected: z.ZodNumber;
    /** True if feature dimension is sufficient for sample size */
    suffientSampleRatio: z.ZodBoolean;
    /** Count of features after preprocessing (includes scaled features) */
    finalFeatureCount: z.ZodNumber;
    /** Warnings/errors encountered */
    issues: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    issues: string[];
    status: "pass" | "fail";
    zeroVarianceColumnsRemoved: number;
    rowsWithMissingValuesImputed: number;
    outliersDetected: number;
    suffientSampleRatio: boolean;
    finalFeatureCount: number;
}, {
    issues: string[];
    status: "pass" | "fail";
    zeroVarianceColumnsRemoved: number;
    rowsWithMissingValuesImputed: number;
    outliersDetected: number;
    suffientSampleRatio: boolean;
    finalFeatureCount: number;
}>;
export type PreprocessingReport = z.infer<typeof PreprocessingReportSchema>;
/**
 * Guard 1: Detect and remove zero-variance columns.
 *
 * Zero-variance columns contain identical values across all rows.
 * They waste dimensions without providing discriminative information.
 *
 * @param data - Numeric feature matrix (rows = samples, cols = features)
 * @param threshold - Variance threshold for detection (default 1e-10)
 * @returns Columns with variance > threshold, and indices to keep
 */
export declare function filterZeroVarianceColumns(data: number[][], threshold?: number): {
    filtered: number[][];
    indicesToKeep: number[];
    removed: number[];
};
/**
 * Guard 2: Impute missing values (NaN, Infinity, undefined).
 *
 * Imputation strategy:
 * - For each column with missing values:
 *   1. Compute column mean from finite values
 *   2. Replace all non-finite values with column mean
 *   3. If column is all non-finite, fill with 0
 *
 * @param data - Numeric feature matrix with possible NaN/Infinity values
 * @returns Imputed matrix, count of rows affected
 */
export declare function imputeMissingValues(data: number[][]): {
    imputed: number[][];
    rowsAffected: number;
};
/**
 * Guard 3: Detect and cap outliers using Interquartile Range (IQR).
 *
 * Outlier definition: Values outside [Q1 - 1.5*IQR, Q3 + 1.5*IQR]
 * For outliers detected, cap to the boundary rather than remove.
 *
 * @param data - Numeric feature matrix
 * @param iqrMultiplier - Multiplier for IQR bounds (default 1.5)
 * @returns Data with outliers capped, count of outliers detected
 */
export declare function capOutliers(data: number[][], iqrMultiplier?: number): {
    capped: number[][];
    outliersDetected: number;
};
/**
 * Guard 4: Apply min-max feature scaling to [0, 1] range.
 *
 * Scaling ensures all features have equal magnitude, preventing
 * algorithms (k-NN, logistic regression) from being biased toward
 * features with large ranges.
 *
 * Constant features (min == max) are mapped to 0.5.
 *
 * @param data - Numeric feature matrix
 * @returns Scaled matrix to [0, 1], min/max for inverse transform
 */
export declare function scaleFeatures(data: number[][]): {
    scaled: number[][];
    mins: number[];
    maxs: number[];
};
/**
 * Guard 5: Validate feature dimension is sufficient for sample size.
 *
 * Heuristic: sample_count should be >= 10 * feature_count to avoid
 * overfitting and poor generalization.
 *
 * @param data - Numeric feature matrix
 * @param minRatio - Minimum samples-per-feature (default 10)
 * @returns Pass/fail status and detailed metrics
 */
export declare function validateSampleFeatureRatio(data: number[][], minRatio?: number): {
    sufficient: boolean;
    sampleCount: number;
    featureCount: number;
    actualRatio: number;
};
/**
 * Comprehensive preprocessing pipeline: Apply all 5 guards.
 *
 * Order of operations:
 * 1. Remove zero-variance columns
 * 2. Impute missing values
 * 3. Cap outliers
 * 4. Scale features to [0,1]
 * 5. Validate dimension sufficiency
 *
 * @param data - Raw numeric feature matrix
 * @returns Preprocessed data and detailed report
 */
export declare function preprocessFeatures(data: number[][]): {
    preprocessed: number[][];
    report: PreprocessingReport;
    mins?: number[];
    maxs?: number[];
};
//# sourceMappingURL=preprocessing.d.ts.map