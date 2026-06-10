/**
 * Feature extraction for remaining-time prediction.
 *
 * Extracts trace-level features optimized for predicting case duration
 * based on process characteristics and temporal patterns.
 */

import { z } from 'zod';
import type { FeatureMatrix } from './types.js';

// ---------------------------------------------------------------------------
// RemainingTimeFeatures
// ---------------------------------------------------------------------------

export const RemainingTimeFeaturesSchema = z.object({
  case_id: z.string(),
  trace_length: z.number(),
  elapsed_time: z.number(),
  activity_frequencies: z.array(z.number()),
  avg_inter_event_time: z.number(),
  cycle_count: z.number(),
  /** Target variable (milliseconds) */
  remaining_time: z.number().optional(),
});

/**
 * Remaining-time feature definition.
 *
 * Extracts the following features from each trace:
 * - trace_length: Number of activities completed so far
 * - elapsed_time: Time elapsed since case start (milliseconds)
 * - activity_frequencies: Vector of activity occurrence counts
 * - avg_inter_event_time: Mean time between consecutive events (milliseconds)
 * - cycle_count: Number of rework instances (repeated activities)
 */
export type RemainingTimeFeatures = z.infer<typeof RemainingTimeFeaturesSchema>;

/**
 * Extract features optimized for remaining-time prediction.
 *
 * Input: Feature matrix from wasm.extract_case_features() with keys:
 *   - case_id: string
 *   - trace_length: number
 *   - elapsed_time: number (milliseconds)
 *   - activity_counts: Record<activity_name, count>
 *   - rework_count: number
 *   - avg_inter_event_time: number (milliseconds)
 *   - remaining_time?: number (optional, for supervised learning)
 *
 * Output: FeatureMatrix with normalized features optimized for regression.
 *
 * @param featuresJson - Array of feature objects from wasm.extract_case_features()
 * @returns FeatureMatrix ready for regression
 */
export function extractRemainingTimeFeatures(
  featuresJson: Array<Record<string, unknown>>
): FeatureMatrix {
  if (!featuresJson || !Array.isArray(featuresJson) || featuresJson.length === 0) {
    return {
      data: [],
      featureNames: [],
      caseIds: [],
      targets: [],
      labels: [],
      metadata: {
        warning: {
          code: 'empty_input',
          message: 'No features provided for remaining-time extraction',
          inputLength: 0,
          minRequired: 1,
        },
      },
    };
  }

  // Filter valid rows
  const validRows = featuresJson.filter(
    (row): row is Record<string, unknown> => row != null && typeof row === 'object'
  );

  if (validRows.length === 0) {
    return {
      data: [],
      featureNames: [],
      caseIds: [],
      targets: [],
      labels: [],
      metadata: {
        warning: {
          code: 'no_valid_features',
          message: 'No valid feature rows after filtering nulls',
          inputLength: featuresJson.length,
          minRequired: 1,
        },
      },
    };
  }

  const caseIds: string[] = [];
  const data: number[][] = [];
  const targets: number[] = [];

  // Collect all unique activities across all rows for one-hot encoding
  const allActivities = new Set<string>();
  for (const row of validRows) {
    const activityCounts = row.activity_counts as Record<string, number> | undefined;
    if (activityCounts && typeof activityCounts === 'object') {
      for (const activity of Object.keys(activityCounts)) {
        allActivities.add(activity);
      }
    }
  }

  const activityList = Array.from(allActivities).sort();
  const featureNames = [
    'trace_length',
    'elapsed_time',
    'avg_inter_event_time',
    'cycle_count',
    ...activityList.map((a) => `activity_${a}`),
  ];

  // Extract features for each trace
  for (const row of validRows) {
    const caseId = String(row.case_id ?? `case_${caseIds.length}`);
    caseIds.push(caseId);

    const traceLength = Math.max(0, Number(row.trace_length ?? 0));
    const elapsedTime = Math.max(0, Number(row.elapsed_time ?? 0));
    const avgInterEventTime = Math.max(0, Number(row.avg_inter_event_time ?? 0));
    const cycleCount = Math.max(0, Number(row.cycle_count ?? row.rework_count ?? 0));

    // Feature vector: numeric features + one-hot activity encoding
    const features: number[] = [
      traceLength,
      elapsedTime,
      avgInterEventTime,
      cycleCount,
    ];

    // One-hot encode activity frequencies
    const activityCounts = (row.activity_counts ?? {}) as Record<string, number>;
    for (const activity of activityList) {
      features.push(Math.max(0, Number(activityCounts[activity] ?? 0)));
    }

    data.push(features);

    // Extract target (remaining_time if available)
    const remainingTime = Number(row.remaining_time ?? 0);
    targets.push(remainingTime);
  }

  return {
    data,
    featureNames,
    caseIds,
    targets,
    labels: [], // Not used for regression
  };
}

