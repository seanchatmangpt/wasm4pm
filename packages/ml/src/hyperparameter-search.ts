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
import { classifyTraces, regressRemainingTime } from './classifiers.js';
import { clusterTraces } from './clustering.js';
import { stratifiedKFold, computeAccuracy } from './cross-validation.js';
import type { FeatureMatrix } from './types.js';

export type { FeatureMatrix };

/** Search space: maps each hyperparameter to the list of values to try. */
export type SearchSpace = Record<string, ParamValue[]>;

// ---------------------------------------------------------------------------
// EvalMetrics
// ---------------------------------------------------------------------------

export const EvalMetricsSchema = z.object({
  accuracy: z.number().optional(),
  f1: z.number().optional(),
  precision: z.number().optional(),
  recall: z.number().optional(),
  silhouetteScore: z.number().optional(),
  inertia: z.number().optional(),
  rmse: z.number().optional(),
  mae: z.number().optional(),
  cvMeanAccuracy: z.number().optional(),
  cvStdAccuracy: z.number().optional(),
  cvFoldAccuracies: z.array(z.number()).optional(),
  trainingTimeMs: z.number().optional(),
});

/** Metrics from a single model evaluation. */
export type EvalMetrics = z.infer<typeof EvalMetricsSchema>;

// ---------------------------------------------------------------------------
// RankedResult
// ---------------------------------------------------------------------------

export const RankedResultSchema = z.object({
  rank: z.number(),
  params: z.record(z.string(), z.union([z.number(), z.string(), z.boolean(), z.array(z.number())])),
  metrics: EvalMetricsSchema,
});

/** One ranked result from GridSearch. */
export type RankedResult = z.infer<typeof RankedResultSchema>;

// ---------------------------------------------------------------------------
// GridSearchOutput
// ---------------------------------------------------------------------------

export const GridSearchOutputSchema = z.object({
  bestParams: z.record(z.string(), z.union([z.number(), z.string(), z.boolean(), z.array(z.number())])),
  bestMetrics: EvalMetricsSchema,
  allResults: z.array(RankedResultSchema),
  evaluatedConfigs: z.number(),
  totalConfigs: z.number(),
});

/** Full output from GridSearch.search(). */
export type GridSearchOutput = z.infer<typeof GridSearchOutputSchema>;

/**
 * Class-based GridSearch that wraps the functional gridSearch() with a richer
 * output shape (metrics per task, ranking, CV stats).
 */
export class GridSearch {
  constructor(
    private task: 'classify' | 'cluster' | 'regress',
    private data: FeatureMatrix,
    private searchSpace: SearchSpace,
    private cvFolds: number = 3,
  ) {}

  async search(): Promise<GridSearchOutput> {
    const combinations = expandGrid(this.searchSpace);
    const results: RankedResult[] = [];
    const n = this.data.data.length;
    const actualFolds = Math.min(this.cvFolds, Math.floor(n / 2));

    for (const params of combinations) {
      const t0 = Date.now();
      const metrics = await evaluateModel(params, this.data, this.task, this.data.labels ?? [], actualFolds);
      metrics.trainingTimeMs = Date.now() - t0;
      results.push({ rank: 0, params, metrics });
    }

    // Sort by primary metric
    const primaryKey = this.task === 'classify' ? 'accuracy' :
                       this.task === 'cluster'  ? 'silhouetteScore' : 'accuracy';
    results.sort((a, b) => (b.metrics[primaryKey] ?? -Infinity) - (a.metrics[primaryKey] ?? -Infinity));
    results.forEach((r, i) => { r.rank = i + 1; });

    return {
      bestParams: results[0]?.params ?? {},
      bestMetrics: results[0]?.metrics ?? {},
      allResults: results,
      evaluatedConfigs: results.length,
      totalConfigs: combinations.length,
    };
  }
}

/**
 * Evaluate a single parameter configuration with CV.
 */
