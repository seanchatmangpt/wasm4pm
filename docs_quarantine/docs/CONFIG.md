# Configuration Guide

Complete reference for configuring wasm4pm via files, environment variables, and CLI arguments.

## Configuration Hierarchy

wasm4pm resolves configuration from **five layers** (highest to lowest priority):

1. **CLI Arguments** — `wpm run --algorithm dfg --profile quality`
2. **TOML Config** — `wasm4pm.toml` in current directory
3. **JSON Config** — `wasm4pm.json` in current directory
4. **Environment Variables** — `WASM4PM_*` prefix
5. **Defaults** — Built-in sensible defaults

**Example:**
```bash
# .env or shell
export WASM4PM_PROFILE=balanced

# wasm4pm.toml
[execution]
profile = "quality"

# CLI
$ wpm run sample.xes --profile fast

# Result: "fast" (CLI argument wins)
```

## Configuration Files

### wasm4pm.toml (TOML Format)

**Location:** Current working directory, `~/.wasm4pm/wasm4pm.toml`, or specified via `--config`

**Example:**
```toml
schema_version = 1
version = "26.4.5"

[source]
kind = "file"          # file | stream | http
path = "./events.xes"

[sink]
kind = "stdout"        # stdout | file | http
path = "./output.pnml"

[algorithm]
name = "heuristic_miner"    # see Algorithm Reference below

[algorithm.parameters]
# Algorithm-specific parameters (optional)
dependency_threshold = 0.3

[execution]
profile = "balanced"   # fast | balanced | quality | stream
timeout = 300000       # milliseconds (5 min)
maxMemory = 1073741824 # bytes (1 GB), optional

[observability]
logLevel = "info"      # debug | info | warn | error
metricsEnabled = false # true | false

[observability.otel]
enabled = false
exporter = "otlp"      # otlp | console | none
endpoint = "http://localhost:4318"
required = false       # fail if OTEL unavailable?

[watch]
enabled = false
poll_interval = 1000   # milliseconds

[output]
format = "human"       # human | json
destination = "stdout" # stdout | stderr | <file path>
pretty = true
colorize = true

[prediction]
enabled = false
activityKey = "concept:name"
ngramOrder = 2         # 2–5
driftWindowSize = 10
tasks = []             # next_activity | remaining_time | drift | outcome | features | resource
```

### wasm4pm.json (JSON Format)

**Same structure as TOML, JSON equivalent:**

```json
{
  "schemaVersion": 1,
  "source": {
    "kind": "file",
    "path": "./events.xes"
  },
  "algorithm": {
    "name": "heuristic_miner",
    "parameters": {
      "dependency_threshold": 0.3
    }
  },
  "execution": {
    "profile": "balanced",
    "timeout": 300000
  },
  "observability": {
    "logLevel": "info",
    "otel": {
      "enabled": true,
      "exporter": "otlp",
      "endpoint": "http://localhost:4318"
    }
  },
  "output": {
    "format": "json",
    "destination": "stdout"
  }
}
```

## Environment Variables

All configuration can be set via `WASM4PM_*` environment variables:

| Variable | Maps To | Example |
|----------|---------|---------|
| `WASM4PM_SOURCE_KIND` | source.kind | `file` |
| `WASM4PM_SOURCE_PATH` | source.path | `./events.xes` |
| `WASM4PM_ALGORITHM` | algorithm.name | `ilp` |
| `WASM4PM_PROFILE` | execution.profile | `quality` |
| `WASM4PM_TIMEOUT` | execution.timeout | `300000` |
| `WASM4PM_OUTPUT_FORMAT` | output.format | `json` |
| `WASM4PM_OUTPUT_DESTINATION` | output.destination | `/tmp/results.json` |
| `WASM4PM_LOG_LEVEL` | observability.logLevel | `debug` |
| `WASM4PM_OTEL_ENABLED` | observability.otel.enabled | `true` |
| `WASM4PM_OTEL_ENDPOINT` | observability.otel.endpoint | `http://localhost:4318` |
| `WASM4PM_PREDICTION_ENABLED` | prediction.enabled | `true` |
| `WASM4PM_ACTIVITY_KEY` | prediction.activityKey | `concept:name` |

**Example:**
```bash
export WASM4PM_PROFILE=quality
export WASM4PM_OUTPUT_FORMAT=json
export WASM4PM_ALGORITHM=ilp

wpm run events.xes
```

## CLI Arguments

All configuration can also be set via CLI:

```bash
wpm run events.xes \
  --algorithm heuristic_miner \
  --profile quality \
  --format json \
  --output /tmp/results.json \
  --log-level debug
```

## Execution Profiles

Profiles balance **speed** vs. **quality**:

| Profile | Use Case | Algorithm | Speed | Quality |
|---------|----------|-----------|-------|---------|
| `fast` | Exploratory analysis | DFG | ●──── | ●───── |
| `balanced` | **Default** | Heuristic Miner | ──●── | ──●── |
| `quality` | Production models | ILP / Genetic | ────● | ────● |
| `stream` | Real-time data | SIMD DFG | ●──── | ●───── |

**Example:**
```bash
# Fast exploration
wpm run large.xes --profile fast

# Production-grade model
wpm run large.xes --profile quality
```

## Algorithm Reference

### Discovery Algorithms

**Fast Tier (profiles: fast, balanced, stream):**
- `dfg` — Directly-Follows Graph
- `process_skeleton` — Skeleton variant
- `simd_streaming_dfg` — SIMD-accelerated streaming

