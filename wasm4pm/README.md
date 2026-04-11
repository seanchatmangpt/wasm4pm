# pictl — Process Intelligence Control

21 process mining algorithms compiled to WebAssembly. Discover process models from event logs in browsers and Node.js — no Python, no services, just `npm install`.

**Version:** v26.4.10 (CalVer: 2026-04-10)

## Quick Start

### CLI (60 seconds)

```bash
npm install -g @pictl/cli
pictl run process-log.xes
```

### Node.js (30 seconds)

```javascript
const pictl = require('@pictl/engine');
await pictl.init();

const log = pictl.load_eventlog_from_xes(xesContent);
const dfg = JSON.parse(pictl.discover_dfg(log, 'concept:name'));
console.log(`${dfg.nodes.length} activities, ${dfg.edges.length} flows`);
```

### Browser (30 seconds)

```html
<script type="module">
  import pictl from '@pictl/engine';
  await pictl.init();
  const log = pictl.load_eventlog_from_xes(xesContent);
  const dfg = JSON.parse(pictl.discover_dfg(log, 'concept:name'));
</script>
```

### Streaming (IoT / infinite event streams)

```javascript
const pictl = require('@pictl/engine');
await pictl.init();

// Open session — no full log held in memory
const handle = pictl.streaming_dfg_begin();

// Feed events as they arrive
pictl.streaming_dfg_add_event(handle, 'case-1', 'Register');
pictl.streaming_dfg_add_event(handle, 'case-1', 'Approve');
pictl.streaming_dfg_close_trace(handle, 'case-1');

// Live snapshot (non-destructive)
const dfg = JSON.parse(pictl.streaming_dfg_snapshot(handle));

// Finalize: flush open traces, return DFG
const result = JSON.parse(pictl.streaming_dfg_finalize(handle));
console.log(`${result.nodes} nodes, ${result.edges} edges`);
```

## What It Does

**pictl** discovers process models from event logs. Give it a log of activities (who did what, when), and it finds the underlying process structure.

| Capability                   | What It Gives You                                                                                                                                         |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **21 discovery algorithms**  | DFG, Alpha++, ILP, Genetic, PSO, A\*, DECLARE, Heuristic Miner, Inductive Miner, Hill Climbing, ACO, Simulated Annealing, Process Skeleton, Optimized DFG |
| **6 ML analysis algorithms** | Classify, cluster, forecast, anomaly detection, regression, PCA                                                                                           |
| **Streaming API**            | Process infinite event streams with bounded memory                                                                                                        |
| **Conformance checking**     | Token-based replay with fitness, precision, generalization                                                                                                |
| **20+ analytics functions**  | Bottlenecks, variants, concept drift, dependencies, rework detection                                                                                      |
| **Predictions**              | Next activity, remaining time, outcome, drift detection                                                                                                   |

**Input:** XES or JSON event logs. **Output:** Petri nets, DFGs, process trees, DECLARE models, JSON analytics.

## CLI Reference

```bash
# DISCOVERY
pictl run <log.xes>              # Process discovery
pictl compare <algos> -i <log>   # Side-by-side algorithm comparison
pictl diff <log1> <log2>         # Compare two event logs

# PREDICTION (van der Aalst's six perspectives)
pictl predict next-activity -i <log> --prefix "A,B"
pictl predict remaining-time -i <log> --prefix "A"
pictl predict outcome -i <log>
pictl predict drift -i <log>
pictl predict features -i <log>
pictl predict resource -i <log>

# CONFORMANCE & QUALITY
pictl conformance -i <log>       # Measure log-to-model fitness and precision
pictl quality -i <log>           # Multi-dimensional quality assessment
pictl validate <log.xes>         # Validate log schema and data quality

# ANALYSIS & SIMULATION
pictl temporal -i <log>          # Temporal profiles and performance patterns
pictl social -i <log>            # Social network mining (handover, working together)
pictl simulate -i <log>          # Monte Carlo simulation and process tree playout

# MONITORING
pictl drift-watch -i <log>       # Live EWMA concept drift monitor (Ctrl+C to stop)

# ML ANALYSIS
pictl ml classify -i <log>       # Classify traces (knn, logistic_regression)
pictl ml cluster -i <log>        # Cluster traces (kmeans, dbscan)
pictl ml forecast -i <log>       # Forecast drift trends
pictl ml anomaly -i <log>        # Detect anomalies in drift signal
pictl ml regress -i <log>        # Regress remaining time
pictl ml pca -i <log>            # PCA dimensionality reduction

# POWL (Process-Oriented Workflow Language)
pictl powl construct -i <log>    # Construct POWL model from log
pictl powl replay -i <log>       # Replay log against POWL model

# RESULTS & HEALTH
pictl results                    # View all saved discovery & prediction results
pictl results --last             # Print the most recent result
pictl doctor                     # 17-check environment diagnostic
pictl status                     # WASM engine health + system info

# SETUP
pictl init                       # Scaffold pictl.toml + .env.example in current dir
pictl watch                      # Config file watcher — re-run on change
pictl explain                    # Human/academic algorithm explanations
```

