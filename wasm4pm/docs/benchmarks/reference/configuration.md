# Benchmark Configuration Reference

## Config File Resolution

### File Names (Searched in Order)

| Priority | File Name      | Status           |
| -------- | -------------- | ---------------- |
| 1        | `wasm4pm.toml` | Current standard |
| 2        | `wasm4pm.json` | Current standard |
| 3        | `wasm4pm.toml` | Backward compat  |
| 4        | `wasm4pm.json` | Backward compat  |

First file found in the working directory wins. If none found, defaults are used.

### Precedence Order

```
CLI flags  >  Config file  >  ENV variables  >  Built-in defaults
```

Higher-priority sources override lower-priority sources. Merging is per-section: a CLI flag for `algorithm` does not affect the `observability` section from the config file.

---

## Config File Schema

### `wasm4pm.toml` Example

```toml
[source]
kind = "file"
path = "log.xes"

[sink]
kind = "stdout"

[algorithm]
name = "heuristic_miner"

[execution]
profile = "balanced"
timeout = 30000          # ms

[observability]
log_level = "info"
otel_enabled = false

[output]
format = "human"
pretty = true
colorize = true

[watch]
enabled = false
```

### `wasm4pm.json` Example

```json
{
  "source": { "kind": "file", "path": "log.xes" },
  "algorithm": { "name": "heuristic_miner" },
  "execution": { "profile": "balanced" },
  "output": { "format": "human" }
}
```

---

## Config Sections

### `source`

| Field  | Type   | Default  | Description                             |
| ------ | ------ | -------- | --------------------------------------- |
| `kind` | string | `"file"` | `file`, `stream`, or `http`             |
| `path` | string | --       | Path to XES event log (for `file` kind) |
| `url`  | string | --       | URL for `http` kind                     |

### `algorithm`

| Field        | Type   | Default | Description                   |
| ------------ | ------ | ------- | ----------------------------- |
| `name`       | string | `"dfg"` | Algorithm ID from registry    |
| `parameters` | object | `{}`    | Algorithm-specific parameters |

### `execution`

| Field       | Type    | Default      | Description                             |
| ----------- | ------- | ------------ | --------------------------------------- |
| `profile`   | string  | `"balanced"` | `fast`, `balanced`, `quality`, `stream` |
| `timeout`   | integer | `30000`      | Maximum execution time in milliseconds  |
| `maxMemory` | integer | --           | Memory limit in MB (optional)           |

### `observability`

| Field             | Type    | Default  | Description                               |
| ----------------- | ------- | -------- | ----------------------------------------- |
| `log_level`       | string  | `"info"` | `trace`, `debug`, `info`, `warn`, `error` |
| `otel_enabled`    | boolean | `false`  | Enable OpenTelemetry span export          |
| `otel_endpoint`   | string  | --       | OTEL collector endpoint                   |
| `metrics_enabled` | boolean | `false`  | Enable metrics collection                 |

### `output`

| Field      | Type    | Default   | Description                 |
| ---------- | ------- | --------- | --------------------------- |
| `format`   | string  | `"human"` | `human` (consola) or `json` |
| `pretty`   | boolean | `true`    | Pretty-print JSON output    |
| `colorize` | boolean | `true`    | Colorize human output       |

### `watch`

| Field            | Type    | Default | Description                    |
| ---------------- | ------- | ------- | ------------------------------ |
| `enabled`        | boolean | `false` | Enable file watcher            |
| `poll_interval`  | integer | `1000`  | Poll interval in ms            |
| `checkpoint_dir` | string  | --      | Directory for checkpoint files |

---

## Environment Variables

### Wasm4pm ENV Variables

| Variable                | Config Path                   | Default    | Example                                       |
| ----------------------- | ----------------------------- | ---------- | --------------------------------------------- |
| `WASM4PM_PROFILE`       | `execution.profile`           | `balanced` | `WASM4PM_PROFILE=fast`                        |
| `WASM4PM_ALGORITHM`     | `algorithm.name`              | `dfg`      | `WASM4PM_ALGORITHM=ilp`                       |
| `WASM4PM_OUTPUT_FORMAT` | `output.format`               | `human`    | `WASM4PM_OUTPUT_FORMAT=json`                  |
| `WASM4PM_LOG_LEVEL`     | `observability.log_level`     | `info`     | `WASM4PM_LOG_LEVEL=debug`                     |
| `WASM4PM_WATCH`         | `watch.enabled`               | `false`    | `WASM4PM_WATCH=true`                          |
| `WASM4PM_OTEL_ENABLED`  | `observability.otel_enabled`  | `false`    | `WASM4PM_OTEL_ENABLED=true`                   |
| `WASM4PM_OTEL_ENDPOINT` | `observability.otel_endpoint` | --         | `WASM4PM_OTEL_ENDPOINT=http://localhost:4317` |

### Legacy ENV Variables (Backward Compatible)

| Legacy Variable         | Maps To                 |
| ----------------------- | ----------------------- |
| `WASM4PM_PROFILE`       | `WASM4PM_PROFILE`       |
| `WASM4PM_ALGORITHM`     | `WASM4PM_ALGORITHM`     |
| `WASM4PM_OUTPUT_FORMAT` | `WASM4PM_OUTPUT_FORMAT` |
| `WASM4PM_LOG_LEVEL`     | `WASM4PM_LOG_LEVEL`     |

---

## Execution Profiles

### Profile Definitions

| Profile    | Algorithm Selection                                 | Timeout   |
| ---------- | --------------------------------------------------- | --------- |
| `fast`     | DFG or Process Skeleton                             | 10,000 ms |
| `balanced` | Heuristic Miner, Alpha++, all ML algorithms         | 30,000 ms |
| `quality`  | Genetic Algorithm, ILP Petri Net, all ML algorithms | 60,000 ms |
| `stream`   | Streaming DFG                                       | 30,000 ms |

### Profile Precedence

CLI `--profile` > `WASM4PM_PROFILE` ENV > config `execution.profile` > default (`balanced`)

---

## Output Formats

### Human Format (default)

`consola` colored terminal output: algorithm name, timing, node/edge counts, ASCII sparklines (in `compare`), status summary.

### JSON Format (`--format json`)

```json
{
  "status": "success",
  "message": "Discovery complete",
  "algorithm": "heuristic_miner",
  "elapsedMs": 14.2,
  "model": {
    "nodes": 12,
    "edges": 34,
    "type": "dfg"
  },
  "receipt": {
    "run_id": "uuid-v4",
    "config_hash": "blake3-hex-64",
    "status": "success"
  }
}
```

---

## Benchmark-Specific Configuration

Benchmark runs are not configured via wasm4pm config files. They use the benchmark runner's own configuration:

| Setting          | Location                  | Default        | Description                      |
| ---------------- | ------------------------- | -------------- | -------------------------------- |
| Iterations       | CLI arg or env            | 7              | Number of runs (median reported) |
| Warmup runs      | CLI arg or env            | 1              | Discarded warmup iterations      |
| Dataset sizes    | Benchmark script          | 100,1K,10K,50K | Cases per synthetic log          |
| Worker threads   | Benchmark script          | 4              | Parallel workers                 |
| CI iterations    | `bench:ci` script         | 3              | Reduced for CI speed             |
| Browser headless | `bench:browser:ci` script | true           | Headless Chromium via Playwright |
