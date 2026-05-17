/**
 * ml-runner.ts
 * Shared ML execution logic used by both `wpm ml` and `wpm run`.
 *
 * Extracts the core ML task dispatch from commands/ml.ts so it can be
 * reused without CLI-specific formatting concerns.
 *
 * QoL improvements (iter16):
 *   1. Quality summary — every task result carries a `_qualitySummary` field
 *      with a task-appropriate quality banner (analogous to van der Aalst's four
 *      quality dimensions) so the human formatter can render a glanceable verdict.
 *   2. Pre-flight log-size validation — degenerate inputs are caught before they
 *      produce cryptic internal errors. Actionable recommendations are included.
 *   3. Class distribution summary for `classify` — practitioner can immediately
 *      see whether the model is finding signal or predicting one class for everything.
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
import { Instrumentation } from '@wasm4pm/observability';
import type { OtelEvent, RequiredOtelAttributes } from '@wasm4pm/observability';

// ─────────────────────────────────────────────────────────────────────────────
// Task registry
// ─────────────────────────────────────────────────────────────────────────────

export const VALID_ML_TASKS = [
  'classify',
  'cluster',
  'forecast',
  'anomaly',
  'regress',
  'pca',
] as const;
export type MlTask = (typeof VALID_ML_TASKS)[number];

// ─────────────────────────────────────────────────────────────────────────────
// Task options
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Quality summary (Gap 1)
//
// Task-appropriate quality signals rendered as a glanceable banner.
// Analogous to van der Aalst's four quality dimensions but adapted for ML:
//   - classify:  accuracy proxy (mean confidence), class count, trace count
//   - cluster:   cohesion (inertia), cluster count, noise ratio
//   - forecast:  trend direction, trend strength, forecast horizon
//   - anomaly:   anomaly rate, peak count, window count
//   - regress:   R-squared (goodness of fit), RMSE, MAE
//   - pca:       total variance explained, component count
// ─────────────────────────────────────────────────────────────────────────────

export interface MlQualitySummary {
  /** Primary quality signal label (e.g. "R-sq", "Mean confidence", "Variance explained") */
  primaryLabel: string;
  /** Primary quality value as a display string */
  primaryValue: string;
  /** Whether the primary value is in a "good" range (used for rendering) */
  primaryGood: boolean;
  /** Secondary signals as key-value pairs */
  secondary: Array<{ label: string; value: string }>;
  /** Human-readable one-line interpretation of the result quality */
  interpretation: string;
}

/**
 * Compute a quality summary from a raw ML task result.
 * Never throws — degrades gracefully if expected fields are absent.
 */