**Balanced Tier (profiles: balanced, quality):**
- `heuristic_miner` — Heuristic Miner (threshold: 0.0–1.0)
- `alpha_plus_plus` — Alpha++ Petri net
- `inductive_miner` — Inductive Miner
- `hill_climbing` — Hill Climbing optimization
- `declare` — DECLARE constraint mining

**Quality Tier (profile: quality):**
- `genetic_algorithm` — Genetic Algorithm (100+ generations)
- `ilp` — Integer Linear Programming
- `ant_colony` — Ant Colony Optimization
- `pso` — Particle Swarm Optimization
- `simulated_annealing` — Simulated Annealing
- `a_star` — A* search
- `optimized_dfg` — Optimized DFG

For **algorithm-specific parameters** (dependency thresholds, population sizes, etc.), see [docs/reference/algorithms.md](reference/algorithms.md).

### Analysis Algorithms

- `conformance` — Token replay fitness + precision
- `temporal` — Performance spectrum + bottleneck analysis
- `social` — Social network mining (handover + working-together)

### ML Tasks

- `ml_classify` — Decision tree / Naive Bayes classification
- `ml_cluster` — K-means clustering
- `ml_forecast` — Forecasting (linear, exponential, polynomial)
- `ml_anomaly` — Anomaly detection (EMA + threshold)
- `ml_regress` — Linear regression
- `ml_pca` — Principal Component Analysis

## Output Formats

### human (Console Output)

Colored, human-readable format with emoji and ASCII tables:

```bash
wpm run sample.xes --format human
```

**Output:**
```
✓ Discovery complete
  Algorithm: dfg
  Activities: 12
  Traces: 950
  Variants: 85
  Mean trace length: 8.3
  Receipt: 3a7f9e2d...
```

### json (Machine-Readable)

Structured JSON for integration and automation:

```bash
wpm run sample.xes --format json
```

**Output:**
```json
{
  "status": "success",
  "algorithm": "dfg",
  "model": {
    "activities": 12,
    "transitions": 28,
    "start_activities": ["Register"],
    "end_activities": ["Release"]
  },
  "statistics": {
    "traces": 950,
    "variants": 85,
    "mean_length": 8.3
  },
  "receipt": {
    "run_id": "uuid-v4",
    "config_hash": "blake3-64",
    "output_hash": "blake3-64",
    "status": "success"
  }
}
```

## Special Cases

### Disable Auto-Save

By default, results are saved to `.wasm4pm/results/`. Disable:

```bash
wpm run sample.xes --no-save
# Output goes to stdout only
```

### Custom Results Directory

```bash
wpm run sample.xes --results-dir /tmp/wasm4pm-output
```

### Stream Mode (For Large Logs)

Process logs larger than available memory:

```bash
wpm run huge-million-event-log.xes --profile stream
```

Uses SIMD-accelerated streaming DFG (memory-constant).

### Watch Mode (For Continuous Monitoring)

Re-run discovery when config changes:

```bash
wpm watch --config wasm4pm.toml
# Monitors wasm4pm.toml and re-runs on save
```

## Validation

Validate a configuration file without running:

```bash
wpm init --validate wasm4pm.toml
# Outputs: OK or error details
```

## Initialization Helper

Generate a starter `wasm4pm.toml`:

```bash
wpm init
# Prompts for: source file, algorithm, profile
# Creates: wasm4pm.toml, .env.example, .gitignore

# With preset
wpm init --preset quality
# Pre-configures for high-quality discovery
```

**Presets:**
- `fast` — Quick exploration
- `balanced` — Balanced speed/quality (default)
- `quality` — High-quality models
- `streaming` — Real-time data
- `conformance` — Fitness checking focus

## Logging & Debugging

Set log level to see internal behavior:

```bash
# Debug: very verbose
wpm run sample.xes --log-level debug

# Trace: extremely verbose (for developers)
RUST_LOG=trace wpm run sample.xes
```

**Log levels:**
- `error` — Only errors
- `warn` — Warnings and above
- `info` — Information (default)
- `debug` — Developer details
- `trace` — Everything (slow)

## OTEL Integration

Enable OpenTelemetry for distributed tracing:

```toml
[observability.otel]
enabled = true
exporter = "otlp"
endpoint = "http://localhost:4318"
required = false   # If false, continue if OTEL unavailable
```

Visualize in Jaeger: http://localhost:16686

## Performance Tuning

### Memory Limit

```bash
wpm run large.xes --max-memory 4294967296  # 4GB
```

### Timeout

```bash
wpm run slow-discovery.xes --timeout 600000  # 10 minutes
```

### Parallel Processing

(Note: WASM is single-threaded, but Rust algorithms may spawn threads)

```bash
export RAYON_NUM_THREADS=4
wpm run sample.xes
```

## Troubleshooting

### Config File Not Found

```bash
# Specify path explicitly
wpm run sample.xes --config /path/to/wasm4pm.toml
```

### Validation Errors

```bash
# Check for syntax errors
wpm init --validate wasm4pm.json

# Or inspect the error message carefully:
wpm run sample.xes 2>&1 | grep -i error
```

### Environment Variable Not Applied

Ensure prefix is correct:

```bash
# ✗ WRONG
export WASM4PM_ALGO=dfg

# ✓ CORRECT
export WASM4PM_ALGORITHM=dfg
```

## See Also

- **[docs/QUICK_START.md](QUICK_START.md)** — 3-minute walkthrough
- **[docs/reference/algorithms.md](reference/algorithms.md)** — Algorithm parameters
- **[docs/reference/cli-commands.md](reference/cli-commands.md)** — All CLI commands
- **[WASM_API.md](../WASM_API.md)** — Low-level WASM API
