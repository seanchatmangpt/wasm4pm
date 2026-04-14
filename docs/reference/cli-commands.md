# Reference: pictl CLI Commands

**Version**: 26.4.7
**Platform**: Linux, macOS, Windows

## pictl init

Initialize configuration

```bash
pictl init [OPTIONS]
```

Options:
- `--sample` - Create sample event log
- `--validate <FILE>` - Validate config file
- `--help` - Show help

## pictl run

Run process discovery with optional ML post-analysis

```bash
pictl run -i <LOG> [OPTIONS]
```

Options:
- `-i, --input <FILE>` - Input event log (XES/JSON)
- `--config <FILE>` - Configuration file
- `--profile <PROFILE>` - Override profile: fast|balanced|quality|stream
- `--format <FORMAT>` - Output format: human|json
- `--verbose` - Enable verbose logging
- `--dry-run` - Validate without executing
- `--timeout <MS>` - Override timeout in milliseconds
- `--no-save` - Skip auto-saving results

When `[ml]` config section has `enabled = true`, runs ML analysis tasks after discovery.

Exit codes:
- `0` - Success
- `1` - CONFIG_ERROR
- `2` - SOURCE_ERROR
- `3` - EXECUTION_ERROR
- `4` - PARTIAL_SUCCESS
- `5` - SYSTEM_ERROR

## pictl compare

Side-by-side algorithm comparison with ASCII sparklines

```bash
pictl compare <ALGOS> -i <LOG> [OPTIONS]
```

Options:
- `-i, --input <FILE>` - Input event log
- `--format <FORMAT>` - Output format

Example: `pictl compare dfg,alpha,heuristic -i log.xes`

## pictl diff

Compare two event logs via Jaccard similarity on DFG edges

```bash
pictl diff <LOG1> <LOG2>
```

## pictl predict

Predictive mining (next-activity, remaining-time, outcome, drift, features, resource)

```bash
pictl predict <TASK> -i <LOG> [OPTIONS]
```

Tasks: `next-activity`, `remaining-time`, `outcome`, `drift`, `features`, `resource`

## pictl ml

ML analysis subtasks

```bash
pictl ml <TASK> [OPTIONS]
```

Tasks:
- `classify` - Trace classification (KNN, etc.)
- `cluster` - Trace clustering (K-Means, etc.)
- `forecast` - Time series forecasting
- `anomaly` - Anomaly detection
- `regress` - Remaining-time regression
- `pca` - Feature dimensionality reduction

Options:
- `-i, --input <FILE>` - Input event log
- `--method <METHOD>` - ML method (knn, kmeans, etc.)
- `-k <N>` - Number of neighbors/clusters
- `--format <FORMAT>` - Output format

Example: `pictl ml classify -i log.xes --method knn -k 5`

## pictl powl

POWL process model discovery

```bash
pictl powl -i <LOG> [OPTIONS]
```

## pictl drift-watch

Real-time EWMA drift monitoring with optional ML anomaly detection

```bash
pictl drift-watch -i <LOG> [OPTIONS]
```

Options:
- `-i, --input <FILE>` - Input event log
- `--enhanced` - Enable ML anomaly detection overlay
- `--format <FORMAT>` - Output format

## pictl watch

Monitor file changes and re-run discovery

```bash
pictl watch --config <FILE> [OPTIONS]
```

Options:
- `--config <FILE>` - Configuration file
- `--verbose` - Detailed output
- `--format <FORMAT>` - Output format

## pictl status

WASM engine health and system info

```bash
pictl status
```

## pictl doctor

6-check environment diagnostic

```bash
pictl doctor
```

## pictl explain

Show execution plan

```bash
pictl explain --config <FILE> [OPTIONS]
```

Options:
- `--config <FILE>` - Configuration file
- `--mode <MODE>` - brief|detailed|verbose
- `--expand-env` - Show resolved env vars
- `--show-provenance` - Show config sources

## pictl results

Browse/inspect saved results in `.wasm4pm/results/`

```bash
pictl results [OPTIONS]
```

## Global Options

```bash
pictl [GLOBAL_OPTIONS] <COMMAND>
```

Global options:
- `--version` - Show version
- `--help` - Show help
- `--config-dir <DIR>` - Config directory

## Environment Variables

- `WASM4PM_CONFIG_FILE` - Default config file
- `WASM4PM_PROFILE` - Default profile
- `WASM4PM_LOG_LEVEL` - Log level
- `WASM4PM_DEBUG` - Enable debug logging

## Examples

```bash
# Simple discovery
pictl run -i events.xes

# Discovery + ML analysis
pictl run -i events.xes --config config-with-ml.toml

# ML classification
pictl ml classify -i events.xes --method knn -k 5

# Algorithm comparison
pictl compare dfg,alpha,heuristic -i events.xes

# Drift monitoring with ML anomaly detection
pictl drift-watch -i events.xes --enhanced

# Predict remaining time
pictl predict remaining-time -i events.xes

# Health check
pictl status

# Environment diagnostic
pictl doctor

# Browse saved results
pictl results
```

## See Also

- [How-To: Analyze Log](../how-to/analyze-log.md)
- [Reference: Config Schema](./config-schema.md)
- [Reference: Prediction Config](./prediction-config.md)
