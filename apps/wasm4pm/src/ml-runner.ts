/**
 * ml-runner.ts
 * Shared ML execution logic used by both `wpm ml` and `wpm run`.
 *
 * Implements 5-layer precedence for ML parameters:
 * 1. CLI arguments (highest priority)
 * 2. Config file (wasm4pm.toml/json)
 * 3. Environment variables (WASM4PM_ML_*)
 * 4. Defaults (lowest priority)
 */

import {
  classifyTraces,
  clusterTraces,
  regressRemainingTime,
  forecastSeries,
  detectEnhancedAnomalies,
  reduceFeaturesPCA,
  assessFeatureQuality,
  pickBestAlgorithm,
  findBestParams,
  suggestSearchSpace,
} from '@wasm4pm/ml';
import type { ClassificationMethod, ClusteringMethod } from '@wasm4pm/ml';
import { Instrumentation } from '@wasm4pm/observability';
import type { OtelEvent, RequiredOtelAttributes } from '@wasm4pm/observability';
import type { Config } from '@wasm4pm/config';

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
  autoSelect?: boolean;
  k?: number | string;
  targetKey?: string;
  forecastPeriods?: number | string;
  nComponents?: number | string;
  eps?: number | string;
  smoothingMethod?: 'sma' | 'ema';
  useExponential?: boolean;
  /**
   * Enable hyperparameter tuning via grid search.
   * When true, finds optimal parameters for the task via k-fold CV.
   */
  tune?: boolean;
  /**
   * Number of CV folds for hyperparameter tuning (default: 3).
   */
  cvFolds?: number;
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
 * Helper: Implement 5-layer precedence for ML method selection.
 *
 * Precedence (highest to lowest):
 * 1. CLI: options.method
 * 2. Config file: config.ml.<task>.model or config.ml.<task>.method
 * 3. Environment: WASM4PM_ML_<TASK>_MODEL env var
 * 4. Defaults: taskDefaults[task]
 */
function resolveMethodWithPrecedence(
  task: MlTask,
  options: MlTaskOptions,
  config: Config | undefined,
  env: NodeJS.ProcessEnv | undefined,
  taskDefaults: Record<MlTask, string>
): string {
  // Layer 1: CLI arguments (highest priority)
  if (options.method) {
    return options.method;
  }

  // Layer 2: Config file
  if (config?.ml) {
    if (task === 'classify' && config.ml.classify?.model) {
      return config.ml.classify.model;
    }
    if (task === 'cluster' && config.ml.cluster?.method) {
      return config.ml.cluster.method;
    }
    if (task === 'forecast' && config.ml.forecast?.method) {
      return config.ml.forecast.method;
    }
    if (task === 'anomaly' && config.ml.anomaly?.method) {
      return config.ml.anomaly.method;
    }
    if (task === 'regress' && config.ml.regress?.method) {
      return config.ml.regress.method;
    }
  }

  // Layer 3: Environment variables
  const envKey = `WASM4PM_ML_${task.toUpperCase()}_MODEL`;
  if (env?.[envKey]) {
    return env[envKey];
  }

  // Layer 4: Defaults
  return taskDefaults[task];
}

/**
 * Execute a single ML task against a loaded WASM event log.
 *
 * @param wasm - WASM module instance (must have extract_case_features and detect_drift)
 * @param task - ML task to execute
 * @param logHandle - Handle from wasm.load_eventlog_from_xes()
 * @param activityKey - Activity attribute key (default: concept:name)
 * @param options - ML-specific options
 * @param config - Optional config object (used for 5-layer precedence)
 * @param env - Optional environment variables (used for 5-layer precedence)
 * @returns ML result as a plain object
 */
