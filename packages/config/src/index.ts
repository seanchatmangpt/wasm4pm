/**
 * @pictl/config — Configuration management with Zod schemas and provenance tracking.
 *
 * @example
 * ```ts
 * import { resolveConfig } from '@pictl/config';
 *
 * const config = await resolveConfig({
 *   cliOverrides: { profile: 'quality' },
 * });
 *
 * console.log(config.execution.profile);       // 'quality'
 * console.log(config.metadata.provenance);     // per-key provenance
 * ```
 */

// Resolution
export { resolveConfig, getExampleTomlConfig, getExampleJsonConfig } from './resolver.js';

// Schema & validation
export {
  configSchema,
  SCHEMA_VERSION,
  validate,
  validatePartial,
  toJsonSchema,
  ALGORITHM_IDS,
  algorithmIdSchema,
  sourceKindSchema,
  sinkKindSchema,
  executionProfileSchema,
  outputFormatSchema,
  logLevelSchema,
  otelExporterSchema,
  sourceConfigSchema,
  sinkConfigSchema,
  algorithmConfigSchema,
  otelConfigSchema,
  observabilityConfigSchema,
  watchConfigSchema,
  outputConfigSchema,
  executionConfigSchema,
  predictionConfigSchema,
  rlConfigSchema,
  mlConfigSchema,
} from './schema.js';
export type { AlgorithmId } from './schema.js';

// Re-export generated constants so consumers can get them from @pictl/config
export { PREDICTION_TASKS, VALID_PREDICT_CLI_TASKS, CLI_SLUG_TO_TASK_ID, TASK_ID_TO_CLI_SLUG } from '@pictl/contracts';
export type { PredictionTask, PredictCliTask } from '@pictl/contracts';

// Provenance
export {
  trackProvenance,
  mergeProvenance,
  type Provenance,
  type ProvenanceSource,
  type ProvenanceMap,
} from './provenance.js';

// Types
export type {
  BaseConfig,
  Config,
  SourceConfig,
  SinkConfig,
  AlgorithmConfig,
  OtelConfig,
  ObservabilityConfig,
  WatchConfig,
  OutputConfig,
  ExecutionConfig,
  PredictionConfig,
  RlConfig,
  SourceKind,
  SinkKind,
  ExecutionProfile,
  OutputFormat,
  LogLevel,
  OtelExporter,
  CliOverrides,
  LoadConfigOptions,
} from './types.js';

// Hashing
export {
  hashConfig,
  verifyConfigHash,
  fingerprintConfig,
  hashConfigSection,
  diffConfigs,
  type ConfigDiff,
} from './hash.js';