**Output formats:** `--format human` (colored terminal) or `--format json` (structured output)

## Performance Benchmarks

**Version:** v26.4.10 | **Hardware:** Apple M3 Max (16P/4E, 36GB unified memory) | **Methodology:** Median of 7 runs

### At a Glance (10K cases)

| Tier            | Algorithms                             | Time       | Use Case                                   |
| --------------- | -------------------------------------- | ---------- | ------------------------------------------ |
| ⚡ Ultra-fast   | DFG, Process Skeleton                  | 2.7–3.0 ms | Real-time dashboards, high-throughput APIs |
| ⚡ Fast         | Heuristic Miner, Inductive Miner       | 14–25 ms   | Interactive discovery, UI-driven analysis  |
| 🚀 Evolutionary | Genetic, ACO, PSO, Simulated Annealing | 21–25 ms   | Quality optimization via population search |
| 🔍 Optimal      | ILP, A\* Search                        | 77–87 ms   | Best possible model, provable quality      |
| 📊 Streaming    | Streaming DFG, Noise-Filtered DFG      | 69–135 ms  | Infinite streams, IoT, memory-constrained  |

**Key metrics:**

- All 21 algorithms tested on real data (BPI 2020: 10,500 traces, 141K events)
- Linear scaling from 100 to 50,000+ cases
- Streaming: 1.4–23x overhead for bounded memory on infinite event streams
- Browser benchmarks: ~40–60% slower than Node.js (expected WASM sandbox overhead)

📖 **Full benchmark report:** [docs/benchmarks/reference/results.md](docs/benchmarks/reference/results.md)
📖 **Benchmark documentation:** [docs/benchmarks/](docs/benchmarks/) — tutorials, methodology, reference

## Documentation

### Getting Started

- [Quick Start](benchmarks/QUICKSTART.md) — 5-minute setup
- [Build Guide](BUILD.md) — Build from source
- [Development](DEVELOPMENT.md) — Development workflow

### Performance & Benchmarks

- [Benchmark Results](docs/benchmarks/reference/results.md) — Full performance tables, all algorithms, all sizes
- [Benchmark Docs](docs/benchmarks/) — Tutorials, how-to guides, methodology, reference
  - [Your First Benchmark](docs/benchmarks/tutorials/first-benchmark.md)
  - [Understanding Results](docs/benchmarks/tutorials/interpreting-results.md)
  - [Streaming vs Batch Tradeoffs](docs/benchmarks/explanation/streaming-vs-batch.md)
  - [Methodology](docs/benchmarks/explanation/methodology.md)

### API & Algorithms

- [API Reference](API.md) — Complete function reference
- [Algorithm Reference](ALGORITHMS.md) — All 21 algorithms explained
- [Configuration](docs/benchmarks/reference/configuration.md) — Config files, ENV vars, profiles

### Integration

- [MCP Integration](MCP.md) — Claude AI / MCP server
- [Architecture](ARCHITECTURE.md) — System design
- [Contributing](CONTRIBUTING.md) — How to contribute

## Architecture

```
pictl/
├── wasm4pm/                # Rust core — 21 algorithms compiled to WASM
│   └── src/                #   Discovery, conformance, analytics, streaming
├── packages/               # TypeScript monorepo (9 packages)
│   ├── @pictl/kernel       #   WASM facade — run(algorithm, handle, params)
│   ├── @pictl/engine       #   Lifecycle state machine
│   ├── @pictl/config       #   Zod-validated config, 5-layer precedence
│   ├── @pictl/planner      #   Execution plan generation
│   ├── @pictl/observability#   CLI output, JSONL, OTEL spans
│   ├── @pictl/contracts    #   Receipts, errors, plans, hashing
│   ├── @pictl/testing      #   Parity/determinism/CLI test harnesses
│   ├── @pictl/ml           #   Micro-ML: classify, cluster, forecast, anomaly
│   └── @pictl/swarm        #   Multi-worker coordinator
├── apps/pmctl/             # CLI tool — pictl command
├── benchmarks/             # Node.js + browser benchmark suite
└── docs/                   # Documentation (Diátaxis)
```

## Installation

```bash
# CLI
npm install -g @pictl/cli

# Library
npm install @pictl/engine

# From source
git clone https://github.com/seanchatmangpt/pictl.git
cd pictl/wasm4pm
npm install && npm run build
```

## Status

**Production Ready** — v26.4.10

- All 21 algorithms tested and operational
- 18 CLI commands for discovery, prediction, conformance, simulation, and analysis
- 6 ML analysis algorithms (classify, cluster, forecast, anomaly, regress, PCA)
- All algorithms benchmarked with real Criterion results
- Validated on BPI 2020 (10,500 traces, 141K events)
- Linear scaling from 100 to 50,000+ cases
- Ready for npm publish

## License

MIT OR Apache-2.0
