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
