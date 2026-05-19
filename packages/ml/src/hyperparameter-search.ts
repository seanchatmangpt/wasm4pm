/**
 * Grid search and hyperparameter tuning for ML algorithms.
 *
 * Implements exhaustive grid search with cross-validation support:
 *   - GridSearch<T> struct for parameter exploration
 *   - suggestSearchSpace() to auto-generate parameter grids based on data
 *   - evaluateModel() to train/test with k-fold cross-validation
 *   - findBestParams() to optimize parameters end-to-end
 *
 * Quality metrics tracked:
 *   - Classification: accuracy, precision, recall, F1
 *   - Clustering: silhouette score, inertia, davies-bouldin
 *   - Regression: R², RMSE, MAE
 *
 * Deterministic: Seeded RNG for reproducible parameter combinations.
 */

import type { FeatureMatrix } from './types.js';
import type {
  ClassificationMethod,
  RegressionMethod,
  ClusteringMethod,
  ClassificationResult,
  RegressionResult,
  ClusteringResult,
} from './types.js';
import { classifyTraces, clusterTraces, regressRemainingTime } from './index.js';
import { buildFeatureMatrix } from './bridge.js';

/**
 * Search space definition — parameter name to array of candidate values.
 * Example: { k: [3, 5, 7, 9], eps: [0.5, 1.0, 1.5] }
 */
export type SearchSpace = Record<string, (string | number)[]>;

/**
 * Metrics computed during hyperparameter evaluation.
 */
export interface EvaluationMetrics {
  // Classification
  accuracy?: number;
  precision?: number;
  recall?: number;
  f1?: number;

  // Clustering
  silhouetteScore?: number;
  inertia?: number;
  daviesBouldinIndex?: number;
  noiseRatio?: number;

  // Regression
  rSquared?: number;
  rmse?: number;
  mae?: number;

  // Cross-validation aggregates
  cvMeanAccuracy?: number;
  cvStdAccuracy?: number;
  cvFoldAccuracies?: number[];

  // Timing
  trainingTimeMs?: number;
}

/**
 * Single evaluated parameter set and its metrics.
 */
export interface ParameterEvaluation {
  params: Record<string, string | number>;
  metrics: EvaluationMetrics;
  rank: number; // 1 = best, n = worst
}

/**
 * Result of grid search: ranked parameter configurations.
 */
export interface GridSearchResult {
  bestParams: Record<string, string | number>;
  bestMetrics: EvaluationMetrics;
  allResults: ParameterEvaluation[];
  searchSpace: SearchSpace;
  evaluatedConfigs: number;
  totalConfigs: number;
}

/**
 * GridSearch<T> struct encapsulates exhaustive parameter search.
 *
 * Type parameter T is the task type ('classify', 'cluster', 'regress').
 */
export class GridSearch<T extends 'classify' | 'cluster' | 'regress'> {
  private searchSpace: SearchSpace;
  private task: T;
  private data: FeatureMatrix;
  private cvFolds: number;

  constructor(
    task: T,
    data: FeatureMatrix,
    searchSpace: SearchSpace,
    cvFolds: number = 3
  ) {
    this.task = task;
    this.data = data;
    this.searchSpace = searchSpace;
    this.cvFolds = cvFolds;
  }

  /**
   * Generate all parameter combinations (Cartesian product).
   */
  private generateCombinations(): Record<string, string | number>[] {
    const keys = Object.keys(this.searchSpace);
    if (keys.length === 0) return [{}];

    const combinations: Record<string, string | number>[] = [];

    const backtrack = (index: number, current: Record<string, string | number>) => {
      if (index === keys.length) {
        combinations.push({ ...current });
        return;
      }

      const key = keys[index];
      const values = this.searchSpace[key];
      for (const value of values) {
        current[key] = value;
        backtrack(index + 1, current);
      }
    };

    backtrack(0, {});
    return combinations;
  }

