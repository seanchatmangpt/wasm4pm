# How-To: Choose the Right Algorithm

**Time required**: 10 minutes
**Difficulty**: Beginner

## Decision Tree

```
Do you want...?

  Speed (< 100ms)
    → Use: fast profile (DFG, Alpha++)

  Balance (< 1 sec)
    → Use: balanced profile (Heuristic, Inductive)

  Quality (< 10 sec)
    → Use: quality profile (Genetic, ILP)

  Real-time streaming
    → Use: stream profile (Fast Discovery variants)

  ML analysis (classify, cluster, forecast, etc.)
    → Use: ml profile or [ml] config section

  Research/academic
    → Use: research profile (all algorithms)
```

## Quick Profiles

| Profile | Algorithm | Time | Quality | Use Case |
|---------|-----------|------|---------|----------|
| **fast** | DFG | 0.1ms/100e | Low | Quick overviews |
| **balanced** | Heuristic | 3ms/100e | Medium | Standard use |
| **quality** | Genetic | 40ms/100e | High | Accuracy critical |
| **stream** | Fast+variants | Real-time | Medium | Live streams |
| **ml** | All 6 ML tasks | Variable | Variable | Classification, clustering, forecasting |
| **research** | All | Variable | Variable | Experimentation |

## Configuration

```toml
[discovery]
# Method 1: Use profile (recommended)
profile = "fast"

# Method 2: Explicit algorithm
algorithm = "dfg"
profile = "fast"

# Method 3: Customize parameters
algorithm = "genetic"
population_size = 100
generations = 50
timeout_ms = 30000
```

## By Use Case

### Quick Dashboard
```toml
[discovery]
algorithm = "dfg"
profile = "fast"
```

### Standard Analysis
```toml
[discovery]
algorithm = "heuristic"
profile = "balanced"
noise_threshold = 0.2
```

### Publication Quality
```toml
[discovery]
algorithm = "genetic"
profile = "quality"
population_size = 200
generations = 100
```

### Real-Time Monitoring
```toml
[discovery]
algorithm = "dfg"
profile = "stream"
```

### Discovery + ML Classification
```toml
[discovery]
algorithm = "heuristic"
profile = "balanced"

[ml]
enabled = true
tasks = ["classify", "cluster"]
method = "knn"
k = 5
```

### Full ML Analysis Suite
```toml
[discovery]
algorithm = "genetic"
profile = "quality"

[ml]
enabled = true
tasks = ["classify", "cluster", "forecast", "anomaly", "regress", "pca"]
```

## Algorithm Details

See [Reference: Algorithm Matrix](../reference/algorithms.md) for full comparison including ML tasks.

## See Also

- [Explanation: Algorithm Profiles](../explanation/profiles.md)
- [Reference: Algorithm Matrix](../reference/algorithms.md)
- [Reference: Benchmarks](../reference/benchmarks.md)
- [Reference: Config Schema](../reference/config-schema.md) — `[ml]` section
