# How-To: Configuration Resolution Walkthrough

**Time required**: 20 minutes  
**Difficulty**: Intermediate  
**Prereq**: Basic familiarity with TOML, environment variables, CLI

---

## Quick Summary

pictl resolves configuration through 5 layers, each with a specific scope and priority. Understanding the resolution order helps you predict which setting wins when multiple layers define the same value.

**Resolution order (highest to lowest priority):**

1. **CLI arguments** (e.g., `--profile fast`)
2. **TOML config file** (e.g., `./pictl.toml` or `~/.wasm4pm/pictl.toml`)
3. **JSON config file** (fallback if no TOML exists)
4. **Environment variables** (e.g., `WASM4PM_PROFILE=fast`)
5. **Hardcoded defaults** (built into pictl)

Later layers override earlier ones. When a field is defined in multiple layers, **the higher layer wins**.

---

## Layer Overview

### Layer 5: Hardcoded Defaults

These are the values pictl uses if you don't specify anything:

```
schema_version = 1
version = "26.4.5"
execution.profile = "balanced"
execution.timeout = 300000 (ms)  # 5 minutes
execution.maxMemory = 1073741824 (bytes)  # 1 GB
observability.logLevel = "info"
observability.metricsEnabled = false
output.format = "human"
output.destination = "stdout"
algorithm.name = "dfg"
source.kind = "file"
sink.kind = "stdout"
prediction.enabled = false
watch.enabled = false
```

