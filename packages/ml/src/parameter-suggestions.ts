/**
 * parameter-suggestions.ts
 *
 * Data-driven ML parameter suggestion helper.
 * Provides heuristics for common ML hyperparameters based on log characteristics.
 *
 * These functions implement domain knowledge from process mining literature
 * and empirical testing to suggest reasonable parameter values without requiring
 * users to understand the underlying ML algorithms.
 */

/**
 * Log characteristics detection result.
 * Identifies observable patterns in the event log for algorithm/parameter suggestion.
 */
export interface LogCharacteristicsDetection {
  /** Fraction of unique trace variants (0-1). High variance: >0.7 */
  variantRatio: number;

  /** Is this a high-variance log (>70% unique traces)? */
  isHighVariance: boolean;

  /** Number of distinct activities */
  activityCount: number;

  /** Is this a high-activity log (>50 distinct activities)? */
  isHighActivity: boolean;

  /** Estimated noise level (0-1). High noise: >0.3 */
  estimatedNoiseLevel: number;

  /** Is this a noisy log (>30% noise)? */
  isNoisy: boolean;

  /** Average trace length in events */
  averageTraceLengthMs?: number;

  /** Is the log time-heavy (large average traces)? */
  isTimeTrending?: boolean;
}

/**
 * Analyze log characteristics to guide algorithm and parameter selection.
 *
 * Detects patterns:
 * - High variance: >70% of traces are unique variants (requires genetic/ACO/PSO)
 * - High activity: >50 distinct activities (requires algorithms optimized for wide logs)
 * - High noise: >30% estimated noise (requires noise-resistant algorithms)
 * - Time-trending: large average trace lengths with temporal patterns
 *
 * @param traceCount Total number of traces
 * @param variantCount Number of unique trace variants
 * @param activityCount Number of distinct activities
 * @param estimatedNoiseLevel (optional) Fraction of events estimated to be noise (0-1)
 * @param averageTraceLengthMs (optional) Average trace duration in milliseconds
 * @returns Detection result with categorization for algorithm/parameter hints
 */
export function detectLogCharacteristics(
  traceCount: number,
  variantCount: number,
  activityCount: number,
  estimatedNoiseLevel: number = 0,
  averageTraceLengthMs?: number,
): LogCharacteristicsDetection {
  const variantRatio = Math.min(1, variantCount / Math.max(traceCount, 1));
  const isHighVariance = variantRatio > 0.7;
  const isHighActivity = activityCount > 50;
  const isNoisy = estimatedNoiseLevel > 0.3;
  const isTimeTrending = averageTraceLengthMs ? averageTraceLengthMs > 30000 : false;

  return {
    variantRatio,
    isHighVariance,
    activityCount,
    isHighActivity,
    estimatedNoiseLevel,
    isNoisy,
    averageTraceLengthMs,
    isTimeTrending,
  };
}

/**
 * Suggest optimal number of clusters for k-means clustering.
 *
 * Uses the elbow heuristic: k ≈ sqrt(n/2), where n is the number of traces.
 * This formula provides a reasonable starting point for unsupervised clustering
 * without requiring cross-validation in resource-constrained environments.
 *
 * Refined by log characteristics:
 * - High variance logs: increase k by 20% (more patterns to capture)
 * - High-activity logs: cap k at 15 (reduce noise from activity dimensionality)
 * - Noisy logs: reduce k by 10% (fewer tight clusters, more resilience)
 *
 * @param traceCount Number of traces in the event log
 * @param activityCount Number of distinct activities
 * @param characteristics (optional) Detected log characteristics for refinement
 * @returns Suggested k value (minimum 2, maximum 20)
 *
 * @example
 *   suggestClusteringK(100, 15) // Returns ~7
 *   suggestClusteringK(1000, 30, { isHighVariance: true }) // Returns ~9 (7 * 1.2)
 *   suggestClusteringK(1000, 60, { isHighActivity: true }) // Returns ~7 (capped at 15)
 *   suggestClusteringK(1000, 30, { isNoisy: true }) // Returns ~6 (7 * 0.9)
 */
