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
 * Suggest optimal number of clusters for k-means clustering.
 *
 * Uses the elbow heuristic: k ≈ sqrt(n/2), where n is the number of traces.
 * This formula provides a reasonable starting point for unsupervised clustering
 * without requiring cross-validation in resource-constrained environments.
 *
 * @param traceCount Number of traces in the event log
 * @param activityCount Number of distinct activities (unused, reserved for future refinement)
 * @returns Suggested k value (minimum 2, maximum 20)
 *
 * @example
 *   suggestClusteringK(100, 15) // Returns ~7
 *   suggestClusteringK(1000, 30) // Returns ~22 (capped at 20)
 *   suggestClusteringK(16, 5)   // Returns ~3 (minimum 2)
 */
export function suggestClusteringK(traceCount: number, activityCount: number): number {
  if (traceCount <= 0) return 2;

  // Elbow heuristic: sqrt(n/2)
  const suggested = Math.sqrt(traceCount / 2);

  // Clamp to reasonable range [2, 20]
  const k = Math.max(2, Math.min(20, Math.round(suggested)));
  return k;
}

/**
 * Suggest optimal number of PCA components to retain.
 *
 * Returns min(0.95 * featureCount, 10) to balance dimensionality reduction
 * with variance preservation. Retaining 95% of features ensures minimal
 * information loss while still providing reduction benefits.
 *
 * The cap at 10 components is appropriate for process mining where traces
 * typically have 10-20 key features (duration, activity count, rework ratio, etc.).
 *
 * @param featureCount Number of input features extracted from the log
 * @returns Suggested number of components to keep
 *
 * @example
 *   suggestPCAComponents(8)  // Returns 8 (95% of 8)
 *   suggestPCAComponents(12) // Returns 10 (95% of 12 = 11.4, capped at 10)
 *   suggestPCAComponents(100) // Returns 10 (95% of 100 = 95, capped at 10)
 *   suggestPCAComponents(5)  // Returns 5 (95% of 5 = 4.75, rounded to 5)
 */
export function suggestPCAComponents(featureCount: number): number {
  if (featureCount <= 0) return 1;

  // Retain 95% of features
  const suggested = Math.ceil(0.95 * featureCount);

  // Cap at 10 for process mining context
  const components = Math.max(1, Math.min(10, suggested));
  return components;
}

/**
 * Suggest anomaly detection threshold based on log size.
 *
 * Scales the threshold inversely with log size: larger logs are more forgiving
 * (higher threshold = fewer false positives), smaller logs are more sensitive.
 *
 * Baseline thresholds:
 *   - Small logs (< 1K events): 0.6 (sensitive, catch more anomalies)
 *   - Medium logs (1K-10K): 0.65
 *   - Large logs (10K-100K): 0.7
 *   - Very large logs (> 100K): 0.75 (conservative, reduce noise)
 *
 * @param logSize Total number of events in the log
 * @returns Suggested anomaly threshold (0-1, higher = fewer anomalies detected)
 *
 * @example
 *   suggestAnomalyThreshold(500)    // Returns 0.6 (sensitive)
 *   suggestAnomalyThreshold(5000)   // Returns 0.65
 *   suggestAnomalyThreshold(50000)  // Returns 0.7
 *   suggestAnomalyThreshold(200000) // Returns 0.75 (conservative)
 */
export function suggestAnomalyThreshold(logSize: number): number {
  if (logSize <= 0) return 0.65; // default for unknown/empty

  // Threshold brackets based on log size
  if (logSize < 1000) return 0.6;   // Small: sensitive
  if (logSize < 10000) return 0.65; // Medium-small
  if (logSize < 100000) return 0.7; // Medium-large
  return 0.75; // Large: conservative (fewer false positives)
}
