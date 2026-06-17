/**
 * Feature extraction for outcome prediction (classification).
 *
 * Extracts trace-level features optimized for predicting case outcomes
 * (success vs failure, normal vs anomalous completion, etc.)
 * based on process characteristics and patterns.
 */

import { z } from 'zod';
import type { FeatureMatrix } from './types.js';

// ---------------------------------------------------------------------------
// OutcomeFeatures
// ---------------------------------------------------------------------------

export const OutcomeFeaturesSchema = z.object({
  case_id: z.string(),
  trace_length: z.number(),
  elapsed_time: z.number(),
  activity_frequencies: z.array(z.number()),
  avg_inter_event_time: z.number(),
  rework_ratio: z.number(),
  cycle_count: z.number(),
  resource_variance: z.number(),
  unique_activities: z.number(),
  /** Target label (success, failure, anomalous, normal, etc.) */
  outcome: z.string().optional(),
});

/**
 * Outcome feature definition.
 *
 * Extracts the following features from each trace:
 * - trace_length: Number of activities in the trace
 * - elapsed_time: Total time from start to finish (milliseconds)
 * - activity_frequencies: Vector of activity occurrence counts
 * - avg_inter_event_time: Mean time between consecutive events (milliseconds)
 * - rework_ratio: Fraction of repeated activities (0-1)
 * - cycle_count: Number of rework instances (repeated activity pairs)
 * - resource_variance: Diversity of resources handling the trace (0-1)
 * - unique_activities: Count of distinct activities in trace
 */
export type OutcomeFeatures = z.infer<typeof OutcomeFeaturesSchema>;

/**
 * Extract features optimized for outcome prediction.
 *
 * Input: Feature matrix from wasm.extract_case_features() with keys:
 *   - case_id: string
 *   - trace_length: number
 *   - elapsed_time: number (milliseconds)
 *   - activity_counts: Record<activity_name, count>
 *   - rework_count: number
 *   - avg_inter_event_time: number (milliseconds)
 *   - unique_activities?: number (optional, derived from activity_counts)
 *   - outcome?: string (optional, for supervised learning)
 *
 * Output: FeatureMatrix ready for classification.
 *
 * @param featuresJson - Array of feature objects from wasm.extract_case_features()
 * @returns FeatureMatrix ready for classification
 */
export function extractOutcomeFeatures(
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
          message: 'No features provided for outcome extraction',
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
  const labels: string[] = [];

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
    'rework_ratio',
    'cycle_count',
    'resource_variance',
    'unique_activities',
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

    // Compute rework_ratio: rework_count / trace_length (bounded [0,1])
    const reworkRatio = traceLength > 0 ? Math.min(1.0, cycleCount / traceLength) : 0;

    // Compute resource_variance: entropy of resource distribution (0-1)
    // For now, approximate as a function of activity diversity
    const activityCounts = (row.activity_counts ?? {}) as Record<string, number>;
    const uniqueActivities = Object.keys(activityCounts).length;
    const totalActivityCount = Object.values(activityCounts).reduce((a, b) => a + b, 0);
    let resourceVariance = 0;
    if (uniqueActivities > 1 && totalActivityCount > 0) {
      // Simplified: higher diversity → higher variance (0-1)
      resourceVariance = Math.min(1.0, uniqueActivities / Math.max(1, totalActivityCount));
    }

    // Feature vector: numeric features + one-hot activity encoding
    const features: number[] = [
      traceLength,
      elapsedTime,
      avgInterEventTime,
      reworkRatio,
      cycleCount,
      resourceVariance,
      uniqueActivities,
    ];

    // One-hot encode activity frequencies
    for (const activity of activityList) {
      features.push(Math.max(0, Number(activityCounts[activity] ?? 0)));
    }

    data.push(features);

    // Extract label (outcome if available)
    const outcome = String(row.outcome ?? row.label ?? 'unknown');
    labels.push(outcome);
  }

  return {
    data,
    featureNames,
    caseIds,
    targets: [], // Not used for classification
    labels,
  };
}

/**
 * Normalize outcome features to [0,1] range per feature.
 *
 * Handles edge cases:
 * - All-zero feature → stays zero
 * - Single value → stays unchanged
 * - Zero-variance column → stays zero
 *
 * @param featureMatrix - Original feature matrix
 * @returns Normalized matrix with per-feature min-max scaling
 */
export function normalizeOutcomeFeatures(featureMatrix: FeatureMatrix): FeatureMatrix {
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

  return {
    data: normalized,
    featureNames: featureMatrix.featureNames,
    caseIds: featureMatrix.caseIds,
    targets: featureMatrix.targets,
    labels: featureMatrix.labels,
  };
}

/**
 * Assess feature quality for outcome prediction.
 *
 * Returns metrics for each feature:
 * - variance: Numeric variance (0 for constant features)
 * - coverage: Fraction of non-zero values
 * - classVariability: How well feature separates outcome classes
 *
 * @param featureMatrix - Feature matrix with labels (outcomes)
 * @returns Array of feature quality objects
 */
export const OutcomeFeatureQualityMetricSchema = z.object({
  feature: z.string(),
  variance: z.number(),
  coverage: z.number(),
  classVariability: z.number(),
  /** Based on variance + class separability */
  quality: z.enum(['high', 'medium', 'low']),
});

export type OutcomeFeatureQualityMetric = z.infer<typeof OutcomeFeatureQualityMetricSchema>;

export function assessOutcomeFeatureQuality(
  featureMatrix: FeatureMatrix
): OutcomeFeatureQualityMetric[] {
  if (featureMatrix.data.length === 0) {
    return [];
  }

  const nFeatures = featureMatrix.data[0].length;
  const nSamples = featureMatrix.data.length;
  const metrics: OutcomeFeatureQualityMetric[] = [];

  // Group samples by outcome label
  const outcomeGroups: Record<string, number[][]> = {};
  for (let i = 0; i < nSamples; i++) {
    const label = featureMatrix.labels[i] ?? 'unknown';
    if (!outcomeGroups[label]) {
      outcomeGroups[label] = [];
    }
    outcomeGroups[label].push(featureMatrix.data[i]);
  }

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

    // Compute class separability (F-statistic approximation)
    let classVariability = 0;
    if (Object.keys(outcomeGroups).length > 1 && variance > 0) {
      let betweenGroupVariance = 0;
      for (const label in outcomeGroups) {
        const groupValues = outcomeGroups[label].map((row) => row[j]);
        const groupMean = groupValues.reduce((a, b) => a + b, 0) / groupValues.length;
        betweenGroupVariance += groupValues.length * Math.pow(groupMean - mean, 2);
      }
      betweenGroupVariance /= nSamples;
      classVariability = Math.min(1.0, betweenGroupVariance / (variance + 1e-10));
    }

    // Assign quality tier
    let quality: 'high' | 'medium' | 'low' = 'low';
    if (variance > 0.1 && classVariability > 0.3) {
      quality = 'high';
    } else if (variance > 0.01 || classVariability > 0.1) {
      quality = 'medium';
    }

    metrics.push({
      feature: featureName,
      variance,
      coverage,
      classVariability,
      quality,
    });
  }

  return metrics;
}
