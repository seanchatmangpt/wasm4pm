import { z } from 'zod';
import { ALGORITHM_IDS, PREDICTION_TASKS } from '@wasm4pm/contracts';

/**
 * Schema version for config format migration.
 *
 * Held at 1 across the v26.5.x ML/RL refactor: the new nested sub-sections
 * (`ml.classify`, `ml.cluster`, `ml.forecast`, `rl.convergence`,
 * `prediction.drift`) are purely additive, and the legacy flat fields
 * (`ml.method`, `ml.k`, `ml.eps`) continue to validate and are promoted into
 * the typed sub-sections by `validate()`. Bump only on a true breaking change.
 */
export const SCHEMA_VERSION = 1;

// Re-export for consumers that import from @wasm4pm/config
export { ALGORITHM_IDS } from '@wasm4pm/contracts';
export type { AlgorithmId } from '@wasm4pm/contracts';

export const algorithmIdSchema = z
  .enum(ALGORITHM_IDS)
  .describe('Algorithm ID: one of the registered wasm4pm kernel algorithms');

// --- Enum Schemas ---

export const sourceKindSchema = z
  .enum(['file', 'stream', 'http'] as const)
  .describe('Source kind: file, stream, or http');

export const sinkKindSchema = z
  .enum(['stdout', 'file', 'http'] as const)
  .describe('Sink kind: stdout, file, or http');

export const executionProfileSchema = z
  .enum(['fast', 'balanced', 'quality', 'stream'] as const)
  .describe('Execution profile: fast, balanced, quality, or stream');

export const outputFormatSchema = z
  .enum(['human', 'json'] as const)
  .describe('Output format: human or json');

export const logLevelSchema = z
  .enum(['debug', 'info', 'warn', 'error'] as const)
  .describe('Log level: debug, info, warn, or error');

export const otelExporterSchema = z
  .enum(['otlp', 'console', 'none'] as const)
  .describe('OpenTelemetry exporter type');

// --- Sub-Schemas ---

export const sourceConfigSchema = z
  .object({
    kind: sourceKindSchema,
    path: z.string().optional(),
    url: z.string().url().optional(),
  })
  .describe('Source configuration');

export const sinkConfigSchema = z
  .object({
    kind: sinkKindSchema,
    path: z.string().optional(),
    url: z.string().url().optional(),
  })
  .describe('Sink configuration');

export const algorithmConfigSchema = z
  .object({
    name: algorithmIdSchema.default('dfg'),
    parameters: z.record(z.unknown()).default({}),
  })
  .describe('Algorithm configuration');

export const otelConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    exporter: otelExporterSchema.default('otlp'),
    endpoint: z.string().url().optional(),
    required: z.boolean().default(false),
    headers: z.record(z.string()).optional(),
  })
  .describe('OpenTelemetry configuration');

export const observabilityConfigSchema = z
  .object({
    otel: otelConfigSchema.optional(),
    logLevel: logLevelSchema.default('info'),
    metricsEnabled: z.boolean().default(false),
  })
  .describe('Observability configuration');

export const watchConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    poll_interval: z.number().int().positive().default(1000),
    checkpoint_dir: z.string().optional(),
  })
  .describe('Watch mode configuration');

export const outputConfigSchema = z
  .object({
    format: outputFormatSchema.default('human'),
    destination: z.string().default('stdout'),
    pretty: z.boolean().default(true),
    colorize: z.boolean().default(true),
  })
  .describe('Output configuration');

export const executionConfigSchema = z
  .object({
    profile: executionProfileSchema.default('balanced'),
    timeout: z.number().int().positive().optional(),
    maxMemory: z.number().int().positive().optional(),
  })
  .describe('Execution configuration');

// =============================================================================
// Prediction configuration
// =============================================================================

/**
 * Drift-detection sub-section of the prediction config.
 *
 * Drift detection uses an Exponentially-Weighted Moving Average (EWMA) over
 * a sliding window of trace fingerprints (Jaccard similarity). When the EWMA
 * deviates from the baseline by more than `threshold`, a drift event is
 * emitted. Both knobs are dimensionless probabilities in (0, 1].
 */
export const driftConfigSchema = z
  .object({
    /** EWMA smoothing factor α in (0, 1]. Higher = more reactive. */
    ewma_alpha: z.number().positive().max(1).default(0.2),
    /** Drift score threshold in (0, 1]. Cross to fire a drift event. */
    threshold: z.number().positive().max(1).default(0.3),
  })
  .describe('Drift-detection parameters (EWMA smoothing + threshold)');