export function computeQualitySummary(
  task: MlTask,
  result: Record<string, unknown>
): MlQualitySummary {
  switch (task) {
    case 'classify': {
      const predictions = result.predictions as Array<{ confidence: number }> | undefined;
      const info = result.modelInfo as Record<string, unknown> | undefined;
      const n = (info?.traceCount as number) ?? predictions?.length ?? 0;
      const classCount = (info?.classCount as number) ?? 0;
      if (!predictions || predictions.length === 0) {
        return {
          primaryLabel: 'Mean confidence',
          primaryValue: 'n/a',
          primaryGood: false,
          secondary: [{ label: 'Traces', value: String(n) }],
          interpretation: 'No predictions produced — check target key and log size.',
        };
      }
      const meanConf = predictions.reduce((s, p) => s + p.confidence, 0) / predictions.length;
      const good = meanConf >= 0.7;
      return {
        primaryLabel: 'Mean confidence',
        primaryValue: `${(meanConf * 100).toFixed(1)}%`,
        primaryGood: good,
        secondary: [
          { label: 'Classes', value: String(classCount) },
          { label: 'Traces', value: String(n) },
        ],
        interpretation: good
          ? `Strong signal: model separates ${classCount} class(es) with ${(meanConf * 100).toFixed(0)}% mean confidence.`
          : `Weak signal: ${(meanConf * 100).toFixed(0)}% mean confidence. Consider more traces or a different method.`,
      };
    }

    case 'cluster': {
      const info = result.modelInfo as Record<string, unknown> | undefined;
      const k = (result.clusterCount as number) ?? 0;
      const noise = (result.noiseCount as number) ?? 0;
      const n = (info?.traceCount as number) ?? 0;
      const inertia = info?.inertia as number | undefined;
      const noiseRatio = n > 0 ? noise / n : 0;
      const good = noiseRatio < 0.2;
      return {
        primaryLabel: 'Noise ratio',
        primaryValue: n > 0 ? `${(noiseRatio * 100).toFixed(1)}%` : 'n/a',
        primaryGood: good,
        secondary: [
          { label: 'Clusters', value: String(k) },
          { label: 'Traces', value: String(n) },
          ...(inertia !== undefined ? [{ label: 'Inertia', value: inertia.toFixed(2) }] : []),
        ],
        interpretation: good
          ? `${k} cluster(s) found, ${(noiseRatio * 100).toFixed(0)}% noise — cohesive grouping.`
          : `High noise (${(noiseRatio * 100).toFixed(0)}%). Try increasing eps or reducing k.`,
      };
    }

    case 'forecast': {
      const trend = result.trend as
        | { direction?: string; slope?: number; strength?: number }
        | undefined;
      const forecast = result.forecast as number[] | undefined;
      const strength = trend?.strength ?? 0;
      const good = strength >= 0.5;
      return {
        primaryLabel: 'Trend strength',
        primaryValue: strength.toFixed(2),
        primaryGood: good,
        secondary: [
          { label: 'Direction', value: trend?.direction ?? 'unknown' },
          { label: 'Horizon', value: forecast ? String(forecast.length) : '0' },
        ],
        interpretation: good
          ? `${trend?.direction ?? 'Unknown'} trend (strength ${strength.toFixed(2)}) — forecast is reliable.`
          : `Weak trend (strength ${strength.toFixed(2)}) — forecast has low confidence.`,
      };
    }

    case 'anomaly': {
      const peakIndices = result.peakIndices as number[] | undefined;
      const originalLength = (result.originalLength as number) ?? 0;
      const anomalyCount = peakIndices?.length ?? 0;
      const rate = originalLength > 0 ? anomalyCount / originalLength : 0;
      const good = rate < 0.2;
      return {
        primaryLabel: 'Anomaly rate',
        primaryValue: originalLength > 0 ? `${(rate * 100).toFixed(1)}%` : 'n/a',
        primaryGood: good,
        secondary: [
          { label: 'Peaks', value: String(anomalyCount) },
          { label: 'Windows', value: String(originalLength) },
        ],
        interpretation: good
          ? `${anomalyCount} anomalous window(s) in ${originalLength} — process appears stable.`
          : `High anomaly rate (${(rate * 100).toFixed(0)}%) — investigate drift windows.`,
      };
    }

    case 'regress': {
      const r2 = result.rSquared as number | undefined;
      const rmse = result.rmse as number | undefined;
      const maeVal = result.mae as number | undefined;
      if (r2 === undefined) {
        return {
          primaryLabel: 'R-squared',
          primaryValue: 'n/a',
          primaryGood: false,
          secondary: [],
          interpretation: 'Regression failed — insufficient traces.',
        };
      }
      const good = r2 >= 0.6;
      return {
        primaryLabel: 'R-squared',
        primaryValue: r2.toFixed(4),
        primaryGood: good,
        secondary: [
          ...(rmse !== undefined ? [{ label: 'RMSE', value: rmse.toFixed(2) }] : []),
          ...(maeVal !== undefined ? [{ label: 'MAE', value: maeVal.toFixed(2) }] : []),
        ],
        interpretation: good
          ? `Good fit (R=${r2.toFixed(2)}): feature explains ${(r2 * 100).toFixed(0)}% of cycle-time variance.`
          : `Weak fit (R=${r2.toFixed(2)}): consider more features or a non-linear method.`,
      };
    }

    case 'pca': {
      const explainedVariance = result.explainedVariance as number[] | undefined;
      const nComp = (result.nComponents as number) ?? 0;
      const totalVariance = explainedVariance
        ? explainedVariance.reduce((s, v) => s + v, 0)
        : undefined;
      const good = totalVariance !== undefined && totalVariance >= 0.7;
      return {
        primaryLabel: 'Variance explained',
        primaryValue: totalVariance !== undefined ? `${(totalVariance * 100).toFixed(1)}%` : 'n/a',
        primaryGood: good,
        secondary: [
          { label: 'Components', value: String(nComp) },
          ...(explainedVariance
            ? explainedVariance.map((v, i) => ({
                label: `PC${i + 1}`,
                value: `${(v * 100).toFixed(1)}%`,
              }))
            : []),
        ],
        interpretation: good
          ? `${nComp} component(s) capture ${(totalVariance! * 100).toFixed(0)}% of variance — good dimensionality reduction.`
          : `Only ${totalVariance !== undefined ? (totalVariance * 100).toFixed(0) : '?'}% variance explained — consider more components.`,
      };
    }

    default:
      return {
        primaryLabel: 'Quality',
        primaryValue: 'n/a',
        primaryGood: false,
        secondary: [],
        interpretation: 'Unknown task.',
      };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pre-flight log-size validation (Gap 2)
//
// Minimum trace requirements per ML task, used to catch degenerate inputs
// before they produce cryptic internal errors.
// ─────────────────────────────────────────────────────────────────────────────

const TASK_MINIMUM_TRACES: Record<MlTask, number> = {
  classify: 4,   // kNN needs at least k+1 (default k=5), warn early at 4
  cluster: 3,    // k-means default k=3 needs at least 3 points
  forecast: 2,   // drift series needs at least 2 windows
  anomaly: 3,    // peak detection needs at least 3 points
  regress: 2,    // linear regression requires at least 2 points
  pca: 2,        // PCA requires at least 2 observations and 2 features
};

/**
 * Recommended tasks when the log is too small for the requested task.
 * Shown in the actionable error message so the practitioner knows what to try.
 */
const TASK_RECOMMENDATIONS: Record<MlTask, string[]> = {
  classify: ['cluster', 'pca'],
  cluster: ['pca', 'anomaly'],
  forecast: ['anomaly'],
  anomaly: ['forecast'],
  regress: ['classify', 'cluster'],
  pca: ['cluster'],
};

/**
 * Execute a single ML task against a loaded WASM event log.
 *
 * Improvements over the original:
 *  - Pre-flight log-size check with actionable recommendations (Gap 2)
 *  - Quality summary attached as `_qualitySummary` on every result (Gap 1)
 *  - Class distribution attached as `_classDistribution` on classify results (Gap 3)
 *
 * @param wasm - WASM module instance (must have extract_case_features and detect_drift)
 * @param task - ML task to execute
 * @param logHandle - Handle from wasm.load_eventlog_from_xes()
 * @param activityKey - Activity attribute key (default: concept:name)
 * @param options - ML-specific options
 * @returns ML result as a plain object, always with a `_qualitySummary` field
 */
export async function executeMlTask(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { parentSpanId, inputAttributes: inputAttributes as any }
    );
  }

  // ── Pre-flight: check trace count for tasks that operate on case features ──
  // forecast and anomaly operate on drift windows (not case features), so we
  // skip the trace-count guard for them — their limit is implicit in detect_drift.
  if (task !== 'forecast' && task !== 'anomaly') {
    try {
      const statsRaw = wasm.analyze_statistics(logHandle);
      const stats = typeof statsRaw === 'string' ? JSON.parse(statsRaw) : statsRaw;
      const traceCount: number =
        (stats?.trace_count as number) ?? (stats?.traceCount as number) ?? (stats?.num_traces as number) ?? 0;
      const minimum = TASK_MINIMUM_TRACES[task];
      if (traceCount > 0 && traceCount < minimum) {
        const recs = TASK_RECOMMENDATIONS[task];
        throw new Error(
          `Task "${task}" requires at least ${minimum} traces, but the log has ${traceCount}. ` +
            `Consider: ${recs.join(', ')}.`
        );
      }
    } catch (e) {
      // Re-throw our own pre-flight errors; swallow wasm.analyze_statistics failures
      if (e instanceof Error && e.message.includes('requires at least')) throw e;
      // If analyze_statistics is unavailable we proceed without the guard
    }
  }

  // ── Task dispatch ──────────────────────────────────────────────────────────
  let rawResult: Record<string, unknown>;

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
      const k = parseInt(String(options.k ?? '5'), 10);
      if (Number.isNaN(k) || k <= 0)
        throw new Error('Classification parameter k must be a positive number');
      rawResult = (await classifyTraces(features, {
        method: (options.method as ClassificationMethod) || 'knn',
        k,
      })) as unknown as Record<string, unknown>;
      // Gap 3: attach class distribution so formatter can render a signal-check table
      rawResult = attachClassDistribution(rawResult);
      break;
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
      rawResult = (await clusterTraces(features, {
        method: (options.method as ClusteringMethod) || 'kmeans',
        k,
        eps,
      })) as unknown as Record<string, unknown>;
      break;
    }

    case 'forecast': {
      const driftRaw = wasm.detect_drift(logHandle, activityKey, 5);
      const driftResult = typeof driftRaw === 'string' ? JSON.parse(driftRaw) : driftRaw;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const distances = (driftResult?.drifts ?? []).map((d: any) => d.distance ?? 0);
      const forecastPeriods = parseInt(String(options.forecastPeriods ?? '5'), 10);
      if (Number.isNaN(forecastPeriods) || forecastPeriods <= 0)
        throw new Error('Forecast parameter forecastPeriods must be a positive number');
      rawResult = (await forecastSeries(distances, {
        forecastPeriods,
        useExponential: options.useExponential,
      })) as unknown as Record<string, unknown>;
      break;
    }

    case 'anomaly': {
      const driftRaw = wasm.detect_drift(logHandle, activityKey, 10);
      const driftResult = typeof driftRaw === 'string' ? JSON.parse(driftRaw) : driftRaw;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const distances = (driftResult?.drifts ?? []).map((d: any) => d.distance ?? 0);
      rawResult = (await detectEnhancedAnomalies(distances, {
        smoothingMethod: options.smoothingMethod,
      })) as unknown as Record<string, unknown>;
      break;
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
      rawResult = (await regressRemainingTime(features, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        method: options.method as any,
      })) as unknown as Record<string, unknown>;
      break;
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
      rawResult = (await reduceFeaturesPCA(features, {
        nComponents,
      })) as unknown as Record<string, unknown>;
      break;
    }

    default:
      throw new Error(`Unhandled ML task: ${task}`);
  }

  // ── Attach quality summary to every result (Gap 1) ─────────────────────────
  rawResult._qualitySummary = computeQualitySummary(task, rawResult);
  return rawResult;
}

// ─────────────────────────────────────────────────────────────────────────────
// Gap 3: Class distribution helper
//
// Computes a per-class breakdown from classification predictions and attaches
// it as `_classDistribution` so the human formatter can render a signal-check
// table without traversing the raw predictions array twice.
// ─────────────────────────────────────────────────────────────────────────────

function attachClassDistribution(
  result: Record<string, unknown>
): Record<string, unknown> {
  const predictions = result.predictions as
    | Array<{ caseId: string; predicted: string; confidence: number }>
    | undefined;
  if (!predictions || predictions.length === 0) return result;

  const dist = new Map<string, { count: number; totalConf: number }>();
  for (const p of predictions) {
    const entry = dist.get(p.predicted) ?? { count: 0, totalConf: 0 };
    entry.count++;
    entry.totalConf += p.confidence;
    dist.set(p.predicted, entry);
  }

  const distribution = Array.from(dist.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .map(([className, { count, totalConf }]) => ({
      className,
      count,
      pct: count / predictions.length,
      meanConf: totalConf / count,
    }));

  return { ...result, _classDistribution: distribution };
}