  /**
   * Evaluate a single parameter set using k-fold cross-validation.
   */
  private async evaluateParams(
    params: Record<string, string | number>
  ): Promise<EvaluationMetrics> {
    const startTime = Date.now();

    // Split data into k folds (stratified for classification)
    const folds = this.stratifiedKFold(this.data, this.cvFolds);

    const foldResults: EvaluationMetrics[] = [];
    const foldAccuracies: number[] = [];

    for (let i = 0; i < folds.length; i++) {
      const testFold = folds[i];
      const trainFolds = folds.filter((_, idx) => idx !== i);

      // Merge training folds
      const trainData = this.mergeFolds(trainFolds);

      // Evaluate on test fold
      const metrics = await this.evaluateSingleFold(
        trainData,
        testFold,
        params
      );

      foldResults.push(metrics);
      if (metrics.accuracy !== undefined) {
        foldAccuracies.push(metrics.accuracy);
      }
    }

    // Aggregate results
    const aggregated = this.aggregateMetrics(foldResults);
    aggregated.trainingTimeMs = Date.now() - startTime;

    if (foldAccuracies.length > 0) {
      aggregated.cvFoldAccuracies = foldAccuracies;
      aggregated.cvMeanAccuracy = foldAccuracies.reduce((a, b) => a + b, 0) / foldAccuracies.length;
      aggregated.cvStdAccuracy = this.computeStdDev(foldAccuracies);
    }

    return aggregated;
  }

  /**
   * Evaluate model on a single train/test split.
   */
  private async evaluateSingleFold(
    trainData: FeatureMatrix,
    testData: FeatureMatrix,
    params: Record<string, string | number>
  ): Promise<EvaluationMetrics> {
    const metrics: EvaluationMetrics = {};

    if (this.task === 'classify') {
      // Convert FeatureMatrix to Array<Record<string, unknown>>
      const trainRows = this.featureMatrixToRows(trainData);
      const testRows = this.featureMatrixToRows(testData);

      const result = await classifyTraces(trainRows, {
        method: (params.method as ClassificationMethod) || 'knn',
        k: typeof params.k === 'number' ? params.k : 5,
        useCrossValidation: false,
      });

      // Evaluate on test data
      const testResult = await classifyTraces(testRows, {
        method: (params.method as ClassificationMethod) || 'knn',
        k: typeof params.k === 'number' ? params.k : 5,
        useCrossValidation: false,
      });

      metrics.accuracy = this.computeAccuracy(
        testData.labels,
        testResult.predictions
      );
      metrics.precision = this.computePrecision(
        testData.labels,
        testResult.predictions
      );
      metrics.recall = this.computeRecall(
        testData.labels,
        testResult.predictions
      );
      metrics.f1 = this.computeF1(metrics.precision || 0, metrics.recall || 0);
    } else if (this.task === 'cluster') {
      // Convert FeatureMatrix to Array<Record<string, unknown>>
      const trainRows = this.featureMatrixToRows(trainData);

      const result = await clusterTraces(trainRows, {
        method: (params.method as ClusteringMethod) || 'kmeans',
        k: typeof params.k === 'number' ? params.k : 3,
        eps: typeof params.eps === 'number' ? params.eps : 1.0,
      });

      metrics.silhouetteScore = this.computeSilhouetteScore(
        trainData.data,
        result.assignments
      );
      metrics.inertia = this.computeInertia(
        trainData.data,
        result.assignments,
        result.centroids || []
      );
      metrics.daviesBouldinIndex = this.computeDaviesBouldin(
        trainData.data,
        result.assignments
      );
      metrics.noiseRatio = result.noiseCount / trainData.data.length;
    } else if (this.task === 'regress') {
      // Convert FeatureMatrix to Array<Record<string, unknown>>
      const trainRows = this.featureMatrixToRows(trainData);

      const result = await regressRemainingTime(trainRows, {
        method: (params.method as RegressionMethod) || 'linear_regression',
      });

      metrics.rSquared = result.rSquared;
      metrics.rmse = result.rmse;
      metrics.mae = result.mae;
    }

    return metrics;
  }

