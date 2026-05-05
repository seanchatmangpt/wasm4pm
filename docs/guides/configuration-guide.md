# Configuration Guide

Complete reference for all wasm4pm configuration options.

**Format:** TOML, JSON, or environment variables | **Validation:** Zod schema | **Precedence:** CLI > File > ENV > Defaults

---

## File-based configuration

### TOML format (recommended)

Create `wasm4pm.toml` in your project root:

```toml
# Source — where to read the event log
[source]
kind = "file"              # file, stream, http
path = "./my-process.xes"
# OR for streaming:
# kind = "stream"
# url = "http://localhost:9001/stream"

# Sink — where to write results
[sink]
kind = "stdout"            # stdout, file, http
# OR for file output:
# kind = "file"
# path = "./results.json"

# Algorithm to run
[algorithm]
name = "dfg"               # See registry for 41 options
[algorithm.parameters]
# Algorithm-specific params (see algorithm guide)

# Execution profile
[execution]
profile = "balanced"       # fast, balanced, quality, stream
timeout = 30000            # milliseconds
maxMemory = 2048           # megabytes

# Observability (logging, telemetry)
[observability]
logLevel = "info"          # debug, info, warn, error
metricsEnabled = true
[observability.otel]
enabled = false
exporter = "console"       # console, jaeger, otlp
endpoint = "http://localhost:4317"

# Prediction tasks
[prediction]
enabled = true
activityKey = "concept:name"
timestampKey = "time:timestamp"
ngramOrder = 3
driftWindowSize = 100
driftAlpha = 0.3
driftThreshold = 0.3
tasks = ["next-activity", "remaining-time", "drift"]

# Watch mode (file watching)
[watch]
enabled = false
pollInterval = 5000        # milliseconds
checkpointDir = ".wasm4pm/checkpoints"

# Output formatting
[output]
format = "human"           # human, json
destination = "stdout"     # stdout, file, dashboard
pretty = true
colorize = true

# Metadata (auto-populated)
[metadata]
# These are computed; don't set manually
# loadTime, hash, provenance tracking
```

### JSON format

Equivalent to TOML:

```json
{
  "source": {
    "kind": "file",
    "path": "./my-process.xes"
  },
  "sink": {
    "kind": "stdout"
  },
  "algorithm": {
    "name": "dfg",
    "parameters": {}
  },
  "execution": {
    "profile": "balanced",
    "timeout": 30000,
    "maxMemory": 2048
  },
  "observability": {
    "logLevel": "info",
    "metricsEnabled": true,
    "otel": {
      "enabled": false,
      "exporter": "console",
      "endpoint": "http://localhost:4317"
    }
  },
  "prediction": {
    "enabled": true,
    "activityKey": "concept:name",
    "ngramOrder": 3,
    "tasks": ["next-activity", "drift"]
  },
  "watch": {
    "enabled": false,
    "pollInterval": 5000
  },
  "output": {
    "format": "human",
    "destination": "stdout",
    "pretty": true
  }
}
```

---

## Environment variables

Prefix: `WASM4PM_` (case-insensitive, underscores separate nested keys)

```bash
# Source
export WASM4PM_SOURCE_KIND=file
export WASM4PM_SOURCE_PATH=./my-process.xes

# Sink
export WASM4PM_SINK_KIND=stdout

# Algorithm
export WASM4PM_ALGORITHM=dfg

# Execution
export WASM4PM_PROFILE=balanced
export WASM4PM_TIMEOUT=30000
export WASM4PM_MAX_MEMORY=2048

# Observability
export WASM4PM_LOG_LEVEL=info
export WASM4PM_METRICS_ENABLED=true
export WASM4PM_OTEL_ENABLED=false
export WASM4PM_OTEL_EXPORTER=console
export WASM4PM_OTEL_ENDPOINT=http://localhost:4317

# Prediction
export WASM4PM_PREDICTION_ENABLED=true
export WASM4PM_PREDICTION_ACTIVITY_KEY=concept:name
export WASM4PM_PREDICTION_NGRAM_ORDER=3
export WASM4PM_PREDICTION_DRIFT_WINDOW=100
export WASM4PM_PREDICTION_DRIFT_ALPHA=0.3
export WASM4PM_PREDICTION_DRIFT_THRESHOLD=0.3
export WASM4PM_PREDICTION_TASKS=next-activity,remaining-time,drift

# Watch mode
export WASM4PM_WATCH_ENABLED=false
export WASM4PM_WATCH_POLL_INTERVAL=5000

# Output
export WASM4PM_OUTPUT_FORMAT=human
export WASM4PM_OUTPUT_DESTINATION=stdout
export WASM4PM_OUTPUT_PRETTY=true
export WASM4PM_OUTPUT_COLORIZE=true
```

