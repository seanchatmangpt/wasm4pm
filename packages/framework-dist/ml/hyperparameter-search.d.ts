/**
 * Grid Search for Hyperparameter Tuning
 *
 * Exhaustive search over parameter grid with k-fold cross-validation.
 * For each parameter combination, computes mean score and standard deviation.
 *
 * Rank-4 Oracle: Confidence intervals via t-distribution (df = k_folds - 1).
 * Deterministic via seeded RNG across CV folds.
 *
 * Usage:
 *   const result = gridSearch(
 *     'classify',
 *     { k: [3, 5, 7], metric: ['euclidean', 'manhattan'] },
 *     X, y, 3,
 *     (predictions, truth) => accuracy(predictions, truth)
 *   );
 *
 * Returns sorted results by mean score (descending).
 */
import { z } from 'zod';
import type { FeatureMatrix } from './types.js';
export type { FeatureMatrix };
/** Search space: maps each hyperparameter to the list of values to try. */
export type SearchSpace = Record<string, ParamValue[]>;
export declare const EvalMetricsSchema: z.ZodObject<{
    accuracy: z.ZodOptional<z.ZodNumber>;
    f1: z.ZodOptional<z.ZodNumber>;
    precision: z.ZodOptional<z.ZodNumber>;
    recall: z.ZodOptional<z.ZodNumber>;
    silhouetteScore: z.ZodOptional<z.ZodNumber>;
    inertia: z.ZodOptional<z.ZodNumber>;
    rmse: z.ZodOptional<z.ZodNumber>;
    mae: z.ZodOptional<z.ZodNumber>;
    cvMeanAccuracy: z.ZodOptional<z.ZodNumber>;
    cvStdAccuracy: z.ZodOptional<z.ZodNumber>;
    cvFoldAccuracies: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
    trainingTimeMs: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    rmse?: number | undefined;
    mae?: number | undefined;
    inertia?: number | undefined;
    accuracy?: number | undefined;
    f1?: number | undefined;
    precision?: number | undefined;
    recall?: number | undefined;
    silhouetteScore?: number | undefined;
    cvMeanAccuracy?: number | undefined;
    cvStdAccuracy?: number | undefined;
    cvFoldAccuracies?: number[] | undefined;
    trainingTimeMs?: number | undefined;
}, {
    rmse?: number | undefined;
    mae?: number | undefined;
    inertia?: number | undefined;
    accuracy?: number | undefined;
    f1?: number | undefined;
    precision?: number | undefined;
    recall?: number | undefined;
    silhouetteScore?: number | undefined;
    cvMeanAccuracy?: number | undefined;
    cvStdAccuracy?: number | undefined;
    cvFoldAccuracies?: number[] | undefined;
    trainingTimeMs?: number | undefined;
}>;
/** Metrics from a single model evaluation. */
export type EvalMetrics = z.infer<typeof EvalMetricsSchema>;
export declare const RankedResultSchema: z.ZodObject<{
    rank: z.ZodNumber;
    params: z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodNumber, z.ZodString, z.ZodBoolean, z.ZodArray<z.ZodNumber, "many">]>>;
    metrics: z.ZodObject<{
        accuracy: z.ZodOptional<z.ZodNumber>;
        f1: z.ZodOptional<z.ZodNumber>;
        precision: z.ZodOptional<z.ZodNumber>;
        recall: z.ZodOptional<z.ZodNumber>;
        silhouetteScore: z.ZodOptional<z.ZodNumber>;
        inertia: z.ZodOptional<z.ZodNumber>;
        rmse: z.ZodOptional<z.ZodNumber>;
        mae: z.ZodOptional<z.ZodNumber>;
        cvMeanAccuracy: z.ZodOptional<z.ZodNumber>;
        cvStdAccuracy: z.ZodOptional<z.ZodNumber>;
        cvFoldAccuracies: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
        trainingTimeMs: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        rmse?: number | undefined;
        mae?: number | undefined;
        inertia?: number | undefined;
        accuracy?: number | undefined;
        f1?: number | undefined;
        precision?: number | undefined;
        recall?: number | undefined;
        silhouetteScore?: number | undefined;
        cvMeanAccuracy?: number | undefined;
        cvStdAccuracy?: number | undefined;
        cvFoldAccuracies?: number[] | undefined;
        trainingTimeMs?: number | undefined;
    }, {
        rmse?: number | undefined;
        mae?: number | undefined;
        inertia?: number | undefined;
        accuracy?: number | undefined;
        f1?: number | undefined;
        precision?: number | undefined;
        recall?: number | undefined;
        silhouetteScore?: number | undefined;
        cvMeanAccuracy?: number | undefined;
        cvStdAccuracy?: number | undefined;
        cvFoldAccuracies?: number[] | undefined;
        trainingTimeMs?: number | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    params: Record<string, string | number | boolean | number[]>;
    rank: number;
    metrics: {
        rmse?: number | undefined;
        mae?: number | undefined;
        inertia?: number | undefined;
        accuracy?: number | undefined;
        f1?: number | undefined;
        precision?: number | undefined;
        recall?: number | undefined;
        silhouetteScore?: number | undefined;
        cvMeanAccuracy?: number | undefined;
        cvStdAccuracy?: number | undefined;
        cvFoldAccuracies?: number[] | undefined;
        trainingTimeMs?: number | undefined;
    };
}, {
    params: Record<string, string | number | boolean | number[]>;
    rank: number;
    metrics: {
        rmse?: number | undefined;
        mae?: number | undefined;
        inertia?: number | undefined;
        accuracy?: number | undefined;
        f1?: number | undefined;
        precision?: number | undefined;
        recall?: number | undefined;
        silhouetteScore?: number | undefined;
        cvMeanAccuracy?: number | undefined;
        cvStdAccuracy?: number | undefined;
        cvFoldAccuracies?: number[] | undefined;
        trainingTimeMs?: number | undefined;
    };
}>;
/** One ranked result from GridSearch. */
export type RankedResult = z.infer<typeof RankedResultSchema>;
export declare const GridSearchOutputSchema: z.ZodObject<{
    bestParams: z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodNumber, z.ZodString, z.ZodBoolean, z.ZodArray<z.ZodNumber, "many">]>>;
    bestMetrics: z.ZodObject<{
        accuracy: z.ZodOptional<z.ZodNumber>;
        f1: z.ZodOptional<z.ZodNumber>;
        precision: z.ZodOptional<z.ZodNumber>;
        recall: z.ZodOptional<z.ZodNumber>;
        silhouetteScore: z.ZodOptional<z.ZodNumber>;
        inertia: z.ZodOptional<z.ZodNumber>;
        rmse: z.ZodOptional<z.ZodNumber>;
        mae: z.ZodOptional<z.ZodNumber>;
        cvMeanAccuracy: z.ZodOptional<z.ZodNumber>;
        cvStdAccuracy: z.ZodOptional<z.ZodNumber>;
        cvFoldAccuracies: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
        trainingTimeMs: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        rmse?: number | undefined;
        mae?: number | undefined;
        inertia?: number | undefined;
        accuracy?: number | undefined;
        f1?: number | undefined;
        precision?: number | undefined;
        recall?: number | undefined;
        silhouetteScore?: number | undefined;
        cvMeanAccuracy?: number | undefined;
        cvStdAccuracy?: number | undefined;
        cvFoldAccuracies?: number[] | undefined;
        trainingTimeMs?: number | undefined;
    }, {
        rmse?: number | undefined;
        mae?: number | undefined;
        inertia?: number | undefined;
        accuracy?: number | undefined;
        f1?: number | undefined;
        precision?: number | undefined;
        recall?: number | undefined;
        silhouetteScore?: number | undefined;
        cvMeanAccuracy?: number | undefined;
        cvStdAccuracy?: number | undefined;
        cvFoldAccuracies?: number[] | undefined;
        trainingTimeMs?: number | undefined;
    }>;
    allResults: z.ZodArray<z.ZodObject<{
        rank: z.ZodNumber;
        params: z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodNumber, z.ZodString, z.ZodBoolean, z.ZodArray<z.ZodNumber, "many">]>>;
        metrics: z.ZodObject<{
            accuracy: z.ZodOptional<z.ZodNumber>;
            f1: z.ZodOptional<z.ZodNumber>;
            precision: z.ZodOptional<z.ZodNumber>;
            recall: z.ZodOptional<z.ZodNumber>;
            silhouetteScore: z.ZodOptional<z.ZodNumber>;
            inertia: z.ZodOptional<z.ZodNumber>;
            rmse: z.ZodOptional<z.ZodNumber>;
            mae: z.ZodOptional<z.ZodNumber>;
            cvMeanAccuracy: z.ZodOptional<z.ZodNumber>;
            cvStdAccuracy: z.ZodOptional<z.ZodNumber>;
            cvFoldAccuracies: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
            trainingTimeMs: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            rmse?: number | undefined;
            mae?: number | undefined;
            inertia?: number | undefined;
            accuracy?: number | undefined;
            f1?: number | undefined;
            precision?: number | undefined;
            recall?: number | undefined;
            silhouetteScore?: number | undefined;
            cvMeanAccuracy?: number | undefined;
            cvStdAccuracy?: number | undefined;
            cvFoldAccuracies?: number[] | undefined;
            trainingTimeMs?: number | undefined;
        }, {
            rmse?: number | undefined;
            mae?: number | undefined;
            inertia?: number | undefined;
            accuracy?: number | undefined;
            f1?: number | undefined;
            precision?: number | undefined;
            recall?: number | undefined;
            silhouetteScore?: number | undefined;
            cvMeanAccuracy?: number | undefined;
            cvStdAccuracy?: number | undefined;
            cvFoldAccuracies?: number[] | undefined;
            trainingTimeMs?: number | undefined;
        }>;
    }, "strip", z.ZodTypeAny, {
        params: Record<string, string | number | boolean | number[]>;
        rank: number;
        metrics: {
            rmse?: number | undefined;
            mae?: number | undefined;
            inertia?: number | undefined;
            accuracy?: number | undefined;
            f1?: number | undefined;
            precision?: number | undefined;
            recall?: number | undefined;
            silhouetteScore?: number | undefined;
            cvMeanAccuracy?: number | undefined;
            cvStdAccuracy?: number | undefined;
            cvFoldAccuracies?: number[] | undefined;
            trainingTimeMs?: number | undefined;
        };
    }, {
        params: Record<string, string | number | boolean | number[]>;
        rank: number;
        metrics: {
            rmse?: number | undefined;
            mae?: number | undefined;
            inertia?: number | undefined;
            accuracy?: number | undefined;
            f1?: number | undefined;
            precision?: number | undefined;
            recall?: number | undefined;
            silhouetteScore?: number | undefined;
            cvMeanAccuracy?: number | undefined;
            cvStdAccuracy?: number | undefined;
            cvFoldAccuracies?: number[] | undefined;
            trainingTimeMs?: number | undefined;
        };
    }>, "many">;
    evaluatedConfigs: z.ZodNumber;
    totalConfigs: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    bestParams: Record<string, string | number | boolean | number[]>;
    bestMetrics: {
        rmse?: number | undefined;
        mae?: number | undefined;
        inertia?: number | undefined;
        accuracy?: number | undefined;
        f1?: number | undefined;
        precision?: number | undefined;
        recall?: number | undefined;
        silhouetteScore?: number | undefined;
        cvMeanAccuracy?: number | undefined;
        cvStdAccuracy?: number | undefined;
        cvFoldAccuracies?: number[] | undefined;
        trainingTimeMs?: number | undefined;
    };
    allResults: {
        params: Record<string, string | number | boolean | number[]>;
        rank: number;
        metrics: {
            rmse?: number | undefined;
            mae?: number | undefined;
            inertia?: number | undefined;
            accuracy?: number | undefined;
            f1?: number | undefined;
            precision?: number | undefined;
            recall?: number | undefined;
            silhouetteScore?: number | undefined;
            cvMeanAccuracy?: number | undefined;
            cvStdAccuracy?: number | undefined;
            cvFoldAccuracies?: number[] | undefined;
            trainingTimeMs?: number | undefined;
        };
    }[];
    evaluatedConfigs: number;
    totalConfigs: number;
}, {
    bestParams: Record<string, string | number | boolean | number[]>;
    bestMetrics: {
        rmse?: number | undefined;
        mae?: number | undefined;
        inertia?: number | undefined;
        accuracy?: number | undefined;
        f1?: number | undefined;
        precision?: number | undefined;
        recall?: number | undefined;
        silhouetteScore?: number | undefined;
        cvMeanAccuracy?: number | undefined;
        cvStdAccuracy?: number | undefined;
        cvFoldAccuracies?: number[] | undefined;
        trainingTimeMs?: number | undefined;
    };
    allResults: {
        params: Record<string, string | number | boolean | number[]>;
        rank: number;
        metrics: {
            rmse?: number | undefined;
            mae?: number | undefined;
            inertia?: number | undefined;
            accuracy?: number | undefined;
            f1?: number | undefined;
            precision?: number | undefined;
            recall?: number | undefined;
            silhouetteScore?: number | undefined;
            cvMeanAccuracy?: number | undefined;
            cvStdAccuracy?: number | undefined;
            cvFoldAccuracies?: number[] | undefined;
            trainingTimeMs?: number | undefined;
        };
    }[];
    evaluatedConfigs: number;
    totalConfigs: number;
}>;
/** Full output from GridSearch.search(). */
export type GridSearchOutput = z.infer<typeof GridSearchOutputSchema>;
/**
 * Class-based GridSearch that wraps the functional gridSearch() with a richer
 * output shape (metrics per task, ranking, CV stats).
 */