export function suggestClusteringK(
  traceCount: number,
  activityCount: number,
  characteristics?: Partial<LogCharacteristicsDetection>,
): number {
  if (traceCount <= 0) return 2;

  // Elbow heuristic: sqrt(n/2)
  let suggested = Math.sqrt(traceCount / 2);

  // Refinement based on log characteristics
  if (characteristics) {
    if (characteristics.isHighVariance) {
      suggested *= 1.2; // More clusters for high-variance logs
    }
    if (characteristics.isNoisy) {
      suggested *= 0.9; // Fewer clusters for noisy logs
    }
  }

  // Clamp to reasonable range [2, 20], with hard cap at 15 for high-activity logs
  const maxK = characteristics?.isHighActivity ? 15 : 20;
  const k = Math.max(2, Math.min(maxK, Math.round(suggested)));
  return k;
}

/**
 * Suggest optimal number of PCA components to retain.
 *
 * Returns min(0.95 * featureCount, cap) to balance dimensionality reduction
 * with variance preservation. Retaining 95% of features ensures minimal
 * information loss while still providing reduction benefits.
 *
 * Default cap at 10 components is appropriate for process mining where traces
 * typically have 10-20 key features (duration, activity count, rework ratio, etc.).
 *
 * Refined by log characteristics:
 * - High-activity logs: cap at 15 (more features, allow more PCA components)
 * - High-variance logs: cap at 12 (capture variance complexity)
 * - Noisy logs: cap at 8 (reduce noise amplification)
 *
 * @param featureCount Number of input features extracted from the log
 * @param characteristics (optional) Detected log characteristics for refinement
 * @returns Suggested number of components to keep
 *
 * @example
 *   suggestPCAComponents(8)  // Returns 8 (95% of 8)
 *   suggestPCAComponents(12, { isHighActivity: true }) // Returns 11 (95% of 12, capped at 15)
 *   suggestPCAComponents(100, { isHighVariance: true }) // Returns 12 (95% of 100 = 95, capped at 12)
 *   suggestPCAComponents(5, { isNoisy: true })  // Returns 5 (95% of 5 = 4.75, capped at 8)
 */
export function suggestPCAComponents(
  featureCount: number,
  characteristics?: Partial<LogCharacteristicsDetection>,
): number {
  if (featureCount <= 0) return 1;

  // Retain 95% of features
  const suggested = Math.ceil(0.95 * featureCount);

  // Determine cap based on characteristics
  let cap = 10; // default
  if (characteristics?.isHighActivity) {
    cap = 15; // more components for high-activity logs
  } else if (characteristics?.isHighVariance) {
    cap = 12; // slightly more for high-variance logs
  } else if (characteristics?.isNoisy) {
    cap = 8; // fewer for noisy logs (less noise amplification)
  }

  const components = Math.max(1, Math.min(cap, suggested));
  return components;
}

/**
 * Suggest anomaly detection threshold based on log size and characteristics.
 *
 * Scales the threshold inversely with log size: larger logs are more forgiving
 * (higher threshold = fewer false positives), smaller logs are more sensitive.
 *
 * Base thresholds by size:
 *   - Small logs (< 1K events): 0.6 (sensitive, catch more anomalies)
 *   - Medium logs (1K-10K): 0.65
 *   - Large logs (10K-100K): 0.7
 *   - Very large logs (> 100K): 0.75 (conservative, reduce noise)
 *
 * Refined by log characteristics:
 * - Noisy logs: lower threshold by 0.05 (increase sensitivity to find true anomalies)
 * - High-variance logs: raise threshold by 0.05 (reduce false positives from natural variance)
 * - High-activity logs: raise threshold by 0.03 (more features = higher baseline noise)
 *
 * Final threshold is clamped to [0.5, 0.85] to stay in practical bounds.
 *
 * @param logSize Total number of events in the log
 * @param characteristics (optional) Detected log characteristics for refinement
 * @returns Suggested anomaly threshold (0-1, higher = fewer anomalies detected)
 *
 * @example
 *   suggestAnomalyThreshold(500)    // Returns 0.6 (sensitive)
 *   suggestAnomalyThreshold(5000, { isNoisy: true })   // Returns 0.6 (0.65 - 0.05)
 *   suggestAnomalyThreshold(50000, { isHighVariance: true })  // Returns 0.75 (0.7 + 0.05)
 *   suggestAnomalyThreshold(200000) // Returns 0.75 (conservative)
 */
