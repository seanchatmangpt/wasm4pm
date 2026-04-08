/**
 * ml-runner.ts
 * Shared ML execution logic used by both `pmctl ml` and `pmctl run`.
 *
 * Extracts the core ML task dispatch from commands/ml.ts so it can be
 * reused without CLI-specific formatting concerns.
 */

import {
  classifyTraces,
  clusterTraces,
  regressRemainingTime,
  forecastSeries,
  detectEnhancedAnomalies,
  reduceFeaturesPCA,
} from '@wasm4pm/ml';
import type { ClassificationMethod, ClusteringMethod } from '@wasm4pm/ml';

export const VALID_ML_TASKS = [
  'classify',
  'cluster',
  'forecast',
  'anomaly',
  'regress',
  'pca',
] as const;
export type MlTask = (typeof VALID_ML_TASKS)[number];

export interface MlTaskOptions {
  method?: string;
  k?: number | string;
  targetKey?: string;
  forecastPeriods?: number | string;
  nComponents?: number | string;
  eps?: number | string;
  smoothingMethod?: 'sma' | 'ema';
  useExponential?: boolean;
}

/**
 * Execute a single ML task against a loaded WASM event log.
 *
 * @param wasm - WASM module instance (must have extract_case_features and detect_drift)
 * @param task - ML task to execute
 * @param logHandle - Handle from wasm.load_eventlog_from_xes()
 * @param activityKey - Activity attribute key (default: concept:name)
 * @param options - ML-specific options
 * @returns ML result as a plain object
 */
export async function executeMlTask(
  wasm: Record<string, any>,
  task: MlTask,
  logHandle: string,
  activityKey: string,
  options: MlTaskOptions = {}
): Promise<Record<string, unknown>> {
  switch (task) {
    case 'classify': {
      const configJson = JSON.stringify({
        features: [
          'trace_length',
          'elapsed_time',
          'activity_counts',
          'rework_count',
          'unique_activities',
          'avg_inter_event_time',
        ],
        target: options.targetKey || 'outcome',
      });
      const rawFeatures = wasm.extract_case_features(
        logHandle,
        activityKey,
        'time:timestamp',
        configJson
      );
      const features = typeof rawFeatures === 'string' ? JSON.parse(rawFeatures) : rawFeatures;
      return (await classifyTraces(features, {
        method: (options.method as ClassificationMethod) || 'knn',
        k: parseInt(String(options.k ?? '5'), 10) || 5,
      })) as unknown as Record<string, unknown>;
    }

    case 'cluster': {
      const configJson = JSON.stringify({
        features: [
          'trace_length',
          'elapsed_time',
          'activity_counts',
          'rework_count',
          'unique_activities',
        ],
      });
      const rawFeatures = wasm.extract_case_features(
        logHandle,
        activityKey,
        'time:timestamp',
        configJson
      );
      const features = typeof rawFeatures === 'string' ? JSON.parse(rawFeatures) : rawFeatures;
      return (await clusterTraces(features, {
        method: (options.method as ClusteringMethod) || 'kmeans',
        k: parseInt(String(options.k ?? '3'), 10) || 3,
        eps: parseFloat(String(options.eps ?? '1.0')) || 1.0,
      })) as unknown as Record<string, unknown>;
    }

    case 'forecast': {
      const driftRaw = wasm.detect_drift(logHandle, activityKey, 5);
      const driftResult = typeof driftRaw === 'string' ? JSON.parse(driftRaw) : driftRaw;
      const distances = (driftResult?.drifts ?? []).map((d: any) => d.distance ?? 0);
      return (await forecastSeries(distances, {
        forecastPeriods: parseInt(String(options.forecastPeriods ?? '5'), 10) || 5,
        useExponential: options.useExponential,
      })) as unknown as Record<string, unknown>;
    }

    case 'anomaly': {
      const driftRaw = wasm.detect_drift(logHandle, activityKey, 10);
      const driftResult = typeof driftRaw === 'string' ? JSON.parse(driftRaw) : driftRaw;
      const distances = (driftResult?.drifts ?? []).map((d: any) => d.distance ?? 0);
      return (await detectEnhancedAnomalies(distances, {
        smoothingMethod: options.smoothingMethod,
      })) as unknown as Record<string, unknown>;
    }

    case 'regress': {
      const configJson = JSON.stringify({
        features: [
          'trace_length',
          'elapsed_time',
          'rework_count',
          'unique_activities',
          'avg_inter_event_time',
        ],
        target: 'remaining_time',
      });
      const rawFeatures = wasm.extract_case_features(
        logHandle,
        activityKey,
        'time:timestamp',
        configJson
      );
      const features = typeof rawFeatures === 'string' ? JSON.parse(rawFeatures) : rawFeatures;
      return (await regressRemainingTime(features, {
        method: options.method as any,
      })) as unknown as Record<string, unknown>;
    }

    case 'pca': {
      const configJson = JSON.stringify({
        features: [
          'trace_length',
          'elapsed_time',
          'activity_counts',
          'rework_count',
          'unique_activities',
          'avg_inter_event_time',
        ],
      });
      const rawFeatures = wasm.extract_case_features(
        logHandle,
        activityKey,
        'time:timestamp',
        configJson
      );
      const features = typeof rawFeatures === 'string' ? JSON.parse(rawFeatures) : rawFeatures;
      return (await reduceFeaturesPCA(features, {
        nComponents: parseInt(String(options.nComponents ?? '2'), 10) || 2,
      })) as unknown as Record<string, unknown>;
    }

    default:
      throw new Error(`Unhandled ML task: ${task}`);
  }
}