---

## CLI arguments (highest priority)

```bash
# Basic usage
wpm run my-log.xes --algorithm dfg

# With explicit options
wpm run my-log.xes \
  --algorithm heuristic_miner \
  --profile quality \
  --output-format json \
  --log-level debug

# Prediction
wpm predict next-activity \
  --input my-log.xes \
  --activity-key concept:name \
  --ngram-order 4

# Watch mode
wpm watch \
  --config wasm4pm.toml \
  --poll-interval 3000

# With OTEL
wpm run my-log.xes \
  --otel-enabled true \
  --otel-endpoint http://localhost:4317
```

---

## Precedence (lowest to highest)

```
Defaults
    ↑
Environment variables (WASM4PM_*)
    ↑
Config file (wasm4pm.toml or wasm4pm.json)
    ↑
CLI arguments (highest priority)
```

**Example:** If `wasm4pm.toml` sets `profile: fast`, but CLI has `--profile quality`, then quality wins.

---

## Source types

### File source

```toml
[source]
kind = "file"
path = "./my-process.xes"        # relative or absolute path
```

**Supported formats:**
- `.xes` — XES 1.0/2.0 (standard)
- `.json` — Custom JSON format
- `.ocel` — Object-centric event log (XML)
- `.ocel2` — OCEL 2.0 (JSON)

### Stream source

```toml
[source]
kind = "stream"
url = "http://localhost:9001/stream"
```

**Expected behavior:**
- Server sends newline-delimited JSON events
- Client connects and reads until EOF or error
- Useful for live process monitoring

### HTTP source

```toml
[source]
kind = "http"
url = "http://api.example.com/logs/production"
```

**Expected behavior:**
- GET request returns XES/JSON/OCEL
- Redirects (3xx) followed
- Auth via `Authorization` header (if available)

---

## Sink types

### Stdout sink

```toml
[sink]
kind = "stdout"
```

**Output:** Formatted text (human-readable) or JSON (machine-readable).

### File sink

```toml
[sink]
kind = "file"
path = "./results.json"
```

**Behavior:**
- Creates parent directories if needed
- Auto-saves discovery/prediction results to `.wasm4pm/results/` (regardless of sink)
- Pass `--no-save` to CLI to disable auto-save

### HTTP sink

```toml
[sink]
kind = "http"
url = "http://example.com/api/results"
```

**Behavior:**
- POST result JSON to endpoint
- Retries 3 times on 5xx errors
- Returns error if endpoint unreachable

---

## Algorithm selection

**41 algorithms available.** See full registry:

```bash
wpm status       # Lists all registered algorithms with descriptions
```

**By profile:**

| Profile | Suitable for | Algorithms |
|---------|--------------|-----------|
| `fast` | Quick exploration | dfg, skeleton, streaming-dfg |
| `balanced` | Default | alpha++, heuristic, inductive + all ML |
| `quality` | High-accuracy models | ilp, genetic, aco, pso + ML |
| `stream` | Real-time logs | streaming-dfg (high throughput) |

**Common algorithms:**

| Algorithm | Speed | Quality | Use when |
|-----------|-------|---------|----------|
| `dfg` | 5 | 30 | Quick visualization |
| `alpha_plus_plus` | 20 | 45 | Balanced speed/accuracy |
| `inductive_miner` | 30 | 55 | Need hierarchical model |
| `heuristic_miner` | 25 | 50 | Complex with loops |
| `ilp` | 80 | 90 | Maximum accuracy (slow) |
| `genetic_algorithm` | 75 | 80 | Quality on large logs |
| `conformance` | 40 | — | Compare log vs. model |
| `ml_classify` | 40 | 60 | Outcome prediction |

