import { z } from 'zod';
import type { BaseConfig, ExecutionProfile, OutputFormat, SourceKind } from './config.js';

/**
 * Remediation hints for configuration validation errors
 */
const remediationHints: Record<string, string> = {
  'execution.profile': 'Must be one of: fast, balanced, quality, stream',
  'execution.timeout': 'Must be a positive number (milliseconds)',
  'execution.maxMemory': 'Must be a positive number (bytes)',
  'observability.logLevel': 'Must be one of: debug, info, warn, error',
  'observability.metricsEnabled': 'Must be a boolean',
  'watch.enabled': 'Must be a boolean',
  'watch.interval': 'Must be a positive number (milliseconds)',
  'watch.debounce': 'Must be a non-negative number (milliseconds)',
  'output.format': 'Must be one of: human, json',
  'output.destination': 'Must be a string (stdout, stderr, or file path)',
  'output.pretty': 'Must be a boolean',
  'output.colorize': 'Must be a boolean',
  'otel.enabled': 'Must be a boolean',
  'otel.endpoint': 'Must be a valid URL (e.g., http://localhost:4318)',
  'version': 'Must be a semantic version string (e.g., 26.4.5)'
};

/**
 * Zod schema for execution profile enum
 */
const executionProfileSchema = z.enum(['fast', 'balanced', 'quality', 'stream'] as const)
  .catch('balanced')
  .describe('Execution profile: fast, balanced, quality, or stream');

/**
 * Zod schema for output format enum
 */
const outputFormatSchema = z.enum(['human', 'json'] as const)
  .catch('human')
  .describe('Output format: human or json');

/**
 * Zod schema for log level enum
 */
const logLevelSchema = z.enum(['debug', 'info', 'warn', 'error'] as const)
  .catch('info')
  .describe('Log level: debug, info, warn, or error');

/**
 * Zod schema for source kind
 */
const sourceKindSchema = z.enum(['file', 'env', 'cli'] as const)
  .describe('Configuration source: file, env, or cli');

/**
 * Zod schema for OpenTelemetry configuration
 */
const otelConfigSchema = z.object({
  enabled: z.boolean().default(false),
  endpoint: z.string().url().optional(),
  headers: z.record(z.string()).optional()
}).strict().partial({ headers: true, endpoint: true });

/**
 * Zod schema for observability configuration
 */
const observabilityConfigSchema = z.object({
  otel: otelConfigSchema.optional(),
  logLevel: logLevelSchema.optional(),
  metricsEnabled: z.boolean().optional()
}).strict().partial();

/**
 * Zod schema for watch configuration
 */
const watchConfigSchema = z.object({
  enabled: z.boolean(),
  interval: z.number().int().positive(),
  debounce: z.number().int().nonnegative().optional()
}).strict().partial({ debounce: true });

/**
 * Zod schema for output configuration
 */
const outputConfigSchema = z.object({
  format: outputFormatSchema,
  destination: z.string(),
  pretty: z.boolean().optional(),
  colorize: z.boolean().optional()
}).strict().partial({ pretty: true, colorize: true });

/**
 * Zod schema for execution configuration
 */
const executionConfigSchema = z.object({
  profile: executionProfileSchema,
  timeout: z.number().int().positive().optional(),
  maxMemory: z.number().int().positive().optional()
}).strict().partial({ timeout: true, maxMemory: true });

/**
 * Zod schema for source metadata
 */
const sourceSchema = z.object({
  kind: sourceKindSchema,
  path: z.string().optional()
}).strict().partial({ path: true });

/**
 * Zod schema for complete base configuration
 */
const baseConfigSchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  source: sourceSchema,
  execution: executionConfigSchema,
  observability: observabilityConfigSchema.optional(),
  watch: watchConfigSchema.optional(),
  output: outputConfigSchema.optional()
}).strict().partial({
  observability: true,
  watch: true,
  output: true
});

/**
 * Validate configuration against schema with detailed error messages.
 *
 * @param config Configuration object to validate
 * @returns Validated configuration
 * @throws Error with remediation hints if validation fails
 */
export function validate(config: unknown): BaseConfig {
  try {
    return baseConfigSchema.parse(config) as BaseConfig;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.errors.map(err => {
        const path = err.path.join('.');
        const hint = remediationHints[path];
        const base = `${path}: ${err.message}`;
        return hint ? `${base} (${hint})` : base;
      }).join('\n  ');

      throw new Error(`Configuration validation failed:\n  ${messages}`);
    }
    throw error;
  }
}

/**
 * Validate a partial configuration (for updates)
 */
export function validatePartial(config: unknown): Partial<BaseConfig> {
  try {
    return baseConfigSchema.partial().parse(config) as Partial<BaseConfig>;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.errors.map(err => {
        const path = err.path.join('.');
        const hint = remediationHints[path];
        const base = `${path}: ${err.message}`;
        return hint ? `${base} (${hint})` : base;
      }).join('\n  ');

      throw new Error(`Configuration validation failed:\n  ${messages}`);
    }
    throw error;
  }
}

/**
 * Get example valid configuration
 */
export function getExampleConfig(): BaseConfig {
  return {
    version: '26.4.5',
    source: {
      kind: 'file',
      path: './wasm4pm.toml'
    },
    execution: {
      profile: 'balanced',
      timeout: 300000,
      maxMemory: 1073741824
    },
    observability: {
      logLevel: 'info',
      metricsEnabled: false,
      otel: {
        enabled: false
      }
    },
    watch: {
      enabled: false,
      interval: 1000,
      debounce: 300
    },
    output: {
      format: 'human',
      destination: 'stdout',
      pretty: true,
      colorize: true
    }
  };
}

/**
 * Get schema description for documentation
 */
export function getSchemaDescription(): string {
  return `
# Configuration Schema

## execution.profile
Execution profile: fast, balanced, quality, or stream
- fast: Minimal processing, max throughput
- balanced: (default) Trade-off between speed and accuracy
- quality: Maximum accuracy, slower processing
- stream: Streaming/incremental processing

## execution.timeout
Maximum time for a single operation (milliseconds)
Default: 300000 (5 minutes)

## execution.maxMemory
Maximum memory allocation (bytes)
Default: 1073741824 (1 GB)

## observability.logLevel
Logging level: debug, info, warn, or error
Default: info

## observability.metricsEnabled
Enable metrics collection (boolean)
Default: false

## observability.otel.enabled
Enable OpenTelemetry integration (boolean)
Default: false

## observability.otel.endpoint
OpenTelemetry collector endpoint
Example: http://localhost:4318

## watch.enabled
Enable file watch mode (boolean)
Default: false

## watch.interval
Watch poll interval (milliseconds)
Default: 1000

## watch.debounce
Debounce delay after file changes (milliseconds)
Default: 300

## output.format
Output format: human or json
Default: human

## output.destination
Output destination: stdout, stderr, or file path
Default: stdout

## output.pretty
Pretty-print output (boolean)
Default: true

## output.colorize
Colorize output (boolean)
Default: true
`;
}