export function suggestAnomalyThreshold(
  logSize: number,
  characteristics?: Partial<LogCharacteristicsDetection>,
): number {
  if (logSize <= 0) return 0.65; // default for unknown/empty

  // Base threshold brackets based on log size
  let base: number;
  if (logSize < 1000) base = 0.6;   // Small: sensitive
  else if (logSize < 10000) base = 0.65; // Medium-small
  else if (logSize < 100000) base = 0.7; // Medium-large
  else base = 0.75; // Large: conservative (fewer false positives)

  // Refinement based on log characteristics
  if (characteristics) {
    if (characteristics.isNoisy) {
      base -= 0.05; // Lower threshold to catch true anomalies in noisy logs
    }
    if (characteristics.isHighVariance) {
      base += 0.05; // Raise threshold to reduce false positives from variance
    }
    if (characteristics.isHighActivity) {
      base += 0.03; // Slight increase for high-activity logs
    }
  }

  // Clamp to practical bounds [0.5, 0.85]
  return Math.max(0.5, Math.min(0.85, base));
}

/**
 * Suggest k-NN parameter k based on sample size and characteristics.
 *
 * Default k=5 is reasonable for general use but can be optimized:
 * - Small logs (<20 samples): k = 3 (reduce overfitting)
 * - Medium logs (20-100): k = 5 (default, balanced)
 * - Large logs (>100): k = sqrt(n) capped at 10 (more neighbors for stability)
 * - Noisy logs: reduce k by 1 (fewer neighbors reduce noise influence)
 *
 * Final k is clamped to [1, n-1] to ensure validity.
 *
 * @param traceCount Number of traces (samples) in the log
 * @param characteristics (optional) Detected log characteristics for refinement
 * @returns Suggested k value for k-NN
 *
 * @example
 *   suggestKnnK(10) // Returns 3 (small log)
 *   suggestKnnK(50) // Returns 5 (medium, default)
 *   suggestKnnK(200) // Returns 10 (large: sqrt(200)≈14, capped at 10)
 *   suggestKnnK(100, { isNoisy: true }) // Returns 4 (5 - 1 for noise)
 */
export function suggestKnnK(
  traceCount: number,
  characteristics?: Partial<LogCharacteristicsDetection>,
): number {
  if (traceCount <= 1) return 1;

  let suggested: number;
  if (traceCount < 20) {
    suggested = 3; // Small: conservative to avoid overfitting
  } else if (traceCount < 100) {
    suggested = 5; // Medium: default
  } else {
    // Large: use sqrt(n), capped at 10
    suggested = Math.min(10, Math.ceil(Math.sqrt(traceCount)));
  }

  // Refine by characteristics
  if (characteristics?.isNoisy) {
    suggested = Math.max(1, suggested - 1); // Fewer neighbors reduce noise influence
  }

  // Clamp to valid range [1, n-1]
  const maxK = Math.max(1, traceCount - 1);
  return Math.max(1, Math.min(maxK, Math.round(suggested)));
}

/**
 * Suggest max depth for decision trees based on sample size and feature count.
 *
 * Deeper trees risk overfitting; shallower trees risk underfitting.
 * Rule: max_depth = min(log2(n), 0.5 * feature_count), clamped to [2, 10].
 *
 * Refinement:
 * - Noisy logs: reduce by 1 (simpler trees resist noise better)
 * - High-variance logs: increase by 1 (more patterns to capture)
 *
 * @param traceCount Number of traces (samples)
 * @param featureCount Number of features after one-hot encoding
 * @param characteristics (optional) Detected log characteristics for refinement
 * @returns Suggested max depth for decision tree
 *
 * @example
 *   suggestDecisionTreeDepth(100, 10) // Returns 5 (log2(100)≈6.6, capped)
 *   suggestDecisionTreeDepth(1000, 20) // Returns 10 (min(10, 10) = 10)
 *   suggestDecisionTreeDepth(100, 10, { isNoisy: true }) // Returns 4 (5 - 1)
 */