export const predictionConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    activityKey: z.string().min(1).default('concept:name'),
    /** N-gram order for next-activity prediction. Domain: integers in [2, 5]. */
    ngramOrder: z.number().int().min(2).max(5).default(2),
    /** Sliding-window size for drift detection (number of traces). */
    driftWindowSize: z.number().int().positive().default(10),
    tasks: z.array(z.enum(PREDICTION_TASKS)).default([]),
    /** Nested drift parameters (Van der Aalst time/concept-drift perspective). */
    drift: driftConfigSchema.default({}),
  })
  .describe('Prediction configuration — which prediction tasks to run');

// =============================================================================
// ML configuration — per-task nested sub-sections
// =============================================================================

const ML_TASKS = ['classify', 'cluster', 'forecast', 'anomaly', 'regress', 'pca'] as const;
export const mlTaskSchema = z
  .enum(ML_TASKS)
  .describe('ML task: classify, cluster, forecast, anomaly, regress, or pca');

const CLASSIFY_MODELS = ['decision_tree', 'naive_bayes', 'logistic_regression', 'knn'] as const;
const FORECAST_METHODS = ['linear', 'exponential', 'polynomial'] as const;
const ANOMALY_METHODS = ['ema', 'isolation_forest', 'zscore'] as const;
const REGRESS_METHODS = ['linear', 'polynomial', 'ridge'] as const;
const CLUSTER_METHODS = ['kmeans', 'dbscan', 'hierarchical'] as const;

export const classifyConfigSchema = z
  .object({
    model: z.enum(CLASSIFY_MODELS).default('decision_tree'),
    targetKey: z.string().min(1).default('outcome'),
    /** k for k-NN; ignored otherwise. */
    k: z.number().int().positive().default(5),
  })
  .describe('Classification sub-config');

export const clusterConfigSchema = z
  .object({
    method: z.enum(CLUSTER_METHODS).default('kmeans'),
    /** Number of clusters (kmeans/hierarchical). */
    k: z.number().int().positive().default(5),
    /** DBSCAN ε neighbourhood radius. */
    eps: z.number().positive().default(1.0),
  })
  .describe('Clustering sub-config');

export const forecastConfigSchema = z
  .object({
    method: z.enum(FORECAST_METHODS).default('linear'),
    periods: z.number().int().positive().default(5),
    /** Polynomial degree (only used when method = "polynomial"). */
    polynomialDegree: z.number().int().min(1).max(8).default(2),
  })
  .describe('Forecasting sub-config');

export const anomalyConfigSchema = z
  .object({
    method: z.enum(ANOMALY_METHODS).default('ema'),
    /** EMA smoothing α (0, 1]. */
    alpha: z.number().positive().max(1).default(0.3),
    /** Score threshold above which a point is anomalous. */
    threshold: z.number().positive().default(2.5),
  })
  .describe('Anomaly-detection sub-config');

export const regressConfigSchema = z
  .object({
    method: z.enum(REGRESS_METHODS).default('linear'),
    targetKey: z.string().min(1).default('outcome'),
    /** L2 regularisation strength (ridge only). */
    lambda: z.number().nonnegative().default(0.0),
  })
  .describe('Regression sub-config');

export const pcaConfigSchema = z
  .object({
    nComponents: z.number().int().positive().default(2),
  })
  .describe('PCA sub-config');

/**
 * ML analysis configuration — classification, clustering, forecasting,
 * anomaly detection, regression, and PCA.
 *
 * Two layouts are accepted simultaneously for backwards-compatibility:
 *
 *   1. Nested (recommended, schema v2):
 *      [ml]
 *      enabled = true
 *      tasks   = ["classify", "cluster"]
 *      [ml.classify] model = "decision_tree"
 *      [ml.cluster]  k = 5
 *
 *   2. Flat (legacy, schema v1):
 *      [ml]
 *      enabled = true
 *      method  = "knn"
 *      k       = 5
 *      eps     = 1.0
 *
 * `validate()` promotes flat fields into the nested sub-sections automatically,
 * so downstream consumers can always read from `config.ml.classify`,
 * `config.ml.cluster`, etc.
 */
