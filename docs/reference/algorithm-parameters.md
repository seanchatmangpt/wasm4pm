# Reference: Algorithm-Specific Parameters

## DFG (No Parameters)

```toml
[discovery]
algorithm = "dfg"
```

DFG takes no parameters - it's deterministic output.

## Alpha Miner (No Parameters)

```toml
[discovery]
algorithm = "alpha"
```

Alpha is fully determined by input.

## Heuristic Miner

```toml
[discovery]
algorithm = "heuristic"

[discovery.params]
noise_threshold = 0.2         # 0.0-1.0
dependency_threshold = 0.8    # 0.0-1.0
concurrency_threshold = 0.1   # 0.0-1.0
```

Parameters:

| Param | Range | Default | Effect |
|-------|-------|---------|--------|
| noise_threshold | 0.0-1.0 | 0.2 | Filter infrequent follows |
| dependency_threshold | 0.0-1.0 | 0.8 | Minimum strength |
| concurrency_threshold | 0.0-1.0 | 0.1 | Parallelism detection |

**Lower values** = More permissive (more edges)
**Higher values** = More restrictive (fewer edges)

## Inductive Miner

```toml
[discovery]
algorithm = "inductive"

[discovery.params]
noise_threshold = 0.0         # 0.0-1.0
depth_limit = 100            # Max recursion depth
```

Parameters:

| Param | Range | Default |
|-------|-------|---------|
| noise_threshold | 0.0-1.0 | 0.0 |
| depth_limit | 1-1000 | 100 |

## Genetic Algorithm

```toml
[discovery]
algorithm = "genetic"

[discovery.params]
population_size = 100        # 10-500
generations = 50             # 10-200
mutation_rate = 0.1          # 0.0-1.0
elite_size = 10              # 1-50
tournament_size = 3          # 2-10
crossover_rate = 0.8         # 0.0-1.0
```

Parameters:

| Param | Range | Default | Effect |
|-------|-------|---------|--------|
| population_size | 10-500 | 100 | Population count |
| generations | 10-200 | 50 | Iterations |
| mutation_rate | 0.0-1.0 | 0.1 | Mutation probability |
| elite_size | 1-50 | 10 | Keep best N |
| tournament_size | 2-10 | 3 | Tournament size |
| crossover_rate | 0.0-1.0 | 0.8 | Crossover probability |

**Tips**:
- Larger `population_size` = Better quality, slower
- More `generations` = Better convergence, slower
- Higher `mutation_rate` = More exploration, less convergence

## ILP Optimization

```toml
[discovery]
algorithm = "ilp"

[discovery.params]
timeout_ms = 30000           # Search timeout
timeout_search = 30000       # Search timeout (redundant)
max_states = 100000          # Max states to explore
```

Parameters:

| Param | Range | Default | Effect |
|-------|-------|---------|--------|
| timeout_ms | 1000-3600000 | 30000 | Max search time |
| timeout_search | 1000-3600000 | 30000 | Search timeout |
| max_states | 100-1000000 | 100000 | State limit |

**Note**: ILP may terminate early if timeout reached.

## Example Configurations

### Fast + Aggressive Filtering

```toml
[discovery]
algorithm = "heuristic"
profile = "fast"

[discovery.params]
noise_threshold = 0.5      # Aggressive filtering
dependency_threshold = 0.9
```

### Quality + Balance

```toml
[discovery]
algorithm = "genetic"
profile = "quality"

[discovery.params]
population_size = 200
generations = 100
mutation_rate = 0.15
```

### Research + All Options

```toml
[discovery]
algorithm = "genetic"
profile = "research"

[discovery.params]
population_size = 500
generations = 200
mutation_rate = 0.1
elite_size = 50
tournament_size = 5
crossover_rate = 0.9
```

## See Also

- [Reference: Algorithms](./algorithms.md)
- [Reference: Config Schema](./config-schema.md)
