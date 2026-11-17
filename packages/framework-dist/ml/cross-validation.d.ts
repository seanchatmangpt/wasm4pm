/**
 * Cross-validation framework for ML models (classification & regression).
 *
 * Provides both k-fold stratified and holdout validation strategies:
 *   - k-fold: Partitions data into k equal-sized folds, trains k models, aggregates metrics
 *   - Holdout: Splits data into train/test sets, trains once, computes single estimate
 *
 * Confidence computation:
 *   - Accuracy (classification): fraction of correct predictions
 *   - Precision, Recall, F1: per-class metrics for multi-class classification
 *   - RMSE, MAE, R² (regression): error magnitude and goodness-of-fit metrics
 *
 * Design: Honest held-out accuracy will be lower than in-sample for overfit-prone
 * methods (kNN with small k, deep decision trees). Reported confidence is thus realistic.
 */
import { z } from 'zod';
export declare const KFoldResultSchema: z.ZodObject<{
    scores: z.ZodArray<z.ZodNumber, "many">;
    mean: z.ZodNumber;
    stdDev: z.ZodNumber;
    confidence: z.ZodNumber;
    foldResults: z.ZodArray<z.ZodObject<{
        foldIdx: z.ZodNumber;
        score: z.ZodNumber;
        trainSize: z.ZodNumber;
        testSize: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        foldIdx: number;
        score: number;
        trainSize: number;
        testSize: number;
    }, {
        foldIdx: number;
        score: number;
        trainSize: number;
        testSize: number;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    confidence: number;
    mean: number;
    scores: number[];
    stdDev: number;
    foldResults: {
        foldIdx: number;
        score: number;
        trainSize: number;
        testSize: number;
    }[];
}, {
    confidence: number;
    mean: number;
    scores: number[];
    stdDev: number;
    foldResults: {
        foldIdx: number;
        score: number;
        trainSize: number;
        testSize: number;
    }[];
}>;
/**
 * Results from k-fold cross-validation.
 */
export type KFoldResult = z.infer<typeof KFoldResultSchema>;
export declare const HoldoutResultSchema: z.ZodObject<{
    trainAccuracy: z.ZodNumber;
    testAccuracy: z.ZodNumber;
    confidence: z.ZodNumber;
    testSize: z.ZodNumber;
    trainSize: z.ZodNumber;
    overfittingGap: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    confidence: number;
    trainSize: number;
    testSize: number;
    trainAccuracy: number;
    testAccuracy: number;
    overfittingGap: number;
}, {
    confidence: number;
    trainSize: number;
    testSize: number;
    trainAccuracy: number;
    testAccuracy: number;
    overfittingGap: number;
}>;
/**
 * Results from holdout validation.
 */
export type HoldoutResult = z.infer<typeof HoldoutResultSchema>;
export declare const RegressionCVResultSchema: z.ZodObject<{
    rSquared: z.ZodNumber;
    rmse: z.ZodNumber;
    mae: z.ZodNumber;
    confidence: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    confidence: number;
    rSquared: number;
    rmse: number;
    mae: number;
}, {
    confidence: number;
    rSquared: number;
    rmse: number;
    mae: number;
}>;
/**
 * Regression CV result.
 */
export type RegressionCVResult = z.infer<typeof RegressionCVResultSchema>;
/**
 * Stratified k-fold partition that maintains class distribution across folds.
 * Returns k pairs of (train, test) index sets.
 *
 * Each fold has approximately the same class proportions as the full dataset,
 * which is critical for imbalanced datasets.
 *
 * @throws Error if k is invalid (k < 2 or k > n)
 */
export declare function stratifiedKFold(labels: number[], k?: number): {
    trainIndices: Int32Array[];
    testIndices: Int32Array[];
};
/**
 * Random holdout split (train/test) with optional stratification.
 *
 * @param labels - Class labels for stratification (optional)
 * @param testRatio - Fraction of data to use as test set (default 0.2)
 * @returns trainIndices and testIndices
 */
export declare function holdoutSplit(n: number, labels?: number[], testRatio?: number): {
    trainIndices: Int32Array;
    testIndices: Int32Array;
};
/**
 * Compute accuracy: fraction of correct predictions.
 */
export declare function computeAccuracy(actual: number[], predicted: number[]): number;
/**
 * Compute RMSE (root mean squared error).
 */
export declare function computeRMSE(actual: number[], predicted: number[]): number;
/**
 * Compute MAE (mean absolute error).
 */
export declare function computeMAE(actual: number[], predicted: number[]): number;
/**
 * Compute R² (coefficient of determination).
 * Returns 1 if perfect fit, 0 if constant baseline, can be negative.
 */
export declare function computeRSquared(actual: number[], predicted: number[]): number;
/**
 * Generic k-fold cross-validation for any model trainer.
 *
 * The trainer function receives:
 *   - trainData: Array<T> of training samples
 *   - testData: Array<T> of test samples
 *   - labels (if classification): numeric labels
 *
 * And returns predictions as number[] (class labels or regression values).
 *
 * @param data - Full dataset (samples)
 * @param labels - Target labels (for classification or stratification)
 * @param k - Number of folds (default 3)
 * @param modelTrainer - Function that trains and predicts: (trainData, testData, labels) => predictions
 * @returns KFoldResult with per-fold scores and aggregate metrics
 */
export declare function kFoldCrossValidation<T>(data: T[], labels: number[], k: number | undefined, modelTrainer: (trainData: T[], testData: T[], trainLabels: number[], testLabels: number[]) => number[]): KFoldResult;
/**
 * Generic holdout validation for classification models.
 *
 * @param data - Full dataset (samples)
 * @param labels - Target labels
 * @param testRatio - Fraction for test set (default 0.2)
 * @param modelTrainer - Function that trains and predicts
 * @returns HoldoutResult with train/test accuracy and overfitting gap
 */
export declare function holdoutValidation<T>(data: T[], labels: number[], testRatio: number | undefined, modelTrainer: (trainData: T[], testData: T[], trainLabels: number[], testLabels: number[]) => {
    train: number[];
    test: number[];
}): HoldoutResult;
/**
 * Holdout validation for regression models.
 *
 * @param xData - Feature vectors
 * @param yData - Target values
 * @param testRatio - Fraction for test set (default 0.2)
 * @param modelTrainer - Function that trains and predicts
 * @returns RegressionCVResult with R², RMSE, MAE
 */
export declare function holdoutRegressionValidation(xData: number[][], yData: number[], testRatio: number | undefined, modelTrainer: (xTrain: number[][], yTrain: number[], xTest: number[][]) => number[]): RegressionCVResult;
//# sourceMappingURL=cross-validation.d.ts.map