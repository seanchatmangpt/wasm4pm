/**
 * Unified algorithm selector for all 6 prediction tasks.
 *
 * Provides data-driven algorithm recommendation based on log characteristics.
 * Centralizes decision logic that was previously scattered across predict.ts and ml-runner.ts.
 *
 * Decision tree uses:
 *   - Log size (trace count)
 *   - Entropy (activity diversity)
 *   - Feature variance (for ML-based tasks)
 *   - Activity count (process complexity)
 *
 * Confidence scores (0-1) reflect heuristic certainty:
 *   - 0.9+: Strong recommendation (e.g., large log → weibull for remaining-time)
 *   - 0.7-0.9: Good recommendation (data supports choice, but alternatives viable)
 *   - <0.7: Weak recommendation (uncertain; multiple algorithms reasonable)
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// LogProfile
// ---------------------------------------------------------------------------

export const LogProfileSchema = z.object({
  /** Number of traces in the log */
  traceCount: z.number(),
  /** Number of unique activities (process complexity indicator) */
  activityCount: z.number(),
  /** Shannon entropy of activity frequencies (0=deterministic, 1=uniform) */
  entropy: z.number(),
  /** Average trace length (process breadth indicator) */
  avgTraceLength: z.number(),
  /** Variance of feature values (0=homogeneous, >1=diverse) */
  featureVariance: z.number(),
  /** Number of distinct traces (variants) */
  variantCount: z.number(),
});

/**
 * Log profile characteristics extracted from WASM features.
 */
export type LogProfile = z.infer<typeof LogProfileSchema>;

// ---------------------------------------------------------------------------
// AlgorithmRecommendation
// ---------------------------------------------------------------------------

export const AlgorithmRecommendationSchema = z.object({
  /** Recommended algorithm name (e.g., 'weibull', 'regress', 'knn', 'ngram') */
  algorithm: z.string(),
  /** Confidence score (0-1): higher = stronger recommendation */
  confidence: z.number(),
  /** Human-readable explanation for the recommendation */
  reason: z.string(),
  /** Alternative algorithms (ranked by suitability) */
  alternatives: z.array(z.string()),
});

/**
 * Algorithm recommendation result.
 */
export type AlgorithmRecommendation = z.infer<typeof AlgorithmRecommendationSchema>;

/**
 * Compute Shannon entropy of activity frequencies.
 *
 * @param counts - Frequency counts per activity
 * @returns Entropy value (0=deterministic, ~1=uniform)
 */
function computeEntropy(counts: number[]): number {
  if (counts.length === 0) return 0;

  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;

  const probabilities = counts.map(c => c / total);
  const entropy = -probabilities.reduce((sum, p) => {
    if (p === 0) return sum;
    return sum + p * Math.log2(p);
  }, 0);

  return entropy;
}

/**
 * Compute variance of numeric values.
 *
 * @param values - Input values
 * @returns Variance (0=all same, >1=spread out)
 */
function computeVariance(values: number[]): number {
  if (values.length <= 1) return 0;

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;

  return variance;
}

/**
 * Extract log profile from WASM feature output.
 *
 * @param features - Output from wasm.extract_case_features()
 * @returns LogProfile with computed characteristics
 */
