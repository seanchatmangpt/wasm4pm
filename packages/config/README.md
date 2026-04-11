# @pictl/config

Configuration management system for pictl with Zod-based validation, provenance tracking, and support for multiple config sources.

## Features

- **Multiple config sources**: TOML, JSON, environment variables, CLI arguments
- **Provenance tracking**: Know where each config value came from
- **Zod validation**: Type-safe config with helpful error messages
- **BLAKE3 hashing**: Deterministic config fingerprinting
- **Sensible defaults**: Works out of the box
- **Well-documented**: Examples, remediation hints, full API docs

## Installation

```bash
npm install @pictl/config
```

## Quick Start

```typescript
import { loadConfig } from '@pictl/config';

// Load configuration from multiple sources
const config = await loadConfig({
  cliOverrides: { profile: 'quality' }
});

console.log(config.execution.profile);        // 'quality'
console.log(config.metadata.loadTime);        // timestamp
console.log(config.metadata.hash);            // BLAKE3 hash
console.log(config.metadata.provenance);      // provenance tracking
```

## Configuration Sources

Config is loaded in this priority order (highest first):

1. **CLI arguments** - Passed to `loadConfig({ cliOverrides })`
2. **TOML files** - `./pictl.toml` or `~/.pictl/config.toml`
3. **JSON files** - `./pictl.json` or `~/.pictl/config.json`
4. **Environment variables** - `PICTL_*` prefix
5. **Defaults** - Built-in defaults

## Configuration Files

### TOML Format

Create `./pictl.toml` or `~/.pictl/config.toml`:

```toml
version = "26.4.5"

[execution]
profile = "balanced"      # fast, balanced, quality, stream
timeout = 300000          # milliseconds (5 minutes)
max_memory = 1073741824   # bytes (1 GB)

[observability]
log_level = "info"        # debug, info, warn, error
metrics_enabled = false

[watch]
enabled = false
interval = 1000           # milliseconds
debounce = 300            # milliseconds

[output]
format = "human"          # human, json
destination = "stdout"    # stdout, stderr, or file path
pretty = true
colorize = true

[observability.otel]
enabled = false
endpoint = "http://localhost:4318"
```

### JSON Format

Create `./pictl.json` or `~/.pictl/config.json`:

```json
{
  "version": "26.4.5",
  "execution": {
    "profile": "balanced",
    "timeout": 300000,
    "maxMemory": 1073741824
  },
  "observability": {
    "logLevel": "info",
    "metricsEnabled": false,
    "otel": {
      "enabled": false,
      "endpoint": "http://localhost:4318"
    }
  },
  "watch": {
    "enabled": false,
    "interval": 1000,
    "debounce": 300
  },
  "output": {
    "format": "human",
    "destination": "stdout",
    "pretty": true,
    "colorize": true
  }
}
```

## Environment Variables

Override config via environment variables with `PICTL_` prefix:

```bash
PICTL_PROFILE=quality          # execution.profile
PICTL_LOG_LEVEL=debug          # observability.logLevel
PICTL_WATCH=true               # watch.enabled
PICTL_OUTPUT_FORMAT=json        # output.format
PICTL_OUTPUT_DESTINATION=/tmp/out.json
```

## CLI Overrides

```typescript
const config = await loadConfig({
  cliOverrides: {
    profile: 'quality',
    outputFormat: 'json',
    outputDestination: '/tmp/output.json',
    watchEnabled: true
  }
});
```

## Provenance Tracking

Track where each configuration value came from:

```typescript
const config = await loadConfig();

console.log(config.metadata.provenance);
// Output:
// {
//   version: { value: '26.4.5', source: 'default' },
//   execution: { value: {...}, source: 'config', path: './pictl.toml' },
//   observability: { value: {...}, source: 'env' }
// }
```

Sources can be:
- `'default'` - Built-in default
- `'config'` - Loaded from config file
- `'env'` - From environment variable
- `'cli'` - From CLI argument

## Configuration Hash

Get a deterministic hash for caching/verification:

