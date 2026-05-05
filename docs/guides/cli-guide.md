# CLI Guide — All 20 Commands

Complete reference for the `wpm` (wasm4pm) command-line interface.

**Version:** v26.4.10+ | **Install:** `npm install -g @wasm4pm/cli`

---

## Command categories

### Core (5)
- `run` — Process discovery
- `compare` — Algorithm comparison
- `diff` — Log comparison
- `watch` — File monitoring
- `status` — System health

### Prediction (2)
- `predict` — Run prediction tasks
- `drift-watch` — Streaming drift detection

### Analysis & ML (4)
- `ml` — ML-powered analysis
- `powl` — Partial-order workflow analysis
- `temporal` — Time-based analysis
- `social` — Organizational network mining

### Quality (3)
- `quality` — Multi-dimensional quality assessment
- `conformance` — Fitness and precision metrics
- `validate` — Log validation

### Simulation & Analysis (2)
- `simulate` — Monte Carlo playout
- `autoprocess` — Autonomous health management

### Autonomic & Utility (3)
- `doctor` — Environment diagnostic
- `explain` — Algorithm explanations
- `init` — Project scaffolding
- `results` — Browse saved results

---

## Core Commands

### `wpm run <log>`

Process discovery from an event log.

```bash
wpm run my-process.xes                      # Quick exploration (DFG)
wpm run my-process.xes --algorithm dfg      # Explicit algorithm
wpm run my-process.xes --algorithm ilp --profile quality
wpm run my-process.xes --format json > results.json
```

**Options:**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `<log>` | path | required | XES, JSON, or OCEL log file |
| `--algorithm` | string | dfg | Algorithm name (see `wpm status`) |
| `--profile` | string | balanced | fast, balanced, quality, stream |
| `--output-format` | string | human | human, json |
| `--log-level` | string | info | debug, info, warn, error |
| `--no-save` | boolean | false | Skip auto-save to `.wasm4pm/results/` |
| `--timeout` | number | 30000 | Max runtime (ms) |
| `--config` | path | auto | Config file path |

**Output:** Process model (DFG, Petri net, or tree depending on algorithm).

**Exit codes:**
- `0` — Success
- `1` — Config error
- `2` — Log error
- `3` — Algorithm error

**Examples:**

```bash
# DFG with default settings
wpm run orders.xes

# High-quality Petri net (slow but accurate)
wpm run orders.xes --algorithm ilp --profile quality

# Streaming DFG for real-time logs
wpm run live.xes --algorithm simd_streaming_dfg --profile stream

# JSON output to file
wpm run orders.xes --format json --no-save > model.json

# Debug mode with telemetry
wpm run orders.xes --log-level debug --otel-enabled
```

---

### `wpm compare <algorithms>`

Side-by-side algorithm comparison.

```bash
wpm compare dfg,alpha_plus_plus,ilp -i my-process.xes
```

**Options:**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `<algorithms>` | string | required | Comma-separated algorithm names |
| `-i, --input` | path | required | Event log file |
| `--output-format` | string | human | human, json |
| `--activity-key` | string | concept:name | Activity attribute |

**Output:** ASCII table or JSON with fitness, precision, generalization, runtime for each.

**Example output:**
```
Algorithm Comparison
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Algorithm          Speed  Quality  Fitness  Precision  Runtime(ms)
dfg                █████  ███      0.81     0.65       2
alpha_plus_plus    ████   ████     0.88     0.79       8
ilp                ██     █████    0.95     0.92       1200
```

**Use case:** Evaluate trade-offs for your specific log.

---

### `wpm diff <log1> <log2>`

Compare two event logs via Jaccard similarity.

```bash
wpm diff january-orders.xes february-orders.xes
```

**Output:** Jaccard distance, common activities, new activities, removed activities.

**Options:**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `<log1>` | path | required | First event log |
| `<log2>` | path | required | Second event log |
| `--activity-key` | string | concept:name | Activity attribute |
| `--format` | string | human | human, json |

---

### `wpm watch`

Monitor event log file for changes and re-discover.

```bash
wpm watch                                   # Uses wasm4pm.toml
wpm watch --config prod.toml                # Custom config
wpm watch --poll-interval 3000              # Check every 3s
```