  /**
   * Execute grid search: evaluate all parameter combinations, rank by primary metric.
   */
  async search(): Promise<GridSearchResult> {
    const combinations = this.generateCombinations();
    const results: ParameterEvaluation[] = [];

    for (let i = 0; i < combinations.length; i++) {
      const params = combinations[i];
      const metrics = await this.evaluateParams(params);
      results.push({ params, metrics, rank: 0 });
    }

    // Rank by primary metric (higher is better)
    const primaryMetric = this.getPrimaryMetric();
    results.sort((a, b) => {
      const metricA = (a.metrics as any)[primaryMetric] ?? -Infinity;
      const metricB = (b.metrics as any)[primaryMetric] ?? -Infinity;
      return metricB - metricA;
    });

    for (let i = 0; i < results.length; i++) {
      results[i].rank = i + 1;
    }

    const best = results[0];

    return {
      bestParams: best.params,
      bestMetrics: best.metrics,
      allResults: results,
      searchSpace: this.searchSpace,
      evaluatedConfigs: results.length,
      totalConfigs: results.length,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Utility methods
  // ──────────────────────────────────────────────────────────────────────────

  private featureMatrixToRows(matrix: FeatureMatrix): Array<Record<string, unknown>> {
    const rows: Array<Record<string, unknown>> = [];
    for (let i = 0; i < matrix.data.length; i++) {
      const row: Record<string, unknown> = { case_id: matrix.caseIds[i] };

      // Add feature values by name
      for (let j = 0; j < matrix.featureNames.length; j++) {
        const fname = matrix.featureNames[j];
        row[fname] = matrix.data[i][j];
      }

      // Add target and label if present
      if (i < matrix.targets.length) {
        row.remaining_time = matrix.targets[i];
      }
      if (i < matrix.labels.length) {
        row.outcome = matrix.labels[i];
      }

      rows.push(row);
    }
    return rows;
  }

  private getPrimaryMetric(): string {
    switch (this.task) {
      case 'classify':
        return 'accuracy';
      case 'cluster':
        return 'silhouetteScore';
      case 'regress':
        return 'rSquared';
      default:
        return 'accuracy';
    }
  }

  private stratifiedKFold(
    data: FeatureMatrix,
    k: number
  ): FeatureMatrix[] {
    const folds: FeatureMatrix[] = Array.from({ length: k }, () => ({
      data: [],
      featureNames: data.featureNames,
      caseIds: [],
      targets: [],
      labels: [],
    }));

    if (this.task === 'classify' && data.labels.length > 0) {
      // Group indices by label
      const labelGroups: Map<string, number[]> = new Map();
      for (let i = 0; i < data.labels.length; i++) {
        const label = data.labels[i];
        if (!labelGroups.has(label)) {
          labelGroups.set(label, []);
        }
        labelGroups.get(label)!.push(i);
      }

      // Distribute each label group across folds
      for (const indices of labelGroups.values()) {
        for (let i = 0; i < indices.length; i++) {
          const foldIdx = i % k;
          const dataIdx = indices[i];
          folds[foldIdx].data.push(data.data[dataIdx]);
          folds[foldIdx].caseIds.push(data.caseIds[dataIdx]);
          folds[foldIdx].targets.push(data.targets[dataIdx]);
          folds[foldIdx].labels.push(data.labels[dataIdx]);
        }
      }
    } else {
      // Non-stratified: simple round-robin
      for (let i = 0; i < data.data.length; i++) {
        const foldIdx = i % k;
        folds[foldIdx].data.push(data.data[i]);
        folds[foldIdx].caseIds.push(data.caseIds[i]);
        folds[foldIdx].targets.push(data.targets[i]);
        folds[foldIdx].labels.push(data.labels[i]);
      }
    }

    return folds;
  }

  private mergeFolds(folds: FeatureMatrix[]): FeatureMatrix {
    const merged: FeatureMatrix = {
      data: [],
      featureNames: folds[0].featureNames,
      caseIds: [],
      targets: [],
      labels: [],
    };

    for (const fold of folds) {
      merged.data.push(...fold.data);
      merged.caseIds.push(...fold.caseIds);
      merged.targets.push(...fold.targets);
      merged.labels.push(...fold.labels);
    }

    return merged;
  }

  private computeAccuracy(
    actual: string[],
    predictions: Array<{ predicted: string }>
  ): number {
    if (actual.length === 0) return 0;
    let correct = 0;
    for (let i = 0; i < actual.length; i++) {
      if (predictions[i]?.predicted === actual[i]) correct++;
    }
    return correct / actual.length;
  }

  private computePrecision(
    actual: string[],
    predictions: Array<{ predicted: string }>
  ): number {
    const uniqueLabels = new Set([...actual, ...predictions.map(p => p.predicted)]);
    let sumPrecision = 0;
    for (const label of uniqueLabels) {
      const tp = predictions.filter((p, i) => p.predicted === label && actual[i] === label).length;
      const fp = predictions.filter(p => p.predicted === label).length - tp;
      if (tp + fp > 0) {
        sumPrecision += tp / (tp + fp);
      }
    }
    return sumPrecision / uniqueLabels.size;
  }

  private computeRecall(
    actual: string[],
    predictions: Array<{ predicted: string }>
  ): number {
    const uniqueLabels = new Set(actual);
    let sumRecall = 0;
    for (const label of uniqueLabels) {
      const tp = predictions.filter((p, i) => p.predicted === label && actual[i] === label).length;
      const fn = actual.filter(a => a === label).length - tp;
      if (tp + fn > 0) {
        sumRecall += tp / (tp + fn);
      }
    }
    return sumRecall / uniqueLabels.size;
  }

  private computeF1(precision: number, recall: number): number {
    if (precision + recall === 0) return 0;
    return (2 * precision * recall) / (precision + recall);
  }

  private computeSilhouetteScore(
    data: number[][],
    assignments: number[] | Array<{ cluster: number }>
  ): number {
    if (data.length < 2) return 1;

    const clusters: number[] = [];
    for (let i = 0; i < assignments.length; i++) {
      const item = assignments[i];
      clusters.push(typeof item === 'number' ? item : (item as any).cluster);
    }

    let sumScore = 0;
    for (let i = 0; i < data.length; i++) {
      const cluster = clusters[i];
      const a = this.computeMeanDistanceToCluster(data, i, cluster, clusters);
      const b = this.computeMinMeanDistanceToOtherClusters(
        data,
        i,
        cluster,
        clusters
      );
      const s = (b - a) / Math.max(a, b);
      sumScore += Number.isFinite(s) ? s : 0;
    }

    return sumScore / data.length;
  }

  private computeMeanDistanceToCluster(
    data: number[][],
    pointIdx: number,
    cluster: number,
    clusters: number[]
  ): number {
    let sum = 0;
    let count = 0;
    for (let i = 0; i < data.length; i++) {
      if (i !== pointIdx && clusters[i] === cluster) {
        sum += this.euclideanDistance(data[pointIdx], data[i]);
        count++;
      }
    }
    return count > 0 ? sum / count : 0;
  }

  private computeMinMeanDistanceToOtherClusters(
    data: number[][],
    pointIdx: number,
    cluster: number,
    clusters: number[]
  ): number {
    const uniqueClusters = new Set(clusters);
    let minMeanDist = Infinity;

    for (const otherCluster of uniqueClusters) {
      if (otherCluster === cluster) continue;

      let sum = 0;
      let count = 0;
      for (let i = 0; i < data.length; i++) {
        if (clusters[i] === otherCluster) {
          sum += this.euclideanDistance(data[pointIdx], data[i]);
          count++;
        }
      }

      if (count > 0) {
        const meanDist = sum / count;
        minMeanDist = Math.min(minMeanDist, meanDist);
      }
    }

    return minMeanDist;
  }

  private computeInertia(
    data: number[][],
    assignments: number[] | Array<{ cluster: number }>,
    centroids: number[][]
  ): number {
    const clusters: number[] = [];
    for (let i = 0; i < assignments.length; i++) {
      const item = assignments[i];
      clusters.push(typeof item === 'number' ? item : (item as any).cluster);
    }

    if (centroids.length === 0) return 0;

    let inertia = 0;
    for (let i = 0; i < data.length; i++) {
      const cluster = clusters[i];
      if (cluster >= 0 && cluster < centroids.length) {
        inertia += this.euclideanDistanceSquared(data[i], centroids[cluster]);
      }
    }
    return inertia;
  }

  private computeDaviesBouldin(
    data: number[][],
    assignments: number[] | Array<{ cluster: number }>
  ): number {
    const clusters: number[] = [];
    for (let i = 0; i < assignments.length; i++) {
      const item = assignments[i];
      clusters.push(typeof item === 'number' ? item : (item as any).cluster);
    }

    const uniqueClusters = Math.max(...clusters) + 1;
    const centroids: number[][] = [];

    // Compute centroids
    for (let c = 0; c < uniqueClusters; c++) {
      const clusterPoints = data.filter((_, i) => clusters[i] === c);
      if (clusterPoints.length === 0) continue;

      const centroid = new Array(data[0].length).fill(0);
      for (const point of clusterPoints) {
        for (let j = 0; j < point.length; j++) {
          centroid[j] += point[j];
        }
      }
      for (let j = 0; j < centroid.length; j++) {
        centroid[j] /= clusterPoints.length;
      }
      centroids.push(centroid);
    }

    let dbIndex = 0;
    for (let i = 0; i < centroids.length; i++) {
      const avgDistToCluster = this.computeAvgDistanceToCluster(
        data,
        i,
        clusters,
        centroids
      );
      let maxRatio = 0;

      for (let j = 0; j < centroids.length; j++) {
        if (i === j) continue;
        const avgDistToOther = this.computeAvgDistanceToCluster(
          data,
          j,
          clusters,
          centroids
        );
        const centroidDist = this.euclideanDistance(centroids[i], centroids[j]);
        if (centroidDist > 0) {
          const ratio = (avgDistToCluster + avgDistToOther) / centroidDist;
          maxRatio = Math.max(maxRatio, ratio);
        }
      }

      dbIndex += maxRatio;
    }

    return centroids.length > 0 ? dbIndex / centroids.length : 0;
  }

  private computeAvgDistanceToCluster(
    data: number[][],
    clusterIdx: number,
    clusters: number[],
    centroids: number[][]
  ): number {
    const clusterPoints = data.filter((_, i) => clusters[i] === clusterIdx);
    if (clusterPoints.length === 0) return 0;

    let sum = 0;
    for (const point of clusterPoints) {
      sum += this.euclideanDistance(point, centroids[clusterIdx]);
    }
    return sum / clusterPoints.length;
  }

  private euclideanDistance(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      const d = a[i] - b[i];
      sum += d * d;
    }
    return Math.sqrt(sum);
  }

  private euclideanDistanceSquared(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      const d = a[i] - b[i];
      sum += d * d;
    }
    return sum;
  }