---

## Execution profiles

### Profile: `fast`

```toml
[execution]
profile = "fast"
```

**Characteristics:**
- 0-5 second runtime
- Minimal memory
- Trade-off: Lower model quality
- **Algorithms:** DFG, skeleton, streaming-DFG
- **Use:** Exploratory analysis, live dashboards

### Profile: `balanced` (default)

```toml
[execution]
profile = "balanced"
```

**Characteristics:**
- 5-30 second runtime
- Moderate memory
- Balanced speed and quality
- **Algorithms:** Alpha++, heuristic, inductive, all ML
- **Use:** Production discovery, standard analysis

### Profile: `quality`

```toml
[execution]
profile = "quality"
```

**Characteristics:**
- 30+ second runtime
- Higher memory usage
- Best accuracy (computationally expensive)
- **Algorithms:** ILP, genetic, ACO, PSO, ML
- **Use:** Offline analysis, academic rigor required

### Profile: `stream`

```toml
[execution]
profile = "stream"
```

**Characteristics:**
- Designed for real-time logs
- Sub-second latency
- **Algorithms:** SIMD-accelerated streaming-DFG
- **Use:** Live event streams, CEP pipelines

---

## Observability configuration

### Log levels

```toml
[observability]
logLevel = "debug"    # debug, info, warn, error, silent
```

| Level | Output | Use when |
|-------|--------|----------|
| `debug` | All messages including algorithm state | Debugging issues |
| `info` | High-level progress | Normal operation |
| `warn` | Warnings and errors only | Production (less noise) |
| `error` | Errors only | Silent operation |
| `silent` | No output | Headless systems |

### Metrics

```toml
[observability]
metricsEnabled = true
```

**Metrics collected:**
- Algorithm runtime
- Memory peak
- Cache hit rate
- Discovery quality (fitness, precision, generalization)
- Throughput (events/sec)

### OTEL (OpenTelemetry)

```toml
[observability.otel]
enabled = true
exporter = "jaeger"              # console, jaeger, otlp
endpoint = "http://localhost:6831"
```

**Exporters:**
- `console` — Prints to stderr
- `jaeger` — Jaeger backend (UDP port 6831 default)
- `otlp` — OTEL Collector (gRPC port 4317)

**View traces:**
```bash
# Jaeger UI
open http://localhost:16686

# Filter by service: wpm
# Search by span name: discover_dfg, ml_classify, etc.
```

---

## Prediction configuration

### Tasks to run

```toml
[prediction]
tasks = [
  "next-activity",
  "remaining-time",
  "outcome",
  "drift",
  "features",
  "resource"
]
```

**Valid tasks:** All 6 shown above (or any subset).

### Parameters

```toml
[prediction]
enabled = true
activityKey = "concept:name"      # Required: activity attribute
timestampKey = "time:timestamp"   # For time-based tasks
resourceKey = "org:resource"      # For resource prediction
ngramOrder = 3                    # For next-activity
driftWindowSize = 100             # For drift detection
driftAlpha = 0.3                  # EWMA smoothing (0.1-1.0)
driftThreshold = 0.3              # Alert if drift > threshold
```

**Tuning guide:**

| Parameter | Small logs (<1K) | Medium (1K-100K) | Large (>100K) |
|-----------|------------------|------------------|---------------|
| `ngramOrder` | 2 | 3 | 4-5 |
| `driftWindowSize` | 20 | 50 | 100 |
| `driftAlpha` | 0.5 (responsive) | 0.3 (balanced) | 0.1 (smooth) |
| `driftThreshold` | 0.4 (lenient) | 0.3 (standard) | 0.2 (strict) |

---

## Watch mode

Real-time re-discovery when log changes:

```toml
[watch]
enabled = true
pollInterval = 5000               # Check every 5 seconds
checkpointDir = ".wasm4pm/checkpoints"  # Save intermediate results
```

**Behavior:**
1. Watches input log for modifications
2. On change, re-runs discovery
3. Compares results (Jaccard distance on edges)
4. Saves checkpoint if significant change detected