export const mlConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    tasks: z.array(mlTaskSchema).default([]),

    // --- Nested per-task sub-sections (preferred) ---
    classify: classifyConfigSchema.default({}),
    cluster: clusterConfigSchema.default({}),
    forecast: forecastConfigSchema.default({}),
    anomaly: anomalyConfigSchema.default({}),
    regress: regressConfigSchema.default({}),
    pca: pcaConfigSchema.default({}),

    // --- Legacy flat fields (deprecated, kept for v1 compatibility) ---
    /** @deprecated Use `ml.classify.model` / `ml.cluster.method` etc. */
    method: z.string().optional(),
    /** @deprecated Use `ml.classify.k` or `ml.cluster.k`. */
    k: z.number().int().positive().optional(),
    /** @deprecated Use `ml.classify.targetKey` or `ml.regress.targetKey`. */
    targetKey: z.string().min(1).default('outcome'),
    /** @deprecated Use `ml.forecast.periods`. */
    forecastPeriods: z.number().int().positive().default(5),
    /** @deprecated Use `ml.pca.nComponents`. */
    nComponents: z.number().int().positive().default(2),
    /** @deprecated Use `ml.cluster.eps`. */
    eps: z.number().positive().default(1.0),
  })
  .describe(
    'ML analysis configuration — classification, clustering, forecasting, anomaly, regression, PCA'
  );

// =============================================================================
// RL configuration — agents, hyperparameters, convergence, LinUCB selection
// =============================================================================

const RL_AGENTS = ['QLearning', 'SARSA', 'DoubleQLearning', 'ExpectedSARSA', 'REINFORCE'] as const;
export const rlAgentSchema = z
  .enum(RL_AGENTS)
  .describe('RL agent: QLearning, SARSA, DoubleQLearning, ExpectedSARSA, or REINFORCE');

/**
 * Convergence-detection criteria for the RL loop.
 *
 * The orchestrator considers the policy converged when, after at least
 * `min_cycles`, the mean reward over the most recent `window_size` cycles
 * has improved by less than `target_reward_improvement` compared with the
 * previous window. The improvement metric is dimensionless.
 */
export const rlConvergenceSchema = z
  .object({
    /** Minimum cycles before convergence checks fire. */
    min_cycles: z.number().int().positive().default(50),
    /** Smallest mean-reward delta (window-over-window) considered "still improving". */
    target_reward_improvement: z.number().nonnegative().default(0.05),
    /** Trailing window size (number of cycles) used to compute mean reward. */
    window_size: z.number().int().positive().default(10),
  })
  .describe('RL convergence-detection criteria');

/**
 * RL system configuration — agents, hyperparameters, convergence, GPU dispatch.
 *
 * Van der Aalst prediction perspective: Resource and Intervention.
 * Question: "Which algorithm should handle the next process mining task,
 * and how do we know the chosen policy has stabilised?"
 *
 * Hyperparameters control the tabular TD agents in `wasm4pm/src/rl_orchestrator.rs`.
 * The LinUCB knobs (`gpu_enabled`, `linucb_lambda`, `ucb1_exploration`) configure
 * the contextual-bandit algorithm-selector defined in
 * `wasm4pm/src/gpu/linucb_kernel.wgsl` and `wasm4pm/src/ml/linucb.rs`.
 */
export const rlConfigSchema = z
  .object({
    /** Master switch for the RL orchestrator. */
    enabled: z.boolean().default(false),

    /** Active agents (one or more). All five must be valid identifiers. */
    agents: z.array(rlAgentSchema).default(['QLearning']),

    /** TD learning rate α in (0, 1]. */
    learning_rate: z.number().positive().max(1).default(0.1),
    /** Discount factor γ in [0, 1]. */
    discount_factor: z.number().min(0).max(1).default(0.99),
    /** ε-greedy exploration rate in [0, 1]. */
    epsilon: z.number().min(0).max(1).default(0.1),

    /** Convergence-detection sub-section. */
    convergence: rlConvergenceSchema.default({}),

    // --- LinUCB / GPU dispatch (kept from schema v1 for compatibility) ---
    /** Enable GPU dispatch via the LinUCB WGSL kernel (requires gpu feature). */
    gpu_enabled: z.boolean().default(false),
    /**
     * LinUCB regularization coefficient λ.
     * A is initialised to λI; larger values produce more conservative exploration.
     */
    linucb_lambda: z.number().positive().default(1.0),
    /**
     * UCB exploration bonus α.
     * Q̂_a(x) = w_a·x + b_a + α√(x^T A^{-1} x).
     * Default: √2 ≈ 1.4142 (standard LinUCB recommendation, Li et al. 2010).
     */
    ucb1_exploration: z.number().nonnegative().default(Math.SQRT2),
  })
  .describe(
    'RL system configuration — agents, hyperparameters, convergence criteria, LinUCB selection'
  );

