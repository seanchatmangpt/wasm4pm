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
/**
 * resolveConfig — Merges CLI, TOML, JSON, ENV, and defaults with 5-layer precedence.
 * @description Returns Zod-validated Config with provenance tracking per field (source + path + timestamp).
 * @example const config = await resolveConfig({ cliOverrides: { profile: 'quality' } });
 */
export {
  resolveConfig,
  checkConfigWarnings,
  getExampleTomlConfig,
  getExampleJsonConfig,
  getExampleEnvFile,
  getExamplePresetConfig,
  configToToml,
  configToEnv,
} from './resolver.js';

// Schema & validation
/**
 * configSchema — Zod schema for complete Config validation; use via validate().
 * @description Enforces 5-layer (CLI > TOML > JSON > ENV > defaults) with Zod parsing and type-safe coercion.
 * @example const config = configSchema.parse(raw); // throws if invalid
 */
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
  driftConfigSchema,
  classifyConfigSchema,
  clusterConfigSchema,
  forecastConfigSchema,
  anomalyConfigSchema,
  regressConfigSchema,
  pcaConfigSchema,
  rlConvergenceSchema,
  rlAgentSchema,
  mlTaskSchema,
  membraneConfigSchema,
  membraneThresholdsSchema,
  membraneDriftSchema,
  membraneEnvelopesSchema,
  swarmConfigSchema,
} from './schema.js';
export type { AlgorithmId } from './schema.js';

// Re-export generated constants so consumers can get them from @wasm4pm/config
export {
  PREDICTION_TASKS,
  VALID_PREDICT_CLI_TASKS,
  CLI_SLUG_TO_TASK_ID,
  TASK_ID_TO_CLI_SLUG,
} from '@wasm4pm/contracts';
export type { PredictionTask, PredictCliTask } from '@wasm4pm/contracts';

// Provenance
export {
  trackProvenance,
  mergeProvenance,
  type Provenance,
  type ProvenanceSource,
  type ProvenanceMap,
} from './provenance.js';

// Types
/**
 * Config — Top-level configuration type with source, algorithm, execution, observability, watch, output, prediction, and metadata.
 * @description After resolveConfig(), check config.metadata.provenance to trace field origins across 5-layer precedence.
 * @example console.log(config.metadata.provenance.execution.profile.source); // 'cli' | 'toml' | 'env' | etc.
 */
/**
 * ExecutionProfile — One of 'fast' | 'balanced' | 'quality' | 'stream' determines algorithm selection and resource constraints.
 * @description Drives planner behavior; 'quality' enables genetic/ILP, 'fast' uses only DFG, 'stream' enables SIMD.
 * @example const profile: ExecutionProfile = 'quality';
 */
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
  DriftConfig,
  MlConfig,
  ClassifyConfig,
  ClusterConfig,
  ForecastConfig,
  AnomalyConfig,
  RegressConfig,
  PcaConfig,
  RlConfig,
  RlConvergenceConfig,
  RlAgent,
  MlTask,
  MembraneConfig,
  MembraneThresholds,
  MembraneDrift,
  MembraneEnvelopes,
  SourceKind,
  SinkKind,
  ExecutionProfile,
  OutputFormat,
  LogLevel,
  OtelExporter,
  CliOverrides,
  LoadConfigOptions,
} from './types.js';

// Hashing (only hashConfig is used externally - by resolver.ts)
/**
 * hashConfig — BLAKE3 hash of resolved Config (used in receipt chaining and audit trails).
 * @description Deterministic hash reflects all merged 5-layer fields; changes if any config layer changes.
 * @example const hash = hashConfig(config); // hex-64 string for receipt verification
 */
export { hashConfig } from './hash.js';

// Validation & Profiles
export {
  formatDetailedZodError,
  validateAlgorithmProfile,
  validateMlConfig,
  validateRlConfig,
  validatePredictionConfig,
  type ValidationErrorContext,
} from './validation/detailed-errors.js';

export {
  getProfileCapabilities,
  suggestProfile,
  validateAlgorithmInProfile,
  getProfileComparisonTable,
  findProfilesWithFeatures,
  type ProfileCapabilities,
  type ProfileSuggestionConstraints,
} from './validation/profile-management.js';

export {
  getPresetConfig,
  getExampleTomlWithComments,
  describePreset,
  getPublicPresetConfig,
  describePublicPreset,
  suggestPreset,
  suggestPresetFromBenchmarks,
  generateOptimalConfig,
  type PresetScenario,
  type PublicPreset,
  type PresetConstraints,
  type AlgorithmMeasurement,
  type BenchmarkData,
} from './validation/presets.js';
