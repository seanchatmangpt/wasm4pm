# Reference: Algorithm Matrix

## Complete Algorithm Comparison

### DFG (Directly-Follows Graph)

```toml
[discovery]
algorithm = "dfg"
profile = "fast"
```

| Metric | Value |
|--------|-------|
| Time | O(n) |
| Space | O(a²) |
| Quality | Low |
| Speed | 0.1ms/100 events |
| Output | DFG |
| Best for | Real-time, dashboards |

### Alpha Miner (α)

```toml
[discovery]
algorithm = "alpha"
profile = "fast"
```

| Metric | Value |
|--------|-------|
| Time | O(n log n) |
| Space | O(a²) |
| Quality | Medium |
| Speed | 0.12ms/100 events |
| Output | Petri Net |
| Best for | Structured processes |

### Heuristic Miner

```toml
[discovery]
algorithm = "heuristic"
profile = "balanced"
noise_threshold = 0.2
```

| Metric | Value |
|--------|-------|
| Time | O(n + a²) |
| Space | O(a²) |
| Quality | Medium-High |
| Speed | 3ms/100 events |
| Output | Petri Net |
| Best for | Noisy logs |
| Parameters | noise_threshold (0.0-1.0) |

### Inductive Miner

```toml
[discovery]
algorithm = "inductive"
profile = "balanced"
```

| Metric | Value |
|--------|-------|
| Time | O(n log n) |
| Space | O(a²) |
| Quality | High |
| Speed | 5ms/100 events |
| Output | Process Tree |
| Best for | Complex structures |

### Genetic Algorithm

```toml
[discovery]
algorithm = "genetic"
profile = "quality"
population_size = 100
generations = 50
```

| Metric | Value |
|--------|-------|
| Time | O(g×n×p) |
| Space | O(g×p×a²) |
| Quality | Very High |
| Speed | 40ms/100 events |
| Output | Petri Net |
| Best for | Best-effort accuracy |
| Parameters | population_size, generations |

### ILP Optimization

```toml
[discovery]
algorithm = "ilp"
profile = "quality"
timeout_ms = 30000
```

| Metric | Value |
|--------|-------|
| Time | O(2^a) (bounded) |
| Space | O(2^a) |
| Quality | Optimal |
| Speed | Variable (bounded by timeout) |
| Output | Petri Net |
| Best for | Correctness-critical |
| Parameters | timeout_ms |

## Profile → Algorithm Mapping

| Profile | Primary | Secondary |
|---------|---------|-----------|
| **fast** | DFG | Alpha |
| **balanced** | Heuristic | Inductive |
| **quality** | Genetic | ILP |
| **stream** | DFG | Fast variants |
| **research** | All | All |

## Complexity Analysis

```
        Quality
           ↑
        ILP ●
          / \
       Genetic
       /     \
  Inductive  ●
    /         \
Heuristic ●    \
  /             \
Alpha●           \
  /               \
DFG ●─────────────→ Speed
```

## Parameter Reference

### Heuristic

- `noise_threshold` (0.0-1.0): Filter infrequent follows
- `dependency_threshold` (0.0-1.0): Minimum dependency strength
- `concurrency_threshold` (0.0-1.0): Detect parallelism

### Genetic

- `population_size` (10-500): Population size
- `generations` (10-200): Iterations
- `mutation_rate` (0.0-1.0): Mutation probability
- `elite_size` (1-50): Keep best N

### ILP

- `timeout_ms` (1000-3600000): Max search time
- `timeout_search` (1000-3600000): Search timeout

## See Also

- [How-To: Choose Algorithm](../how-to/choose-algorithm.md)
- [Explanation: Profiles](../explanation/profiles.md)
- [Reference: Benchmarks](./benchmarks.md)