export function extractLogProfile(
  features: Array<Record<string, unknown>>
): LogProfile {
  if (!features || features.length === 0) {
    return {
      traceCount: 0,
      activityCount: 0,
      entropy: 0,
      avgTraceLength: 0,
      featureVariance: 0,
      variantCount: 0,
    };
  }

  const traceCount = features.length;

  // Extract activity count and trace lengths
  const activityCounts = new Map<string, number>();
  const traceLengths: number[] = [];

  for (const feature of features) {
    if (typeof feature.trace_length === 'number') {
      traceLengths.push(feature.trace_length);
    }
    // Count unique activities (approximation: check common feature names)
    if (typeof feature.unique_activities === 'number') {
      activityCounts.set(String(feature.unique_activities), (activityCounts.get(String(feature.unique_activities)) || 0) + 1);
    }
  }

  const activityCount = activityCounts.size > 0
    ? Math.max(...Array.from(activityCounts.keys()).map(k => parseInt(k, 10)))
    : 0;

  const avgTraceLength = traceLengths.length > 0
    ? traceLengths.reduce((a, b) => a + b, 0) / traceLengths.length
    : 0;

  // Compute entropy from activity distribution
  const activityFreqs = Array.from(activityCounts.values());
  const entropy = computeEntropy(activityFreqs);

  // Compute feature variance (sample numeric features)
  const numericFeatures: number[] = [];
  for (const feature of features) {
    for (const [_key, val] of Object.entries(feature)) {
      if (typeof val === 'number' && !Number.isNaN(val) && Number.isFinite(val)) {
        numericFeatures.push(val);
      }
    }
  }
  const featureVariance = numericFeatures.length > 0
    ? computeVariance(numericFeatures)
    : 0;

  // Estimate variant count (approximate: unique combinations of trace_length and activity_count)
  const variantSet = new Set<string>();
  for (const feature of features) {
    const key = `${feature.trace_length}:${feature.unique_activities}`;
    variantSet.add(key);
  }
  const variantCount = variantSet.size;

  return {
    traceCount,
    activityCount,
    entropy,
    avgTraceLength,
    featureVariance,
    variantCount,
  };
}

/**
 * Recommend best algorithm for 'next-activity' prediction task.
 *
 * Decision tree:
 *   - Large, diverse logs: n-gram (high entropy → better pattern matching)
 *   - Small logs: dfg (simple, fast, avoids overfitting)
 *   - Medium logs: markov (balance)
 */
function selectNextActivityAlgorithm(profile: LogProfile): AlgorithmRecommendation {
  // Entropy > 0.7 and large log: n-gram captures patterns well
  if (profile.entropy > 0.7 && profile.traceCount > 500) {
    return {
      algorithm: 'ngram',
      confidence: 0.85,
      reason: `Diverse log (${profile.traceCount} traces, entropy ${profile.entropy.toFixed(2)}) benefits from n-gram pattern matching`,
      alternatives: ['markov', 'dfg'],
    };
  }

  // Small log or low entropy: simple DFG
  if (profile.traceCount < 200 || profile.entropy < 0.4) {
    return {
      algorithm: 'dfg',
      confidence: 0.8,
      reason: `Log size (${profile.traceCount}) or low diversity (entropy ${profile.entropy.toFixed(2)}) favors simple DFG`,
      alternatives: ['markov', 'ngram'],
    };
  }

  // Medium log: Markov chain (good balance)
  return {
    algorithm: 'markov',
    confidence: 0.75,
    reason: `Medium-sized log (${profile.traceCount} traces) well-suited for Markov chain prediction`,
    alternatives: ['ngram', 'dfg'],
  };
}

/**
 * Recommend best algorithm for 'remaining-time' prediction task.
 *
 * Decision tree:
 *   - Large log (>1000): regress (ML captures feature patterns)
 *   - Small log (<200): weibull (parametric, avoids overfitting)
 *   - Medium: hybrid (ensemble)
 */
function selectRemainingTimeAlgorithm(profile: LogProfile): AlgorithmRecommendation {
  // Large log: ML regression captures feature dependencies well
  if (profile.traceCount > 1000 && profile.featureVariance > 0.5) {
    return {
      algorithm: 'regress',
      confidence: 0.9,
      reason: `Large log (${profile.traceCount} traces) with feature variance (${profile.featureVariance.toFixed(2)}) benefits from ML regression`,
      alternatives: ['hybrid', 'weibull'],
    };
  }

  // Small log: Weibull (parametric, data-efficient)
  if (profile.traceCount < 200) {
    return {
      algorithm: 'weibull',
      confidence: 0.85,
      reason: `Small log (${profile.traceCount} traces) better handled by Weibull parametric model`,
      alternatives: ['hybrid', 'regress'],
    };
  }

  // Medium log or uncertain: Hybrid (ensemble)
  return {
    algorithm: 'hybrid',
    confidence: 0.75,
    reason: `Medium log (${profile.traceCount} traces) benefits from hybrid ensemble approach`,
    alternatives: ['regress', 'weibull'],
  };
}

/**
 * Recommend best algorithm for 'outcome' prediction task.
 *
 * Decision tree:
 *   - High complexity (many activities): anomaly scoring (process-aware)
 *   - Low complexity: likelihood scoring (simpler)
 */
