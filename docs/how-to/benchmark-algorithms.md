# How-To: Benchmark Algorithms Against Your Event Log

**Time required**: 10 minutes
**Difficulty**: Beginner

## Problem

You need to choose the best discovery algorithm for your event log, but you are not sure which one will give you the best balance of speed, model complexity, and quality. Running each algorithm individually and comparing by hand is tedious.

## Available Algorithms

wasm4pm ships 15 discovery algorithms:

| ID | Speed | Quality | Output Type |
|----|-------|---------|-------------|
| `dfg` | 5 (fastest) | 30 | DFG |
| `process_skeleton` | 3 | 25 | DFG |
| `alpha_plus_plus` | 20 | 45 | Petri net |
| `heuristic_miner` | 25 | 50 | DFG |
| `inductive_miner` | 30 | 55 | Process tree |
| `hill_climbing` | 40 | 55 | Petri net |
| `declare` | 35 | 50 | Declare |
| `simulated_annealing` | 55 | 65 | Petri net |
| `a_star` | 60 | 70 | Petri net |
| `aco` (ant-colony) | 65 | 75 | Petri net |
| `pso` | 70 | 75 | Petri net |
| `genetic_algorithm` | 75 | 80 | Petri net |
| `optimized_dfg` | 70 | 85 | DFG |
| `ilp` | 80 | 90 | Petri net |

Speed is on a 0--100 scale (higher is slower). Quality is on a 0--100 scale (higher is better).

## Step 1 -- Compare Two Algorithms

The simplest benchmark compares two algorithms side by side:

```bash
pmctl compare dfg inductive -i process.xes
```

What you should see:

```
  Algorithm Comparison — process.xes
  ═════════════════════════════════════

  Metric      dfg              inductive_miner
  ───────     ──────────────   ──────────────
  Nodes       12               18
  Edges       22               31
  Time (ms)   2                28
  Fitness     ██████████ 0.82  ██████████████ 0.95
  Precision   ██████ 0.61      ████████████ 0.88

  Winner: inductive_miner (higher fitness + precision)
```

The output shows nodes, edges, and execution time for each algorithm, plus relative ASCII sparkbar charts for fitness and precision metrics.

## Step 2 -- Compare Fast vs Quality Algorithms

You can pass any number of algorithms to compare them all at once:

```bash
pmctl compare dfg heuristic_miner ilp genetic_algorithm -i process.xes
```

What you should see:

```
  Algorithm Comparison — process.xes
  ═════════════════════════════════════

  Metric      dfg        heuristic_miner  ilp        genetic_algorithm
  ───────     ─────────  ───────────────  ─────────  ─────────────────
  Nodes       12         15               19         18
  Edges       22         27               34         32
  Time (ms)   2          8                85         62
  Fitness     ████ 0.82  ██████ 0.89      ████████ 0.96  ████████ 0.95
  Precision   ███ 0.61   █████ 0.77       ████████ 0.91  ████████ 0.88
```

## Step 3 -- Get JSON Output for Scripting

Pass `--format json` to get machine-readable output suitable for scripting, CI pipelines, or post-processing:

```bash
pmctl compare dfg inductive_miner genetic_algorithm -i process.xes --format json
```

What you should see:

```json
{
  "status": "success",
  "log": "process.xes",
  "algorithms": [
    {
      "id": "dfg",
      "nodes": 12,
      "edges": 22,
      "time_ms": 2,
      "fitness": 0.82,
      "precision": 0.61
    },
    {
      "id": "inductive_miner",
      "nodes": 18,
      "edges": 31,
      "time_ms": 28,
      "fitness": 0.95,
      "precision": 0.88
    },
    {
      "id": "genetic_algorithm",
      "nodes": 18,
      "edges": 32,
      "time_ms": 62,
      "fitness": 0.95,
      "precision": 0.88
    }
  ],
  "winner": "inductive_miner"
}
```

## Interpreting the Results

### Sparkbar Charts

The ASCII sparkbars (e.g., `████████ 0.95`) give a visual comparison of each metric across algorithms at a glance:

- **Longer bar** = higher value for that metric.
- Bars are scaled relative to the maximum value in the comparison set, so you can see proportions even without reading the numbers.

### Choosing Based on Your Priorities

| Your priority | Recommended comparison | What to look for |
|---|---|---|
| Raw speed | `dfg process_skeleton` | Lowest `Time (ms)` |
| Good-enough quality, fast | `dfg heuristic_miner alpha_plus_plus` | Best fitness/precision under 20ms |
| Best possible model | `ilp genetic_algorithm` | Highest fitness + precision |
| Petri net output | `inductive_miner ilp a_star` | All produce Petri nets; compare fitness |
| Research / exploration | All algorithms | Full picture of the trade-off space |

### Key Metrics

- **Nodes / Edges**: Model complexity. More nodes and edges means a more detailed process model, but also potentially more noise.
- **Time (ms)**: Wall-clock execution time. Lower is better.
- **Fitness**: How well the discovered model replay the original log (0--1 scale). Higher is better.
- **Precision**: How much of the discovered model behavior is actually seen in the log (0--1 scale). Higher is better.

## Command Reference

```bash
# Basic syntax
pmctl compare <algo1> <algo2> [...] --input <log.xes>

# Two algorithms
pmctl compare dfg inductive -i process.xes

# Multiple algorithms
pmctl compare dfg heuristic_miner ilp genetic -i process.xes

# JSON output
pmctl compare dfg inductive genetic -i process.xes --format json

# With config file (uses config for additional settings)
pmctl compare dfg heuristic --config wasm4pm.toml
```

## Related

- [How-To: Choose the Right Algorithm](choose-algorithm.md) -- decision tree and profile recommendations
- [How-To: Analyze an Event Log](analyze-log.md) -- running a single discovery task
- [How-To: Browse and Inspect Previous Results](browse-results.md) -- finding saved comparison results
- [How-To: Configure Predictions](configure-predictions.md) -- prediction task setup
