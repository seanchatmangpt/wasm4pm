# Compare Two Algorithms

**Problem:** You want to know whether Algorithm A is faster, produces a more complex model, or discovers more edges than Algorithm B on the same event log.

## Solution: Use `pictl compare`

The `pictl compare` command runs two or more discovery algorithms against the same XES event log and prints a side-by-side table with timing, node counts, edge counts, and ASCII sparklines.

### Basic comparison

```bash
pictl compare dfg heuristic_miner -i log.xes --format human
```

This runs both DFG and Heuristic Miner on `log.xes` and prints a human-readable comparison table.

### Comparing three or more algorithms

```bash
pictl compare dfg heuristic inductive ilp -i log.xes
```

Separate algorithm names with spaces. You can also use commas:

```bash
pictl compare dfg,heuristic,inductive,ilp -i log.xes
```

### Available algorithms

| CLI Name              | Full Name               | Category         |
| --------------------- | ----------------------- | ---------------- |
| `dfg`                 | Directly-Follows Graph  | Ultra-fast       |
| `skeleton`            | Process Skeleton        | Ultra-fast       |
| `dfg-optimized`       | Optimized DFG           | Fast             |
| `heuristic`           | Heuristic Miner         | Balanced         |
| `inductive`           | Inductive Miner         | Sound models     |
| `alpha`               | Alpha++                 | Balanced         |
| `declare`             | Declare                 | Constraint-based |
| `hill-climbing`       | Hill Climbing           | Greedy prune     |
| `simulated-annealing` | Simulated Annealing     | Metaheuristic    |
| `astar`               | A\* Search              | Informed search  |
| `genetic`             | Genetic Algorithm       | Evolutionary     |
| `pso`                 | PSO Algorithm           | Swarm            |
| `ant-colony`          | Ant Colony Optimization | Swarm            |
| `ilp`                 | ILP Petri Net           | Optimal          |

### Understanding the output

```
  Algorithm              Nodes   Edges  Time(ms)  Nodes(bar)  Edges(bar)  Time(bar)
  ─────────────────────  ──────  ──────  ────────  ──────────  ──────────  ──────────
  dfg                       12      28       3.0  ▓▓░░░░░░░░  ▓▓░░░░░░░░  ░░░░░░░░░░
  heuristic                 12      34      14.2  ▓▓░░░░░░░░  ▓▓▓░░░░░░░  ░░░░░░░░░░
  inductive                 12      30      25.1  ▓▓░░░░░░░░  ▓▓░░░░░░░░  ░▓░░░░░░░░
  ilp                       12      28      87.3  ▓▓░░░░░░░░  ▓▓░░░░░░░░  ▓▓▓▓▓▓▓▓░░

  Legend: bars are relative within this comparison
```

Each row shows:

- **Algorithm** -- the name you passed on the command line.
- **Nodes** -- number of nodes (places + transitions for Petri nets; activity nodes for DFGs).
- **Edges** -- number of arcs or directly-follows edges.
- **Time(ms)** -- wall-clock time for the single run, measured with `performance.now()`.
- **Sparklines** -- ASCII bar charts (block characters) scaled relative to the min/max across all algorithms in the table. The widest bar represents the maximum value.

### JSON output for scripting

Pass `--format json` to get machine-readable output:

```bash
pictl compare dfg heuristic -i log.xes --format json
```

Output:

```json
{
  "status": "success",
  "input": "log.xes",
  "activityKey": "concept:name",
  "algorithms": [
    {
      "algorithm": "dfg",
      "nodes": 12,
      "edges": 28,
      "variants": 85,
      "density": 0.42,
      "complexity": 0.31,
      "elapsedMs": 3.0
    },
    {
      "algorithm": "heuristic",
      "nodes": 12,
      "edges": 34,
      "variants": 85,
      "density": 0.42,
      "complexity": 0.31,
      "elapsedMs": 14.2
    }
  ]
}
```

## Alternative: Compare Two Logs with `pictl diff`

`pictl compare` compares algorithms on the same log. If you want to compare two different logs (for example, before and after a process change), use `pictl diff`:

```bash
pictl diff log_v1.xes log_v2.xes
```

This discovers a DFG for each log and reports:

- **Jaccard similarity** over DFG edge sets (1.0 = identical, 0.0 = no overlap).
- **Activities** added, removed, and shared between the two logs.
- **Edges** added, removed, and changed with frequency deltas.
- **Trace variants** unique to each log and shared between them.

Example output:

```
Process Diff: log_v1.xes -> log_v2.xes
============================================================

  Structural similarity: 0.847  ▓▓▓▓▓▓▓░░░  Minor structural changes

Activities:
  + New:     Escalate, Reopen (appeared in log2, 2 activities)
  - Removed: (none)
  = Shared:  12 activities

Edges (directly-follows):
  + New:     Approve_Senior->Escalate (15)
  ~ Changed: Validate->Check_Docs  120 -> 98  (-18%)
```

JSON output is also available with `--format json`.

## Common Issues

### Unfair comparison due to different log sizes

`pictl compare` uses the same log for all algorithms, so log size is not a factor. However, if you are comparing results across separate benchmark runs, ensure both runs use the same log file and the same number of cases.

### WASM warmup skew

The first WASM call after loading can be slower due to JIT compilation in the JavaScript engine. `pictl compare` does not perform an explicit warmup run, so the first algorithm in the list may appear slightly slower. Mitigate this by:

1. Running the comparison twice and discarding the first result.
2. Putting the algorithm you care most about _last_ in the argument list.

### Algorithm parameters affect speed and quality

Some algorithms accept parameters that change both runtime and result quality. `pictl compare` uses sensible defaults (e.g., `heuristic` uses a threshold of 0.5, `astar` uses maxIter=500). If you need custom parameters, use `pictl run` instead and compare the JSON outputs manually.

### Cache effects

If you run `pictl compare` multiple times on the same log, the WASM parse cache may speed up subsequent runs. To get clean measurements, restart the process between runs or use `pictl run --no-cache` for individual measurements.

## See Also

- [Profile a Slow Algorithm](./profile-slow-algorithm.md) -- deeper performance investigation
- [Reproduce Published Benchmark Results](./reproduce-paper-benchmarks.md) -- validate against published numbers
- [docs/BENCHMARKS.md](../../BENCHMARKS.md) -- full benchmark results table