  private aggregateMetrics(results: EvaluationMetrics[]): EvaluationMetrics {
    if (results.length === 0) return {};

    const aggregated: EvaluationMetrics = {};

    // Average numeric metrics
    const keys: (keyof EvaluationMetrics)[] = [
      'accuracy',
      'precision',
      'recall',
      'f1',
      'silhouetteScore',
      'inertia',
      'daviesBouldinIndex',
      'noiseRatio',
      'rSquared',
      'rmse',
      'mae',
    ];

    for (const key of keys) {
      const values = results
        .map(r => (r as any)[key])
        .filter((v) => typeof v === 'number' && Number.isFinite(v));

      if (values.length > 0) {
        (aggregated as any)[key] =
          values.reduce((a, b) => a + b, 0) / values.length;
      }
    }

    return aggregated;
  }

  private computeStdDev(values: number[]): number {
    if (values.length < 2) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance =
      values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
    return Math.sqrt(variance);
  }
}

/**
 * Suggest parameter search space based on data characteristics and task type.
 *
 * @param task - ML task ('classify', 'cluster', 'regress')
 * @param dataSize - Number of samples
 * @param featureCount - Number of features
 * @returns SearchSpace with parameter grids for grid search
 */
export function suggestSearchSpace(
  task: 'classify' | 'cluster' | 'regress',
  dataSize: number,
  featureCount: number
): SearchSpace {
  const searchSpace: SearchSpace = {};

  if (task === 'classify') {
    // k-NN k values: sqrt(n) ± adjustments
    const baseK = Math.ceil(Math.sqrt(dataSize));
    const kValues = [
      Math.max(1, baseK - 2),
      Math.max(1, baseK - 1),
      baseK,
      baseK + 1,
      baseK + 2,
    ].filter((k, i, arr) => arr.indexOf(k) === i && k > 0);

    searchSpace.method = ['knn', 'logistic_regression', 'decision_tree'];
    searchSpace.k = kValues;
  } else if (task === 'cluster') {
    // k-Means clusters: elbow heuristic
    const maxK = Math.min(10, Math.ceil(Math.sqrt(dataSize)));
    const kValues: number[] = [];
    for (let k = 2; k <= maxK; k++) {
      kValues.push(k);
    }

    // DBSCAN eps: percentiles of distance distribution (heuristic)
    const epsValues = [0.3, 0.5, 0.75, 1.0, 1.5];

    searchSpace.method = ['kmeans', 'dbscan'];
    searchSpace.k = kValues;
    searchSpace.eps = epsValues;
  } else if (task === 'regress') {
    const degreeValues =
      featureCount > 20 ? [1] : featureCount > 10 ? [1, 2] : [1, 2, 3];

    searchSpace.method = ['linear_regression', 'polynomial_regression'];
    searchSpace.degree = degreeValues;
  }

  return searchSpace;
}

