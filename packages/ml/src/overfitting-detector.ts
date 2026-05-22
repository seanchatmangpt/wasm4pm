/**
 * Overfitting detection suite for classifiers.
 *
 * Detects generalization gaps through:
 * 1. Train/test accuracy divergence
 * 2. Feature importance concentration (Gini coefficient)
 * 3. Feature-to-sample ratio (risk of high-dimensional overfitting)
 * 4. Model complexity vs dataset size
 * 5. Weight magnitude concentration (for logistic regression)
 *
 * Each detector returns a severity level (none|warning|critical) and
 * quantitative evidence.
 */

import type { ClassificationResult } from './types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Type definitions
// ─────────────────────────────────────────────────────────────────────────────

export interface OverfittingIndicator {
  /** Detector name */
  detector: string;
  /** Severity level */
  severity: 'none' | 'warning' | 'critical';
  /** Numeric evidence (0-1 scale for most detectors) */
  score: number;
  /** Human-readable explanation */
  message: string;
  /** Actionable recommendation */
  recommendation: string;
}

export interface OverfittingAnalysis {
  /** Overall severity (highest from all detectors) */
  overallSeverity: 'none' | 'warning' | 'critical';
  /** Individual detector results (sorted by severity) */
  indicators: OverfittingIndicator[];
  /** Summary risk level for decision-making */
  riskLevel: number; // 0.0 (safe) to 1.0 (severe)
  /** Total number of concerning indicators */
  concernCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Detector 1: Cross-Validation Accuracy Gap
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect overfitting via CV accuracy vs in-sample accuracy.
 *
 * In-sample accuracy (predictions on training data) is optimistically biased.
 * A large gap indicates the model memorized training data rather than learning.
 *
 * Thresholds:
 * - gap < 0.05: none (good generalization)
 * - gap 0.05-0.15: warning (moderate overfitting)
 * - gap > 0.15: critical (severe overfitting)
 */
function detectCVAccuracyGap(result: ClassificationResult): OverfittingIndicator {
  const cvAccuracy = result.cv_accuracy ?? null;

  if (cvAccuracy === null) {
    return {
      detector: 'cv_accuracy_gap',
      severity: 'none',
      score: 0,
      message: 'Cross-validation not performed (requires crossValidate=true)',
      recommendation: 'Re-run with crossValidate=true to enable honest accuracy measurement',
    };
  }

  // Compute in-sample accuracy from predictions
  const inSampleAccuracy =
    result.predictions.length > 0
      ? result.predictions.filter((p) => p.confidence > 0.5).length / result.predictions.length
      : 0;

  const gap = inSampleAccuracy - cvAccuracy;

  let severity: 'none' | 'warning' | 'critical' = 'none';
  if (gap > 0.15) severity = 'critical';
  else if (gap > 0.05) severity = 'warning';

  return {
    detector: 'cv_accuracy_gap',
    severity,
    score: Math.min(1, gap / 0.2), // Normalize: 0.2 gap = score 1.0
    message: `In-sample accuracy ${(inSampleAccuracy * 100).toFixed(1)}% vs CV accuracy ${(cvAccuracy * 100).toFixed(1)}% (gap: ${(gap * 100).toFixed(1)}%)`,
    recommendation:
      severity === 'critical'
        ? 'Model memorized training data. Try: regularization, simpler model, more training data'
        : severity === 'warning'
          ? 'Some overfitting detected. Consider reducing model complexity or adding more data'
          : 'Good generalization',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Detector 2: Feature Importance Concentration (Gini)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect overfitting via feature importance concentration.
 *
 * If a model relies on 1-2 features for 80%+ of decisions, it may overfit to
 * those features and fail on new data with different feature distributions.
 *
 * Uses Gini coefficient of weights (for logistic regression) or feature
 * access patterns (for tree-based models).
 *
 * Gini = 0: uniform importance (good)
 * Gini > 0.6: concentrated importance (warning)
 * Gini > 0.8: extreme concentration (critical)
 */
function detectFeatureImportanceConcentration(result: ClassificationResult): OverfittingIndicator {
  const modelInfo = result.modelInfo as Record<string, unknown>;

  // Try to extract weights from logistic regression
  const weights = modelInfo.weights as number[][] | undefined;
  if (weights && Array.isArray(weights) && weights.length > 0) {
    // Flatten and take absolute values
    const flatWeights: number[] = [];
    for (const row of weights) {
      for (const w of row) {
        flatWeights.push(Math.abs(w));
      }
    }

    // Compute Gini coefficient
    const sorted = flatWeights.sort((a, b) => a - b);
    const n = sorted.length;
    let cumSum = 0;
    for (let i = 0; i < n; i++) {
      cumSum += (i + 1) * sorted[i];
    }
    const totalSum = sorted.reduce((s, v) => s + v, 0);
    const gini = totalSum === 0 ? 0 : (2 * cumSum) / (n * totalSum) - (n + 1) / n;

    let severity: 'none' | 'warning' | 'critical' = 'none';
    if (gini > 0.8) severity = 'critical';
    else if (gini > 0.6) severity = 'warning';

    return {
      detector: 'feature_importance_concentration',
      severity,
      score: Math.min(1, gini),
      message: `Feature importance Gini coefficient: ${gini.toFixed(3)} (${Math.round(gini * 100)}% concentration)`,
      recommendation:
        severity === 'critical'
          ? 'Model depends on 1-2 features. Validate those features are stable; consider regularization'
          : severity === 'warning'
            ? 'Moderate feature concentration. Audit top features for stability'
            : 'Good feature diversity',
    };
  }

  // For tree models, check depth vs feature count
  const depth = modelInfo.depth as number | undefined;
  const featureCount = modelInfo.featureCount as number | undefined;

  if (typeof depth === 'number' && typeof featureCount === 'number' && featureCount > 0) {
    const depthToFeatureRatio = depth / featureCount;
    let severity: 'none' | 'warning' | 'critical' = 'none';
    if (depthToFeatureRatio > 2) severity = 'critical';
    else if (depthToFeatureRatio > 1) severity = 'warning';

    return {
      detector: 'feature_importance_concentration',
      severity,
      score: Math.min(1, depthToFeatureRatio / 2.5),
      message: `Tree depth ${depth} vs feature count ${featureCount} (ratio: ${depthToFeatureRatio.toFixed(2)})`,
      recommendation:
        severity === 'critical'
          ? 'Deep tree relative to features. Reduce max_depth or collect more data'
          : 'Tree complexity acceptable',
    };
  }

  return {
    detector: 'feature_importance_concentration',
    severity: 'none',
    score: 0,
    message: 'Model type does not expose weight/importance data',
    recommendation: 'No concentration analysis available for this model',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Detector 3: Feature-to-Sample Ratio (Curse of Dimensionality)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect curse of dimensionality: too many features relative to training samples.
 *
 * High-dimensional spaces are sparse; distances become meaningless (kNN fails).
 * Typical threshold: feature_count should be < 10% of sample_count.
 *
 * Ratio threshold:
 * - ratio < 0.1: none (well-sampled)
 * - ratio 0.1-0.33: warning (moderate dimensionality)
 * - ratio > 0.33: critical (severe curse)
 */
function detectFeatureToSampleRatio(result: ClassificationResult): OverfittingIndicator {
  const modelInfo = result.modelInfo as Record<string, unknown>;
  const featureCount = modelInfo.featureCount as number | undefined;
  const traceCount = modelInfo.traceCount as number | undefined;

  if (typeof featureCount !== 'number' || typeof traceCount !== 'number' || traceCount === 0) {
    return {
      detector: 'feature_to_sample_ratio',
      severity: 'none',
      score: 0,
      message: 'Feature/sample count not available',
      recommendation: 'No analysis available',
    };
  }

  const ratio = featureCount / traceCount;

  let severity: 'none' | 'warning' | 'critical' = 'none';
  if (ratio > 0.33) severity = 'critical';
  else if (ratio > 0.1) severity = 'warning';

  return {
    detector: 'feature_to_sample_ratio',
    severity,
    score: Math.min(1, ratio / 0.5), // Normalize: 0.5 ratio = score 1.0
    message: `Feature-to-sample ratio: ${ratio.toFixed(3)} (${featureCount} features / ${traceCount} samples)`,
    recommendation:
      severity === 'critical'
        ? 'High-dimensional space relative to training data. Reduce features via PCA or domain selection; collect more samples'
        : severity === 'warning'
          ? 'Moderate dimensionality. Monitor generalization; consider dimensionality reduction'
          : 'Well-sampled feature space',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Detector 4: Model Complexity vs Dataset Size
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect overfitting via model complexity.
 *
 * Rulesets:
 * - kNN: Small k is high-complexity (noisy); large k is under-complex
 *   Target: k ~= sqrt(n)
 * - Decision tree: Depth grows exponentially; target depth ~= log2(n)
 * - Logistic regression: Number of weights should be << n
 *
 * Severity based on how much the model exceeds safe complexity.
 */
function detectModelComplexity(result: ClassificationResult): OverfittingIndicator {
  const modelInfo = result.modelInfo as Record<string, unknown>;
  const traceCount = modelInfo.traceCount as number | undefined;

  if (!traceCount || traceCount < 2) {
    return {
      detector: 'model_complexity',
      severity: 'none',
      score: 0,
      message: 'Insufficient data to assess complexity',
      recommendation: 'Collect more samples for meaningful analysis',
    };
  }

  const k = modelInfo.k as number | undefined;
  if (typeof k === 'number') {
    // kNN complexity: target is sqrt(n)
    const targetK = Math.sqrt(traceCount);
    const kRatio = k / targetK;

    let severity: 'none' | 'warning' | 'critical' = 'none';
    if (kRatio < 0.3) severity = 'critical'; // k too small (noisy)
    else if (kRatio > 3) severity = 'warning'; // k too large (over-smooth)
    else severity = 'none';

    return {
      detector: 'model_complexity',
      severity,
      score: Math.abs(1 - kRatio) / 2, // Distance from ideal ratio
      message: `k-NN k=${k} vs recommended ~${targetK.toFixed(0)} (ratio: ${kRatio.toFixed(2)})`,
      recommendation:
        severity === 'critical'
          ? `k too small (${k}). Use k ~= sqrt(${traceCount}) ≈ ${Math.round(targetK)} for better stability`
          : severity === 'warning'
            ? `k too large (${k}). May over-smooth; use smaller k for finer boundaries`
            : `k value ${k} is reasonable`,
    };
  }

  const depth = modelInfo.depth as number | undefined;
  if (typeof depth === 'number') {
    // Decision tree: target depth ~= log2(n), with safety margin
    const maxSafeDepth = Math.log2(traceCount) + 2; // Allow +2 for safety
    let severity: 'none' | 'warning' | 'critical' = 'none';
    if (depth > maxSafeDepth * 1.5) severity = 'critical';
    else if (depth > maxSafeDepth) severity = 'warning';

    return {
      detector: 'model_complexity',
      severity,
      score: Math.min(1, depth / (maxSafeDepth * 1.5)),
      message: `Tree depth ${depth} vs safe bound ~${maxSafeDepth.toFixed(1)}`,
      recommendation:
        severity === 'critical'
          ? `Reduce max_depth (currently ${depth}); target ~${Math.round(maxSafeDepth)}`
          : severity === 'warning'
            ? `Tree may be too deep. Consider reducing max_depth`
            : `Tree depth acceptable`,
    };
  }

  return {
    detector: 'model_complexity',
    severity: 'none',
    score: 0,
    message: 'Model complexity metric not available',
    recommendation: 'No analysis for this model type',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Detector 5: Weight Magnitude Concentration (Logistic Regression)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect overfitting in logistic regression via weight magnitude distribution.
 *
 * If all weights are large, the model is making confident predictions
 * (potentially overfit). If weights are concentrated in 1-2 classes/features,
 * the model may discriminate based on spurious correlations.
 *
 * Metric: max weight / median weight ratio
 * - ratio < 3: moderate (good)
 * - ratio 3-10: warning (high confidence)
 * - ratio > 10: critical (extreme confidence, likely overfitting)
 */
function detectWeightMagnitudeConcentration(result: ClassificationResult): OverfittingIndicator {
  if (result.method !== 'logistic_regression') {
    return {
      detector: 'weight_magnitude_concentration',
      severity: 'none',
      score: 0,
      message: 'Weight concentration detector only applies to logistic regression',
      recommendation: 'Use for logistic_regression method',
    };
  }

  const modelInfo = result.modelInfo as Record<string, unknown>;
  const weights = modelInfo.weights as number[][] | undefined;

  if (!weights || !Array.isArray(weights) || weights.length === 0) {
    return {
      detector: 'weight_magnitude_concentration',
      severity: 'none',
      score: 0,
      message: 'Weights not available',
      recommendation: 'No analysis available',
    };
  }

  // Flatten weights and compute magnitudes
  const magnitudes: number[] = [];
  for (const row of weights) {
    for (const w of row) {
      magnitudes.push(Math.abs(w));
    }
  }

  if (magnitudes.length === 0) {
    return {
      detector: 'weight_magnitude_concentration',
      severity: 'none',
      score: 0,
      message: 'No weights found',
      recommendation: 'No analysis available',
    };
  }

  // Compute max and median
  const sorted = magnitudes.slice().sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const max = Math.max(...magnitudes);

  const ratio = median > 1e-10 ? max / median : Infinity;

  let severity: 'none' | 'warning' | 'critical' = 'none';
  if (ratio > 10) severity = 'critical';
  else if (ratio > 3) severity = 'warning';

  return {
    detector: 'weight_magnitude_concentration',
    severity,
    score: Math.min(1, (ratio - 3) / 7), // Normalize: ratio 10 = score 1.0
    message: `Weight magnitude ratio: max/median = ${ratio.toFixed(2)} (max=${max.toFixed(3)}, median=${median.toFixed(3)})`,
    recommendation:
      severity === 'critical'
        ? 'Weights are extremely concentrated. Model may overfit. Try: L1/L2 regularization, lower learning rate'
        : severity === 'warning'
          ? 'Some weight concentration. Monitor confidence calibration'
          : 'Weight distribution is reasonable',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Comprehensive overfitting analysis of a classification result.
 *
 * Runs all detectors and aggregates findings with severity ranking.
 * Intended for post-training diagnostics and model selection.
 *
 * @example
 * ```typescript
 * const result = await classifyTraces(features, { crossValidate: true });
 * const analysis = analyzeOverfitting(result);
 * if (analysis.overallSeverity === 'critical') {
 *   console.warn('Model shows severe overfitting signs');
 * }
 * ```
 */
export function analyzeOverfitting(result: ClassificationResult): OverfittingAnalysis {
  const indicators = [
    detectCVAccuracyGap(result),
    detectFeatureImportanceConcentration(result),
    detectFeatureToSampleRatio(result),
    detectModelComplexity(result),
    detectWeightMagnitudeConcentration(result),
  ];

  // Sort by severity (critical > warning > none)
  const severityRank = { critical: 2, warning: 1, none: 0 };
  indicators.sort((a, b) => severityRank[b.severity] - severityRank[a.severity]);

  // Aggregate overall severity
  let overallSeverity: 'none' | 'warning' | 'critical' = 'none';
  let concernCount = 0;
  let riskScore = 0;

  for (const indicator of indicators) {
    if (indicator.severity === 'critical') {
      overallSeverity = 'critical';
      concernCount++;
      riskScore += 0.3;
    } else if (indicator.severity === 'warning' && overallSeverity !== 'critical') {
      overallSeverity = 'warning';
      concernCount++;
      riskScore += 0.15;
    }
    riskScore += indicator.score * 0.1; // Add score contribution
  }

  const riskLevel = Math.min(1, riskScore);

  return {
    overallSeverity,
    indicators,
    riskLevel,
    concernCount,
  };
}

/**
 * Quick check: does the model show overfitting signs?
 *
 * Returns true if any detector reports 'critical' or 2+ report 'warning'.
 */
export function hasOverfittingConcerns(result: ClassificationResult): boolean {
  const analysis = analyzeOverfitting(result);
  return analysis.overallSeverity === 'critical' || analysis.concernCount >= 2;
}

/**
 * Quick severity check without full analysis.
 */
export function getOverfittingSeverity(result: ClassificationResult): 'none' | 'warning' | 'critical' {
  return analyzeOverfitting(result).overallSeverity;
}
