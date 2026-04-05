/**
 * @wasm4pm/config - Configuration Management System
 *
 * Provides Zod-based validation, TOML/JSON loading, environment variable support,
 * and provenance tracking for wasm4pm configuration.
 *
 * @example
 * ```ts
 * import { loadConfig } from '@wasm4pm/config';
 *
 * // Load configuration with CLI overrides
 * const config = await loadConfig({
 *   cliOverrides: { profile: 'quality' }
 * });
 *
 * console.log(config.execution.profile); // 'quality'
 * console.log(config.metadata.provenance);
 * ```
 */

// Configuration loading and types
export {
  loadConfig,
  getExampleTomlConfig,
  getExampleJsonConfig,
  type BaseConfig,
  type Config,
  type CliOverrides,
  type LoadConfigOptions,
  type ProvenanceSource,
  type Provenance,
  type ExecutionProfile,
  type OutputFormat,
  type SourceKind,
  type OtelConfig,
  type ObservabilityConfig,
  type WatchConfig,
  type OutputConfig
} from './config.js';

// Validation
export {
  validate,
  validatePartial,
  getExampleConfig,
  getSchemaDescription
} from './validate.js';

// Hashing and fingerprinting
export {
  hashConfig,
  verifyConfigHash,
  fingerprintConfig,
  hashConfigSection,
  diffConfigs,
  type ConfigDiff
} from './hash.js';
