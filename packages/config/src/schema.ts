import { z } from 'zod';
import { ALGORITHM_IDS, PREDICTION_TASKS } from '@pictl/contracts';

/**
 * Schema version for config format migration.
 */
export const SCHEMA_VERSION = 1;

// Re-export for consumers that import from @pictl/config
export { ALGORITHM_IDS } from '@pictl/contracts';
export type { AlgorithmId } from '@pictl/contracts';

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

export const predictionConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    activityKey: z.string().default('concept:name'),
    ngramOrder: z.number().int().min(2).max(5).default(2),
    driftWindowSize: z.number().int().positive().default(10),
    tasks: z.array(z.enum(PREDICTION_TASKS)).default([]),
  })
  .describe('Prediction configuration — which prediction tasks to run');

const ML_TASKS = ['classify', 'cluster', 'forecast', 'anomaly', 'regress', 'pca'] as const;

export const mlConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    tasks: z.array(z.enum(ML_TASKS)).default([]),
    method: z.string().optional(),
    k: z.number().int().positive().optional(),
    targetKey: z.string().default('outcome'),
    forecastPeriods: z.number().int().positive().default(5),
    nComponents: z.number().int().positive().default(2),
    eps: z.number().positive().default(1.0),
  })
  .describe(
    'ML analysis configuration — classification, clustering, forecasting, anomaly, regression, PCA'
  );

/**
 * RL / GPU execution configuration — LinUCB contextual bandit parameters.
 *
 * Van der Aalst prediction perspective: Resource and Intervention.
 * Question: "Which algorithm should handle the next process mining task?"
 *
 * These parameters control the GPU-accelerated LinUCB kernel defined in
 * wasm4pm/src/gpu/linucb_kernel.wgsl and its CPU reference in
 * wasm4pm/src/ml/linucb.rs.
 */
export const rlConfigSchema = z
  .object({
    /** Enable GPU dispatch via the LinUCB WGSL kernel (requires gpu feature). */
    gpu_enabled: z.boolean().default(false),
    /**
     * LinUCB regularization coefficient λ.
     * A is initialised to λI; larger values produce more conservative exploration.
     * Default: 1.0
     */
    linucb_lambda: z.number().positive().default(1.0),
    /**
     * UCB exploration bonus α.
     * Q̂_a(x) = w_a·x + b_a + α√(x^T A^{-1} x).
     * Default: √2 ≈ 1.4142 (standard LinUCB recommendation from Li et al. 2010).
     */
    ucb1_exploration: z.number().nonnegative().default(Math.SQRT2),
  })
  .describe(
    'RL / GPU execution configuration — LinUCB contextual bandit for algorithm selection'
  );

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
  })
  .describe('wasm4pm configuration');

/**
 * Validate a config object against the full schema. Returns the validated config
 * with defaults applied, or throws a descriptive error.
 */
export function validate(config: unknown): z.infer<typeof configSchema> {
  try {
    return configSchema.parse(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.errors
        .map((err) => {
          const path = err.path.join('.');
          return `${path}: ${err.message}`;
        })
        .join('\n  ');
      throw new Error(`Configuration validation failed:\n  ${messages}`);
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
      const messages = error.errors
        .map((err) => {
          const path = err.path.join('.');
          return `${path}: ${err.message}`;
        })
        .join('\n  ');
      throw new Error(`Configuration validation failed:\n  ${messages}`);
    }
    throw error;
  }
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