// =============================================================================
// Membrane configuration — AutoMembrane 5-layer conformance membrane
// =============================================================================

export const membraneThresholdsSchema = z.object({
  actor_anomaly_escalate: z.number().min(0).max(1).default(0.7),
  actor_anomaly_warn:     z.number().min(0).max(1).default(0.4),
  route_match_allow:      z.number().min(0).max(1).default(0.5),
  automl_escalate:        z.number().min(0).max(1).default(0.9),
  automl_warn:            z.number().min(0).max(1).default(0.7),
}).describe('Membrane layer thresholds (all values in [0, 1])');

export const membraneDriftSchema = z.object({
  stable_threshold:   z.number().min(0).max(1).default(0.10),
  moderate_threshold: z.number().min(0).max(1).default(0.25),
  high_threshold:     z.number().min(0).max(1).default(0.50),
  severe_threshold:   z.number().min(0).max(1).default(0.75),
}).describe('Membrane drift-band thresholds (stable < moderate < high < severe)');

export const membraneEnvelopesSchema = z.object({
  persist: z.boolean().default(true),
  path:    z.string().default('.wasm4pm/envelopes'),
}).describe('Envelope persistence configuration');

export const membraneConfigSchema = z.object({
  enabled:         z.boolean().default(false),
  custody_actions: z.array(z.string()).min(1).default(['approve', 'release', 'transfer']),
  thresholds:      membraneThresholdsSchema.default({}),
  drift:           membraneDriftSchema.default({}),
  envelopes:       membraneEnvelopesSchema.default({}),
}).describe('AutoMembrane — pre-execution 5-layer conformance membrane (actor/object/route/automl/custody)');

// --- Root Schema ---

export const configSchema = z
  .object({
    schemaVersion: z.number().int().positive().default(SCHEMA_VERSION),
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    source: sourceConfigSchema,
    sink: sinkConfigSchema.default({ kind: 'stdout' }),
    algorithm: algorithmConfigSchema.default({ name: 'dfg', parameters: {} }),
    execution: executionConfigSchema.default({}),
    observability: observabilityConfigSchema.default({}),
    watch: watchConfigSchema.optional(),
    output: outputConfigSchema.default({}),
    prediction: predictionConfigSchema.optional(),
    ml: mlConfigSchema.optional(),
    rl: rlConfigSchema.optional(),
    membrane: membraneConfigSchema.optional(),
  })
  .describe('wasm4pm configuration');

/**
 * Format Zod issues as a concise, hierarchical, developer-friendly message.
 *
 * Example output:
 *
 *   Configuration validation failed (3 issues):
 *     [rl.learning_rate] expected number, got string
 *     [rl.convergence.min_cycles] Number must be greater than 0
 *     [ml.tasks.0] Invalid enum value. Expected 'classify' | … , received 'foo'
 *
 * For advanced error formatting with suggestions and constraints, use
 * formatDetailedZodError from the validation module.
 */
function formatZodErrors(error: z.ZodError, header = 'Configuration validation failed'): string {
  const lines = error.errors.map((err) => {
    const path = err.path.length > 0 ? err.path.join('.') : '(root)';
    return `  [${path}] ${err.message}`;
  });
  const count = error.errors.length;
  return `${header} (${count} issue${count === 1 ? '' : 's'}):\n${lines.join('\n')}`;
}

/**
 * Validate a config object against the full schema. Returns the validated config
 * with defaults applied, or throws a descriptive error.
 *
 * Also performs schema-v1 → v2 migration: legacy flat `ml.method`/`ml.k`/`ml.eps`
 * fields are promoted into the corresponding nested `ml.classify` / `ml.cluster`
 * sub-sections so downstream consumers can read a single canonical shape.
 */
export function validate(config: unknown): z.infer<typeof configSchema> {
  try {
    const parsed = configSchema.parse(config);
    return migrateLegacyMl(parsed);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(formatZodErrors(error));
    }
    throw error;
  }
}

/**
 * Validate a partial config (useful for individual layers before merging).
 */
export function validatePartial(config: unknown): Partial<z.infer<typeof configSchema>> {
  try {
    return configSchema.partial().parse(config) as Partial<z.infer<typeof configSchema>>;
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(formatZodErrors(error));
    }
    throw error;
  }
}

