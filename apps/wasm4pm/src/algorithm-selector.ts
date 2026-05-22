/**
 * Algorithm selection helpers for ML tasks.
 * Recommends best algorithm based on log characteristics and constraints.
 *
 * Implementation of Gap G1 from Iteration 5 AutoML Audit:
 * - suggestAlgorithm() provides a unified interface for all task types
 * - AlgorithmRecommendation includes confidence score and rationale
 * - Selection logic considers speed/quality trade-offs and data characteristics
 */

import type { ClassificationMethod, ClusteringMethod, RegressionMethod } from '@wasm4pm/ml';

export interface LogCharacteristics {
  traceCount: number;
  eventCount: number;
  activityCount: number;
  avgTraceLength: number;
  maxTraceLength: number;
}

/**
 * Algorithm recommendation with confidence score and rationale.
 */
export interface AlgorithmRecommendation {
  algorithm: string;
  confidence: number; // [0, 1] where 1 is highest confidence
  rationale: string;
  alternatives?: string[];
}

/**
 * Suggest an algorithm for any ML task (classify/cluster/forecast/regress/pca).
 * Unified interface for all task types.
 *
 * @param task - ML task type
 * @param characteristics - Log characteristics from the event log
 * @param userChoice - Optional user override
 * @returns Algorithm recommendation with confidence and rationale
 *
 * Example:
 *   const rec = suggestAlgorithm('classify', logChars);
 *   console.log(`Selected: ${rec.algorithm} (confidence: ${rec.confidence.toFixed(2)})`);
 */
export function suggestAlgorithm(
  task: 'classify' | 'cluster' | 'forecast' | 'regress' | 'pca',
  characteristics: LogCharacteristics,
  userChoice?: string
): AlgorithmRecommendation {
  switch (task) {
    case 'classify':
      return suggestClassificationAlgorithm(characteristics, userChoice);
    case 'cluster':
      return suggestClusteringAlgorithm(characteristics, userChoice);
    case 'forecast':
      return suggestForecastingAlgorithm(characteristics, userChoice);
    case 'regress':
      return suggestRegressionAlgorithm(characteristics, userChoice);
    case 'pca':
      return suggestPcaAlgorithm(characteristics, userChoice);
    default:
      return {
        algorithm: 'unknown',
        confidence: 0,
        rationale: `Unknown task: ${task as never}`,
      };
  }
}

/**
 * Suggest the best classification method based on log characteristics.
 *
 * Strategy:
 * - Small logs (<20 traces): naive_bayes (low variance)
 * - High-dimensional (>30 activities): decision_tree (handles feature interactions)
 * - High-cardinality (20-100 traces): knn (robust, non-parametric)
 * - Large logs (>100 traces): logistic_regression (stable, interpretable)
 */
function suggestClassificationAlgorithm(
  logChars: LogCharacteristics,
  userChoice?: string
): AlgorithmRecommendation {
  if (userChoice) {
    const valid = ['knn', 'naive_bayes', 'decision_tree', 'logistic_regression'];
    if (valid.includes(userChoice)) {
      return {
        algorithm: userChoice as ClassificationMethod,
        confidence: 1.0,
        rationale: 'User specified',
      };
    }
  }

  const { traceCount, activityCount } = logChars;

  // Very small logs: avoid overfitting with naive_bayes
  if (traceCount < 20) {
    return {
      algorithm: 'naive_bayes',
      confidence: 0.9,
      rationale: `Small log (${traceCount} traces): naive_bayes has lower variance than kNN`,
      alternatives: ['knn'],
    };
  }

  // High-dimensional: decision_tree handles feature interactions
  if (activityCount > 30 && traceCount < 100) {
    return {
      algorithm: 'decision_tree',
      confidence: 0.85,
      rationale: `High-dimensional data (${activityCount} activities): decision_tree captures feature interactions`,
      alternatives: ['knn', 'logistic_regression'],
    };
  }

  // Large logs: logistic_regression is stable
  if (traceCount > 100) {
    return {
      algorithm: 'logistic_regression',
      confidence: 0.88,
      rationale: `Large log (${traceCount} traces): logistic_regression is stable and interpretable`,
      alternatives: ['knn', 'decision_tree'],
    };
  }

  // Default: kNN is robust across conditions
  return {
    algorithm: 'knn',
    confidence: 0.8,
    rationale: `Medium log (${traceCount} traces, ${activityCount} activities): kNN is robust baseline`,
    alternatives: ['naive_bayes', 'decision_tree'],
  };
}

/**
 * Suggest the best classification method based on log characteristics.
 */
export function suggestClassificationMethod(
  logChars: LogCharacteristics,
  userChoice?: string
): ClassificationMethod {
  const rec = suggestClassificationAlgorithm(logChars, userChoice);
  return rec.algorithm as ClassificationMethod;
}

/**
 * Suggest the best clustering method based on log characteristics.
 *
 * Strategy:
 * - Sparse high-dimensional (>50 activities, <100 traces): dbscan (outlier robust)
 * - Medium logs with moderate cardinality: kmeans (fast, interpretable)
 * - Large, dense logs: kmeans (scalable, stable)
 */