export declare class GridSearch {
    private task;
    private data;
    private searchSpace;
    private cvFolds;
    constructor(task: 'classify' | 'cluster' | 'regress', data: FeatureMatrix, searchSpace: SearchSpace, cvFolds?: number);
    search(): Promise<GridSearchOutput>;
}
/**
 * Evaluate a single parameter configuration with CV.
 */
export declare function evaluateModel(params: Record<string, ParamValue>, data: FeatureMatrix, task: 'classify' | 'cluster' | 'regress', labels: string[], cvFolds?: number): Promise<EvalMetrics>;
/**
 * Suggest a default search space for the given task, sample count, and feature count.
 */
export declare function suggestSearchSpace(task: 'classify' | 'cluster' | 'regress', nSamples: number, nFeatures: number): SearchSpace;
/**
 * Convenience wrapper: run GridSearch and return just the best parameters + metrics.
 */
export declare function findBestParams(task: 'classify' | 'cluster' | 'regress', data: FeatureMatrix, _labels: string[], searchSpace: SearchSpace, cvFolds?: number): Promise<GridSearchOutput>;
/**
 * Parameter value for grid search (can be number, string, boolean, or array).
 */
export type ParamValue = number | string | boolean | number[];
/**
 * Grid search parameter space: maps parameter name to list of values.
 */