export async function evaluateModel(
  params: Record<string, ParamValue>,
  data: FeatureMatrix,
  task: 'classify' | 'cluster' | 'regress',
  labels: string[],
  cvFolds: number = 3,
): Promise<EvalMetrics> {
  const n = data.data.length;
  const actualFolds = Math.min(cvFolds, Math.floor(n / 2));
  if (actualFolds < 2) {
    // Not enough data — run single evaluation
    return _evaluateSingle(params, data, task, labels);
  }

  const { testIndices } = stratifiedKFold(
    labels.length > 0 ? labels.map((_, i) => i % 2) : Array(n).fill(0),
    actualFolds,
  );

  const foldAccuracies: number[] = [];
  for (let f = 0; f < actualFolds; f++) {
    const testIdx = testIndices[f];
    const testData: FeatureMatrix = {
      ...data,
      data: Array.from(testIdx).map((i) => data.data[i]),
      caseIds: Array.from(testIdx).map((i) => data.caseIds[i]),
      targets: data.targets ? Array.from(testIdx).map((i) => data.targets![i]) : [],
      labels: labels.length > 0 ? Array.from(testIdx).map((i) => labels[i]) : [],
    };
    const m = await _evaluateSingle(params, testData, task, testData.labels ?? []);
    foldAccuracies.push(m.accuracy ?? 0);
  }

  const mean = foldAccuracies.reduce((a, b) => a + b, 0) / foldAccuracies.length;
  const variance = foldAccuracies.reduce((a, v) => a + (v - mean) ** 2, 0) / foldAccuracies.length;

  // Also compute full-dataset metrics for cluster tasks
  const full = await _evaluateSingle(params, data, task, labels);
  return {
    ...full,
    accuracy: mean,
    cvMeanAccuracy: mean,
    cvStdAccuracy: Math.sqrt(variance),
    cvFoldAccuracies: foldAccuracies,
  };
}

async function _evaluateSingle(
  params: Record<string, ParamValue>,
  data: FeatureMatrix,
  task: 'classify' | 'cluster' | 'regress',
  labels: string[],
): Promise<EvalMetrics> {
  if (task === 'classify') {
    if (data.data.length === 0) return { accuracy: 0 };
    // classifyTraces expects Record<string,unknown>[] — build synthetic feature objects
    const rows: Record<string, unknown>[] = data.data.map((row, i) => {
      const obj: Record<string, unknown> = { case_id: data.caseIds[i] ?? `c${i}`, outcome: labels[i] ?? '' };
      (data.featureNames ?? []).forEach((name, fi) => { obj[name] = row[fi]; });
      return obj;
    });
    const result = await classifyTraces(rows, {
      method: ((params.method as string) ?? 'knn') as import('./types.js').ClassificationMethod,
      k: typeof params.k === 'number' ? params.k : 3,
    });
    const preds = result.predictions ?? [];
    // predictions are {caseId, predicted, confidence} objects
    const predLabels = preds.map((p) => (p as { caseId: string; predicted: string }).predicted);
    const correct = predLabels.filter((p, i) => p === labels[i]).length;
    const accuracy = labels.length > 0 ? correct / labels.length : 0;
    const tp = predLabels.filter((p, i) => p === '1' && labels[i] === '1').length;
    const fp = predLabels.filter((p, i) => p === '1' && labels[i] !== '1').length;
    const fn = predLabels.filter((p, i) => p !== '1' && labels[i] === '1').length;
    const prec = tp + fp > 0 ? tp / (tp + fp) : 0;
    const rec = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1 = prec + rec > 0 ? 2 * prec * rec / (prec + rec) : 0;
    return { accuracy, precision: prec, recall: rec, f1 };
  }

  if (task === 'cluster') {
    if (data.data.length === 0) return { silhouetteScore: 0, inertia: 0 };
    const k = typeof params.k === 'number' ? params.k : 2;
    // clusterTraces expects Record<string,unknown>[] — build synthetic objects
    const rows: Record<string, unknown>[] = data.data.map((row, i) => {
      const obj: Record<string, unknown> = { case_id: data.caseIds[i] ?? `c${i}` };
      (data.featureNames ?? []).forEach((name, fi) => { obj[name] = row[fi]; });
      return obj;
    });
    const result = await clusterTraces(rows, { method: ((params.method as string) ?? 'kmeans') as import('./types.js').ClusteringMethod, k });
    const silhouette = typeof result.modelInfo?.silhouetteScore === 'number' ? result.modelInfo.silhouetteScore : 0;
    const inertia = typeof result.modelInfo?.inertia === 'number' ? result.modelInfo.inertia : 0;
    return { silhouetteScore: silhouette, inertia, accuracy: Math.max(0, silhouette) };
  }

  if (task === 'regress') {
    if (data.data.length < 2) return { accuracy: 0 };
    // regressTraces expects Record<string,unknown>[] — build synthetic objects
    const rows: Record<string, unknown>[] = data.data.map((row, i) => {
      const obj: Record<string, unknown> = {
        case_id: data.caseIds[i] ?? `c${i}`,
        remaining_time: data.targets![i] ?? 0,
      };
      (data.featureNames ?? []).forEach((name, fi) => {
        obj[name] = row[fi];
      });
      return obj;
    });
    const result = await regressRemainingTime(rows, {
      method: ((params.method as string) ?? 'linear_regression') as import('./types.js').RegressionMethod,
      degree: typeof params.degree === 'number' ? params.degree : 2,
    });
    return {
      accuracy: result.rSquared,
      rmse: result.rmse,
      mae: result.mae,
    };
  }

  return { accuracy: 0 };
}

