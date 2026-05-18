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