export type ParamGrid = Record<string, ParamValue[]>;
export declare const GridSearchResultSchema: z.ZodObject<{
    /** Parameter combination tested */
    params: z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodNumber, z.ZodString, z.ZodBoolean, z.ZodArray<z.ZodNumber, "many">]>>;
    /** Mean score across CV folds */
    meanScore: z.ZodNumber;
    /** Standard deviation of scores */
    stdDev: z.ZodNumber;
    /** Confidence interval lower bound (95% CI via t-distribution) */
    ciLower: z.ZodNumber;
    /** Confidence interval upper bound */
    ciUpper: z.ZodNumber;
    /** Per-fold scores */
    scores: z.ZodArray<z.ZodNumber, "many">;
}, "strip", z.ZodTypeAny, {
    params: Record<string, string | number | boolean | number[]>;
    scores: number[];
    stdDev: number;
    meanScore: number;
    ciLower: number;
    ciUpper: number;
}, {
    params: Record<string, string | number | boolean | number[]>;
    scores: number[];
    stdDev: number;
    meanScore: number;
    ciLower: number;
    ciUpper: number;
}>;
/**
 * Single parameter combination result.
 */
export type GridSearchResult = z.infer<typeof GridSearchResultSchema>;
/**
 * Generate all combinations of parameters in the grid.
 *
 * @param grid - Parameter grid
 * @returns Array of parameter combinations
 */
export declare function expandGrid(grid: ParamGrid): Record<string, ParamValue>[];
/**
 * Grid search over parameter combinations with k-fold cross-validation.
 *
 * @param data - Feature vectors (samples)
 * @param labels - Target labels
 * @param paramGrid - Parameter grid to search
 * @param cvFolds - Number of CV folds (default 3)
 * @param modelTrainer - Function: (trainData, testData, trainLabels, testLabels, params) => predictions
 * @returns Sorted grid search results (by mean score, descending)
 */
export declare function gridSearch<T>(data: T[], labels: number[], paramGrid: ParamGrid, cvFolds: number | undefined, modelTrainer: (trainData: T[], testData: T[], trainLabels: number[], testLabels: number[], params: Record<string, ParamValue>) => number[]): GridSearchResult[];
/**
 * Get the best parameter combination from grid search results.
 *
 * @param results - Grid search results
 * @returns Best parameter combination (highest mean score)
 */
export declare function getBestParams(results: GridSearchResult[]): Record<string, ParamValue>;
//# sourceMappingURL=hyperparameter-search.d.ts.map