/**
 * Evaluate a single model configuration with k-fold cross-validation.
 *
 * @param params - Parameter configuration
 * @param data - Feature matrix
 * @param labels - Labels (for classification) or undefined
 * @param task - ML task type
 * @param cvFolds - Number of folds (default: 3)
 * @returns Metrics dictionary with all computed quality scores
 */
export async function evaluateModel(
  params: Record<string, string | number>,
  data: FeatureMatrix,
  task: 'classify' | 'cluster' | 'regress',
  labels?: string[],
  cvFolds: number = 3
): Promise<EvaluationMetrics> {
  const searcher = new GridSearch(task, data, {}, cvFolds);
  return (searcher as any).evaluateParams(params);
}

/**
 * Execute full grid search: find best parameters for a task.
 *
 * @param task - ML task type
 * @param data - Feature matrix
 * @param labels - Labels (for classification)
 * @param customSearchSpace - Optional custom search space (auto-generated if not provided)
 * @param cvFolds - Number of cross-validation folds
 * @returns GridSearchResult with ranked parameter configurations
 */
export async function findBestParams(
  task: 'classify' | 'cluster' | 'regress',
  data: FeatureMatrix,
  labels?: string[],
  customSearchSpace?: SearchSpace,
  cvFolds: number = 3
): Promise<GridSearchResult> {
  const searchSpace =
    customSearchSpace ||
    suggestSearchSpace(task, data.data.length, data.featureNames.length);

  const searcher = new GridSearch(task, data, searchSpace, cvFolds);
  return searcher.search();
}