/**
 * Normalize remaining-time features to [0,1] range per feature.
 *
 * Handles edge cases:
 * - All-zero feature → stays zero
 * - Single value → stays unchanged
 * - Zero-variance column → stays zero
 *
 * @param featureMatrix - Original feature matrix
 * @returns Normalized matrix with per-feature min-max scaling
 */
export function normalizeRemainingTimeFeatures(featureMatrix: FeatureMatrix): FeatureMatrix {
  if (featureMatrix.data.length === 0) {
    return featureMatrix;
  }

  const normalized = featureMatrix.data.map((row) => [...row]);
  const nFeatures = featureMatrix.data[0].length;

  // Min-max normalize each feature
  for (let j = 0; j < nFeatures; j++) {
    const column = normalized.map((row) => row[j]);
    const min = Math.min(...column);
    const max = Math.max(...column);
    const range = max - min;

    if (range === 0) {
      // Zero-variance column: leave as is (or set to 0)
      for (let i = 0; i < normalized.length; i++) {
        normalized[i][j] = 0;
      }
    } else {
      // Standard min-max scaling
      for (let i = 0; i < normalized.length; i++) {
        normalized[i][j] = (normalized[i][j] - min) / range;
      }
    }
  }

  // Normalize targets (remaining_time) as well
  const normalizedTargets = [...featureMatrix.targets];
  if (normalizedTargets.length > 0) {
    const minTarget = Math.min(...normalizedTargets);
    const maxTarget = Math.max(...normalizedTargets);
    const targetRange = maxTarget - minTarget;

    if (targetRange > 0) {
      for (let i = 0; i < normalizedTargets.length; i++) {
        normalizedTargets[i] = (normalizedTargets[i] - minTarget) / targetRange;
      }
    } else {
      // All same value: set to 0 or leave as is
      for (let i = 0; i < normalizedTargets.length; i++) {
        normalizedTargets[i] = 0;
      }
    }
  }

  return {
    data: normalized,
    featureNames: featureMatrix.featureNames,
    caseIds: featureMatrix.caseIds,
    targets: normalizedTargets,
    labels: featureMatrix.labels,
  };
}

/**
 * Assess feature quality for remaining-time prediction.
 *
 * Returns metrics for each feature:
 * - variance: Numeric variance (0 for constant features)
 * - coverage: Fraction of non-zero values
 * - correlation: Absolute correlation with target (remaining_time)
 *
 * @param featureMatrix - Feature matrix with targets
 * @returns Array of feature quality objects
 */
export const FeatureQualityMetricSchema = z.object({
  feature: z.string(),
  variance: z.number(),
  coverage: z.number(),
  correlation: z.number(),
  /** Based on variance + correlation */
  quality: z.enum(['high', 'medium', 'low']),
});

export type FeatureQualityMetric = z.infer<typeof FeatureQualityMetricSchema>;

export function assessRemainingTimeFeatureQuality(
  featureMatrix: FeatureMatrix
): FeatureQualityMetric[] {
  if (featureMatrix.data.length === 0) {
    return [];
  }

  const nFeatures = featureMatrix.data[0].length;
  const nSamples = featureMatrix.data.length;
  const metrics: FeatureQualityMetric[] = [];

  for (let j = 0; j < nFeatures; j++) {
    const column = featureMatrix.data.map((row) => row[j]);
    const featureName = featureMatrix.featureNames[j] ?? `feature_${j}`;

    // Compute variance
    const mean = column.reduce((a, b) => a + b, 0) / nSamples;
    const variance =
      column.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / nSamples;

    // Compute coverage (fraction non-zero)
    const nonZeroCount = column.filter((x) => x !== 0).length;
    const coverage = nonZeroCount / nSamples;

    // Compute correlation with target
    let correlation = 0;
    if (featureMatrix.targets.length === nSamples && variance > 0) {
      const targetMean = featureMatrix.targets.reduce((a, b) => a + b, 0) / nSamples;
      const covariance =
        column.reduce((sum, x, i) => sum + (x - mean) * (featureMatrix.targets[i] - targetMean), 0) /
        nSamples;
      const targetVariance =
        featureMatrix.targets.reduce((sum, y) => sum + Math.pow(y - targetMean, 2), 0) /
        nSamples;
      if (targetVariance > 0) {
        correlation = Math.abs(covariance / Math.sqrt(variance * targetVariance));
      }
    }

    // Assign quality tier
    let quality: 'high' | 'medium' | 'low' = 'low';
    if (variance > 0.1 && correlation > 0.3) {
      quality = 'high';
    } else if (variance > 0.01 || correlation > 0.1) {
      quality = 'medium';
    }

    metrics.push({
      feature: featureName,
      variance,
      coverage,
      correlation,
      quality,
    });
  }

  return metrics;
}