function suggestClusteringAlgorithm(
  logChars: LogCharacteristics,
  userChoice?: string
): AlgorithmRecommendation {
  if (userChoice) {
    const valid = ['kmeans', 'dbscan'];
    if (valid.includes(userChoice)) {
      return {
        algorithm: userChoice as ClusteringMethod,
        confidence: 1.0,
        rationale: 'User specified',
      };
    }
  }

  const { traceCount, activityCount } = logChars;

  // Sparse high-dimensional: DBSCAN is outlier-robust
  if (activityCount > 50 && traceCount < 100) {
    return {
      algorithm: 'dbscan',
      confidence: 0.87,
      rationale: `Sparse high-dimensional data (${activityCount} activities, ${traceCount} traces): dbscan handles outliers`,
      alternatives: ['kmeans'],
    };
  }

  // Default: kmeans is fast and well-understood
  return {
    algorithm: 'kmeans',
    confidence: 0.85,
    rationale: `Standard clustering: kmeans is fast and interpretable (${traceCount} traces, ${activityCount} activities)`,
    alternatives: ['dbscan'],
  };
}

/**
 * Suggest the best clustering method based on log characteristics.
 */
export function suggestClusteringMethod(
  logChars: LogCharacteristics,
  userChoice?: string
): ClusteringMethod {
  const rec = suggestClusteringAlgorithm(logChars, userChoice);
  return rec.algorithm as ClusteringMethod;
}

/**
 * Suggest the best regression method based on log characteristics.
 *
 * Strategy:
 * - Small logs (<50 traces): linear_regression (low overfitting risk)
 * - High trace variance (avgLen > 100): polynomial_regression (captures non-linearity)
 * - Medium logs: exponential_regression or linear based on trend
 */
function suggestRegressionAlgorithm(
  logChars: LogCharacteristics,
  userChoice?: string
): AlgorithmRecommendation {
  if (userChoice) {
    const valid = ['linear_regression', 'polynomial_regression', 'exponential_regression'];
    if (valid.includes(userChoice)) {
      return {
        algorithm: userChoice as RegressionMethod,
        confidence: 1.0,
        rationale: 'User specified',
      };
    }
  }

  const { traceCount, avgTraceLength } = logChars;

  // Small logs: linear to avoid overfitting
  if (traceCount < 50) {
    return {
      algorithm: 'linear_regression',
      confidence: 0.88,
      rationale: `Small log (${traceCount} traces): linear_regression avoids overfitting`,
      alternatives: ['polynomial_regression'],
    };
  }

  // High trace variance: polynomial captures non-linearity
  if (avgTraceLength > 100) {
    return {
      algorithm: 'polynomial_regression',
      confidence: 0.82,
      rationale: `High trace variance (avg ${avgTraceLength} length): polynomial_regression fits non-linear patterns`,
      alternatives: ['linear_regression', 'exponential_regression'],
    };
  }

  // Medium logs: linear as safe default
  return {
    algorithm: 'linear_regression',
    confidence: 0.8,
    rationale: `Medium log (${traceCount} traces): linear_regression is stable baseline`,
    alternatives: ['polynomial_regression', 'exponential_regression'],
  };
}

/**
 * Suggest the best regression method based on log characteristics.
 */
export function suggestRegressionMethod(
  logChars: LogCharacteristics,
  userChoice?: string
): RegressionMethod {
  const rec = suggestRegressionAlgorithm(logChars, userChoice);
  return rec.algorithm as RegressionMethod;
}

/**
 * Suggest forecasting algorithm (simple linear trend assumed for MVP).
 */
function suggestForecastingAlgorithm(
  logChars: LogCharacteristics,
  userChoice?: string
): AlgorithmRecommendation {
  if (userChoice && ['linear', 'exponential'].includes(userChoice)) {
    return {
      algorithm: userChoice,
      confidence: 1.0,
      rationale: 'User specified',
    };
  }

  const { eventCount } = logChars;

  // For now, use linear as default (exponential may be added in future)
  return {
    algorithm: 'linear',
    confidence: 0.75,
    rationale: `Drift forecasting: using linear trend model (${eventCount} events in log)`,
    alternatives: ['exponential'],
  };
}

/**
 * Suggest PCA algorithm (SVD is implicit).
 */
function suggestPcaAlgorithm(
  logChars: LogCharacteristics,
  userChoice?: string
): AlgorithmRecommendation {
  if (userChoice && userChoice === 'svd') {
    return {
      algorithm: userChoice,
      confidence: 1.0,
      rationale: 'User specified',
    };
  }

  const { activityCount, traceCount } = logChars;

  return {
    algorithm: 'svd',
    confidence: 0.9,
    rationale: `Dimensionality reduction: SVD works well for ${activityCount} features, ${traceCount} samples`,
    alternatives: [],
  };
}

/**
 * Validate that k is reasonable for clustering.
 * Returns normalized k (clamped to [1, traceCount]).
 */
export function validateAndNormalizeK(k: number | undefined, traceCount: number): number {
  if (k === undefined) {
    // Default: sqrt(n) is common heuristic
    return Math.max(2, Math.min(10, Math.ceil(Math.sqrt(traceCount))));
  }

  if (k < 1) {
    return 1;
  }

  if (k > traceCount) {
    return traceCount;
  }

  return k;
}

/**
 * Validate that classification target key makes sense.
 * Returns actionable error if issues found.
 */
export function validateClassificationTarget(
  targetKey: string | undefined,
  availableKeys: string[]
): { valid: boolean; error?: string } {
  if (!targetKey) {
    return { valid: false, error: 'Target key is required for classification' };
  }

  if (!availableKeys.includes(targetKey)) {
    return {
      valid: false,
      error: `Target key "${targetKey}" not found in log. Available: [${availableKeys.join(', ')}]`,
    };
  }

  return { valid: true };
}
