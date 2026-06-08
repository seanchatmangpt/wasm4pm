# @wasm4pm/config

Configuration management system for wasm4pm with Zod-based validation, provenance tracking, and support for multiple config sources.

## Features

- **Multiple config sources**: TOML, JSON, environment variables, CLI arguments
- **Provenance tracking**: Know where each config value came from
- **Zod validation**: Type-safe config with helpful error messages
- **BLAKE3 hashing**: Deterministic config fingerprinting
- **Sensible defaults**: Works out of the box
- **Well-documented**: Examples, remediation hints, full API docs

## Installation

```bash
npm install @wasm4pm/config
```

## Quick Start

```typescript
import { loadConfig } from '@wasm4pm/config';

// Load configuration from multiple sources
const config = await loadConfig({
  cliOverrides: { profile: 'quality' }
});

console.log(config.execution.profile);        // 'quality'
console.log(config.metadata.loadTime);        // timestamp
console.log(config.metadata.hash);            // BLAKE3 hash
console.log(config.metadata.provenance);      // provenance tracking
```

## Migration: flat ML config → nested ML sub-sections

Schema v1 used a flat layout for `[ml]`. Schema v1 keeps validating, but
new code should use the nested per-task layout introduced in v26.5.x.

|  (still valid)              | Preferred                           |
|-----------------------------------|-------------------------------------|
| `ml.method = "knn"`               | `ml.classify.model = "knn"`         |
| `ml.k = 5`                        | `ml.classify.k = 5`, `ml.cluster.k = 5` |
| `ml.targetKey = "outcome"`        | `ml.classify.targetKey`, `ml.regress.targetKey` |
| `ml.eps = 1.0`                    | `ml.cluster.eps = 1.0`              |
| `ml.forecastPeriods = 5`          | `ml.forecast.periods = 5`           |
| `ml.nComponents = 2`              | `ml.pca.nComponents = 2`            |

`validate()` performs the promotion automatically — there is no rename
step required for in-place upgrades. You can adopt nested sections one
task at a time, and explicit nested values always win over their 
counterparts.

## Configuration Sources

Config is loaded in this priority order (highest first):

1. **CLI arguments** - Passed to `loadConfig({ cliOverrides })`
2. **TOML files** - `./wasm4pm.toml` or `~/.wasm4pm/config.toml`
3. **JSON files** - `./wasm4pm.json` or `~/.wasm4pm/config.json`
4. **Environment variables** - `WASM4PM_*` prefix
5. **Defaults** - Built-in defaults

## Configuration Files

### TOML Format

Create `./wasm4pm.toml` or `~/.wasm4pm/config.toml`:

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

Create `./wasm4pm.json` or `~/.wasm4pm/config.json`:

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

## ML / RL / Prediction Configuration

The `[ml]`, `[rl]`, and `[prediction]` sections let you configure the
ML/RL/predictive-mining pipeline declaratively — no code edits required.

### `[ml]` — Machine learning analysis

Six ML tasks are supported. Each has its own nested sub-section so the
hyperparameters that matter for one task never collide with another.

```toml
[ml]
enabled = true
tasks   = ["classify", "cluster", "forecast", "anomaly", "regress", "pca"]

[ml.classify]
model     = "decision_tree"   # decision_tree | naive_bayes | logistic_regression | knn
targetKey = "outcome"
k         = 5                 # only used when model = "knn"

[ml.cluster]
method = "kmeans"             # kmeans | dbscan | hierarchical
k      = 5
eps    = 1.0                  # DBSCAN ε neighbourhood radius

[ml.forecast]
method           = "linear"   # linear | exponential | polynomial
periods          = 5
polynomialDegree = 2          # only used when method = "polynomial"

[ml.anomaly]
method    = "ema"             # ema | isolation_forest | zscore
alpha     = 0.3               # EMA smoothing in (0, 1]
threshold = 2.5               # score above which a point is anomalous

[ml.regress]
method    = "linear"          # linear | polynomial | ridge
targetKey = "outcome"
lambda    = 0.0               # L2 regularisation strength (ridge only)

[ml.pca]
nComponents = 2
```

**Backwards-compatibility.** Schema-v1 configs that used the flat
`ml.method` / `ml.k` / `ml.eps` / `ml.forecastPeriods` / `ml.nComponents`
/ `ml.targetKey` keys still validate. `validate()` promotes them into the
matching nested sub-section, so downstream code can always read
`config.ml.classify`, `config.ml.cluster`, etc.

### `[rl]` — Reinforcement-learning system

Configure the tabular TD agents (`wasm4pm/src/rl_orchestrator.rs`) plus
the LinUCB algorithm-selector (`wasm4pm/src/ml/linucb.rs`).