/**
 * Suggest a default search space for the given task, sample count, and feature count.
 */
export function suggestSearchSpace(
  task: 'classify' | 'cluster' | 'regress',
  nSamples: number,
  nFeatures: number,
): SearchSpace {
  if (task === 'classify') {
    const maxK = Math.min(15, Math.max(3, Math.floor(Math.sqrt(nSamples))));
    const kValues = [3, 5, 7, 9].filter((k) => k <= maxK);
    if (!kValues.includes(maxK)) kValues.push(maxK);
    return { method: ['knn'], k: kValues };
  }

  if (task === 'cluster') {
    const maxK = Math.min(10, Math.max(2, Math.floor(Math.sqrt(nSamples / 2))));
    const kValues: number[] = [];
    for (let k = 2; k <= maxK; k++) kValues.push(k);
    const epsValues = nFeatures > 5 ? [0.5, 1.0, 2.0] : [0.3, 0.7, 1.5];
    return { method: ['kmeans', 'dbscan'], k: kValues, eps: epsValues };
  }

  // regress
  return { method: ['linear'], degree: [1, 2, 3] };
}

/**
 * Convenience wrapper: run GridSearch and return just the best parameters + metrics.
 */
export async function findBestParams(
  task: 'classify' | 'cluster' | 'regress',
  data: FeatureMatrix,
  _labels: string[],
  searchSpace: SearchSpace,
  cvFolds: number = 3,
): Promise<GridSearchOutput> {
  const gs = new GridSearch(task, data, searchSpace, cvFolds);
  return gs.search();
}

/**
 * Parameter value for grid search (can be number, string, boolean, or array).
 */
export type ParamValue = number | string | boolean | number[];

/**
 * Grid search parameter space: maps parameter name to list of values.
 */
export type ParamGrid = Record<string, ParamValue[]>;

// ---------------------------------------------------------------------------
// GridSearchResult
// ---------------------------------------------------------------------------

export const GridSearchResultSchema = z.object({
  /** Parameter combination tested */
  params: z.record(z.string(), z.union([z.number(), z.string(), z.boolean(), z.array(z.number())])),
  /** Mean score across CV folds */
  meanScore: z.number(),
  /** Standard deviation of scores */
  stdDev: z.number(),
  /** Confidence interval lower bound (95% CI via t-distribution) */
  ciLower: z.number(),
  /** Confidence interval upper bound */
  ciUpper: z.number(),
  /** Per-fold scores */
  scores: z.array(z.number()),
});

/**
 * Single parameter combination result.
 */
export type GridSearchResult = z.infer<typeof GridSearchResultSchema>;

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
function tQuantile(df: number, _alpha: number = 0.05): number {
  // Approximation: t(df, 0.025) ≈ polynomial fit for 95% CI
  // For df >= 1, use Abramowitz & Stegun approximation
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
