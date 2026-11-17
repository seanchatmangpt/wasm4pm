/**
 * Feature importance ranking for ML models.
 *
 * Computes feature importance scores to identify which input features drive predictions.
 * Supports multiple importance methods:
 *   - Permutation importance: Measures prediction degradation when feature is shuffled
 *   - Correlation-based: Uses absolute correlation with target
 *   - Mutual information: Information gain metric for feature-target relationship
 *
 * Methods are designed to work without external ML library dependencies.
 */
import { z } from 'zod';
export declare const FeatureImportanceSchema: z.ZodObject<{
    feature: z.ZodString;
    importance: z.ZodNumber;
    rank: z.ZodNumber;
    method: z.ZodEnum<["permutation", "correlation", "mutual_information"]>;
}, "strip", z.ZodTypeAny, {
    method: "permutation" | "correlation" | "mutual_information";
    feature: string;
    importance: number;
    rank: number;
}, {
    method: "permutation" | "correlation" | "mutual_information";
    feature: string;
    importance: number;
    rank: number;
}>;
/**
 * Feature importance score and metadata.
 */
export type FeatureImportance = z.infer<typeof FeatureImportanceSchema>;
export declare const FeatureImportanceResultSchema: z.ZodObject<{
    importances: z.ZodArray<z.ZodObject<{
        feature: z.ZodString;
        importance: z.ZodNumber;
        rank: z.ZodNumber;
        method: z.ZodEnum<["permutation", "correlation", "mutual_information"]>;
    }, "strip", z.ZodTypeAny, {
        method: "permutation" | "correlation" | "mutual_information";
        feature: string;
        importance: number;
        rank: number;
    }, {
        method: "permutation" | "correlation" | "mutual_information";
        feature: string;
        importance: number;
        rank: number;
    }>, "many">;
    topFeatures: z.ZodArray<z.ZodObject<{
        feature: z.ZodString;
        importance: z.ZodNumber;
        rank: z.ZodNumber;
        method: z.ZodEnum<["permutation", "correlation", "mutual_information"]>;
    }, "strip", z.ZodTypeAny, {
        method: "permutation" | "correlation" | "mutual_information";
        feature: string;
        importance: number;
        rank: number;
    }, {
        method: "permutation" | "correlation" | "mutual_information";
        feature: string;
        importance: number;
        rank: number;
    }>, "many">;
    bottomFeatures: z.ZodArray<z.ZodObject<{
        feature: z.ZodString;
        importance: z.ZodNumber;
        rank: z.ZodNumber;
        method: z.ZodEnum<["permutation", "correlation", "mutual_information"]>;
    }, "strip", z.ZodTypeAny, {
        method: "permutation" | "correlation" | "mutual_information";
        feature: string;
        importance: number;
        rank: number;
    }, {
        method: "permutation" | "correlation" | "mutual_information";
        feature: string;
        importance: number;
        rank: number;
    }>, "many">;
    totalVariance: z.ZodNumber;
    method: z.ZodEnum<["permutation", "correlation", "mutual_information"]>;
}, "strip", z.ZodTypeAny, {
    method: "permutation" | "correlation" | "mutual_information";
    importances: {
        method: "permutation" | "correlation" | "mutual_information";
        feature: string;
        importance: number;
        rank: number;
    }[];
    topFeatures: {
        method: "permutation" | "correlation" | "mutual_information";
        feature: string;
        importance: number;
        rank: number;
    }[];
    bottomFeatures: {
        method: "permutation" | "correlation" | "mutual_information";
        feature: string;
        importance: number;
        rank: number;
    }[];
    totalVariance: number;
}, {
    method: "permutation" | "correlation" | "mutual_information";
    importances: {
        method: "permutation" | "correlation" | "mutual_information";
        feature: string;
        importance: number;
        rank: number;
    }[];
    topFeatures: {
        method: "permutation" | "correlation" | "mutual_information";
        feature: string;
        importance: number;
        rank: number;
    }[];
    bottomFeatures: {
        method: "permutation" | "correlation" | "mutual_information";
        feature: string;
        importance: number;
        rank: number;
    }[];
    totalVariance: number;
}>;
/**
 * Feature importance ranking result.
 */
export type FeatureImportanceResult = z.infer<typeof FeatureImportanceResultSchema>;
/**
 * Compute feature importance using permutation importance.
 *
 * Measures how much model performance degrades when each feature is randomly shuffled.
 * Higher degradation = higher importance.
 *
 * @param data - Feature matrix (rows = samples, cols = features)
 * @param predictions - Model predictions on original data
 * @param actual - Actual target values
 * @param featureNames - Names of features
 * @param isClassification - Whether this is classification (true) or regression (false)
 * @returns Sorted importance scores
 */
export declare function computePermutationImportance(data: number[][], _predictions: number[], _actual: number[], featureNames: string[], _isClassification?: boolean): FeatureImportance[];
/**
 * Compute feature importance using correlation with target.
 *
 * Measures absolute correlation between each feature and the target variable.
 * Higher correlation = higher importance.
 *
 * @param data - Feature matrix
 * @param targets - Target values
 * @param featureNames - Names of features
 * @returns Sorted importance scores
 */
export declare function computeCorrelationImportance(data: number[][], targets: number[], featureNames: string[]): FeatureImportance[];
/**
 * Compute feature importance using mutual information.
 *
 * Measures information gain: how much knowing the feature reduces entropy of target.
 * This is model-agnostic and works for both classification and regression.
 *
 * @param data - Feature matrix
 * @param targets - Target values (for regression, will be binned into quintiles)
 * @param featureNames - Names of features
 * @param numBins - Number of bins for discretization (default 5)
 * @returns Sorted importance scores
 */
export declare function computeMutualInformationImportance(data: number[][], targets: number[], featureNames: string[], numBins?: number): FeatureImportance[];
/**
 * Rank feature importance using the specified method.
 *
 * @param data - Feature matrix (rows = samples, cols = features)
 * @param targets - Target values (for regression/classification)
 * @param featureNames - Names of features
 * @param method - Which importance method to use (default: correlation)
 * @returns Feature importance ranking result with top/bottom features
 */
export declare function rankFeatureImportance(data: number[][], targets: number[], featureNames: string[], method?: 'permutation' | 'correlation' | 'mutual_information'): FeatureImportanceResult;
//# sourceMappingURL=feature-importance.d.ts.map