```toml
[rl]
enabled         = true
agents          = ["QLearning", "SARSA", "DoubleQLearning", "ExpectedSARSA", "REINFORCE"]
learning_rate   = 0.1     # α in (0, 1]
discount_factor = 0.99    # γ in [0, 1]
epsilon         = 0.1     # ε-greedy exploration in [0, 1]

[rl.convergence]
min_cycles                = 50    # gate: no convergence checks before this
target_reward_improvement = 0.05  # mean Δ-reward (window over window) considered "still improving"
window_size               = 10    # trailing window for mean-reward computation

# LinUCB / GPU dispatch (algorithm-selector contextual bandit)
gpu_enabled      = false
linucb_lambda    = 1.0
ucb1_exploration = 1.4142  # √2 (Li et al. 2010 default)
```

### `[prediction]` — Predictive process mining

```toml
[prediction]
enabled         = true
activityKey     = "concept:name"
ngramOrder      = 2                     # 2..5
driftWindowSize = 10
tasks           = ["next_activity", "remaining_time", "drift", "outcome"]

[prediction.drift]
ewma_alpha = 0.2   # EWMA smoothing α in (0, 1]
threshold  = 0.3   # drift score in (0, 1] that fires a drift event
```

### Built-in presets

For convenience there are three presets you can scaffold from:

```typescript
import { getExamplePresetConfig } from '@wasm4pm/config';

await fs.writeFile('wasm4pm.toml', getExamplePresetConfig('quality'));
//                                       ^ 'fast' | 'balanced' | 'quality'
```

- **fast** — discovery only (DFG), ML/RL/prediction off, 60 s timeout
- **balanced** — heuristic miner + classify/anomaly + next-activity + drift
- **quality** — ILP miner + all six ML tasks + 4 RL agents + 4 prediction tasks

## Environment Variables

Override config via environment variables with `WASM4PM_` prefix.

### Core

```bash
WASM4PM_PROFILE=quality              # execution.profile (fast|balanced|quality|stream)
WASM4PM_ALGORITHM=heuristic_miner    # algorithm.name
WASM4PM_LOG_LEVEL=debug              # observability.logLevel
WASM4PM_WATCH=true                   # watch.enabled
WASM4PM_OUTPUT_FORMAT=json           # output.format
WASM4PM_OUTPUT_DESTINATION=/tmp/out.json
WASM4PM_SOURCE_KIND=stream           # source.kind
WASM4PM_SINK_KIND=http               # sink.kind
WASM4PM_OTEL_ENABLED=true
WASM4PM_OTEL_ENDPOINT=http://localhost:4318
```

### ML / RL / Prediction

```bash
# ML
WASM4PM_ML_ENABLED=true
WASM4PM_ML_ALGORITHMS=classify,cluster,forecast    # comma-separated tasks

# RL
WASM4PM_RL_ENABLED=true
WASM4PM_RL_AGENTS=QLearning,SARSA                  # comma-separated agents
WASM4PM_RL_LEARNING_RATE=0.05                      # number in (0, 1]
WASM4PM_RL_DISCOUNT_FACTOR=0.95                    # number in [0, 1]
WASM4PM_RL_EPSILON=0.1                             # number in [0, 1]

# Prediction
WASM4PM_PREDICTION_ENABLED=true
WASM4PM_PREDICTION_TASKS=next_activity,drift
WASM4PM_PREDICTION_ACTIVITY_KEY=concept:name
WASM4PM_PREDICTION_NGRAM_ORDER=3                   # integer in [2, 5]
WASM4PM_PREDICTION_DRIFT_WINDOW=10
WASM4PM_PREDICTION_DRIFT_EWMA_ALPHA=0.2            # number in (0, 1]
WASM4PM_PREDICTION_DRIFT_THRESHOLD=0.3             # number in (0, 1]
```

A complete `.env` template covering every supported variable is available
programmatically via `getExampleEnvFile()`.

### Validation

Out-of-range or non-numeric env values are rejected at load time with a
clear, prefixed error message — for example:

```
Invalid WASM4PM_RL_LEARNING_RATE: 5 must be in (0, 1]
Invalid WASM4PM_PREDICTION_DRIFT_THRESHOLD: "abc" must be a number in (0, 1]
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
//   execution: { value: {...}, source: 'config', path: './wasm4pm.toml' },
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
import { hashConfig, fingerprintConfig, verifyConfigHash } from '@wasm4pm/config';

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
import { validate } from '@wasm4pm/config';

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
import { diffConfigs } from '@wasm4pm/config';

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
- `configSearchPaths?: string[]` - Paths to search for config files (default: `[cwd, ~/.wasm4pm]`)
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
