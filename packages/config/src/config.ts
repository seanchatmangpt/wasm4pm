import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';
import * as toml from 'toml';
import type {
  BaseConfig,
  Config,
  CliOverrides,
  LoadConfigOptions,
  ExecutionProfile,
} from './types.js';
import type { ProvenanceMap } from './provenance.js';

/**
 * Load configuration from multiple sources with provenance tracking.
 * Resolution order (highest to lowest priority):
 * 1. CLI overrides
 * 2. TOML config file (./wasm4pm.toml)
 * 3. JSON config file (./wasm4pm.json)
 * 4. Environment variables (WASM4PM_* prefix)
 * 5. Default values
 *
 * @param options Loading options including CLI overrides and search paths
 * @returns Complete configuration with provenance metadata
 * @throws Error if configuration is invalid according to schema
 */
export async function loadConfig(options?: LoadConfigOptions): Promise<Config> {
  const cliOverrides = options?.cliOverrides ?? {};
  const env = options?.env ?? process.env;
  const configSearchPaths = options?.configSearchPaths ?? getDefaultSearchPaths();

  const provenance: Record<string, Provenance> = {};
  let configSource: SourceKind = 'cli';
  let configPath: string | undefined;

  // Start with defaults
  const defaults = getDefaultConfig();
  Object.entries(defaults).forEach(([key, value]) => {
    provenance[key] = { value, source: 'default' };
  });

  // Merge environment variables (WASM4PM_* prefix)
  const envConfig = parseEnvConfig(env);
  Object.entries(envConfig).forEach(([key, value]) => {
    provenance[key] = { value, source: 'env' };
  });

  // Try to load from TOML/JSON config files
  let fileConfig: Partial<BaseConfig> = {};
  for (const searchPath of configSearchPaths) {
    const tomlPath = path.join(searchPath, 'wasm4pm.toml');
    const jsonPath = path.join(searchPath, 'wasm4pm.json');

    if (existsSync(tomlPath)) {
      try {
        const content = await fs.readFile(tomlPath, 'utf-8');
        fileConfig = toml.parse(content) as Partial<BaseConfig>;
        configPath = tomlPath;
        configSource = 'file';
        Object.entries(fileConfig).forEach(([key, value]) => {
          provenance[key] = { value, source: 'config', path: tomlPath };
        });
        break;
      } catch (error) {
        throw new Error(`Failed to parse TOML config at ${tomlPath}: ${error}`);
      }
    }

    if (existsSync(jsonPath)) {
      try {
        const content = await fs.readFile(jsonPath, 'utf-8');
        fileConfig = JSON.parse(content) as Partial<BaseConfig>;
        configPath = jsonPath;
        configSource = 'file';
        Object.entries(fileConfig).forEach(([key, value]) => {
          provenance[key] = { value, source: 'config', path: jsonPath };
        });
        break;
      } catch (error) {
        throw new Error(`Failed to parse JSON config at ${jsonPath}: ${error}`);
      }
    }
  }

  // Apply CLI overrides (highest priority)
  const cliConfig = parsCliOverrides(cliOverrides);
  Object.entries(cliConfig).forEach(([key, value]) => {
    provenance[key] = { value, source: 'cli' };
  });

  // Merge all configs
  const merged = mergeConfigs(
    defaults,
    envConfig,
    fileConfig,
    cliConfig
  );

  // Validate against schema
  const { validate } = await import('./validate.js');
  const validatedConfig = validate(merged) as BaseConfig;

  // Calculate hash
  const { hashConfig } = await import('./hash.js');
  const hash = hashConfig(validatedConfig);

  const config: Config = {
    ...validatedConfig,
    source: {
      kind: configSource,
      path: configPath ?? cliOverrides.configPath
    },
    metadata: {
      loadTime: Date.now(),
      hash,
      provenance
    }
  };

  return config;
}

/**
 * Get default search paths for configuration files.
 * Search order:
 * 1. Current working directory
 * 2. Home directory (~/.wasm4pm)
 */
function getDefaultSearchPaths(): string[] {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  return [
    process.cwd(),
    path.join(home, '.wasm4pm')
  ].filter(p => p);
}

/**
 * Get default configuration values
 */