**Use case:** Live process monitoring with file-based logs.

---

## Output formatting

### Human format

```toml
[output]
format = "human"
pretty = true
colorize = true
```

**Example output:**
```
Discovery Results — dfg
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Activities  : 8
Edges       : 15
Fitness     : 0.92
Precision   : 0.81
Generalization: 0.88
```

### JSON format

```toml
[output]
format = "json"
```

**Example output:**
```json
{
  "status": "success",
  "algorithm": "dfg",
  "result": {
    "nodes": ["A", "B", "C"],
    "edges": [{"from": "A", "to": "B", "frequency": 42}]
  },
  "metrics": {
    "fitness": 0.92,
    "runtime_ms": 123
  }
}
```

### Destination

```toml
[output]
destination = "stdout"    # stdout, file, dashboard, webhook
```

| Destination | Use |
|-------------|-----|
| `stdout` | Terminal output (default) |
| `file` | Write to `[sink].path` |
| `dashboard` | Real-time web UI (if enabled) |
| `webhook` | POST to URL |

---

## Example configurations

### Quick exploration

```toml
[execution]
profile = "fast"

[algorithm]
name = "dfg"

[output]
format = "human"
colorize = true
```

### Production discovery + prediction

```toml
[execution]
profile = "balanced"
timeout = 60000

[algorithm]
name = "heuristic_miner"

[prediction]
enabled = true
tasks = ["next-activity", "remaining-time", "drift"]

[observability]
logLevel = "warn"
metricsEnabled = true

[observability.otel]
enabled = true
exporter = "jaeger"
```

### Real-time streaming

```toml
[source]
kind = "stream"
url = "http://localhost:9001/events"

[execution]
profile = "stream"

[prediction]
enabled = true
tasks = ["drift"]
driftWindowSize = 50
driftAlpha = 0.5

[output]
format = "json"
```

### ML-focused analysis

```toml
[algorithm]
name = "ml_classify"
[algorithm.parameters]
method = "naive_bayes"

[output]
format = "json"
destination = "file"
```

---

## Validation and defaults

**Zod schema enforced:** Invalid configs are rejected at load time.

**Defaults (if not specified):**
```
source.kind = "file"
sink.kind = "stdout"
algorithm.name = "dfg"
execution.profile = "balanced"
execution.timeout = 30000 ms
execution.maxMemory = 2048 MB
observability.logLevel = "info"
prediction.enabled = false
prediction.ngramOrder = 3
prediction.driftWindowSize = 100
prediction.driftAlpha = 0.3
prediction.driftThreshold = 0.3
watch.enabled = false
watch.pollInterval = 5000 ms
output.format = "human"
output.pretty = true
output.colorize = true
```

---

## Environment variable expansion

Use `$` notation to reference environment variables:

```toml
[source]
path = "${LOG_PATH}"      # expands to env var LOG_PATH

[observability.otel]
endpoint = "${JAEGER_ENDPOINT:http://localhost:6831}"  # with default
```

---

## Config file discovery

wasm4pm searches for config in this order:

1. `--config <path>` (CLI argument)
2. `wasm4pm.toml` (current directory)
3. `wasm4pm.json` (current directory)
4. Environment variables (`WASM4PM_*`)
5. Built-in defaults

---

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `Config validation failed: ...` | Invalid option or type | Check option name and type in docs |
| `File not found: path` | Source file missing | Verify path is correct and readable |
| `Algorithm not found: xyz` | Algorithm name typo | Run `wpm status` to see available algorithms |
| `OTEL export failed` | Jaeger/OTLP not running | Start Jaeger or OTEL collector |
| `Timeout exceeded` | Operation too slow | Increase `execution.timeout` or use faster profile |

---

## Next steps

- **Prediction config:** [`prediction-quickstart.md`](./prediction-quickstart.md)
- **CLI reference:** [`cli-guide.md`](./cli-guide.md)
- **Troubleshooting:** [`troubleshooting.md`](../troubleshooting.md)

---

See also: [`@wasm4pm/config` API reference](../api/@wasm4pm/config.md)