**Options:**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--config` | path | wasm4pm.toml | Config file |
| `--poll-interval` | number | 5000 | Check frequency (ms) |
| `--checkpoint-dir` | path | .wasm4pm/checkpoints | Where to save intermediate results |

**Behavior:**
1. Loads log from `source.path` in config
2. Every `--poll-interval`, checks file modification time
3. On change, re-runs discovery
4. Compares against previous result
5. Saves checkpoint if drift detected

**Exit:** Ctrl+C to stop.

---

### `wpm status`

System health and algorithm registry.

```bash
wpm status                                  # Full report
wpm status --format json                    # Machine-readable
```

**Output includes:**
- WASM module health
- Available algorithms (41 total)
- Supported features
- Deployment profile
- System info (Node version, platform)

**Example snippet:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WASM Module        : ✓ Loaded
Total Algorithms   : 41
Discovery (15)     : dfg, alpha_plus_plus, inductive_miner, ...
ML Analysis (6)    : ml_classify, ml_cluster, ml_forecast, ...
Features           : conformance, streaming, gpu (if enabled)
Deployment Profile : browser (all algorithms)
```

---

## Prediction Commands

### `wpm predict <task>`

Run a single prediction task.

```bash
wpm predict next-activity -i my-process.xes
wpm predict remaining-time -i my-process.xes --case-id case_123
wpm predict drift -i my-process.xes --window-size 50
```

**Tasks:**

| Task | Question | Required options |
|------|----------|------------------|
| `next-activity` | What's next? | `-i <log>` |
| `remaining-time` | How long left? | `-i <log>` |
| `outcome` | Success or failure? | `-i <log>` |
| `drift` | Has behavior changed? | `-i <log>` |
| `features` | What predicts outcome? | `-i <log>` |
| `resource` | Who handles next? | `-i <log>` |

**Options (common to all tasks):**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `-i, --input` | path | required | Event log file |
| `--activity-key` | string | concept:name | Activity attribute |
| `--timestamp-key` | string | time:timestamp | Timestamp attribute |
| `--format` | string | human | human, json |
| `--no-save` | boolean | false | Skip auto-save |

**Task-specific options:**

```bash
# next-activity
wpm predict next-activity -i log.xes --ngram-order 4

# remaining-time
wpm predict remaining-time -i log.xes --case-id case_42

# drift
wpm predict drift -i log.xes --window-size 100 --threshold 0.25

# features
wpm predict features -i log.xes --top-k 10

# resource
wpm predict resource -i log.xes --resource-key org:resource
```

**Output example (next-activity, human format):**
```
Next Activity Predictions
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Activity        Probability
Approve         62.1%
Reject          21.3%
Escalate        16.6%
```

---

### `wpm drift-watch`

Streaming drift detection with real-time alerts.

```bash
wpm drift-watch -i live.xes --interval 5000
wpm drift-watch -i live.xes --window 50 --alpha 0.3 --threshold 0.25
```

**Options:**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `-i, --input` | path | required | Event log or stream URL |
| `--window` | number | 100 | Window size (traces) |
| `--interval` | number | 5000 | Check frequency (ms) |
| `--alpha` | number | 0.3 | EWMA smoothing (0.1-1.0) |
| `--threshold` | number | 0.3 | Alert threshold (0.0-1.0) |
| `--activity-key` | string | concept:name | Activity attribute |

**Output:**
```
Drift Detection (streaming)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[12:34:56] Window 1: drift=0.15 (OK)
[12:35:01] Window 2: drift=0.28 (OK)
[12:35:06] Window 3: drift=0.42 (ALERT) ⚠️
[12:35:11] Window 4: drift=0.51 (ALERT) ⚠️
```

**Exit:** Ctrl+C to stop.

---

## Analysis & ML Commands

### `wpm ml <task>`

ML-powered analysis: classification, clustering, forecasting, anomaly detection.

```bash
wpm ml classify -i my-process.xes --method naive_bayes
wpm ml cluster -i my-process.xes --k 5
wpm ml forecast -i my-process.xes --task throughput
wpm ml anomaly -i my-process.xes
```

**Tasks:**

