/**
 * prediction/types.ts
 *
 * Canonical type contracts for the prediction subsystem.
 *
 * The prediction layer is *additive* on top of the kernel: it does not modify
 * the existing ML/algorithm code. Instead, it defines a clean task vocabulary
 * (the 6 Van der Aalst-aligned prediction perspectives) and a uniform
 * input/output shape that perspective handlers honour.
 *
 * All types are intentionally framework-free (no zod dependency in the kernel).
 * Validation is performed by hand-rolled type guards in `validation.ts`.
 */

/**
 * The six prediction perspectives supported by wasm4pm.
 *
 * Each perspective answers a different runtime question about an in-flight
 * process instance. They map 1:1 to the prediction tasks documented in
 * `.claude/rules/ml-rl-testing.md`.
 */
export type PredictionPerspective =
  | 'next_activity'
  | 'remaining_time'
  | 'outcome'
  | 'drift'
  | 'features'
  | 'resource';

export const ALL_PREDICTION_PERSPECTIVES: readonly PredictionPerspective[] = [
  'next_activity',
  'remaining_time',
  'outcome',
  'drift',
  'features',
  'resource',
] as const;

/**
 * Minimal trace shape consumed by the prediction subsystem.
 *
 * Kept intentionally narrow so the prediction layer can be exercised in
 * isolation from the WASM kernel. Adapters for the kernel's `EventLogIR`
 * convert into this shape.
 */
export interface PredictionEvent {
  activity: string;
  timestamp: number; // epoch milliseconds
  resource?: string;
  attributes?: Readonly<Record<string, unknown>>;
}

export interface PredictionTrace {
  caseId: string;
  events: readonly PredictionEvent[];
}

export interface PredictionLog {
  traces: readonly PredictionTrace[];
  /** Optional declared activity universe; inferred from events when omitted. */
  activities?: readonly string[];
}

/**
 * Common knobs shared across all perspectives.
 */
export interface PredictionTaskCommon {
  /** Event attribute used as activity label. Defaults to 'concept:name'. */
  activityKey?: string;
  /** Maximum prefix length to consider per case. Defaults to unbounded. */
  maxPrefixLength?: number;
  /** Optional deterministic seed for stochastic perspectives. */
  seed?: number;
}

export interface NextActivityTask extends PredictionTaskCommon {
  perspective: 'next_activity';
  /** Order of the n-gram model. Range: 1..=8. Default 2. */
  ngramOrder?: number;
  /** Top-k predictions to return per prefix. Range: 1..=20. Default 3. */
  topK?: number;
}

export interface RemainingTimeTask extends PredictionTaskCommon {
  perspective: 'remaining_time';
  /** Aggregator used for trace duration baseline. Default 'mean'. */
  aggregator?: 'mean' | 'median';
}

export type OutcomeLabeller = (trace: PredictionTrace) => string | undefined;

export interface OutcomeTask extends PredictionTaskCommon {
  perspective: 'outcome';
  /**
   * Function that assigns a known outcome label to a *completed* training
   * trace, or `undefined` if the trace has no outcome (it will be skipped
   * during model fit). For inference traces the labeller is not used.
   */
  labeller?: OutcomeLabeller;
  /** Universe of legal outcome labels; inferred when omitted. */
  outcomes?: readonly string[];
}

export interface DriftTask extends PredictionTaskCommon {
  perspective: 'drift';
  /** Sliding window size in traces. Range: 5..=10000. Default 50. */
  windowSize?: number;
  /** EWMA smoothing factor in (0, 1]. Default 0.3. */
  ewmaAlpha?: number;
  /** Jaccard similarity below this threshold flags drift. Default 0.7. */
  driftThreshold?: number;
}

export interface FeaturesTask extends PredictionTaskCommon {
  perspective: 'features';
  /** Whether to include rework / loop indicators. Default true. */
  includeRework?: boolean;
}

export interface ResourceTask extends PredictionTaskCommon {
  perspective: 'resource';
  /** UCB1 exploration constant. Default sqrt(2). */
  ucbC?: number;
}

export type PredictionTask =
  | NextActivityTask
  | RemainingTimeTask
  | OutcomeTask
  | DriftTask
  | FeaturesTask
  | ResourceTask;

/**
 * Prediction operating mode.
 *
 * - `fit`: train a model from the supplied log. Returns a `PredictionModel`.
 * - `predict`: apply a previously-fit model to one or more prefix traces.
 * - `fit_predict`: convenience — fit on log, then predict on `prefixes`.
 */
export type PredictionMode = 'fit' | 'predict' | 'fit_predict';

export interface PredictionRequest<T extends PredictionTask = PredictionTask> {
  task: T;
  mode: PredictionMode;
  /** Required for `fit` and `fit_predict`. */
  log?: PredictionLog;
  /** Required for `predict` and `fit_predict`. */
  prefixes?: readonly PredictionTrace[];
  /** Required for `predict` only. */
  model?: PredictionModel;
}

export interface PredictionModel {
  perspective: PredictionPerspective;
  /** Opaque model state managed by the perspective implementation. */
  state: Readonly<Record<string, unknown>>;
  /** Number of training traces used. */
  trainedOn: number;
  /** Wall-clock fit duration in milliseconds. */
  fitDurationMs: number;
  /** Optional fingerprint for caching/dedup. */
  fingerprint?: string;
}

/**
 * Per-prefix prediction record. The shape of `prediction` is
 * perspective-specific and documented per perspective module.
 */
export interface PredictionRecord {
  caseId: string;
  prefixLength: number;
  prediction: Readonly<Record<string, unknown>>;
  /** Confidence in [0, 1] when meaningful. */
  confidence?: number;
}

export interface PredictionDiagnostics {
  perspective: PredictionPerspective;
  durationMs: number;
  /** Number of prefixes scored. */
  scored: number;
  /** Number of prefixes skipped (e.g. empty). */
  skipped: number;
  /** Optional perspective-specific metrics. */
  metrics?: Readonly<Record<string, number>>;
}

export interface PredictionResponse {
  perspective: PredictionPerspective;
  mode: PredictionMode;
  predictions: readonly PredictionRecord[];
  /** Returned when `mode` includes a `fit` step. */
  model?: PredictionModel;
  diagnostics: PredictionDiagnostics;
}
