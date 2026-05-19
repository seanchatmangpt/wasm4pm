/**
 * Parameter suggestion engine for ML algorithms.
 *
 * Analyzes log characteristics and recommends:
 * - Classification method (knn, logistic_regression, decision_tree, naive_bayes)
 * - Regression method (linear, polynomial, exponential)
 * - Algorithm parameters (k, maxDepth, clusterCount)
 */

import type { FeatureMatrix } from './types.js';
import type {
  ClassificationMethod,
  RegressionMethod,
  ClusteringMethod,
} from './types.js';

export interface AlgorithmSuggestion {
  name: ClassificationMethod | RegressionMethod | ClusteringMethod;
  confidence: number; // 0-1
  reason: string;
  suggestedParameters: Record<string, number | string>;
}

export interface ParameterSuggestions {
  classification: AlgorithmSuggestion[];
  regression: AlgorithmSuggestion[];
  clustering: AlgorithmSuggestion[];
}

function analyzeDataCharacteristics(features: FeatureMatrix): {
  sampleCount: number;
  featureCount: number;
  hasHighDimensionality: boolean;
  isSmallDataset: boolean;
  isLargeDataset: boolean;
} {
  const sampleCount = features.data.length;
  const featureCount = features.featureNames.length;

  return {
    sampleCount,
    featureCount,
    hasHighDimensionality: featureCount > 50,
    isSmallDataset: sampleCount < 100,
    isLargeDataset: sampleCount > 10000,
  };
}

export function suggestParameters(
  features: FeatureMatrix,
): ParameterSuggestions {
  const chars = analyzeDataCharacteristics(features);
  const { sampleCount, featureCount } = chars;

  const classification: AlgorithmSuggestion[] = [];
  const regression: AlgorithmSuggestion[] = [];
  const clustering: AlgorithmSuggestion[] = [];

  // ──────────────────────────────────────────────────────────────────
  // Classification suggestions
  // ──────────────────────────────────────────────────────────────────

  // Decision tree: good for categorical, small datasets
  if (chars.isSmallDataset) {
    classification.push({
      name: 'decision_tree',
      confidence: 0.85,
      reason: 'Small dataset; decision tree avoids overfitting risk',
      suggestedParameters: {
        maxDepth: Math.max(3, Math.min(8, Math.ceil(Math.log2(sampleCount)))),
      },
    });
  } else {
    // Larger dataset: decision tree still good, higher depth
    classification.push({
      name: 'decision_tree',
      confidence: 0.8,
      reason: 'Balanced interpretability and accuracy',
      suggestedParameters: {
        maxDepth: Math.min(15, Math.ceil(Math.log2(sampleCount))),
      },
    });
  }

  // k-NN: good with medium features, smaller datasets
  if (!chars.hasHighDimensionality && sampleCount < 5000) {
    const kSuggested = Math.max(3, Math.min(15, Math.ceil(Math.sqrt(sampleCount))));
    classification.push({
      name: 'knn',
      confidence: 0.8,
      reason: 'Good for non-linearly separable data',
      suggestedParameters: { k: kSuggested },
    });
  }

  // Logistic regression: good baseline
  classification.push({
    name: 'logistic_regression',
    confidence: 0.75,
    reason: 'Fast, interpretable baseline',
    suggestedParameters: { learningRate: 0.01, iterations: 100 },
  });

  // Naive Bayes: good for high-dimensional data
  if (chars.hasHighDimensionality) {
    classification.push({
      name: 'naive_bayes',
      confidence: 0.8,
      reason: 'Efficient with many features',
      suggestedParameters: { smoothing: 1.0 },
    });
  }

  // Gradient Boosting: good all-purpose ensemble (for larger datasets)
  if (!chars.isSmallDataset) {
    classification.push({
      name: 'gradient_boosting',
      confidence: 0.82,
      reason: 'Ensemble method effective on complex patterns',
      suggestedParameters: { numIterations: 100, learningRate: 0.1 },
    });
  } else {
    // Even for small datasets, GB can work with careful tuning
    classification.push({
      name: 'gradient_boosting',
      confidence: 0.75,
      reason: 'Ensemble method with careful regularization',
      suggestedParameters: { numIterations: 50, learningRate: 0.05 },
    });
  }

  // ──────────────────────────────────────────────────────────────────
  // Regression suggestions
  // ──────────────────────────────────────────────────────────────────

  // Linear regression: always a baseline
  regression.push({
    name: 'linear_regression',
    confidence: 0.8,
    reason: 'Interpretable baseline for linear relationships',
    suggestedParameters: { learningRate: 0.01 },
  });

  // Polynomial regression: for non-linear patterns
  if (!chars.isSmallDataset) {
    regression.push({
      name: 'polynomial_regression',
      confidence: 0.75,
      reason: 'Captures non-linear trends (duration, throughput)',
      suggestedParameters: { degree: 2, learningRate: 0.01 },
    });
  }

  // Exponential regression: for growth/decay patterns
  regression.push({
    name: 'exponential_regression',
    confidence: 0.7,
    reason: 'Good for process growth or throughput acceleration',
    suggestedParameters: { learningRate: 0.001 },
  });

  // ──────────────────────────────────────────────────────────────────
  // Clustering suggestions
  // ──────────────────────────────────────────────────────────────────

  // K-Means: default clustering
  const kMeansK = Math.max(2, Math.min(10, Math.ceil(Math.sqrt(sampleCount / 10))));
  clustering.push({
    name: 'kmeans',
    confidence: 0.85,
    reason: 'General-purpose clustering for trace variants',
    suggestedParameters: { clusters: kMeansK, iterations: 10 },
  });

  // DBSCAN: for density-based clustering
  if (!chars.isSmallDataset) {
    clustering.push({
      name: 'dbscan',
      confidence: 0.7,
      reason: 'Detects natural clusters and outlier traces',
      suggestedParameters: { eps: 0.5, minPts: Math.max(3, Math.floor(featureCount / 2)) },
    });
  }

  return {
    classification: classification.sort((a, b) => b.confidence - a.confidence),
    regression: regression.sort((a, b) => b.confidence - a.confidence),
    clustering: clustering.sort((a, b) => b.confidence - a.confidence),
  };
}

/**
 * Pick the best algorithm from suggestions based on task and data size.
 */
export function pickBestAlgorithm(
  task: 'classification' | 'regression' | 'clustering',
  features: FeatureMatrix,
): ClassificationMethod | RegressionMethod | ClusteringMethod {
  const suggestions = suggestParameters(features);
  const candidates =
    task === 'classification'
      ? suggestions.classification
      : task === 'regression'
        ? suggestions.regression
        : suggestions.clustering;

  return candidates.length > 0 ? (candidates[0].name as never) : ('knn' as never);
}