| Task | Algorithm | Options |
|------|-----------|---------|
| `classify` | Naive Bayes, KNN, decision tree | `--method`, `--holdout` |
| `cluster` | K-means, DBSCAN | `--k`, `--eps` |
| `forecast` | Linear, polynomial, exponential | `--method`, `--degree` |
| `anomaly` | EMA smoothing, isolation | `--sensitivity` |
| `regress` | Linear/polynomial/exponential | `--method` |
| `pca` | Principal component analysis | `--n-components` |

**Examples:**

```bash
# Outcome classification
wpm ml classify -i orders.xes --method decision_tree

# Customer cohort discovery
wpm ml cluster -i orders.xes --k 7

# Throughput forecasting
wpm ml forecast -i orders.xes --task throughput --method exponential

# Find unusual cases
wpm ml anomaly -i orders.xes --sensitivity high

# Feature importance
wpm ml regress -i orders.xes --method linear_regression

# Dimensionality reduction
wpm ml pca -i orders.xes --n-components 3
```

---

### `wpm powl <subcommand>`

Partial-order workflow analysis and transformation.

```bash
wpm powl parse model.powl                   # Parse POWL file
wpm powl simplify model.powl                # Simplify constraints
wpm powl convert model.powl --to bpmn       # Convert format
wpm powl conformance model.powl -i log.xes  # Check fitness
```

**Subcommands:**

| Subcommand | Purpose |
|------------|---------|
| `parse` | Validate POWL syntax |
| `simplify` | Remove redundant constraints |
| `convert` | Transform to BPMN, Petri net, etc. |
| `diff` | Compare two POWL models |
| `complexity` | Compute cyclomatic + other metrics |
| `footprints` | Generate causality footprints |
| `conformance` | Check log-to-model fitness |
| `discover` | Discover POWL from log |

---

### `wpm temporal`

Time-based process analysis.

```bash
wpm temporal -i my-process.xes              # Throughput, bottlenecks, waiting times
wpm temporal -i my-process.xes --by activity
wpm temporal -i my-process.xes --by resource
```

**Metrics:**
- Throughput (events/sec, cases/hour)
- Cycle time distribution
- Bottleneck identification
- Waiting times
- Service time per activity

---

### `wpm social`

Organizational network mining.

```bash
wpm social -i my-process.xes                # Who works with whom?
wpm social -i my-process.xes --by resource  # Resource interactions
wpm social -i my-process.xes --format json
```

**Output:**
- Resource collaboration matrix
- Handoff frequency
- Specialization score

---

## Quality Commands

### `wpm quality`

Multi-dimensional process quality assessment.

```bash
wpm quality -m model.pnml -i log.xes        # Model vs. log
```

**Metrics:**
- Fitness (token replay)
- Precision (model specificity)
- Generalization (model generality)
- Simplicity (element count)
- Overall score

---

### `wpm conformance`

Fitness and precision checking.

```bash
wpm conformance -m model.pnml -i log.xes    # Token replay fitness
wpm conformance -m model.pnml -i log.xes --method alignments  # Exact
```

**Methods:**
- `token_replay` (fast, approximate)
- `alignments` (exact, slow)

---

### `wpm validate`

Event log validation and data quality.

```bash
wpm validate -i log.xes                     # Check schema
wpm validate -i log.xes --strict            # Strict mode
```

**Checks:**
- Valid XES/JSON/OCEL format
- Required attributes present
- Timestamp format and order
- No duplicate events
- No orphaned cases

---

## Simulation & Autonomic Commands

### `wpm simulate`

Monte Carlo playout and performance simulation.

```bash
wpm simulate -m model.pnml                  # Playout with discovered model
wpm simulate -m model.pnml --iterations 1000 --seed 42
```

**Options:**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `-m, --model` | path | required | PNML or tree model |
| `--iterations` | number | 100 | Playout count |
| `--seed` | number | random | RNG seed for determinism |
| `--max-steps` | number | 10000 | Max steps per trace |

**Output:** Synthetic event log with statistics.

---

### `wpm autoprocess`

Autonomous process health management.

```bash
wpm autoprocess -i live.xes                 # Run RL orchestrator
wpm autoprocess -i live.xes --cycles 50     # N cycles
wpm autoprocess -i live.xes --seed 42       # Deterministic
```

**What it does:**
1. Samples telemetry from log (health, drift, SPC)
2. Runs RL orchestrator
3. Recommends actions (Continue, Scale, Retry, Fallback, Restart)
4. Learns from reward feedback

