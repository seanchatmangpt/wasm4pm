/**
 * Type definitions for @wasm4pm/ml
 *
 * Result interfaces for all ML operations.
 * Native process intelligence ML — no external ML library dependencies.
 */
import { z } from 'zod';
export declare const EmptyInputWarningSchema: z.ZodObject<{
    /** Stable warning code. Use this for programmatic checks. */
    code: z.ZodEnum<["empty_input", "insufficient_samples", "short_series", "no_valid_features", "no_labels"]>;
    /** Human-readable explanation. */
    message: z.ZodString;
    /** Number of items the function received. */
    inputLength: z.ZodNumber;
    /** Minimum number of items required to produce a meaningful result. */
    minRequired: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    code: "empty_input" | "insufficient_samples" | "short_series" | "no_valid_features" | "no_labels";
    message: string;
    inputLength: number;
    minRequired: number;
}, {
    code: "empty_input" | "insufficient_samples" | "short_series" | "no_valid_features" | "no_labels";
    message: string;
    inputLength: number;
    minRequired: number;
}>;
/**
 * Sentinel metadata attached to ML results when the input was too small or
 * empty to produce a meaningful answer. Callers should treat any result with
 * a populated `warning` as a no-op: numeric fields will be defaults (0, []),
 * predictions/assignments will be empty, and no model was actually fit.
 *
 * This is a domain-contract refusal in metadata form — existing tests that
 * assert empty arrays still pass, but downstream code can now branch on
 * `metadata?.warning` to surface the situation instead of silently using
 * sentinel results as if they were valid.
 */
