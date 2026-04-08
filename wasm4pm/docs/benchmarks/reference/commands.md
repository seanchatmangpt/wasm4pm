# Benchmark Commands Reference

## CLI Commands

### `pictl run <log.xes>`

Run a single discovery algorithm on an event log.

```bash
pictl run log.xes                          # default algorithm (DFG)
pictl run log.xes --algorithm inductive    # specific algorithm
pictl run log.xes --format json            # JSON output
pictl run log.xes --profile quality        # execution profile
pictl run log.xes --no-save                # skip auto-save to .pictl/results/
```

| Flag          | Type    | Default    | Description                                                |
| ------------- | ------- | ---------- | ---------------------------------------------------------- |
| `--algorithm` | string  | `dfg`      | Algorithm name from registry                               |
| `--format`    | string  | `human`    | Output format: `human` or `json`                           |
| `--profile`   | string  | `balanced` | Execution profile: `fast`, `balanced`, `quality`, `stream` |
| `--no-save`   | boolean | false      | Suppress auto-save to `.pictl/results/`                    |

Exit codes: `0` success, `1` config error, `2` source error, `3` execution error.

---

### `pictl compare <algos> -i <log>`

Run multiple algorithms on the same log, output side-by-side table.

```bash
pictl compare dfg heuristic -i log.xes
pictl compare dfg,heuristic,inductive -i log.xes --format json
pictl compare dfg heuristic -i log.xes --verbose
```

| Flag        | Type    | Default  | Description                                |
| ----------- | ------- | -------- | ------------------------------------------ |
| `-i`        | string  | required | Input event log (XES format)               |
| `--format`  | string  | `human`  | Output format: `human` or `json`           |
| `--verbose` | boolean | false    | Include density, complexity, variant count |

Algorithm names are space-separated or comma-separated. See [datasets.md](./datasets.md) for supported algorithms.

---

### `pictl diff <log1> <log2>`

Compare two event logs via Jaccard similarity on DFG edges.

```bash
pictl diff log_v1.xes log_v2.xes
pictl diff log_v1.xes log_v2.xes --format json
```

| Flag       | Type   | Default | Description                      |
| ---------- | ------ | ------- | -------------------------------- |
| `--format` | string | `human` | Output format: `human` or `json` |

Output includes: structural similarity score, activities added/removed/shared, edges added/changed, trace variant overlap.

---

### `pictl status`

WASM engine health check and system info.

```bash
pictl status
```

Reports: WASM binary loaded, algorithm registry count, memory usage, platform info.

---

### `pictl doctor`

Six-check environment diagnostic.

```bash
pictl doctor
```

| Check # | What It Checks                     | Pass Condition           |
| ------- | ---------------------------------- | ------------------------ |
| 1       | WASM binary exists and is loadable | `pkg/wasm4pm_bg.wasm`    |
| 2       | Node.js version >= 18              | `process.version`        |
| 3       | Memory available (>= 512 MB)       | `os.freemem()`           |
| 4       | Algorithm registry populated       | 21 algorithms registered |
| 5       | Config resolution works            | `resolveConfig()`        |
| 6       | XES parser functional              | Parse test fixture       |

Exit codes: `0` all checks pass, `1` one or more checks fail.

---

## Benchmark Runner Commands

### `npm run bench`

Node.js benchmarks using worker threads. Default: 7 iterations, median reported.

```bash
cd wasm4pm
npm run bench
```

### `npm run bench:ci`

CI-optimized mode. 3 iterations, minimal output.

```bash
npm run bench:ci
```

### `npm run bench:browser`

Browser benchmarks via Playwright.

```bash
npm run bench:browser
```

### `npm run bench:browser:ci`

Browser CI mode (headless, 3 iterations).

```bash
npm run bench:browser:ci
```

### `node benchmarks/compare.js`

Node.js vs Browser performance comparison report.

```bash
node benchmarks/compare.js
```

Outputs a table with per-algorithm timing in both environments and the ratio.

---

## Exit Codes

| Code | Constant        | Meaning                                    |
| ---- | --------------- | ------------------------------------------ |
| 0    | SUCCESS         | Command completed successfully             |
| 1    | CONFIG_ERROR    | Invalid configuration or missing arguments |
| 2    | SOURCE_ERROR    | Cannot read or parse the input event log   |
| 3    | EXECUTION_ERROR | WASM execution failed (algorithm error)    |
| 4    | PARTIAL_FAILURE | Some operations succeeded, some failed     |
| 5    | SYSTEM_ERROR    | Unrecoverable system failure (OOM, etc.)   |

---

## Execution Profiles

| Profile    | Algorithm Selection                                 | Use Case                |
| ---------- | --------------------------------------------------- | ----------------------- |
| `fast`     | DFG, Process Skeleton                               | Quick exploration       |
| `balanced` | Heuristic Miner, Alpha++, all ML algorithms         | Default general-purpose |
| `quality`  | Genetic Algorithm, ILP Petri Net, all ML algorithms | High-quality models     |
| `stream`   | Streaming DFG                                       | Infinite event streams  |

Profile is set via `--profile` flag, `PICTL_PROFILE` ENV var, or `execution.profile` in config file.