/**
 * Promote legacy flat `ml.method` / `ml.k` / `ml.eps` / `ml.forecastPeriods`
 * / `ml.nComponents` fields into their nested counterparts. Idempotent: if the
 * caller already supplied nested sub-sections, those win.
 */
function migrateLegacyMl(cfg: z.infer<typeof configSchema>): z.infer<typeof configSchema> {
  if (!cfg.ml) return cfg;
  const ml = cfg.ml;

  // Forecast periods: legacy field overrides default but never an explicit nested value.
  if (ml.forecastPeriods !== undefined && ml.forecast.periods === 5) {
    ml.forecast.periods = ml.forecastPeriods;
  }
  // PCA components.
  if (ml.nComponents !== undefined && ml.pca.nComponents === 2) {
    ml.pca.nComponents = ml.nComponents;
  }
  // Cluster eps (DBSCAN).
  if (ml.eps !== undefined && ml.cluster.eps === 1.0) {
    ml.cluster.eps = ml.eps;
  }
  // Generic targetKey applies to both classify + regress when not overridden.
  if (ml.targetKey && ml.targetKey !== 'outcome') {
    if (ml.classify.targetKey === 'outcome') ml.classify.targetKey = ml.targetKey;
    if (ml.regress.targetKey === 'outcome') ml.regress.targetKey = ml.targetKey;
  }
  // Legacy `k` applies to classify + cluster.
  if (ml.k !== undefined) {
    if (ml.classify.k === 5) ml.classify.k = ml.k;
    if (ml.cluster.k === 5) ml.cluster.k = ml.k;
  }
  return cfg;
}

/**
 * Export the Zod schema as a JSON Schema object.
 */
export function toJsonSchema(): Record<string, unknown> {
  return zodToJsonSchema(configSchema);
}

/**
 * Minimal Zod-to-JSON-Schema converter (no external dependency).
 * Handles the shapes actually used in our config schema.
 */
function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const def = schema._def;
  const typeName = def.typeName as string;

  switch (typeName) {
    case 'ZodObject': {
      const shape = (schema as z.ZodObject<any>).shape;
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const [key, val] of Object.entries(shape)) {
        properties[key] = zodToJsonSchema(val as z.ZodTypeAny);
        if (!isOptional(val as z.ZodTypeAny)) {
          required.push(key);
        }
      }
      const result: Record<string, unknown> = { type: 'object', properties };
      if (required.length > 0) result.required = required;
      if (def.description) result.description = def.description;
      return result;
    }
    case 'ZodString': {
      const result: Record<string, unknown> = { type: 'string' };
      if (def.description) result.description = def.description;
      for (const check of def.checks ?? []) {
        if (check.kind === 'regex') result.pattern = check.regex.source;
        if (check.kind === 'url') result.format = 'uri';
        if (check.kind === 'min') result.minLength = check.value;
      }
      return result;
    }
    case 'ZodNumber': {
      const result: Record<string, unknown> = { type: 'number' };
      if (def.description) result.description = def.description;
      for (const check of def.checks ?? []) {
        if (check.kind === 'int') result.type = 'integer';
        if (check.kind === 'min') {
          if (check.inclusive) result.minimum = check.value;
          else result.exclusiveMinimum = check.value;
        }
        if (check.kind === 'max') {
          if (check.inclusive) result.maximum = check.value;
          else result.exclusiveMaximum = check.value;
        }
      }
      return result;
    }
    case 'ZodBoolean': {
      const result: Record<string, unknown> = { type: 'boolean' };
      if (def.description) result.description = def.description;
      return result;
    }
    case 'ZodEnum': {
      const result: Record<string, unknown> = { type: 'string', enum: def.values };
      if (def.description) result.description = def.description;
      return result;
    }
    case 'ZodOptional':
      return zodToJsonSchema(def.innerType);
    case 'ZodDefault':
      return { ...zodToJsonSchema(def.innerType), default: def.defaultValue() };
    case 'ZodRecord': {
      return {
        type: 'object',
        additionalProperties: zodToJsonSchema(def.valueType),
      };
    }
    case 'ZodArray': {
      const result: Record<string, unknown> = {
        type: 'array',
        items: zodToJsonSchema(def.type),
      };
      if (def.description) result.description = def.description;
      return result;
    }
    case 'ZodUnknown':
      return {};
    default:
      return {};
  }
}

function isOptional(schema: z.ZodTypeAny): boolean {
  const typeName = schema._def.typeName as string;
  if (typeName === 'ZodOptional') return true;
  if (typeName === 'ZodDefault') return true;
  return false;
}