export type EmptyInputWarning = z.infer<typeof EmptyInputWarningSchema>;
export declare const FeatureMatrixSchema: z.ZodObject<{
    /** Rows = traces/observations, cols = features */
    data: z.ZodArray<z.ZodArray<z.ZodNumber, "many">, "many">;
    /** Column headers (original feature names + one-hot encoded names) */
    featureNames: z.ZodArray<z.ZodString, "many">;
    /** Row identifiers (case IDs or trace indices) */
    caseIds: z.ZodArray<z.ZodString, "many">;
    /** Numeric target values (e.g., remaining_time) */
    targets: z.ZodArray<z.ZodNumber, "many">;
    /** Categorical target labels (e.g., outcome activity name) */
    labels: z.ZodArray<z.ZodString, "many">;
    /** Set when the input was empty / null / had no valid rows. */
    metadata: z.ZodOptional<z.ZodObject<{
        warning: z.ZodObject<{
            /** Stable warning code. Use this for programmatic checks. */
            code: z.ZodEnum<["empty_input", "insufficient_samples", "short_series", "no_valid_features", "no_labels"]>;
            /** Human-readable explanation. */
            message: z.ZodString;
            /** Number of items the function received. */
            inputLength: z.ZodNumber;
            /** Minimum number of items required to produce a meaningful result. */
            minRequired: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            code: "empty_input" | "insufficient_samples" | "short_series" | "no_valid_features" | "no_labels";
            message: string;
            inputLength: number;
            minRequired: number;
        }, {
            code: "empty_input" | "insufficient_samples" | "short_series" | "no_valid_features" | "no_labels";
            message: string;
            inputLength: number;
            minRequired: number;
        }>;
    }, "strip", z.ZodTypeAny, {
        warning: {
            code: "empty_input" | "insufficient_samples" | "short_series" | "no_valid_features" | "no_labels";
            message: string;
            inputLength: number;
            minRequired: number;
        };
    }, {
        warning: {
            code: "empty_input" | "insufficient_samples" | "short_series" | "no_valid_features" | "no_labels";
            message: string;
            inputLength: number;
            minRequired: number;
        };
    }>>;
}, "strip", z.ZodTypeAny, {
    data: number[][];
    featureNames: string[];
    caseIds: string[];
    targets: number[];
    labels: string[];
    metadata?: {
        warning: {
            code: "empty_input" | "insufficient_samples" | "short_series" | "no_valid_features" | "no_labels";
            message: string;
            inputLength: number;
            minRequired: number;
        };
    } | undefined;
}, {
    data: number[][];
    featureNames: string[];
    caseIds: string[];
    targets: number[];
    labels: string[];
    metadata?: {
        warning: {
            code: "empty_input" | "insufficient_samples" | "short_series" | "no_valid_features" | "no_labels";
            message: string;
            inputLength: number;
            minRequired: number;
        };
    } | undefined;
}>;
/** Numeric feature matrix ready for ML consumption */
export type FeatureMatrix = z.infer<typeof FeatureMatrixSchema>;
/** Label encoding result for classifiers */
export interface LabelEncoding {
    /** Numeric labels (0, 1, 2, ...) */
    encoded: number[];
    /** String label → numeric index */
    labelMap: Map<string, number>;
    /** Numeric index → string label */
    reverseMap: Map<number, string>;
}
/** Classification method */
export type ClassificationMethod = 'knn' | 'logistic_regression' | 'decision_tree' | 'naive_bayes' | 'gradient_boosting';
/** Regression method */
export type RegressionMethod = 'linear_regression' | 'polynomial_regression' | 'exponential_regression';
/** Clustering method */
export type ClusteringMethod = 'kmeans' | 'dbscan';
export declare const ClassificationResultSchema: z.ZodObject<{
    method: z.ZodEnum<["knn", "logistic_regression", "decision_tree", "naive_bayes", "gradient_boosting"]>;
    predictions: z.ZodArray<z.ZodObject<{
        caseId: z.ZodString;
        predicted: z.ZodString;
        confidence: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        confidence: number;
        caseId: string;
        predicted: string;
    }, {
        confidence: number;
        caseId: string;
        predicted: string;
    }>, "many">;
    modelInfo: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    /**
     * Mean cross-validation accuracy over k held-out folds.
     * Present only when crossValidate=true is passed to classifyTraces.
     */
    cv_accuracy: z.ZodOptional<z.ZodNumber>;
    /** Standard deviation of per-fold accuracy scores. */
    cv_std_dev: z.ZodOptional<z.ZodNumber>;
    /** Number of CV folds used (default: 3). */
    cv_folds: z.ZodOptional<z.ZodNumber>;
    /** Per-fold accuracy scores for debugging and audit trails. */
    cv_fold_scores: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
    /** Method selected by the data-driven algorithm selector. */
    suggested_method: z.ZodOptional<z.ZodEnum<["knn", "logistic_regression", "decision_tree", "naive_bayes", "gradient_boosting"]>>;
    /** Empty-input refusal metadata. */
    metadata: z.ZodOptional<z.ZodObject<{
        warning: z.ZodObject<{
            /** Stable warning code. Use this for programmatic checks. */
            code: z.ZodEnum<["empty_input", "insufficient_samples", "short_series", "no_valid_features", "no_labels"]>;
            /** Human-readable explanation. */
            message: z.ZodString;
            /** Number of items the function received. */
            inputLength: z.ZodNumber;
            /** Minimum number of items required to produce a meaningful result. */
            minRequired: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            code: "empty_input" | "insufficient_samples" | "short_series" | "no_valid_features" | "no_labels";
            message: string;
            inputLength: number;
            minRequired: number;
        }, {
            code: "empty_input" | "insufficient_samples" | "short_series" | "no_valid_features" | "no_labels";
            message: string;
            inputLength: number;
            minRequired: number;
        }>;
    }, "strip", z.ZodTypeAny, {
        warning: {
            code: "empty_input" | "insufficient_samples" | "short_series" | "no_valid_features" | "no_labels";
            message: string;
            inputLength: number;
            minRequired: number;
        };
    }, {
        warning: {
            code: "empty_input" | "insufficient_samples" | "short_series" | "no_valid_features" | "no_labels";
            message: string;
            inputLength: number;
            minRequired: number;
        };
    }>>;
}, "strip", z.ZodTypeAny, {
    method: "knn" | "logistic_regression" | "decision_tree" | "naive_bayes" | "gradient_boosting";
    predictions: {
        confidence: number;
        caseId: string;
        predicted: string;
    }[];
    modelInfo: Record<string, unknown>;
    metadata?: {
        warning: {
            code: "empty_input" | "insufficient_samples" | "short_series" | "no_valid_features" | "no_labels";
            message: string;
            inputLength: number;
            minRequired: number;
        };
    } | undefined;
    cv_accuracy?: number | undefined;
    cv_std_dev?: number | undefined;
    cv_folds?: number | undefined;
    cv_fold_scores?: number[] | undefined;
    suggested_method?: "knn" | "logistic_regression" | "decision_tree" | "naive_bayes" | "gradient_boosting" | undefined;
}, {
    method: "knn" | "logistic_regression" | "decision_tree" | "naive_bayes" | "gradient_boosting";
    predictions: {
        confidence: number;
        caseId: string;
        predicted: string;
    }[];
    modelInfo: Record<string, unknown>;
    metadata?: {
        warning: {
            code: "empty_input" | "insufficient_samples" | "short_series" | "no_valid_features" | "no_labels";
            message: string;
            inputLength: number;
            minRequired: number;
        };
    } | undefined;
    cv_accuracy?: number | undefined;
    cv_std_dev?: number | undefined;
    cv_folds?: number | undefined;
    cv_fold_scores?: number[] | undefined;
    suggested_method?: "knn" | "logistic_regression" | "decision_tree" | "naive_bayes" | "gradient_boosting" | undefined;
}>;
export type ClassificationResult = z.infer<typeof ClassificationResultSchema>;
export declare const RegressionResultSchema: z.ZodObject<{
    method: z.ZodEnum<["linear_regression", "polynomial_regression", "exponential_regression"]>;
    slope: z.ZodOptional<z.ZodNumber>;
    intercept: z.ZodOptional<z.ZodNumber>;
    rSquared: z.ZodNumber;
    rmse: z.ZodNumber;
    mae: z.ZodNumber;
    predictions: z.ZodArray<z.ZodObject<{
        caseId: z.ZodString;
        actual: z.ZodNumber;
        predicted: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        caseId: string;
        predicted: number;
        actual: number;
    }, {
        caseId: string;
        predicted: number;
        actual: number;
    }>, "many">;
    degree: z.ZodOptional<z.ZodNumber>;
    coefficients: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
    growthRate: z.ZodOptional<z.ZodNumber>;
    amplitude: z.ZodOptional<z.ZodNumber>;
    doublingTime: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    method: "linear_regression" | "polynomial_regression" | "exponential_regression";
    predictions: {
        caseId: string;
        predicted: number;
        actual: number;
    }[];
    rSquared: number;
    rmse: number;
    mae: number;
    degree?: number | undefined;
    slope?: number | undefined;
    intercept?: number | undefined;
    coefficients?: number[] | undefined;
    growthRate?: number | undefined;
    amplitude?: number | undefined;
    doublingTime?: number | undefined;
}, {
    method: "linear_regression" | "polynomial_regression" | "exponential_regression";
    predictions: {
        caseId: string;
        predicted: number;
        actual: number;
    }[];
    rSquared: number;
    rmse: number;
    mae: number;
    degree?: number | undefined;
    slope?: number | undefined;
    intercept?: number | undefined;
    coefficients?: number[] | undefined;
    growthRate?: number | undefined;
    amplitude?: number | undefined;
    doublingTime?: number | undefined;
}>;
export type RegressionResult = z.infer<typeof RegressionResultSchema>;
export declare const ClusteringResultSchema: z.ZodObject<{
    method: z.ZodEnum<["kmeans", "dbscan"]>;
    clusterCount: z.ZodNumber;
    noiseCount: z.ZodNumber;
    assignments: z.ZodArray<z.ZodObject<{
        caseId: z.ZodString;
        cluster: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        cluster: number;
        caseId: string;
    }, {
        cluster: number;
        caseId: string;
    }>, "many">;
    centroids: z.ZodOptional<z.ZodArray<z.ZodArray<z.ZodNumber, "many">, "many">>;
    modelInfo: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    metadata: z.ZodOptional<z.ZodObject<{
        warning: z.ZodObject<{
            /** Stable warning code. Use this for programmatic checks. */
            code: z.ZodEnum<["empty_input", "insufficient_samples", "short_series", "no_valid_features", "no_labels"]>;
            /** Human-readable explanation. */
            message: z.ZodString;
            /** Number of items the function received. */
            inputLength: z.ZodNumber;
            /** Minimum number of items required to produce a meaningful result. */
            minRequired: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            code: "empty_input" | "insufficient_samples" | "short_series" | "no_valid_features" | "no_labels";
            message: string;
            inputLength: number;
            minRequired: number;
        }, {
            code: "empty_input" | "insufficient_samples" | "short_series" | "no_valid_features" | "no_labels";
            message: string;
            inputLength: number;
            minRequired: number;
        }>;
    }, "strip", z.ZodTypeAny, {
        warning: {
            code: "empty_input" | "insufficient_samples" | "short_series" | "no_valid_features" | "no_labels";
            message: string;
            inputLength: number;
            minRequired: number;
        };
    }, {
        warning: {
            code: "empty_input" | "insufficient_samples" | "short_series" | "no_valid_features" | "no_labels";
            message: string;
            inputLength: number;
            minRequired: number;
        };
    }>>;
}, "strip", z.ZodTypeAny, {
    method: "kmeans" | "dbscan";
    modelInfo: Record<string, unknown>;
    clusterCount: number;
    noiseCount: number;
    assignments: {
        cluster: number;
        caseId: string;
    }[];
    metadata?: {
        warning: {
            code: "empty_input" | "insufficient_samples" | "short_series" | "no_valid_features" | "no_labels";
            message: string;
            inputLength: number;
            minRequired: number;
        };
    } | undefined;
    centroids?: number[][] | undefined;
}, {
    method: "kmeans" | "dbscan";
    modelInfo: Record<string, unknown>;
    clusterCount: number;
    noiseCount: number;
    assignments: {
        cluster: number;
        caseId: string;
    }[];
    metadata?: {
        warning: {
            code: "empty_input" | "insufficient_samples" | "short_series" | "no_valid_features" | "no_labels";
            message: string;
            inputLength: number;
            minRequired: number;
        };
    } | undefined;
    centroids?: number[][] | undefined;
}>;
export type ClusteringResult = z.infer<typeof ClusteringResultSchema>;
export declare const ThroughputForecastResultSchema: z.ZodObject<{
    eventCounts: z.ZodArray<z.ZodNumber, "many">;
    windowCount: z.ZodNumber;
    trend: z.ZodObject<{
        direction: z.ZodString;
        slope: z.ZodNumber;
        strength: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        slope: number;
        direction: string;
        strength: number;
    }, {
        slope: number;
        direction: string;
        strength: number;
    }>;
    forecast: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
    seasonality: z.ZodOptional<z.ZodObject<{
        period: z.ZodNumber;
        strength: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        strength: number;
        period: number;
    }, {
        strength: number;
        period: number;
    }>>;
    decomposition: z.ZodOptional<z.ZodObject<{
        trend: z.ZodArray<z.ZodNumber, "many">;
        seasonal: z.ZodArray<z.ZodNumber, "many">;
        residual: z.ZodArray<z.ZodNumber, "many">;
    }, "strip", z.ZodTypeAny, {
        trend: number[];
        seasonal: number[];
        residual: number[];
    }, {
        trend: number[];
        seasonal: number[];
        residual: number[];
    }>>;
    windowSizeMs: z.ZodNumber;
    exponentialForecast: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
    metadata: z.ZodOptional<z.ZodObject<{
        warning: z.ZodObject<{
            /** Stable warning code. Use this for programmatic checks. */
            code: z.ZodEnum<["empty_input", "insufficient_samples", "short_series", "no_valid_features", "no_labels"]>;
            /** Human-readable explanation. */
            message: z.ZodString;
            /** Number of items the function received. */
            inputLength: z.ZodNumber;
            /** Minimum number of items required to produce a meaningful result. */
            minRequired: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            code: "empty_input" | "insufficient_samples" | "short_series" | "no_valid_features" | "no_labels";
            message: string;
            inputLength: number;
            minRequired: number;
        }, {
            code: "empty_input" | "insufficient_samples" | "short_series" | "no_valid_features" | "no_labels";
            message: string;
            inputLength: number;
            minRequired: number;
        }>;
    }, "strip", z.ZodTypeAny, {
        warning: {
            code: "empty_input" | "insufficient_samples" | "short_series" | "no_valid_features" | "no_labels";
            message: string;
            inputLength: number;
            minRequired: number;
        };
    }, {
        warning: {
            code: "empty_input" | "insufficient_samples" | "short_series" | "no_valid_features" | "no_labels";
            message: string;
            inputLength: number;
            minRequired: number;
        };
    }>>;
}, "strip", z.ZodTypeAny, {
    trend: {
        slope: number;
        direction: string;
        strength: number;
    };
    eventCounts: number[];
    windowCount: number;
    windowSizeMs: number;
    forecast?: number[] | undefined;
    metadata?: {
        warning: {
            code: "empty_input" | "insufficient_samples" | "short_series" | "no_valid_features" | "no_labels";
            message: string;
            inputLength: number;
            minRequired: number;
        };
    } | undefined;
    seasonality?: {
        strength: number;
        period: number;
    } | undefined;
    decomposition?: {
        trend: number[];
        seasonal: number[];
        residual: number[];
    } | undefined;
    exponentialForecast?: number[] | undefined;
}, {
    trend: {
        slope: number;
        direction: string;
        strength: number;
    };
    eventCounts: number[];
    windowCount: number;
    windowSizeMs: number;
    forecast?: number[] | undefined;
    metadata?: {
        warning: {
            code: "empty_input" | "insufficient_samples" | "short_series" | "no_valid_features" | "no_labels";
            message: string;
            inputLength: number;
            minRequired: number;
        };
    } | undefined;
    seasonality?: {
        strength: number;
        period: number;
    } | undefined;
    decomposition?: {
        trend: number[];
        seasonal: number[];
        residual: number[];
    } | undefined;
    exponentialForecast?: number[] | undefined;
}>;
export type ThroughputForecastResult = z.infer<typeof ThroughputForecastResultSchema>;
export declare const SeriesForecastResultSchema: z.ZodObject<{
    seriesLength: z.ZodNumber;
    trend: z.ZodObject<{
        direction: z.ZodString;
        slope: z.ZodNumber;
        strength: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        slope: number;
        direction: string;
        strength: number;
    }, {
        slope: number;
        direction: string;
        strength: number;
    }>;
    forecast: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
    /**
     * R² goodness-of-fit for the linear trend model.
     * Present when series has ≥ 3 observations.
     */
    rSquared: z.ZodOptional<z.ZodNumber>;
    /**
     * 95% confidence intervals for each forecast period.
     * Present when series has ≥ 3 observations and `forecast` is populated.
     */
    confidenceIntervals: z.ZodOptional<z.ZodArray<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>, "many">>;
    seasonality: z.ZodOptional<z.ZodObject<{
        period: z.ZodNumber;
        strength: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        strength: number;
        period: number;
    }, {
        strength: number;
        period: number;
    }>>;
    decomposition: z.ZodOptional<z.ZodObject<{
        trend: z.ZodArray<z.ZodNumber, "many">;
        seasonal: z.ZodArray<z.ZodNumber, "many">;
        residual: z.ZodArray<z.ZodNumber, "many">;
    }, "strip", z.ZodTypeAny, {
        trend: number[];
        seasonal: number[];
        residual: number[];
    }, {
        trend: number[];
        seasonal: number[];
        residual: number[];
    }>>;
    exponentialForecast: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
    metadata: z.ZodOptional<z.ZodObject<{
        warning: z.ZodObject<{
            /** Stable warning code. Use this for programmatic checks. */
            code: z.ZodEnum<["empty_input", "insufficient_samples", "short_series", "no_valid_features", "no_labels"]>;
            /** Human-readable explanation. */
            message: z.ZodString;
            /** Number of items the function received. */
            inputLength: z.ZodNumber;
            /** Minimum number of items required to produce a meaningful result. */
            minRequired: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            code: "empty_input" | "insufficient_samples" | "short_series" | "no_valid_features" | "no_labels";
            message: string;
            inputLength: number;
            minRequired: number;
        }, {
            code: "empty_input" | "insufficient_samples" | "short_series" | "no_valid_features" | "no_labels";
            message: string;
            inputLength: number;
            minRequired: number;
        }>;
    }, "strip", z.ZodTypeAny, {
        warning: {
            code: "empty_input" | "insufficient_samples" | "short_series" | "no_valid_features" | "no_labels";
            message: string;
            inputLength: number;
            minRequired: number;
        };
    }, {
        warning: {
            code: "empty_input" | "insufficient_samples" | "short_series" | "no_valid_features" | "no_labels";
            message: string;
            inputLength: number;
            minRequired: number;
        };
    }>>;
}, "strip", z.ZodTypeAny, {
    trend: {
        slope: number;
        direction: string;
        strength: number;
    };
    seriesLength: number;
    forecast?: number[] | undefined;
    metadata?: {
        warning: {
            code: "empty_input" | "insufficient_samples" | "short_series" | "no_valid_features" | "no_labels";
            message: string;
            inputLength: number;
            minRequired: number;
        };
    } | undefined;
    rSquared?: number | undefined;
    seasonality?: {
        strength: number;
        period: number;
    } | undefined;
    decomposition?: {
        trend: number[];
        seasonal: number[];
        residual: number[];
    } | undefined;
    exponentialForecast?: number[] | undefined;
    confidenceIntervals?: [number, number][] | undefined;
}, {
    trend: {
        slope: number;
        direction: string;
        strength: number;
    };
    seriesLength: number;
    forecast?: number[] | undefined;
    metadata?: {
        warning: {
            code: "empty_input" | "insufficient_samples" | "short_series" | "no_valid_features" | "no_labels";
            message: string;
            inputLength: number;
            minRequired: number;
        };
    } | undefined;
    rSquared?: number | undefined;
    seasonality?: {
        strength: number;
        period: number;
    } | undefined;
    decomposition?: {
        trend: number[];
        seasonal: number[];
        residual: number[];
    } | undefined;
    exponentialForecast?: number[] | undefined;
    confidenceIntervals?: [number, number][] | undefined;
}>;
/** Generic series forecast result (for drift distances, any numeric series) */
export type SeriesForecastResult = z.infer<typeof SeriesForecastResultSchema>;
export declare const EnhancedAnomalyResultSchema: z.ZodObject<{
    peakIndices: z.ZodArray<z.ZodNumber, "many">;
    peakValues: z.ZodArray<z.ZodNumber, "many">;
    decomposed: z.ZodOptional<z.ZodObject<{
        trend: z.ZodArray<z.ZodNumber, "many">;
        seasonal: z.ZodArray<z.ZodNumber, "many">;
        residual: z.ZodArray<z.ZodNumber, "many">;
    }, "strip", z.ZodTypeAny, {
        trend: number[];
        seasonal: number[];
        residual: number[];
    }, {
        trend: number[];
        seasonal: number[];
        residual: number[];
    }>>;
    residualPeaks: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
    smoothedSeries: z.ZodArray<z.ZodNumber, "many">;
    originalLength: z.ZodNumber;
    metadata: z.ZodOptional<z.ZodObject<{
        warning: z.ZodObject<{
            /** Stable warning code. Use this for programmatic checks. */
            code: z.ZodEnum<["empty_input", "insufficient_samples", "short_series", "no_valid_features", "no_labels"]>;
            /** Human-readable explanation. */
            message: z.ZodString;
            /** Number of items the function received. */
            inputLength: z.ZodNumber;
            /** Minimum number of items required to produce a meaningful result. */
            minRequired: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            code: "empty_input" | "insufficient_samples" | "short_series" | "no_valid_features" | "no_labels";
            message: string;
            inputLength: number;
            minRequired: number;
        }, {
            code: "empty_input" | "insufficient_samples" | "short_series" | "no_valid_features" | "no_labels";
            message: string;
            inputLength: number;
            minRequired: number;
        }>;
    }, "strip", z.ZodTypeAny, {
        warning: {
            code: "empty_input" | "insufficient_samples" | "short_series" | "no_valid_features" | "no_labels";
            message: string;
            inputLength: number;
            minRequired: number;
        };
    }, {
        warning: {
            code: "empty_input" | "insufficient_samples" | "short_series" | "no_valid_features" | "no_labels";
            message: string;
            inputLength: number;
            minRequired: number;
        };
    }>>;
}, "strip", z.ZodTypeAny, {
    peakIndices: number[];
    peakValues: number[];
    smoothedSeries: number[];
    originalLength: number;
    metadata?: {
        warning: {
            code: "empty_input" | "insufficient_samples" | "short_series" | "no_valid_features" | "no_labels";
            message: string;
            inputLength: number;
            minRequired: number;
        };
    } | undefined;
    decomposed?: {
        trend: number[];
        seasonal: number[];
        residual: number[];
    } | undefined;
    residualPeaks?: number[] | undefined;
}, {
    peakIndices: number[];
    peakValues: number[];
    smoothedSeries: number[];
    originalLength: number;
    metadata?: {
        warning: {
            code: "empty_input" | "insufficient_samples" | "short_series" | "no_valid_features" | "no_labels";
            message: string;
            inputLength: number;
            minRequired: number;
        };
    } | undefined;
    decomposed?: {
        trend: number[];
        seasonal: number[];
        residual: number[];
    } | undefined;
    residualPeaks?: number[] | undefined;
}>;
export type EnhancedAnomalyResult = z.infer<typeof EnhancedAnomalyResultSchema>;
export declare const PCAResultSchema: z.ZodObject<{
    nComponents: z.ZodNumber;
    explainedVariance: z.ZodArray<z.ZodNumber, "many">;
    transformedData: z.ZodArray<z.ZodArray<z.ZodNumber, "many">, "many">;
    components: z.ZodArray<z.ZodArray<z.ZodNumber, "many">, "many">;
    originalFeatureCount: z.ZodNumber;
    featureNames: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    featureNames: string[];
    nComponents: number;
    explainedVariance: number[];
    transformedData: number[][];
    components: number[][];
    originalFeatureCount: number;
}, {
    featureNames: string[];
    nComponents: number;
    explainedVariance: number[];
    transformedData: number[][];
    components: number[][];
    originalFeatureCount: number;
}>;
export type PCAResult = z.infer<typeof PCAResultSchema>;
//# sourceMappingURL=types.d.ts.map