export async function executeMlTask(
  wasm: Record<string, any>,
  task: MlTask,
  logHandle: string,
  activityKey: string,
  options: MlTaskOptions = {},
  config?: Config,
  env?: NodeJS.ProcessEnv
): Promise<Record<string, unknown>> {
  const taskDefaults: Record<MlTask, string> = {
    classify: 'knn',
    cluster: 'kmeans',
    forecast: 'linear',
    anomaly: 'ewma',
    regress: 'linear',
    pca: 'svd',
  };

  // If instrumentation is configured, wrap the entire task dispatch in a span.
  if (options.instrumentation) {
    const { traceId, requiredAttrs, emit, parentSpanId } = options.instrumentation;
    // Resolve method using precedence chain
    const method = resolveMethodWithPrecedence(task, options, config, env, taskDefaults);
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
      () => executeMlTask(wasm, task, logHandle, activityKey, inner, config, env),
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
      // Defensive: only assess quality if features have the expected structure
      if (features && typeof features === 'object' && 'data' in features) {
        const quality = assessFeatureQuality(features);
        if (quality.score < 0.7) {
          console.warn(
            `[Warning] Feature quality score is ${quality.score.toFixed(2)} (< 0.7). ` +
              `Recommendations: ${quality.recommendations.join('; ')}`
          );
        }
      }
      const k = parseInt(String(options.k ?? '5'), 10);
      if (Number.isNaN(k) || k <= 0)
        throw new Error('Classification parameter k must be a positive number');
      // Algorithm selection: precedence chain > auto-select > default
      const method = resolveMethodWithPrecedence(
        'classify',
        options,
        config,
        env,
        taskDefaults
      );
      let selectedMethod: ClassificationMethod = (method as ClassificationMethod) || 'knn';
      if (
        !options.method &&
        !config?.ml?.classify?.model &&
        !env?.WASM4PM_ML_CLASSIFY_MODEL &&
        options.autoSelect
      ) {
        selectedMethod = pickBestAlgorithm('classification', features) as ClassificationMethod;
      }

      // Hyperparameter tuning if --tune flag is set
      if (options.tune) {
        console.log('[Tuning] Starting grid search for classification parameters...');
        const searchSpace = suggestSearchSpace(
          'classify',
          features.data.length,
          features.featureNames.length
        );
        const cvFolds = options.cvFolds ?? 3;
        const result = await findBestParams('classify', features, features.labels, searchSpace, cvFolds);
        console.log(
          `[Tuning] Evaluated ${result.evaluatedConfigs} parameter configurations`
        );
        console.log(`[Tuning] Best params: method=${result.bestParams.method}, k=${result.bestParams.k}`);
        console.log(
          `[Tuning] Best accuracy: ${((result.bestMetrics.accuracy || 0) * 100).toFixed(2)}%`
        );
        if (result.bestMetrics.cvMeanAccuracy !== undefined) {
          console.log(
            `[Tuning] CV mean accuracy: ${((result.bestMetrics.cvMeanAccuracy || 0) * 100).toFixed(2)}%`
          );
          console.log(
            `[Tuning] CV std accuracy: ${((result.bestMetrics.cvStdAccuracy || 0) * 100).toFixed(2)}%`
          );
        }

        // Run classification with tuned parameters
        const tunedK = typeof result.bestParams.k === 'number' ? result.bestParams.k : k;
        selectedMethod = (result.bestParams.method as ClassificationMethod) || selectedMethod;
        return (await classifyTraces(features, {
          method: selectedMethod,
          k: tunedK,
        })) as unknown as Record<string, unknown>;
      }

      return (await classifyTraces(features, {
        method: selectedMethod,
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
      // Algorithm selection: precedence chain > auto-select > default
      const method = resolveMethodWithPrecedence(
        'cluster',
        options,
        config,
        env,
        taskDefaults
      );
      let selectedMethod: ClusteringMethod = (method as ClusteringMethod) || 'kmeans';
      if (
        !options.method &&
        !config?.ml?.cluster?.method &&
        !env?.WASM4PM_ML_CLUSTER_MODEL &&
        options.autoSelect
      ) {
        selectedMethod = pickBestAlgorithm('clustering', features) as ClusteringMethod;
      }

      // Hyperparameter tuning if --tune flag is set
      if (options.tune) {
        console.log('[Tuning] Starting grid search for clustering parameters...');
        const searchSpace = suggestSearchSpace(
          'cluster',
          features.data.length,
          features.featureNames.length
        );
        const cvFolds = options.cvFolds ?? 3;
        const result = await findBestParams('cluster', features, undefined, searchSpace, cvFolds);
        console.log(
          `[Tuning] Evaluated ${result.evaluatedConfigs} parameter configurations`
        );
        console.log(
          `[Tuning] Best params: method=${result.bestParams.method}, k=${result.bestParams.k}, eps=${result.bestParams.eps}`
        );
        if (result.bestMetrics.silhouetteScore !== undefined) {
          console.log(
            `[Tuning] Best silhouette score: ${result.bestMetrics.silhouetteScore.toFixed(3)}`
          );
        }
        if (result.bestMetrics.inertia !== undefined) {
          console.log(`[Tuning] Best inertia: ${result.bestMetrics.inertia.toFixed(2)}`);
        }

        // Run clustering with tuned parameters
        const tunedK = typeof result.bestParams.k === 'number' ? result.bestParams.k : k;
        const tunedEps = typeof result.bestParams.eps === 'number' ? result.bestParams.eps : eps;
        selectedMethod = (result.bestParams.method as ClusteringMethod) || selectedMethod;
        return (await clusterTraces(features, {
          method: selectedMethod,
          k: tunedK,
          eps: tunedEps,
        })) as unknown as Record<string, unknown>;
      }

      return (await clusterTraces(features, {
        method: selectedMethod,
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

      // Hyperparameter tuning if --tune flag is set
      if (options.tune) {
        console.log('[Tuning] Starting grid search for regression parameters...');
        const searchSpace = suggestSearchSpace(
          'regress',
          features.data.length,
          features.featureNames.length
        );
        const cvFolds = options.cvFolds ?? 3;
        const result = await findBestParams('regress', features, undefined, searchSpace, cvFolds);
        console.log(
          `[Tuning] Evaluated ${result.evaluatedConfigs} parameter configurations`
        );
        console.log(`[Tuning] Best params: method=${result.bestParams.method}, degree=${result.bestParams.degree}`);
        if (result.bestMetrics.rSquared !== undefined) {
          console.log(`[Tuning] Best R²: ${result.bestMetrics.rSquared.toFixed(3)}`);
        }
        if (result.bestMetrics.rmse !== undefined) {
          console.log(`[Tuning] Best RMSE: ${result.bestMetrics.rmse.toFixed(2)}`);
        }

        // Run regression with tuned method
        const tunedMethod = result.bestParams.method || options.method;
        return (await regressRemainingTime(features, {
          method: tunedMethod as any,
        })) as unknown as Record<string, unknown>;
      }

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
