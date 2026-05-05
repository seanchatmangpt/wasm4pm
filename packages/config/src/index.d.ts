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
export { resolveConfig, getExampleTomlConfig, getExampleJsonConfig } from './resolver.js';
export { configSchema, SCHEMA_VERSION, validate, validatePartial, toJsonSchema, ALGORITHM_IDS, algorithmIdSchema, sourceKindSchema, sinkKindSchema, executionProfileSchema, outputFormatSchema, logLevelSchema, otelExporterSchema, sourceConfigSchema, sinkConfigSchema, algorithmConfigSchema, otelConfigSchema, observabilityConfigSchema, watchConfigSchema, outputConfigSchema, executionConfigSchema, predictionConfigSchema, rlConfigSchema, mlConfigSchema, } from './schema.js';
export type { AlgorithmId } from './schema.js';
export { PREDICTION_TASKS, VALID_PREDICT_CLI_TASKS, CLI_SLUG_TO_TASK_ID, TASK_ID_TO_CLI_SLUG } from '@wasm4pm/contracts';
export type { PredictionTask, PredictCliTask } from '@wasm4pm/contracts';
export { trackProvenance, mergeProvenance, type Provenance, type ProvenanceSource, type ProvenanceMap, } from './provenance.js';
export type { BaseConfig, Config, SourceConfig, SinkConfig, AlgorithmConfig, OtelConfig, ObservabilityConfig, WatchConfig, OutputConfig, ExecutionConfig, PredictionConfig, RlConfig, SourceKind, SinkKind, ExecutionProfile, OutputFormat, LogLevel, OtelExporter, CliOverrides, LoadConfigOptions, } from './types.js';
export { hashConfig } from './hash.js';
//# sourceMappingURL=index.d.ts.map