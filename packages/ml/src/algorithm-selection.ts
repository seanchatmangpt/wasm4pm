/**
 * Algorithm Selection via Data Characteristics
 *
 * Heuristic-based algorithm selection (Rank-2 Oracle) based on feature matrix
 * and label characteristics.
 *
 * Tier 3 AUTOML Gap-14: Decision logic for:
 * - classify: knn if n_features < 10 AND n_samples < 1K, else random_forest
 * - cluster: pca_then_kmeans if n_features > 20, else kmeans
 * - forecast: exponential_smoothing if trend_strength > 0.7, else arima
 * - regress: ridge if multicollinearity > 0.9, else lasso
 * - pca: reduce to min(n_samples/3, n_features)
 *
 * Returns recommendation with confidence [0-1] and rationale.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// AlgorithmRecommendation
// ---------------------------------------------------------------------------

export const AlgorithmRecommendationSchema = z.object({
  /** Selected algorithm */
  algorithm: z.string(),
  /** Confidence in this choice [0-1] */
  confidence: z.number(),
  /** Why this algorithm was selected */
  rationale: z.string(),
  /** Alternative algorithms (if applicable) */
  alternatives: z.array(z.string()).optional(),
});

/**
 * Algorithm recommendation result.
 */
export type AlgorithmRecommendation = z.infer<typeof AlgorithmRecommendationSchema>;

// ---------------------------------------------------------------------------
// FeatureMatrixCharacteristics
// ---------------------------------------------------------------------------

export const FeatureMatrixCharacteristicsSchema = z.object({
  /** Number of samples (rows) */
  n_samples: z.number(),
  /** Number of features (columns) */
  n_features: z.number(),
  /** Correlation matrix (upper triangle as 1D array) */
  correlations: z.array(z.number()).optional(),
  /** Trend strength [0-1] for time series */
  trend_strength: z.number().optional(),
  /** Max absolute correlation (multicollinearity indicator) */
  max_abs_correlation: z.number().optional(),
  /** Variance explained by first component (PCA) */
  pca_variance_explained: z.number().optional(),
  /** Sparsity (fraction of zero values) */
  sparsity: z.number().optional(),
});

/**
 * Feature matrix characteristics for algorithm selection.
 */
export type FeatureMatrixCharacteristics = z.infer<typeof FeatureMatrixCharacteristicsSchema>;

/**
 * Compute multicollinearity metric (max absolute correlation between features).
 *
 * @param data - Feature matrix (n_samples x n_features)
 * @returns Max absolute correlation (excluding diagonal)
 */
export function computeMulticollinearity(data: number[][]): number {
  if (data.length === 0 || data[0].length === 0) return 0;

  const n_features = data[0].length;
  const n_samples = data.length;

  // Compute correlation matrix
  const means = new Array(n_features).fill(0);
  const stds = new Array(n_features).fill(0);

  // Compute means and stds
  for (let j = 0; j < n_features; j++) {
    let sum = 0;
    for (let i = 0; i < n_samples; i++) {
      sum += data[i][j];
    }
    means[j] = sum / n_samples;
  }

  for (let j = 0; j < n_features; j++) {
    let sumSq = 0;
    for (let i = 0; i < n_samples; i++) {
      const d = data[i][j] - means[j];
      sumSq += d * d;
    }
    stds[j] = Math.sqrt(sumSq / n_samples);
  }

  // Compute max absolute correlation
  let maxCorr = 0;
  for (let j1 = 0; j1 < n_features; j1++) {
    for (let j2 = j1 + 1; j2 < n_features; j2++) {
      if (stds[j1] === 0 || stds[j2] === 0) continue;

      let cov = 0;
      for (let i = 0; i < n_samples; i++) {
        cov +=
          ((data[i][j1] - means[j1]) / stds[j1]) * ((data[i][j2] - means[j2]) / stds[j2]);
      }
      cov /= n_samples;
      maxCorr = Math.max(maxCorr, Math.abs(cov));
    }
  }

  return maxCorr;
}

/**
 * Select algorithm for classification task.
 *
 * Heuristic:
 * - n_features < 10 AND n_samples < 1K: k-NN (simple, fast)
 * - Otherwise: random_forest (robust, generalizes well)
 *
 * @param data - Feature matrix
 * @param labels - Class labels
 * @returns Algorithm recommendation
 */
export function selectClassificationAlgorithm(
  data: number[][],
  _labels: number[]
): AlgorithmRecommendation {
  const n_samples = data.length;
  const n_features = data[0]?.length ?? 0;

  if (n_features < 10 && n_samples < 1000) {
    return {
      algorithm: 'knn',
      confidence: 0.8,
      rationale: `Few features (${n_features}) and small dataset (${n_samples}); k-NN is fast and effective.`,
      alternatives: ['random_forest', 'logistic_regression'],
    };
  } else {
    return {
      algorithm: 'random_forest',
      confidence: 0.75,
      rationale: `Dataset size (${n_samples}) and feature count (${n_features}) warrant ensemble method for robustness.`,
      alternatives: ['knn', 'gradient_boosting'],
    };
  }
}

/**
 * Select algorithm for clustering task.
 *
 * Heuristic:
 * - n_features > 20: PCA + k-means (dimensionality reduction first)
 * - Otherwise: k-means directly
 *
 * @param data - Feature matrix
 * @returns Algorithm recommendation
 */
