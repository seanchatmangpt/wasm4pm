# wasm4pm Process Mining Domain

**Van der Aalst perspectives, event log formats, algorithm taxonomy.**

## Van der Aalst Perspectives

| Perspective | What It Captures | Key Algorithms |
|-------------|-----------------|----------------|
| **Control Flow** | Activity ordering | DFG, Petri nets, process trees |
| **Time** | Timestamps, durations, bottlenecks | Performance spectrum, temporal profiles |
| **Resource** | Organizational mining, roles | Social network analysis |
| **Case** | Data attributes, variants | Variant analysis, case features |

## Event Log Formats

### XES (eXtensible Event Stream)
- Standard XML format for process mining
- Elements: `<log>`, `<trace>`, `<event>`
- Key attributes: `concept:name`, `time:timestamp`, `org:resource`
- Parse: `load_eventlog_from_xes(xes_content)`

### OCEL (Object-Centric Event Log)
- Multiple object types per event
- Captures complex relationships
- Feature flag: `feature-ocel`

### JSON (wasm4pm format)
- Custom format for direct JavaScript consumption
- Parse: `load_eventlog_from_json(json_content)`

## Discovery Algorithms (36 registered in `packages/kernel/src/registry.ts`)

### Tier 1 — Fast (Speed Score 0-30)

| Algorithm | Speed | Quality | Output |
|-----------|-------|---------|--------|
| `dfg` | 5 | 30 | DFG |
| `process_skeleton` | 3 | 25 | DFG |
| `simd_streaming_dfg` | 2 | 28 | DFG |

### Tier 2 — Balanced (Speed Score 20-55)

| Algorithm | Speed | Quality | Output |
|-----------|-------|---------|--------|
| `alpha_plus_plus` | 20 | 45 | Petri net |
| `heuristic_miner` | 25 | 50 | DFG |
| `inductive_miner` | 30 | 55 | Process tree |
| `hill_climbing` | 40 | 55 | Petri net |
| `declare` | 35 | 50 | Declare constraints |

### Tier 3 — Quality (Speed Score 55-90)

| Algorithm | Speed | Quality | Output |
|-----------|-------|---------|--------|
| `simulated_annealing` | 55 | 65 | Petri net |
| `a_star` | 60 | 70 | Petri net |
| `aco` | 65 | 75 | Petri net |
| `pso` | 70 | 75 | Petri net |
| `genetic_algorithm` | 75 | 80 | Petri net |
| `optimized_dfg` | 70 | 85 | DFG |
| `ilp` | 80 | 90 | Petri net |

### ML Analysis (6 algorithms)

| Algorithm | Purpose |
|-----------|---------|
| `ml_classify` | Decision tree, naive Bayes |
| `ml_cluster` | K-means clustering |
| `ml_forecast` | Linear/polynomial/exponential regression |
| `ml_anomaly` | Information-theoretic scoring (log2 edge-frequency; missing-edge cost=10) |
| `ml_regress` | Linear regression |
| `ml_pca` | Principal component analysis |

### Analysis & Utilities (20+ algorithms)

Categories: conformance, simulation, import/export, streaming, analytics.

## Quality Metrics (4 Dimensions)

### Fitness (0-1, >0.85 required)
How much of the observed behavior is explained by the model.
`fitness = 1 - (missing + consumed) / (produced + remaining)`

### Precision (0-1)
How much of the model behavior is observed in the log.
Avoid underfitting (model too general).

### Generalization (0-1)
How well the model generalizes to unseen behavior.
Avoid overfitting (model too specific).

### Simplicity
Fewer places, transitions, and silent activities is better.
Measured by element count.

## Conformance Checking

### Token-Based Replay (Fast)
- Approximate fitness score
- Uses remaining/produced/missing/consumed tokens
- O(n) complexity

### Alignments (Exact)
- Optimal alignment between log and model
- Computes fitness + precision simultaneously
- NP-hard for large logs

### Trace Classification
- Conforming vs. deviating traces
- Deviation diagnosis (missing/extra/late activities)

## Process Mining Terminology

| Term | Definition |
|------|------------|
| **Trace** | Sequence of events for one case (process instance) |
| **Variant** | Unique trace pattern (e.g., A→B→C vs A→C→B) |
| **Activity** | Event name/action (e.g., "Register", "Approve") |
| **Case ID** | Process instance identifier |
| **Timestamp** | Event occurrence time |
| **Directly-Follows** | A→B relationship (no intermediate activity) |
| **Event Rate** | Events per time unit (normalized metric) |
| **Rework** | Repeated activities indicating process problems |
| **Bottleneck** | Slowest activity in the process |
| **Drift** | Change in process behavior over time |

## Autonomic System Integration

The process mining domain integrates with:

- **RL Orchestrator**: Uses SPC alerts and quality metrics as reward signals
- **Circuit Breaker**: Protects against cascading failures during discovery
- **SPC System**: Western Electric rules detect process drift in real-time
- **Agent System**: 9 van der Aalst agents for autonomous analysis
