import type { z } from 'zod';
import type {
  configSchema,
  sourceConfigSchema,
  sinkConfigSchema,
  algorithmConfigSchema,
  otelConfigSchema,
  observabilityConfigSchema,
  watchConfigSchema,
  outputConfigSchema,
  executionConfigSchema,
  predictionConfigSchema,
  driftConfigSchema,
  mlConfigSchema,
  classifyConfigSchema,
  clusterConfigSchema,
  forecastConfigSchema,
  anomalyConfigSchema,
  regressConfigSchema,
  pcaConfigSchema,
  rlConfigSchema,
  rlConvergenceSchema,
  rlAgentSchema,
  mlTaskSchema,
  membraneConfigSchema,
  membraneThresholdsSchema,
  membraneDriftSchema,
  membraneEnvelopesSchema,
  swarmConfigSchema,
  supabaseIntegrationConfigSchema,
  integrationsConfigSchema,
} from './schema.js';
import type { ProvenanceMap } from './provenance.js';

// --- Inferred types from Zod schemas ---

export type BaseConfig = z.infer<typeof configSchema>;
export type SourceConfig = z.infer<typeof sourceConfigSchema>;
export type SinkConfig = z.infer<typeof sinkConfigSchema>;
export type AlgorithmConfig = z.infer<typeof algorithmConfigSchema>;
export type OtelConfig = z.infer<typeof otelConfigSchema>;
export type ObservabilityConfig = z.infer<typeof observabilityConfigSchema>;
export type WatchConfig = z.infer<typeof watchConfigSchema>;
export type OutputConfig = z.infer<typeof outputConfigSchema>;
export type ExecutionConfig = z.infer<typeof executionConfigSchema>;
export type PredictionConfig = z.infer<typeof predictionConfigSchema>;
export type DriftConfig = z.infer<typeof driftConfigSchema>;
export type MlConfig = z.infer<typeof mlConfigSchema>;
export type ClassifyConfig = z.infer<typeof classifyConfigSchema>;
export type ClusterConfig = z.infer<typeof clusterConfigSchema>;
export type ForecastConfig = z.infer<typeof forecastConfigSchema>;
export type AnomalyConfig = z.infer<typeof anomalyConfigSchema>;
export type RegressConfig = z.infer<typeof regressConfigSchema>;
export type PcaConfig = z.infer<typeof pcaConfigSchema>;
export type RlConfig = z.infer<typeof rlConfigSchema>;
export type RlConvergenceConfig = z.infer<typeof rlConvergenceSchema>;
export type RlAgent = z.infer<typeof rlAgentSchema>;
export type MlTask = z.infer<typeof mlTaskSchema>;
export type MembraneConfig     = z.infer<typeof membraneConfigSchema>;
export type MembraneThresholds = z.infer<typeof membraneThresholdsSchema>;
export type MembraneDrift      = z.infer<typeof membraneDriftSchema>;
export type MembraneEnvelopes  = z.infer<typeof membraneEnvelopesSchema>;
export type SwarmConfig        = z.infer<typeof swarmConfigSchema>;
export type SupabaseIntegrationConfig = z.infer<typeof supabaseIntegrationConfigSchema>;
export type IntegrationsConfig = z.infer<typeof integrationsConfigSchema>;

export type SourceKind = SourceConfig['kind'];
export type SinkKind = SinkConfig['kind'];
export type ExecutionProfile = ExecutionConfig['profile'];
export type OutputFormat = OutputConfig['format'];
export type LogLevel = ObservabilityConfig['logLevel'];
export type OtelExporter = NonNullable<OtelConfig>['exporter'];

// --- Resolved config (with metadata) ---

export interface Config extends BaseConfig {
  metadata: {
    loadTime: number;
    hash: string;
    provenance: ProvenanceMap;
  };
}

// --- Loading options ---

export interface CliOverrides {
  profile?: ExecutionProfile;
  configPath?: string;
  outputFormat?: OutputFormat;
  outputDestination?: string;
  watchEnabled?: boolean;
  algorithm?: string;
  algorithmParams?: Record<string, unknown>;
  sinkKind?: SinkKind;
  sinkPath?: string;
  sinkUrl?: string;
  // Prediction overrides
  predictionEnabled?: boolean;
  predictionTasks?: string[];
  predictionActivityKey?: string;
  predictionNgramOrder?: number;
  predictionDriftWindow?: number;
  // ML overrides
  mlEnabled?: boolean;
  mlTasks?: string[];
  // RL overrides
  rlEnabled?: boolean;
  rlAgents?: string[];
  rlLearningRate?: number;
  rlDiscountFactor?: number;
  rlEpsilon?: number;
  [key: string]: unknown;
}

export interface LoadConfigOptions {
  cliOverrides?: CliOverrides;
  configSearchPaths?: string[];
  env?: NodeJS.ProcessEnv;
}
