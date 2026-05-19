/**
 * ml-runner.ts
 * Shared ML execution logic used by both `wpm ml` and `wpm run`.
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
  assessFeatureQuality,
} from '@wasm4pm/ml';
import type { ClassificationMethod, ClusteringMethod } from '@wasm4pm/ml';
import { Instrumentation } from '@wasm4pm/observability';
import type { OtelEvent, RequiredOtelAttributes } from '@wasm4pm/observability';

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
  /**
   * Optional OTEL instrumentation. When provided, every ML task execution
   * emits a `ml.<task>` start/complete span pair via {@link Instrumentation.instrumentMlExecution}.
   * Emission is non-blocking: exporter exceptions are swallowed.
   */
  instrumentation?: {
    traceId: string;
    requiredAttrs: RequiredOtelAttributes;
    emit: (event: OtelEvent) => void;
    parentSpanId?: string;
  };
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
  // If instrumentation is configured, wrap the entire task dispatch in a span.
  if (options.instrumentation) {
    const { traceId, requiredAttrs, emit, parentSpanId } = options.instrumentation;
    const method =
      (options.method as string) ||
      (
        {
          classify: 'knn',
          cluster: 'kmeans',
          forecast: 'linear',
          anomaly: 'ewma',
          regress: 'linear',
          pca: 'svd',
        } as Record<MlTask, string>
      )[task];
    const inputAttributes: Record<string, unknown> = {};
    const k = options.k !== undefined ? Number(options.k) : undefined;
    if (k !== undefined && !Number.isNaN(k)) inputAttributes.parameterK = k;
    const eps = options.eps !== undefined ? Number(options.eps) : undefined;
    if (eps !== undefined && !Number.isNaN(eps)) inputAttributes.parameterEps = eps;
    const nc = options.nComponents !== undefined ? Number(options.nComponents) : undefined;
    if (nc !== undefined && !Number.isNaN(nc)) inputAttributes.parameterNComponents = nc;
    const fp = options.forecastPeriods !== undefined ? Number(options.forecastPeriods) : undefined;
    if (fp !== undefined && !Number.isNaN(fp)) inputAttributes.parameterForecastPeriods = fp;

    // Recurse without instrumentation to avoid infinite loop.
    const inner: MlTaskOptions = { ...options, instrumentation: undefined };
    return Instrumentation.instrumentMlExecution(
      traceId,
      task,
      method,
      requiredAttrs,
      () => executeMlTask(wasm, task, logHandle, activityKey, inner),
      emit,
      { parentSpanId, inputAttributes: inputAttributes as any }
    );
  }

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
      const quality = assessFeatureQuality(features);
      if (quality.score < 0.7) {
        console.warn(
          `[Warning] Feature quality score is ${quality.score.toFixed(2)} (< 0.7). ` +
          `Recommendations: ${quality.recommendations.join('; ')}`
        );
      }
      const k = parseInt(String(options.k ?? '5'), 10);
      if (Number.isNaN(k) || k <= 0)
        throw new Error('Classification parameter k must be a positive number');
      return (await classifyTraces(features, {
        method: (options.method as ClassificationMethod) || 'knn',
        k,
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
      const k = parseInt(String(options.k ?? '3'), 10);
      const eps = parseFloat(String(options.eps ?? '1.0'));
      if (Number.isNaN(k) || k <= 0)
        throw new Error('Clustering parameter k must be a positive number');
      if (Number.isNaN(eps) || eps <= 0)
        throw new Error('Clustering parameter eps must be a positive number');
      return (await clusterTraces(features, {
        method: (options.method as ClusteringMethod) || 'kmeans',
        k,
        eps,
      })) as unknown as Record<string, unknown>;
    }

    case 'forecast': {
      const driftRaw = wasm.detect_drift(logHandle, activityKey, 5);
      const driftResult = typeof driftRaw === 'string' ? JSON.parse(driftRaw) : driftRaw;
      const distances = (driftResult?.drifts ?? []).map((d: any) => d.distance ?? 0);
      const forecastPeriods = parseInt(String(options.forecastPeriods ?? '5'), 10);
      if (Number.isNaN(forecastPeriods) || forecastPeriods <= 0)
        throw new Error('Forecast parameter forecastPeriods must be a positive number');
      return (await forecastSeries(distances, {
        forecastPeriods,
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
      const nComponents = parseInt(String(options.nComponents ?? '2'), 10);
      if (Number.isNaN(nComponents) || nComponents <= 0)
        throw new Error('PCA parameter nComponents must be a positive number');
      return (await reduceFeaturesPCA(features, {
        nComponents,
      })) as unknown as Record<string, unknown>;
    }

    default:
      throw new Error(`Unhandled ML task: ${task}`);
  }
}