**Options:**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `-i, --input` | path | required | Event log or stream |
| `--cycles` | number | 100 | Orchestrator cycles |
| `--seed` | number | random | RNG seed |
| `--telemetry` | string | auto | Manual telemetry JSON (for testing) |

---

## Autonomic & Utility Commands

### `wpm doctor`

Environment diagnostic (17 checks).

```bash
wpm doctor                                  # Full check
wpm doctor --json                           # Machine-readable
```

**Checks:**
- Node version compatibility
- WASM support (native vs. polyfill)
- Available memory
- Disk space
- Config file validity
- Network connectivity (optional)
- Performance baseline

---

### `wpm explain <algorithm>`

Human-readable algorithm explanations.

```bash
wpm explain dfg                             # Quick explanation
wpm explain dfg --verbose                   # Detailed (academic)
wpm explain alpha_plus_plus --cite          # With references
```

**Content:**
- Algorithm name and inventor
- Time complexity
- Space complexity
- Assumptions
- Guarantees
- References

---

### `wpm init`

Scaffold a new wasm4pm project.

```bash
wpm init                                    # Interactive setup
wpm init --log-path ./logs/my-process.xes --algorithm dfg
```

**Generates:**
- `wasm4pm.toml` (config)
- `.env.example` (environment variables)
- `.gitignore` (excludes results, cache)
- `README.md` (quick start)

---

### `wpm results`

Browse and inspect saved results.

```bash
wpm results                                 # List all results
wpm results --filter dfg                    # Filter by algorithm
wpm results show <id>                       # Show one result
wpm results delete <id>                     # Remove saved result
wpm results export <id> --format json       # Export to file
```

**Result location:** `.wasm4pm/results/` (auto-created).

---

## Global options

These apply to all commands:

```bash
--help, -h                                  # Show help
--version, -v                               # Show version
--config <path>                             # Config file
--log-level <level>                         # debug, info, warn, error
--format <format>                           # human, json
--no-save                                   # Skip auto-save to .wasm4pm/results/
--otel-enabled                              # Enable OpenTelemetry
--otel-endpoint <url>                       # Jaeger/OTLP endpoint
--quiet                                     # Suppress output
--profile <profile>                         # fast, balanced, quality, stream
```

---

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Config error (invalid CLI args, missing config) |
| 2 | Source error (log not found, parse failed) |
| 3 | Execution error (algorithm failed, WASM error) |
| 4 | Partial failure (some results ok, some failed) |
| 5 | System error (out of memory, OOM killer) |

---

## Examples

### Scenario 1: Quick exploration

```bash
wpm run my-process.xes
```

### Scenario 2: Find best algorithm

```bash
wpm compare dfg,alpha_plus_plus,ilp -i my-process.xes
wpm run my-process.xes --algorithm ilp
```

### Scenario 3: Predict outcomes and detect drift

```bash
wpm predict outcome -i orders.xes
wpm predict drift -i orders.xes
```

### Scenario 4: Live monitoring

```bash
wpm watch --config prod.toml
wpm drift-watch -i live-orders.xes --interval 10000
```

### Scenario 5: Comprehensive analysis

```bash
wpm run orders.xes --algorithm heuristic_miner --format json
wpm ml classify -i orders.xes --method naive_bayes
wpm temporal -i orders.xes --by resource
wpm social -i orders.xes
```

### Scenario 6: Autonomous health management

```bash
wpm autoprocess -i live-orders.xes --cycles 100
```

---

## Common issues

| Error | Solution |
|-------|----------|
| `command not found: wpm` | Install: `npm install -g @wasm4pm/cli` |
| `File not found: ...xes` | Check path; use absolute path |
| `Unknown algorithm: xyz` | Run `wpm status` to see available |
| `WASM initialization failed` | Check Node version (≥14), reinstall, run `wpm doctor` |
| `Timeout` | Increase `--timeout` or use faster algorithm/profile |

---

## Next steps

- **Configuration:** [`configuration-guide.md`](./configuration-guide.md)
- **Prediction tuning:** [`prediction-quickstart.md`](./prediction-quickstart.md)
- **Drift detection:** [`drift-detection-guide.md`](./drift-detection-guide.md)
- **Examples:** [`examples/`](../../examples/)

---

See also: `wpm <command> --help` for command-specific options.
