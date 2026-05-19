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

import { stratifiedKFold, computeAccuracy } from './cross-validation.js';

/**
 * Parameter value for grid search (can be number, string, boolean, or array).
 */
export type ParamValue = number | string | boolean | number[];

/**
 * Grid search parameter space: maps parameter name to list of values.
 */
export type ParamGrid = Record<string, ParamValue[]>;

/**
 * Single parameter combination result.
 */
export interface GridSearchResult {
  /** Parameter combination tested */
  params: Record<string, ParamValue>;

  /** Mean score across CV folds */
  meanScore: number;

  /** Standard deviation of scores */
  stdDev: number;

  /** Confidence interval lower bound (95% CI via t-distribution) */
  ciLower: number;

  /** Confidence interval upper bound */
  ciUpper: number;

  /** Per-fold scores */
  scores: number[];
}

/**
 * Compute t-distribution quantile (approximation for df >= 1).
 * For 95% CI and df = k-1:
 *   - df=2: t ≈ 4.303
 *   - df=3: t ≈ 3.182
 *   - df=4: t ≈ 2.776
 *   - df=5: t ≈ 2.571
 *
 * @param df - Degrees of freedom
 * @param alpha - Significance level (0.05 for 95% CI)
 * @returns t-value
 */
function tQuantile(df: number, alpha: number = 0.05): number {
  // Approximation: t(df, alpha/2) ≈ polynomial fit
  // For df >= 1, use Abramowitz & Stegun approximation
  const t_alpha = alpha / 2;
  if (df === 1) return 12.706;
  if (df === 2) return 4.303;
  if (df === 3) return 3.182;
  if (df === 4) return 2.776;
  if (df === 5) return 2.571;
  if (df === 6) return 2.447;
  if (df === 7) return 2.365;
  if (df === 8) return 2.306;
  if (df === 9) return 2.262;
  if (df === 10) return 2.228;
  // For df > 10, approximate with normal quantile
  const z = 1.96; // 95% CI normal quantile
  return z * (1 + 1 / (4 * df));
}

/**
 * Generate all combinations of parameters in the grid.
 *
 * @param grid - Parameter grid
 * @returns Array of parameter combinations
 */
export function expandGrid(grid: ParamGrid): Record<string, ParamValue>[] {
  const keys = Object.keys(grid);
  if (keys.length === 0) return [{}];

  const combinations: Record<string, ParamValue>[] = [];

  // Recursive function to generate combinations
  function recurse(index: number, current: Record<string, ParamValue>) {
    if (index === keys.length) {
      combinations.push({ ...current });
      return;
    }

    const key = keys[index];
    const values = grid[key];
    for (const value of values) {
      current[key] = value;
      recurse(index + 1, current);
    }
  }

  recurse(0, {});
  return combinations;
}

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
export function gridSearch<T>(
  data: T[],
  labels: number[],
  paramGrid: ParamGrid,
  cvFolds: number = 3,
  modelTrainer: (
    trainData: T[],
    testData: T[],
    trainLabels: number[],
    testLabels: number[],
    params: Record<string, ParamValue>
  ) => number[] // predictions for test set
): GridSearchResult[] {
  const combinations = expandGrid(paramGrid);
  const results: GridSearchResult[] = [];

  const n = data.length;
  if (n < 2 * cvFolds) {
    return []; // Not enough data for CV
  }

  const { trainIndices, testIndices } = stratifiedKFold(labels, cvFolds);

  // For each parameter combination
  for (const params of combinations) {
    const scores: number[] = [];

    // For each CV fold
    for (let foldIdx = 0; foldIdx < cvFolds; foldIdx++) {
      const trainIdx = trainIndices[foldIdx];
      const testIdx = testIndices[foldIdx];

      const trainData = Array.from(trainIdx).map((i) => data[i]);
      const testData = Array.from(testIdx).map((i) => data[i]);
      const trainLabels = Array.from(trainIdx).map((i) => labels[i]);
      const testLabels = Array.from(testIdx).map((i) => labels[i]);

      if (trainData.length === 0 || testData.length === 0) {
        scores.push(0);
        continue;
      }

      const predictions = modelTrainer(trainData, testData, trainLabels, testLabels, params);
      const accuracy = computeAccuracy(testLabels, predictions);
      scores.push(accuracy);
    }

    // Compute mean and std dev
    const mean = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const variance =
      scores.length > 1
        ? scores.reduce((a, v) => a + (v - mean) ** 2, 0) / scores.length
        : 0;
    const stdDev = Math.sqrt(variance);

    // Compute 95% confidence interval via t-distribution
    const df = cvFolds - 1;
    const t = tQuantile(df, 0.05);
    const se = stdDev / Math.sqrt(cvFolds); // standard error
    const ciLower = mean - t * se;
    const ciUpper = mean + t * se;

    results.push({
      params,
      meanScore: mean,
      stdDev,
      ciLower,
      ciUpper,
      scores,
    });
  }

  // Sort by mean score (descending)
  return results.sort((a, b) => b.meanScore - a.meanScore);
}

/**
 * Get the best parameter combination from grid search results.
 *
 * @param results - Grid search results
 * @returns Best parameter combination (highest mean score)
 */
export function getBestParams(results: GridSearchResult[]): Record<string, ParamValue> {
  if (results.length === 0) return {};
  return results[0].params;
}