export function selectClusteringAlgorithm(data: number[][]): AlgorithmRecommendation {
  const n_features = data[0]?.length ?? 0;

  if (n_features > 20) {
    return {
      algorithm: 'pca_then_kmeans',
      confidence: 0.85,
      rationale: `High dimensionality (${n_features} features); apply PCA first to reduce curse of dimensionality.`,
      alternatives: ['kmeans', 'dbscan'],
    };
  } else {
    return {
      algorithm: 'kmeans',
      confidence: 0.8,
      rationale: `Moderate dimensionality (${n_features} features); k-means is efficient and interpretable.`,
      alternatives: ['hierarchical_clustering', 'dbscan'],
    };
  }
}

/**
 * Select algorithm for forecasting task.
 *
 * Heuristic:
 * - trend_strength > 0.7: exponential_smoothing (captures trends well)
 * - Otherwise: arima (more flexible for stationary/non-stationary)
 *
 * @param trend_strength - Trend component strength [0-1]
 * @returns Algorithm recommendation
 */
export function selectForecastingAlgorithm(trend_strength: number = 0.5): AlgorithmRecommendation {
  if (trend_strength > 0.7) {
    return {
      algorithm: 'exponential_smoothing',
      confidence: 0.82,
      rationale: `Strong trend detected (strength=${trend_strength.toFixed(2)}); exponential smoothing is ideal.`,
      alternatives: ['arima', 'prophet'],
    };
  } else {
    return {
      algorithm: 'arima',
      confidence: 0.75,
      rationale: `Weak/no trend (strength=${trend_strength.toFixed(2)}); ARIMA handles mixed stationary/non-stationary.`,
      alternatives: ['exponential_smoothing', 'state_space'],
    };
  }
}

/**
 * Select algorithm for regression task.
 *
 * Heuristic:
 * - multicollinearity > 0.9: ridge (handles correlated features)
 * - Otherwise: lasso (feature selection + regularization)
 *
 * @param data - Feature matrix
 * @returns Algorithm recommendation
 */
export function selectRegressionAlgorithm(data: number[][]): AlgorithmRecommendation {
  const multicollinearity = computeMulticollinearity(data);

  if (multicollinearity > 0.9) {
    return {
      algorithm: 'ridge',
      confidence: 0.85,
      rationale: `High multicollinearity detected (r=${multicollinearity.toFixed(2)}); ridge regression handles correlated features.`,
      alternatives: ['elastic_net', 'lasso'],
    };
  } else {
    return {
      algorithm: 'lasso',
      confidence: 0.8,
      rationale: `Low multicollinearity (r=${multicollinearity.toFixed(2)}); lasso provides feature selection via sparsity.`,
      alternatives: ['ridge', 'elastic_net'],
    };
  }
}

/**
 * Select target dimensionality for PCA.
 *
 * Heuristic: reduce to min(n_samples/3, n_features), preserving at least 2 dimensions.
 *
 * @param data - Feature matrix
 * @returns Target number of components
 */
export function selectPcaDimensionality(data: number[][]): { n_components: number; rationale: string } {
  const n_samples = data.length;
  const n_features = data[0]?.length ?? 1;

  const n_components = Math.max(2, Math.min(Math.floor(n_samples / 3), n_features));

  return {
    n_components,
    rationale: `Reduce from ${n_features} to ${n_components} components (min of n_samples/3=${Math.floor(n_samples / 3)} and n_features=${n_features}).`,
  };
}

/**
 * Master algorithm selection function.
 *
 * Routes to task-specific selector.
 *
 * @param task - ML task ('classify', 'cluster', 'forecast', 'regress', 'pca')
 * @param data - Feature matrix or characteristics
 * @param labels - Labels (for classification)
 * @param trend_strength - Trend strength (for forecasting)
 * @returns Algorithm recommendation
 */
export function selectAlgorithm(
  task: 'classify' | 'cluster' | 'forecast' | 'regress' | 'pca',
  data: number[][] | FeatureMatrixCharacteristics,
  labels?: number[],
  trend_strength?: number
): AlgorithmRecommendation {
  // Handle characteristics object
  if ('n_samples' in data) {
    const chars = data as FeatureMatrixCharacteristics;
    switch (task) {
      case 'classify':
        return selectClassificationAlgorithm(
          Array(chars.n_samples)
            .fill(null)
            .map(() => Array(chars.n_features).fill(0)),
          labels ?? []
        );
      case 'cluster':
        return selectClusteringAlgorithm(
          Array(chars.n_samples)
            .fill(null)
            .map(() => Array(chars.n_features).fill(0))
        );
      case 'forecast':
        return selectForecastingAlgorithm(chars.trend_strength ?? 0.5);
      case 'regress':
        return selectRegressionAlgorithm(
          Array(chars.n_samples)
            .fill(null)
            .map(() => Array(chars.n_features).fill(0))
        );
      case 'pca':
        const { n_components, rationale } = selectPcaDimensionality(
          Array(chars.n_samples)
            .fill(null)
            .map(() => Array(chars.n_features).fill(0))
        );
        return {
          algorithm: `pca_n${n_components}`,
          confidence: 0.9,
          rationale,
        };
    }
  }

  // Handle matrix data
  const matrix = data as number[][];
  switch (task) {
    case 'classify':
      return selectClassificationAlgorithm(matrix, labels ?? []);
    case 'cluster':
      return selectClusteringAlgorithm(matrix);
    case 'forecast':
      return selectForecastingAlgorithm(trend_strength);
    case 'regress':
      return selectRegressionAlgorithm(matrix);
    case 'pca':
      const { n_components, rationale } = selectPcaDimensionality(matrix);
      return {
        algorithm: `pca_n${n_components}`,
        confidence: 0.9,
        rationale,
      };
  }
}
