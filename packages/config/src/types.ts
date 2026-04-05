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
  [key: string]: unknown;
}

export interface LoadConfigOptions {
  cliOverrides?: CliOverrides;
  configSearchPaths?: string[];
  env?: NodeJS.ProcessEnv;
}
