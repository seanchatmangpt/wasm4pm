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
  suggestClusteringK,
  detectLogCharacteristics,
  assessFeatureQuality,
} from '@wasm4pm/ml';
import type { ClassificationMethod, ClusteringMethod, RegressionMethod, QualityReport } from '@wasm4pm/ml';
import { Instrumentation } from '@wasm4pm/observability';
import type { OtelEvent, RequiredOtelAttributes } from '@wasm4pm/observability';

// ─────────────────────────────────────────────────────────────────────────────
// WASM result shapes
//
// Typed envelopes for the raw JSON that wasm.detect_drift() returns.  These
// replace the `(d: any)` casts in the forecast and anomaly dispatch branches
// and make the field access explicit so TypeScript will catch any WASM output
// shape change at compile time.
// ─────────────────────────────────────────────────────────────────────────────

/** One entry in the `drifts` array returned by wasm.detect_drift(). */
interface WasmDriftWindow {
  window_start?: number;
  window_end?: number;
  distance?: number;
  detected?: boolean;
}

/** Top-level shape returned by wasm.detect_drift(). */
interface WasmDriftResult {
  drifts?: WasmDriftWindow[];
  ewma?: number;
  threshold?: number;
}

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
      const rSquared = result.rSquared as number | undefined;
      const strength = trend?.strength ?? 0;
      // Primary quality signal: R² when available, otherwise trend strength
      const hasR2 = rSquared !== undefined;
      const primaryLabel = hasR2 ? 'R-squared' : 'Trend strength';
      const primaryValue = hasR2 ? rSquared!.toFixed(4) : strength.toFixed(2);
      const good = hasR2 ? rSquared! >= 0.7 : strength >= 0.5;
      const r2Narrative = hasR2
        ? rSquared! >= 0.9
          ? 'strong — trend is reliable'
          : rSquared! >= 0.7
            ? 'moderate — trend is a reasonable guide'
            : rSquared! >= 0.5
              ? 'weak — trend direction is meaningful but magnitude is uncertain'
              : rSquared! >= 0
                ? 'poor — use with caution, high variability'
                : 'negative — model worse than constant baseline'
        : undefined;
      return {
        primaryLabel,
        primaryValue,
        primaryGood: good,
        secondary: [
          { label: 'Direction', value: trend?.direction ?? 'unknown' },
          { label: 'Horizon', value: forecast ? String(forecast.length) : '0' },
          ...(hasR2 ? [{ label: 'Trend strength', value: strength.toFixed(2) }] : []),
        ],
        interpretation: hasR2
          ? `Model fit R²=${rSquared!.toFixed(2)} (${r2Narrative}). ${trend?.direction ?? 'Unknown'} trend over ${forecast?.length ?? 0} periods.`
          : good
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
  classify: 4, // kNN needs at least k+1 (default k=5), warn early at 4
  cluster: 3, // k-means default k=3 needs at least 3 points
  forecast: 2, // drift series needs at least 2 windows
  anomaly: 3, // peak detection needs at least 3 points
  regress: 2, // linear regression requires at least 2 points
  pca: 2, // PCA requires at least 2 observations and 2 features
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
        (stats?.trace_count as number) ??
        (stats?.traceCount as number) ??
        (stats?.num_traces as number) ??
        0;
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

      // Gap 2: Assess feature quality before classification
      const featureMatrix = buildFeatureMatrixFromExtraction(features);
      const qualityReport = assessFeatureQuality(featureMatrix.data);
      if (qualityReport.warnings.length > 0) {
        console.warn(`[ML Feature Quality] ${qualityReport.warnings.join('; ')}`);
        qualityReport.recommendations.forEach((rec) => console.warn(`  → ${rec}`));
      }

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

      // Get log characteristics for parameter suggestion
      const statsRaw = wasm.analyze_statistics(logHandle);
      const stats = typeof statsRaw === 'string' ? JSON.parse(statsRaw) : statsRaw;
      const traceCount = (stats?.trace_count as number) ?? (stats?.traceCount as number) ?? 0;
      const variantCount = (stats?.variant_count as number) ?? (stats?.variantCount as number) ?? 0;
      const activityCount = (stats?.num_activities as number) ?? 15; // fallback

      // Detect characteristics and suggest k if not provided
      const characteristics = detectLogCharacteristics(traceCount, variantCount, activityCount);
      const defaultK = suggestClusteringK(traceCount, activityCount, characteristics);
      const k = parseInt(String(options.k ?? defaultK), 10);

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
      // Gap 4: attach per-cluster process mining narratives
      rawResult = attachClusterProfiles(rawResult, features);
      break;
    }

    case 'forecast': {
      const driftRaw = wasm.detect_drift(logHandle, activityKey, 5);
      const driftResult = (
        typeof driftRaw === 'string' ? JSON.parse(driftRaw) : driftRaw
      ) as WasmDriftResult;
      const distances = (driftResult?.drifts ?? []).map(
        (d: WasmDriftWindow) => d.distance ?? 0
      );
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
      const driftResult = (
        typeof driftRaw === 'string' ? JSON.parse(driftRaw) : driftRaw
      ) as WasmDriftResult;
      const distances = (driftResult?.drifts ?? []).map(
        (d: WasmDriftWindow) => d.distance ?? 0
      );
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
        method: options.method as RegressionMethod | undefined,
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

// ─────────────────────────────────────────────────────────────────────────────
// Gap 4: Cluster profile narratives
//
// Derives per-cluster process mining characteristics from the raw feature
// objects so the human formatter can render "Cluster 0: short traces with
// low rework" instead of just a size count.
//
// Feature keys expected from extract_case_features (Rust):
//   trace_length, elapsed_time, rework_count, unique_activities,
//   activity_counts (object), avg_inter_event_time
//
// The narrative is built by comparing each cluster's mean values against the
// global means — we label a dimension "high" if the cluster mean is >20%
// above global mean, "low" if >20% below. This threshold is a domain contract
// (Rank-2): small logs have high variance and a tighter threshold would produce
// noise narratives.
// ─────────────────────────────────────────────────────────────────────────────

export interface ClusterProfile {
  clusterId: number;
  caseCount: number;
  pct: number;
  /** Human-readable process mining narrative for this cluster. */
  narrative: string;
  /** Mean values of key features for this cluster (rounded to 2dp). */
  means: {
    traceLength: number;
    reworkCount: number;
    uniqueActivities: number;
    elapsedTime: number;
  };
}

function attachClusterProfiles(
  result: Record<string, unknown>,
  features: Array<Record<string, unknown>>
): Record<string, unknown> {
  const assignments = result.assignments as Array<{ caseId: string; cluster: number }> | undefined;
  if (!assignments || assignments.length === 0 || features.length === 0) return result;

  // Build a caseId → feature map for O(1) lookup.
  const featureMap = new Map<string, Record<string, unknown>>();
  for (const f of features) {
    const id = String(f.caseId ?? f.case_id ?? f.id ?? '');
    if (id) featureMap.set(id, f);
  }

  // Accumulate per-cluster sums.
  interface Sums {
    traceLength: number;
    reworkCount: number;
    uniqueActivities: number;
    elapsedTime: number;
    n: number;
  }
  const clusterSums = new Map<number, Sums>();
  for (const a of assignments) {
    if (a.cluster < 0) continue; // skip noise
    const f = featureMap.get(a.caseId) ?? {};
    const existing = clusterSums.get(a.cluster) ?? {
      traceLength: 0,
      reworkCount: 0,
      uniqueActivities: 0,
      elapsedTime: 0,
      n: 0,
    };
    existing.traceLength += Number(f.trace_length ?? f.traceLength ?? 0);
    existing.reworkCount += Number(f.rework_count ?? f.reworkCount ?? 0);
    existing.uniqueActivities += Number(f.unique_activities ?? f.uniqueActivities ?? 0);
    existing.elapsedTime += Number(f.elapsed_time ?? f.elapsedTime ?? 0);
    existing.n++;
    clusterSums.set(a.cluster, existing);
  }

  // Compute global means across all non-noise cases.
  let globalN = 0;
  let gTraceLength = 0;
  let gReworkCount = 0;
  let gUniqueActivities = 0;
  let gElapsedTime = 0;
  for (const s of clusterSums.values()) {
    gTraceLength += s.traceLength;
    gReworkCount += s.reworkCount;
    gUniqueActivities += s.uniqueActivities;
    gElapsedTime += s.elapsedTime;
    globalN += s.n;
  }
  if (globalN === 0) return result;
  const gMeans = {
    traceLength: gTraceLength / globalN,
    reworkCount: gReworkCount / globalN,
    uniqueActivities: gUniqueActivities / globalN,
    elapsedTime: gElapsedTime / globalN,
  };

  const total = assignments.length;
  const profiles: ClusterProfile[] = [];

  for (const [clusterId, s] of Array.from(clusterSums.entries()).sort((a, b) => a[0] - b[0])) {
    const means = {
      traceLength: s.n > 0 ? round2(s.traceLength / s.n) : 0,
      reworkCount: s.n > 0 ? round2(s.reworkCount / s.n) : 0,
      uniqueActivities: s.n > 0 ? round2(s.uniqueActivities / s.n) : 0,
      elapsedTime: s.n > 0 ? round2(s.elapsedTime / s.n) : 0,
    };

    const tags: string[] = [];
    const THRESHOLD = 0.2; // 20% deviation triggers a label

    // Trace length
    if (gMeans.traceLength > 0) {
      const rel = (means.traceLength - gMeans.traceLength) / gMeans.traceLength;
      if (rel > THRESHOLD) tags.push('long traces');
      else if (rel < -THRESHOLD) tags.push('short traces');
    }

    // Rework
    if (gMeans.reworkCount > 0) {
      const rel = (means.reworkCount - gMeans.reworkCount) / gMeans.reworkCount;
      if (rel > THRESHOLD) tags.push('high rework');
      else if (rel < -THRESHOLD) tags.push('low rework');
    } else if (means.reworkCount > 0.5) {
      tags.push('some rework');
    }

    // Unique activities (process complexity)
    if (gMeans.uniqueActivities > 0) {
      const rel = (means.uniqueActivities - gMeans.uniqueActivities) / gMeans.uniqueActivities;
      if (rel > THRESHOLD) tags.push('high activity variety');
      else if (rel < -THRESHOLD) tags.push('narrow activity set');
    }

    // Elapsed time
    if (gMeans.elapsedTime > 0) {
      const rel = (means.elapsedTime - gMeans.elapsedTime) / gMeans.elapsedTime;
      if (rel > THRESHOLD) tags.push('slow cases');
      else if (rel < -THRESHOLD) tags.push('fast cases');
    }

    const narrative = tags.length > 0 ? tags.join(', ') : 'similar to global average';

    profiles.push({
      clusterId,
      caseCount: s.n,
      pct: s.n / total,
      narrative,
      means,
    });
  }

  return { ...result, _clusterProfiles: profiles };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function attachClassDistribution(result: Record<string, unknown>): Record<string, unknown> {
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

/**
 * Helper: convert extract_case_features JSON output to numeric feature matrix.
 * Used for feature quality assessment.
 */
function buildFeatureMatrixFromExtraction(
  features: Array<Record<string, unknown>>
): { data: number[][]; featureNames: string[] } {
  if (!features || !Array.isArray(features) || features.length === 0) {
    return { data: [], featureNames: [] };
  }

  const firstRow = features[0];
  const featureNames = Object.keys(firstRow).filter((k) => k !== 'case_id');
  const excludeKeys = new Set(['case_id']);

  const data: number[][] = [];
  for (const row of features) {
    if (row == null || typeof row !== 'object') continue;
    const numRow: number[] = [];
    for (const key of featureNames) {
      if (excludeKeys.has(key)) continue;
      const val = row[key];
      let num = 0;
      if (typeof val === 'number') {
        num = val;
      } else if (typeof val === 'string') {
        num = parseFloat(val);
        if (Number.isNaN(num)) num = 0;
      }
      numRow.push(num);
    }
    if (numRow.length > 0) {
      data.push(numRow);
    }
  }

  return { data, featureNames: featureNames.filter((k) => !excludeKeys.has(k)) };
}