```typescript
import { hashConfig, fingerprintConfig, verifyConfigHash } from '@pictl/config';

const config = await loadConfig();

// Full BLAKE3 hash
const hash = hashConfig(config);

// Short 8-char fingerprint
const fingerprint = fingerprintConfig(config);

// Verify config hasn't changed
const isValid = verifyConfigHash(config, storedHash);
```

## Validation

All configs are validated with Zod. Validation errors include helpful hints:

```typescript
import { validate } from '@pictl/config';

try {
  validate(config);
} catch (error) {
  console.error(error.message);
  // Configuration validation failed:
  //   execution.profile: Invalid enum value (Options: fast, balanced, quality, stream)
}
```

## Comparing Configs

Detect what changed between two configs:

```typescript
import { diffConfigs } from '@pictl/config';

const diff = diffConfigs(config1, config2);
if (diff.changed) {
  console.log('Config changed:');
  for (const change of diff.differences) {
    console.log(`  ${change.path}: ${change.before} → ${change.after}`);
  }
}
```

## Types

### BaseConfig

```typescript
interface BaseConfig {
  version: string;  // e.g., "26.4.5"
  source: {
    kind: 'file' | 'env' | 'cli';
    path?: string;
  };
  execution: {
    profile: 'fast' | 'balanced' | 'quality' | 'stream';
    timeout?: number;    // milliseconds
    maxMemory?: number;  // bytes
  };
  observability?: {
    otel?: {
      enabled: boolean;
      endpoint?: string;
      headers?: Record<string, string>;
    };
    logLevel?: 'debug' | 'info' | 'warn' | 'error';
    metricsEnabled?: boolean;
  };
  watch?: {
    enabled: boolean;
    interval: number;    // milliseconds
    debounce?: number;   // milliseconds
  };
  output?: {
    format: 'human' | 'json';
    destination: string;
    pretty?: boolean;
    colorize?: boolean;
  };
}
```

### Config (with metadata)

```typescript
interface Config extends BaseConfig {
  metadata: {
    loadTime: number;                    // timestamp
    hash: string;                        // BLAKE3 hash
    provenance: Record<string, {
      value: unknown;
      source: 'config' | 'env' | 'default' | 'cli';
      path?: string;
    }>;
  };
}
```

## API Reference

### loadConfig(options?)

Load configuration from all sources with priority ordering.

```typescript
function loadConfig(options?: LoadConfigOptions): Promise<Config>
```

**Options:**
- `cliOverrides?: CliOverrides` - CLI-provided overrides (highest priority)
- `configSearchPaths?: string[]` - Paths to search for config files (default: `[cwd, ~/.pictl]`)
- `env?: NodeJS.ProcessEnv` - Environment variables (default: `process.env`)

**Returns:** Complete configuration with metadata

### validate(config)

Validate configuration against Zod schema.

```typescript
function validate(config: unknown): BaseConfig
```

Throws with detailed error messages including remediation hints.

### validatePartial(config)

Validate partial configuration (for updates).

```typescript
function validatePartial(config: unknown): Partial<BaseConfig>
```

### hashConfig(config)

Get BLAKE3 hash of configuration.

```typescript
function hashConfig(config: BaseConfig): string
```

### fingerprintConfig(config)

Get short 8-character fingerprint.

```typescript
function fingerprintConfig(config: BaseConfig): string
```

### verifyConfigHash(config, hash)

Verify config matches expected hash.

```typescript
function verifyConfigHash(config: BaseConfig, expectedHash: string): boolean
```

### diffConfigs(config1, config2)

Compare two configs and return differences.

```typescript
function diffConfigs(config1: BaseConfig, config2: BaseConfig): ConfigDiff
```

### getExampleTomlConfig()

Get example TOML configuration.

```typescript
function getExampleTomlConfig(): string
```

### getExampleJsonConfig()

Get example JSON configuration.

```typescript
function getExampleJsonConfig(): string
```

## Testing

Run the test suite:

```bash
npm test
```

## License

MIT OR Apache-2.0
