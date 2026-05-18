/**
 * Algorithm selection helpers for ML tasks.
 * Recommends best algorithm based on log characteristics and constraints.
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
 * Suggest the best classification method based on log characteristics.
 */
export function suggestClassificationMethod(
  logChars: LogCharacteristics,
  userChoice?: string
): ClassificationMethod {
  if (userChoice) {
    const valid = ['knn', 'naive_bayes', 'decision_tree', 'logistic_regression'];
    if (valid.includes(userChoice)) {
      return userChoice as ClassificationMethod;
    }
  }

  // Rule-based selection
  const { traceCount, activityCount } = logChars;

  // If very few traces, use simpler method
  if (traceCount < 20) {
    return 'naive_bayes'; // Lower variance than kNN
  }

  // If many distinct activities, decision_tree handles feature space better
  if (activityCount > 30) {
    return 'decision_tree';
  }

  // Default: kNN is robust
  return 'knn';
}

/**
 * Suggest the best clustering method based on log characteristics.
 */
export function suggestClusteringMethod(
  logChars: LogCharacteristics,
  userChoice?: string
): ClusteringMethod {
  if (userChoice) {
    const valid = ['kmeans', 'dbscan'];
    if (valid.includes(userChoice)) {
      return userChoice as ClusteringMethod;
    }
  }

  // Rule-based selection
  const { traceCount, activityCount } = logChars;

  // If sparse high-dimensional data (many activities), DBSCAN handles outliers better
  if (activityCount > 50 && traceCount < 100) {
    return 'dbscan';
  }

  // Default: kmeans is fast and well-understood
  return 'kmeans';
}

/**
 * Suggest the best regression method based on log characteristics.
 */
export function suggestRegressionMethod(
  logChars: LogCharacteristics,
  userChoice?: string
): RegressionMethod {
  if (userChoice) {
    const valid = ['linear_regression', 'polynomial_regression', 'exponential_regression'];
    if (valid.includes(userChoice)) {
      return userChoice as RegressionMethod;
    }
  }

  // Rule-based selection
  const { traceCount, avgTraceLength } = logChars;

  // If few data points, linear is less prone to overfitting
  if (traceCount < 50) {
    return 'linear_regression';
  }

  // If high variability in trace lengths, polynomial may fit better
  if (avgTraceLength > 100) {
    return 'polynomial_regression';
  }

  // Default: linear regression
  return 'linear_regression';
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
