/**
 * @wasm4pm/config — Configuration management with Zod schemas and provenance tracking.
 *
 * @example
 * ```ts
 * import { resolveConfig } from '@wasm4pm/config';
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
} from './schema.js';

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