function getDefaultConfig(): BaseConfig {
  return {
    schemaVersion: 1,
    version: '26.4.5',
    source: {
      kind: 'cli'
    },
    sink: {
      kind: 'stdout'
    },
    algorithm: {
      name: 'alpha',
      parameters: {}
    },
    execution: {
      profile: 'balanced',
      timeout: 300000, // 5 minutes
      maxMemory: 1024 * 1024 * 1024 // 1 GB
    },
    observability: {
      logLevel: 'info',
      metricsEnabled: false,
      otel: {
        enabled: false,
        exporter: 'otlp',
        required: false
      }
    },
    watch: {
      enabled: false,
      poll_interval: 1000
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
 * Parse environment variables with WASM4PM_ prefix
 */
function parseEnvConfig(env: NodeJS.ProcessEnv): Partial<BaseConfig> {
  const config: any = {};

  // WASM4PM_PROFILE -> execution.profile
  if (env.WASM4PM_PROFILE) {
    config.execution = { profile: env.WASM4PM_PROFILE };
  }

  // WASM4PM_LOG_LEVEL -> observability.logLevel
  if (env.WASM4PM_LOG_LEVEL) {
    config.observability = { logLevel: env.WASM4PM_LOG_LEVEL };
  }

  // WASM4PM_WATCH -> watch.enabled
  if (env.WASM4PM_WATCH) {
    config.watch = { enabled: env.WASM4PM_WATCH === 'true' || env.WASM4PM_WATCH === '1' };
  }

  // WASM4PM_OUTPUT_FORMAT -> output.format
  if (env.WASM4PM_OUTPUT_FORMAT) {
    config.output = { format: env.WASM4PM_OUTPUT_FORMAT };
  }

  // WASM4PM_OUTPUT_DESTINATION -> output.destination
  if (env.WASM4PM_OUTPUT_DESTINATION) {
    if (!config.output) config.output = {};
    config.output.destination = env.WASM4PM_OUTPUT_DESTINATION;
  }

  return config;
}

/**
 * Parse CLI overrides into configuration
 */
function parsCliOverrides(cliOverrides: CliOverrides): Partial<BaseConfig> {
  const config: any = {};

  if (cliOverrides.profile) {
    config.execution = { profile: cliOverrides.profile };
  }

  if (cliOverrides.outputFormat || cliOverrides.outputDestination) {
    config.output = {};
    if (cliOverrides.outputFormat) {
      config.output.format = cliOverrides.outputFormat;
    }
    if (cliOverrides.outputDestination) {
      config.output.destination = cliOverrides.outputDestination;
    }
  }

  if (cliOverrides.watchEnabled !== undefined) {
    config.watch = { enabled: cliOverrides.watchEnabled };
  }

  return config;
}

/**
 * Recursively merge configuration objects with later sources taking precedence.
 * Only overwrites defined (non-undefined) values.
 */
function mergeConfigs(...configs: Array<Partial<BaseConfig> | any>): Partial<BaseConfig> {
  const result: any = {};

  for (const config of configs) {
    if (!config) continue;

    for (const [key, value] of Object.entries(config)) {
      if (value === undefined || value === null) continue;

      if (typeof value === 'object' && !Array.isArray(value)) {
        result[key] = mergeConfigs(result[key] ?? {}, value);
      } else {
        result[key] = value;
      }
    }
  }

  return result;
}

/**
 * Load example configuration file content
 */
export function getExampleTomlConfig(): string {
  return `# wasm4pm Configuration
# Place this at: ./wasm4pm.toml or ~/.wasm4pm/config.toml

version = "26.4.5"

[execution]
profile = "balanced"  # Options: fast, balanced, quality, stream
timeout = 300000      # milliseconds (5 minutes)
max_memory = 1073741824  # bytes (1 GB)

[observability]
log_level = "info"    # Options: debug, info, warn, error
metrics_enabled = false

[watch]
enabled = false
interval = 1000       # milliseconds
debounce = 300        # milliseconds

[output]
format = "human"      # Options: human, json
destination = "stdout"  # stdout, stderr, or file path
pretty = true
colorize = true

[observability.otel]
enabled = false
endpoint = "http://localhost:4318"
`;
}

/**
 * Load example JSON configuration
 */
export function getExampleJsonConfig(): string {
  return JSON.stringify(
    {
      version: '26.4.5',
      execution: {
        profile: 'balanced',
        timeout: 300000,
        maxMemory: 1073741824
      },
      observability: {
        logLevel: 'info',
        metricsEnabled: false,
        otel: {
          enabled: false,
          endpoint: 'http://localhost:4318'
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
    },
    null,
    2
  );
}