function selectOutcomeAlgorithm(profile: LogProfile): AlgorithmRecommendation {
  // Complex process: anomaly scoring
  if (profile.activityCount > 20 || profile.entropy > 0.6) {
    return {
      algorithm: 'anomaly_scoring',
      confidence: 0.8,
      reason: `Complex process (${profile.activityCount} activities, entropy ${profile.entropy.toFixed(2)}) requires anomaly detection`,
      alternatives: ['likelihood_scoring'],
    };
  }

  // Simple process: likelihood scoring
  return {
    algorithm: 'likelihood_scoring',
    confidence: 0.8,
    reason: `Simple process (${profile.activityCount} activities) well-suited for likelihood-based scoring`,
    alternatives: ['anomaly_scoring'],
  };
}

/**
 * Recommend best algorithm for 'drift' detection task.
 *
 * Decision tree:
 *   - Large log: Jaccard (robust to noise)
 *   - Small log: Euclidean (fast, simpler)
 */
function selectDriftAlgorithm(profile: LogProfile): AlgorithmRecommendation {
  // Large log: Jaccard distance (set-based, noise-robust)
  if (profile.traceCount > 500) {
    return {
      algorithm: 'jaccard_window',
      confidence: 0.85,
      reason: `Large log (${profile.traceCount} traces) benefits from Jaccard distance robustness`,
      alternatives: ['euclidean_distance'],
    };
  }

  // Any size: Jaccard is generally safer
  return {
    algorithm: 'jaccard_window',
    confidence: 0.8,
    reason: `Jaccard distance recommended for robust drift detection`,
    alternatives: ['euclidean_distance'],
  };
}

/**
 * Recommend best algorithm for 'features' extraction task.
 *
 * Decision tree:
 *   - High complexity: transition probability matrix (captures process structure)
 *   - Any: transition probabilities (always applicable)
 */
function selectFeaturesAlgorithm(_profile: LogProfile): AlgorithmRecommendation {
  return {
    algorithm: 'transition_probabilities',
    confidence: 0.9,
    reason: `Transition probability matrix effective for all process complexities`,
    alternatives: ['prefix_features'],
  };
}

/**
 * Recommend best algorithm for 'resource' estimation task.
 *
 * Decision tree:
 *   - Always: M/M/1 queue model (standard queueing model)
 */
function selectResourceAlgorithm(_profile: LogProfile): AlgorithmRecommendation {
  return {
    algorithm: 'mm1_queue',
    confidence: 0.8,
    reason: `M/M/1 queue model appropriate for resource delay estimation`,
    alternatives: ['mm1k_queue', 'mg1_queue'],
  };
}

/**
 * Select best algorithm for a given prediction task and log profile.
 *
 * Main entry point: given task name and log characteristics, returns recommended
 * algorithm with confidence score and justification.
 *
 * @param task - Prediction task: 'next-activity', 'remaining-time', 'outcome', 'drift', 'features', 'resource'
 * @param profile - Log profile (extract via extractLogProfile())
 * @returns AlgorithmRecommendation with algorithm name, confidence, reason, and alternatives
 * @throws Error if task is not recognized
 */
export function selectBestAlgorithmForTask(
  task: string,
  profile: LogProfile
): AlgorithmRecommendation {
  switch (task) {
    case 'next-activity':
      return selectNextActivityAlgorithm(profile);

    case 'remaining-time':
      return selectRemainingTimeAlgorithm(profile);

    case 'outcome':
      return selectOutcomeAlgorithm(profile);

    case 'drift':
      return selectDriftAlgorithm(profile);

    case 'features':
      return selectFeaturesAlgorithm(profile);

    case 'resource':
      return selectResourceAlgorithm(profile);

    default:
      throw new Error(
        `Unknown prediction task: "${task}". Valid tasks: ` +
        `next-activity, remaining-time, outcome, drift, features, resource`
      );
  }
}

/**
 * Convenience function: extract profile and select algorithm in one call.
 *
 * @param task - Prediction task name
 * @param features - Raw WASM feature output array
 * @returns AlgorithmRecommendation
 */
export function recommendAlgorithm(
  task: string,
  features: Array<Record<string, unknown>>
): AlgorithmRecommendation {
  const profile = extractLogProfile(features);
  return selectBestAlgorithmForTask(task, profile);
}