export function suggestDecisionTreeDepth(
  traceCount: number,
  featureCount: number,
  characteristics?: Partial<LogCharacteristicsDetection>,
): number {
  if (traceCount <= 0 || featureCount <= 0) return 2;

  // Max depth = min(log2(n), 0.5 * d)
  const depthFromSamples = Math.log2(Math.max(1, traceCount));
  const depthFromFeatures = 0.5 * featureCount;
  let suggested = Math.min(depthFromSamples, depthFromFeatures);

  // Refine by characteristics
  if (characteristics?.isNoisy) {
    suggested -= 1; // Simpler trees resist noise
  }
  if (characteristics?.isHighVariance) {
    suggested += 1; // Allow more splits for variance
  }

  // Clamp to [2, 10]
  return Math.max(2, Math.min(10, Math.round(suggested)));
}

/**
 * Suggest polynomial degree based on feature count and sample size.
 *
 * Higher degree risks overfitting (curse of dimensionality).
 * Rule: degree = min(3, max(1, 0.1 * feature_count)), adjusted for sample size.
 *
 * Guard: degree <= n - 1 (more parameters than observations = underdetermined).
 *
 * @param featureCount Number of input features
 * @param traceCount Number of samples for regression
 * @returns Suggested polynomial degree (clamped to [1, 3])
 *
 * @example
 *   suggestPolynomialDegree(5, 20) // Returns 1 (0.1*5=0.5, min(3,1)=1)
 *   suggestPolynomialDegree(20, 100) // Returns 2 (0.1*20=2, min(3,2)=2)
 *   suggestPolynomialDegree(50, 100) // Returns 3 (0.1*50=5, capped at 3)
 */
export function suggestPolynomialDegree(
  featureCount: number,
  traceCount: number,
): number {
  if (featureCount <= 0 || traceCount <= 0) return 1;

  // Base: 0.1 * feature_count, capped at 3
  let suggested = Math.min(3, Math.max(1, Math.ceil(0.1 * featureCount)));

  // Guard: degree <= traceCount - 1 (avoid underdetermined system)
  suggested = Math.min(suggested, Math.max(1, traceCount - 1));

  return Math.round(suggested);
}

/**
 * Suggest forecast horizon based on the number of windows available.
 *
 * Forecast horizon should not exceed 50% of training window count.
 * Default: ceil(0.2 * windowCount), clamped to [1, ceil(0.5 * windowCount)].
 *
 * @param windowCount Number of drift/forecast windows in the series
 * @returns Suggested forecast periods
 *
 * @example
 *   suggestForecastHorizon(10) // Returns 2 (0.2*10=2)
 *   suggestForecastHorizon(50) // Returns 10 (0.2*50=10)
 *   suggestForecastHorizon(5) // Returns 1 (min is 1)
 */
export function suggestForecastHorizon(windowCount: number): number {
  if (windowCount <= 0) return 1;

  // Default: 20% of window count
  const suggested = Math.max(1, Math.ceil(0.2 * windowCount));

  // Cap at 50% of window count
  const maxHorizon = Math.max(1, Math.ceil(0.5 * windowCount));

  return Math.min(suggested, maxHorizon);
}

/**
 * Adaptive algorithm selection for classification based on log characteristics.
 *
 * Selects between knn and logistic_regression based on:
 * - Feature quality (zero-variance, multicollinearity)
 * - Dataset size (trace count)
 * - Feature variance and complexity
 */
export function suggestClassificationAlgorithm(
  traceCount: number,
  featureCount: number,
  featureQualityScore: number,
  characteristics?: Partial<LogCharacteristicsDetection>,
): 'knn' | 'logistic_regression' {
  // Small datasets: prefer kNN (stable, no assumptions)
  if (traceCount < 30) return 'knn';

  // Low feature quality: prefer kNN (robust to collinearity, zero-variance)
  if (featureQualityScore < 0.6) return 'knn';

  // Noisy logs: prefer kNN (less sensitive to noise)
  if (characteristics?.isNoisy) return 'knn';

  // High-variance logs: prefer logistic regression (learns complex decision boundaries)
  if (characteristics?.isHighVariance && traceCount > 100 && featureQualityScore >= 0.7) {
    return 'logistic_regression';
  }

  // Large dataset + good features: prefer logistic regression
  if (traceCount > 100 && featureQualityScore >= 0.6) {
    return 'logistic_regression';
  }

  // Default safe choice
  return 'knn';
}

// ─────────────────────────────────────────────────────────────────────────────
// suggestParameters + pickBestAlgorithm — high-level recommendation API
// ─────────────────────────────────────────────────────────────────────────────