**When to rely on defaults:**
- Initial exploration (don't need a config file)
- Simple one-off runs with sensible middle-ground settings
- Development/testing

---

### Layer 4: Environment Variables

Set these in your shell or in CI/CD to override defaults across multiple runs without editing config files.

**Supported environment variables:**

| Variable | Maps To | Example |
|----------|---------|---------|
| `WASM4PM_PROFILE` | `execution.profile` | `WASM4PM_PROFILE=fast` |
| `WASM4PM_TIMEOUT` | `execution.timeout` | `WASM4PM_TIMEOUT=600000` |
| `WASM4PM_LOG_LEVEL` | `observability.logLevel` | `WASM4PM_LOG_LEVEL=debug` |
| `WASM4PM_WATCH` | `watch.enabled` | `WASM4PM_WATCH=true` |
| `WASM4PM_OUTPUT_FORMAT` | `output.format` | `WASM4PM_OUTPUT_FORMAT=json` |
| `WASM4PM_OUTPUT_DESTINATION` | `output.destination` | `WASM4PM_OUTPUT_DESTINATION=/tmp/out` |
| `WASM4PM_ALGORITHM` | `algorithm.name` | `WASM4PM_ALGORITHM=genetic` |
| `WASM4PM_SINK_KIND` | `sink.kind` | `WASM4PM_SINK_KIND=file` |
| `WASM4PM_SOURCE_KIND` | `source.kind` | `WASM4PM_SOURCE_KIND=stream` |
| `WASM4PM_OTEL_ENABLED` | `observability.otel.enabled` | `WASM4PM_OTEL_ENABLED=true` |
| `WASM4PM_OTEL_ENDPOINT` | `observability.otel.endpoint` | `WASM4PM_OTEL_ENDPOINT=http://localhost:4318` |
| `WASM4PM_PREDICTION_ENABLED` | `prediction.enabled` | `WASM4PM_PREDICTION_ENABLED=true` |
| `WASM4PM_PREDICTION_TASKS` | `prediction.tasks` | `WASM4PM_PREDICTION_TASKS=next_activity,remaining_time` |
| `WASM4PM_PREDICTION_ACTIVITY_KEY` | `prediction.activityKey` | `WASM4PM_PREDICTION_ACTIVITY_KEY=activity` |
| `WASM4PM_PREDICTION_NGRAM_ORDER` | `prediction.ngramOrder` | `WASM4PM_PREDICTION_NGRAM_ORDER=3` |
| `WASM4PM_PREDICTION_DRIFT_WINDOW` | `prediction.driftWindowSize` | `WASM4PM_PREDICTION_DRIFT_WINDOW=15` |

**When to use environment variables:**
- CI/CD pipelines (Docker, GitHub Actions, Kubernetes)
- Temporary overrides for a single run
- Secrets that shouldn't be in version control (e.g., OTel endpoints)
- Cross-project configuration inheritance

**Example:**
```bash
# Run with fast profile and JSON output
WASM4PM_PROFILE=fast WASM4PM_OUTPUT_FORMAT=json pmctl run -i events.xes
```

---

### Layer 3: JSON Config File

JSON config provides granular control via a file. pictl searches for `wasm4pm.json` in:

1. Current working directory (`.`)
2. Home directory config folder (`~/.wasm4pm/`)

The first file found is used. If TOML exists, JSON is skipped.

**Example `wasm4pm.json`:**

```json
{
  "schemaVersion": 1,
  "version": "26.4.5",
  "source": {
    "kind": "file",
    "path": "./events.xes"
  },
  "sink": {
    "kind": "file",
    "path": "./output.pnml"
  },
  "algorithm": {
    "name": "genetic",
    "parameters": {
      "population_size": 100,
      "generations": 50
    }
  },
  "execution": {
    "profile": "quality",
    "timeout": 600000,
    "maxMemory": 2147483648
  },
  "observability": {
    "logLevel": "debug",
    "metricsEnabled": true,
    "otel": {
      "enabled": true,
      "exporter": "otlp",
      "endpoint": "http://localhost:4318"
    }
  },
  "output": {
    "format": "json",
    "destination": "stdout",
    "pretty": true
  },
  "prediction": {
    "enabled": true,
    "tasks": ["next_activity", "remaining_time"],
    "activityKey": "concept:name",
    "ngramOrder": 2,
    "driftWindowSize": 10
  }
}
```

**When to use JSON:**
- Programmatic config generation
- Integration with systems that emit JSON
- Lighter than TOML for small configs

---

### Layer 2: TOML Config File

TOML is the preferred format for pictl. It's human-readable and supports deep nesting. pictl searches for `pictl.toml` in:

1. Current working directory (`.`)
2. Home directory config folder (`~/.wasm4pm/`)

**Example `pictl.toml`:**

```toml
schema_version = 1
version = "26.4.5"

[source]
kind = "file"
path = "./events.xes"

[sink]
kind = "file"
path = "./output.pnml"

[algorithm]
name = "genetic"

[algorithm.parameters]
population_size = 100
generations = 50

[execution]
profile = "quality"
timeout = 600000
maxMemory = 2147483648

[observability]
logLevel = "debug"
metricsEnabled = true

[observability.otel]
enabled = true
exporter = "otlp"
endpoint = "http://localhost:4318"

[output]
format = "json"
destination = "stdout"
pretty = true

[prediction]
enabled = true
tasks = ["next_activity", "remaining_time"]
activityKey = "concept:name"
ngramOrder = 2
driftWindowSize = 10
```

**When to use TOML:**
- Primary project configuration
- Source control (config versioning)
- Team collaboration
- Complex nested settings

---

### Layer 1: CLI Arguments

CLI flags override all other layers. These apply only to the single command invocation.

**Supported CLI flags:**

| Flag | Maps To | Type | Example |
|------|---------|------|---------|
| `--config <PATH>` | Search path | string | `--config ./my-config.toml` |
| `--profile <NAME>` | `execution.profile` | enum | `--profile fast` |
| `--format <FORMAT>` | `output.format` | enum | `--format json` |
| `--output <PATH>` | `output.destination` | string | `--output /tmp/result` |
| `--watch` | `watch.enabled` | bool | `--watch` |
| `--dry-run` | Validation mode | bool | `--dry-run` |
| `--verbose` | `observability.logLevel` | bool | `--verbose` |
| `--timeout <MS>` | `execution.timeout` | number | `--timeout 600000` |

**When to use CLI args:**
- One-off commands
- Overriding a single setting
- Scripting (don't edit config for each run)
- Testing different parameters quickly

**Example:**
```bash
pmctl run -i events.xes --profile fast --format json --output /tmp/results.json
```

---

## Real Walkthrough: Tracing a Single Config Value

### Example: Resolving `execution.profile`

Let's trace where the final `execution.profile` value comes from when you run:

```bash
WASM4PM_PROFILE=fast pmctl run -i events.xes --profile quality
```

#### Step 1: Collect from each layer

**Layer 5 (Defaults):**
- `execution.profile = "balanced"`

**Layer 4 (Environment):**
- `WASM4PM_PROFILE=fast` → `execution.profile = "fast"`

**Layer 3 (TOML file):**
Suppose `./pictl.toml` exists with:
```toml
[execution]
profile = "stream"
```
- `execution.profile = "stream"`

**Layer 2 (JSON file):**
No JSON file (TOML took precedence). Skipped.

**Layer 1 (CLI):**
- `--profile quality` → `execution.profile = "quality"`

#### Step 2: Merge in reverse (CLI wins)

The resolution order applies as we go UP the layers:

```
CLI (--profile quality)           ← WINS (highest priority)
    ↓ overrides
TOML (pictl.toml: stream)
    ↓ overrides
Env (WASM4PM_PROFILE=fast)
    ↓ overrides
Defaults (balanced)
```

**Final result:**
```
execution.profile = "quality"
```

The CLI argument `--profile quality` overrides the TOML, environment variable, and defaults.

---

## Walkthrough 2: Complex Case (Multi-Layer Mix)

Run this command with a mixed config setup:

```bash
WASM4PM_OUTPUT_FORMAT=json pmctl run -i events.xes --config ./custom.toml
```

**Setup:**
- Default `execution.timeout = 300000` (5 min)
- Environment: `WASM4PM_PROFILE=fast` (not set for timeout)
- TOML (`./custom.toml`): `execution.timeout = 600000` (10 min)
- CLI: Not specified (no `--timeout` flag)

#### Step 1: Collect from each layer

| Layer | Field | Value | Source |
|-------|-------|-------|--------|
| 5 | `execution.timeout` | 300000 | default |
| 4 | `execution.timeout` | _(not set)_ | env (no WASM4PM_TIMEOUT) |
| 3 | `execution.timeout` | 600000 | TOML file |
| 2 | `execution.timeout` | _(not set)_ | JSON (not used) |
| 1 | `execution.timeout` | _(not set)_ | CLI (no `--timeout`) |

#### Step 2: Resolve (highest non-empty wins)

Start from Layer 1 (CLI) and go DOWN until we find a value:

```
CLI: not set
  ↓
TOML: 600000  ← FOUND!
```

**Final result:**
```
execution.timeout = 600000
```

The TOML config wins because the CLI didn't override it.

---

## Walkthrough 3: Error Case (Invalid Value)

Run:

```bash
WASM4PM_PROFILE=invalid_profile pmctl run -i events.xes
```

**Resolution:**
1. CLI layer: Not specified (no `--profile` flag)
2. TOML layer: Not specified (assume no pictl.toml)
3. JSON layer: Not specified
4. Env layer: `WASM4PM_PROFILE=invalid_profile`
5. Default layer: `execution.profile = "balanced"`

The environment variable wins, so pictl tries to use `profile = "invalid_profile"`.

#### Validation Catches It

When pictl validates the resolved config using Zod schema, it rejects invalid profile:

```
Zod schema requires: profile must be one of ["fast", "balanced", "quality", "stream"]
Value received: "invalid_profile"
```

**Error output:**
```
Error: CONFIG_INVALID
Field: execution.profile
Reason: Invalid enum value. Expected 'fast' | 'balanced' | 'quality' | 'stream'
Source: environment variable WASM4PM_PROFILE
Value: invalid_profile

Next: Fix the environment variable or use a valid profile in your config.
```

**Exit code:** 1 (CONFIG_ERROR)

---

## Zod Schema Validation

After all 5 layers are merged, the resulting config is validated against a Zod schema. The schema defines:

- **Required fields** (must be present)
- **Valid values** (enums, ranges, formats)
- **Type constraints** (string, number, boolean)
- **Defaults** (provided by schema if field is missing)

**Example schema checks:**

```typescript
// Profile must be one of 4 values
const executionProfileSchema = z.enum(['fast', 'balanced', 'quality', 'stream']);

// Timeout must be positive integer
const timeoutSchema = z.number().int().positive();

// Log level must be valid
const logLevelSchema = z.enum(['debug', 'info', 'warn', 'error']);

// Algorithm name must be registered
const algorithmIdSchema = z.enum(ALGORITHM_IDS);
```

**What happens if validation fails:**
1. pictl reports which field failed
2. Shows expected type/values
3. Indicates which layer the invalid value came from
4. Exits with code 1 (CONFIG_ERROR)

---

## Provenance Tracking

pictl tracks which layer each config value came from. This helps debug resolution issues.

### View Provenance with `pmctl explain`

```bash
pmctl explain --config custom.toml --show-provenance
```

**Output:**
```
Configuration Provenance
========================

execution.profile = "quality"
  Source: CLI (--profile quality)

execution.timeout = 300000
  Source: default (pictl built-in)

observability.logLevel = "debug"
  Source: TOML file (./custom.toml)

output.format = "json"
  Source: environment (WASM4PM_OUTPUT_FORMAT)

prediction.enabled = false
  Source: default (pictl built-in)
```

### Programmatic Provenance

The resolved config includes metadata:

```json
{
  "config": { ... },
  "metadata": {
    "loadTime": 1681234567890,
    "hash": "abc123def456",
    "provenance": {
      "execution.profile": { "kind": "cli", "value": "quality" },
      "execution.timeout": { "kind": "default" },
      "observability.logLevel": { "kind": "toml", "path": "./custom.toml" },
      ...
    }
  }
}
```

---

## Debugging Configuration Issues

### Symptom: Config value is not what I expect

**Step 1: View resolved config**
```bash
pmctl explain --config pictl.toml --show-provenance
```

This shows the final merged config and where each value came from.

**Step 2: Check each layer**

Defaults:
```bash
pmctl init --sample  # Shows default config
```

Environment:
```bash
env | grep WASM4PM_
```

TOML file:
```bash
cat pictl.toml
```

JSON file:
```bash
cat wasm4pm.json
```

CLI:
```bash
pmctl run --help
```

**Step 3: Trace resolution manually**

Use the 5-layer order and mark which layers have values:

```
Layer 1 (CLI): --profile fast
Layer 2 (JSON): not present
Layer 3 (TOML): profile = "quality"
Layer 4 (Env): WASM4PM_PROFILE=balanced
Layer 5 (Default): balanced

Resolution (top-down):
CLI has --profile fast → USE THIS
```

Result: `profile = fast`

### Symptom: Validation error on config

**Step 1: Identify the field**
```
Error: CONFIG_INVALID
Field: execution.timeout
Reason: Expected integer, got string
```

**Step 2: Find which layer provided it**
```bash
pmctl explain --show-provenance | grep "execution.timeout"
```

Output:
```
execution.timeout = "600000"
  Source: environment (WASM4PM_TIMEOUT)
```

**Step 3: Fix the source**

The environment variable has a string instead of number:
```bash
# Bad (string)
export WASM4PM_TIMEOUT="600000"

# Good (will be parsed as number)
export WASM4PM_TIMEOUT=600000
```

Or remove the quotes:
```bash
WASM4PM_TIMEOUT=600000 pmctl run -i events.xes
```

### Symptom: Config file not found

**Check the search paths:**
```bash
pwd  # Current directory
echo $HOME  # Home directory for ~/.wasm4pm/
```

pictl searches these paths in order:
1. Current directory (`.`)
2. `~/.wasm4pm/`

**To use a specific config file:**
```bash
pmctl run -i events.xes --config /path/to/custom/config.toml
```

### Symptom: "Unknown field" error

TOML/JSON has a typo. Example:

```toml
[execution]
profile = "fast"
timout = 600000  # Typo! Should be "timeout"
```

Error:
```
Error: CONFIG_INVALID
Unknown field: execution.timout
```

Fix: Check spelling against the schema.

---

## Best Practices

### 1. Use TOML for Projects

Version control your `pictl.toml` alongside your event logs:
```
project/
  ├── events.xes
  ├── pictl.toml  ← Version control this
  └── README.md
```

### 2. Use Env Vars for Secrets/Overrides

Never commit OTel endpoints or sensitive settings:
```bash
# Good: In CI/CD secrets
WASM4PM_OTEL_ENDPOINT=$SECRET_OTEL_ENDPOINT pmctl run -i events.xes

# Bad: In config file
[observability.otel]
endpoint = "http://internal.secrets..."
```

### 3. Use CLI Args for One-Off Runs

Quick experiments don't need config files:
```bash
# Good: One-off test
pmctl run -i events.xes --profile fast

# OK: If you have a project config
pmctl run -i events.xes --config ./pictl.toml --profile fast
```

### 4. Check Provenance When Debugging

Always run `pmctl explain --show-provenance` before filing an issue:
```bash
pmctl explain --config pictl.toml --show-provenance > debug.txt
```

### 5. Document Non-Obvious Settings

If your config uses non-default values, document why in a comment or README:
```toml
[execution]
profile = "quality"   # High accuracy needed for regulatory audit

[observability]
logLevel = "debug"    # Temporary for performance investigation
```

---

## Reference: All Configurable Fields

| Field | Layer | Type | Valid Values | Default |
|-------|-------|------|--------------|---------|
| `execution.profile` | All | enum | fast, balanced, quality, stream | balanced |
| `execution.timeout` | Env, TOML, JSON, CLI | number (ms) | 1–3600000 | 300000 |
| `execution.maxMemory` | TOML, JSON | number (bytes) | 1–8589934592 | 1073741824 |
| `observability.logLevel` | All | enum | debug, info, warn, error | info |
| `observability.metricsEnabled` | TOML, JSON | bool | true, false | false |
| `output.format` | All | enum | human, json | human |
| `output.destination` | All | string | stdout or file path | stdout |
| `algorithm.name` | All | enum | dfg, alpha, heuristic, genetic, ... | dfg |
| `algorithm.parameters` | TOML, JSON | object | algorithm-specific | {} |
| `source.kind` | All | enum | file, stream, http | file |
| `sink.kind` | All | enum | stdout, file, http | stdout |
| `prediction.enabled` | All | bool | true, false | false |
| `prediction.tasks` | All | array | next_activity, remaining_time, outcome, drift, features, resource | [] |
| `watch.enabled` | All | bool | true, false | false |

---

## Summary

pictl's 5-layer configuration system gives you flexibility:

- **Defaults** for out-of-box simplicity
- **Env vars** for CI/CD and secrets
- **Config files** (TOML/JSON) for projects
- **CLI args** for one-off overrides

Higher layers always win. Use `pmctl explain --show-provenance` to debug resolution issues. Validate early and often with `pmctl init --validate`.

---

## See Also

- [Reference: Config Schema](../reference/config-schema.md) — Full Zod schema definition
- [How-To: Debug Config](./debug-config.md) — Detailed troubleshooting
- [How-To: Multi-Env Config](./multi-env-config.md) — Managing dev/test/prod configs
- [Reference: Environment Variables](../reference/environment-variables.md) — Env var reference
- [Reference: CLI Commands](../reference/cli-commands.md) — Complete CLI flag list