export interface AlgorithmSuggestion {
  name: string;
  confidence: number;
  reason: string;
  suggestedParameters: Record<string, unknown>;
}

export interface ParameterSuggestions {
  classification: AlgorithmSuggestion[];
  regression: AlgorithmSuggestion[];
  clustering: AlgorithmSuggestion[];
}

/**
 * Suggest algorithms and parameters for all three ML tasks given a FeatureMatrix.
 */
export function suggestParameters(data: { data: number[][]; featureNames?: string[] }): ParameterSuggestions {
  const n = data.data.length;
  const d = data.featureNames?.length ?? (data.data[0]?.length ?? 1);
  const k = suggestClusteringK(n, d);
  const knn = suggestKnnK(n, undefined);
  const depth = suggestDecisionTreeDepth(n, d);
  const degree = suggestPolynomialDegree(d, n);

  // Classification
  const classification: AlgorithmSuggestion[] = [
    {
      name: 'decision_tree',
      confidence: n < 500 ? 0.9 : 0.75,
      reason: n < 500 ? 'Small dataset — decision tree avoids overfitting via depth limit.' : 'Medium dataset — decision tree provides interpretable boundaries.',
      suggestedParameters: { maxDepth: depth },
    },
    {
      name: 'knn',
      confidence: 0.75,
      reason: `k-NN is robust on ${n} samples with ${d} features.`,
      suggestedParameters: { k: knn },
    },
    {
      name: 'logistic_regression',
      confidence: n > 200 ? 0.8 : 0.6,
      reason: n > 200 ? 'Large dataset suits logistic regression.' : 'Small dataset; prefer tree or knn.',
      suggestedParameters: { maxIter: 200 },
    },
    {
      name: 'naive_bayes',
      confidence: d > 30 ? 0.85 : 0.6,
      reason: d > 30 ? 'High-dimensional data — naive Bayes scales linearly with features.' : 'Naive Bayes works but not optimal for low-dimensional data.',
      suggestedParameters: {},
    },
    {
      name: 'gradient_boosting',
      confidence: n > 1000 ? 0.85 : 0.55,
      reason: n > 1000 ? 'Large dataset favors ensemble gradient boosting.' : 'Not enough data for reliable gradient boosting.',
      suggestedParameters: { nEstimators: 100, learningRate: 0.1 },
    },
  ].sort((a, b) => b.confidence - a.confidence);

  // Regression
  const regression: AlgorithmSuggestion[] = [
    {
      name: 'linear_regression',
      confidence: 0.85,
      reason: 'Linear regression is the baseline for all regression tasks.',
      suggestedParameters: {},
    },
    {
      name: 'polynomial_regression',
      confidence: n > 5000 ? 0.8 : 0.5,
      reason: n > 5000 ? 'Large dataset — polynomial regression can capture non-linearity.' : 'Small dataset — risk of overfitting with polynomial regression.',
      suggestedParameters: { degree },
    },
    {
      name: 'exponential_regression',
      confidence: 0.6,
      reason: 'Exponential regression for growth/decay patterns.',
      suggestedParameters: {},
    },
  ].sort((a, b) => b.confidence - a.confidence);

  // Clustering
  const clustering: AlgorithmSuggestion[] = [
    {
      name: 'kmeans',
      confidence: 0.85,
      reason: `k-Means with k=${k} clusters for ${n} samples.`,
      suggestedParameters: { clusters: k },
    },
    {
      name: 'dbscan',
      confidence: 0.7,
      reason: 'DBSCAN discovers clusters of arbitrary shape and handles noise.',
      suggestedParameters: { eps: 1.0, minPoints: Math.max(2, Math.floor(Math.log(n))) },
    },
  ].sort((a, b) => b.confidence - a.confidence);

  return { classification, regression, clustering };
}

/**
 * Pick the single best algorithm name for a given task based on dataset characteristics.
 */
export function pickBestAlgorithm(
  task: 'classification' | 'regression' | 'clustering',
  data: { data: number[][]; featureNames?: string[] },
): string {
  const suggestions = suggestParameters(data);
  if (task === 'classification') return suggestions.classification[0]?.name ?? 'knn';
  if (task === 'regression') return suggestions.regression[0]?.name ?? 'linear_regression';
  return suggestions.clustering[0]?.name ?? 'kmeans';
}
