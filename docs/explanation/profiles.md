# Explanation: Algorithm Profiles and Trade-Offs

**Time to read**: 15 minutes  
**Level**: Intermediate  

## The Five Profiles

wasm4pm provides 5 preset profiles balancing speed, quality, and resource use:

### 1. Fast Profile

```toml
[discovery]
profile = "fast"
algorithm = "dfg"
```

| Metric | Value |
|--------|-------|
| Time | 0.1ms per 100 events |
| Memory | 10MB per 1000 events |
| Quality | Low (baseline model) |
| Best for | Real-time, dashboards |

**What it does**: Generates directly-follows graph (raw dependencies).

**Example**: 10K events → 10ms → 50 nodes, 100 edges

### 2. Balanced Profile

```toml
[discovery]
profile = "balanced"
algorithm = "heuristic"  # or "inductive"
```

| Metric | Value |
|--------|-------|
| Time | 3ms per 100 events |
| Memory | 50MB per 1000 events |
| Quality | Medium (filtered dependencies) |
| Best for | Standard analysis |

**What it does**: Filters noise, builds Petri net.

**Example**: 10K events → 30ms → 30 nodes, 40 edges (cleaner)

### 3. Quality Profile

```toml
[discovery]
profile = "quality"
algorithm = "genetic"  # or "ilp"
```

| Metric | Value |
|--------|-------|
| Time | 40ms per 100 events |
| Memory | 200MB per 1000 events |
| Quality | High (best-effort optimal) |
| Best for | Publication, compliance |

**What it does**: Searches best model using evolutionary algorithm.

**Example**: 10K events → 400ms → 25 nodes, 32 edges (most accurate)

### 4. Stream Profile

```toml
[discovery]
profile = "stream"
algorithm = "dfg"  # Fast variants
```

| Metric | Value |
|--------|-------|
| Time | 0.1ms per event (incremental) |
| Memory | Constant (checkpoint-based) |
| Quality | Medium (updates incrementally) |
| Best for | Live streams, 24/7 monitoring |

**What it does**: Incrementally updates model as events arrive.

**Example**: 10K events over 1 hour → ~10 updates

### 5. Research Profile

```toml
[discovery]
profile = "research"
algorithm = "any"  # All available
```

| Metric | Value |
|--------|-------|
| Time | Variable |
| Memory | High (for detailed analysis) |
| Quality | Very high (all techniques) |
| Best for | Academic papers |

**What it does**: Access to 15+ algorithms with full parameters.

## Complexity Analysis

| Algorithm | Time | Space | Quality |
|-----------|------|-------|---------|
| DFG | O(n) | O(a²) | Low |
| Alpha | O(n log n) | O(a²) | Medium |
| Heuristic | O(n + a²) | O(a²) | Medium |
| Inductive | O(n log n) | O(n + a²) | High |
| Genetic | O(g×n×p) | O(g×p×a²) | Very High |
| ILP | O(2^a) | O(2^a) | Optimal |

Legend: n=events, a=activities, g=generations, p=population

## Trade-Off Visualization

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
     ←─────────────
       (Slower)
```

## When to Use Each

### Fast Profile

```bash
# Real-time dashboard
pmctl watch --config config.toml --profile fast

# Quick exploration
pmctl run --config config.toml --profile fast
```

Use when:
- ✅ Need results in milliseconds
- ✅ Exploring many event logs
- ✅ Building live dashboards
- ✅ Memory-constrained environment

### Balanced Profile

```bash
# Standard analysis
pmctl run --config config.toml --profile balanced
```

Use when:
- ✅ Standard process mining task
- ✅ Need reasonable accuracy
- ✅ Don't have extreme time constraints
- ✅ Most common use case

### Quality Profile

```bash
# Publication quality
pmctl run --config config.toml --profile quality
```

Use when:
- ✅ Publishing academic paper
- ✅ Compliance audit needed
- ✅ High-stakes decision
- ✅ Can wait minutes for perfect model

### Stream Profile

```bash
# 24/7 monitoring
pmctl watch --config config.toml --profile stream
```

Use when:
- ✅ Live event stream
- ✅ Detect drift/anomalies
- ✅ Continuous monitoring
- ✅ Limited memory

### Research Profile

```bash
# Experiment with multiple algorithms
pmctl run --config config.toml --profile research \
  --algorithm genetic --generations 200
```

Use when:
- ✅ Academic research
- ✅ Comparing algorithms
- ✅ Fine-tuning parameters
- ✅ Full control needed

## Profile Customization

Override profile defaults:

```toml
[discovery]
profile = "balanced"

# But customize parameters
algorithm = "heuristic"
noise_threshold = 0.15
timeout_ms = 60000
```

Or create custom profile in code:

```javascript
const pm = new Wasm4pm();
const result = await pm.run({
  config: {
    discovery: {
      algorithm: 'heuristic',
      population_size: 75,        // Between balanced & quality
      generations: 40,
      timeout_ms: 45000
    }
  }
});
```

## Benchmarking

Compare profiles:

```bash
# Time each profile
time pmctl run --config config.toml --profile fast
time pmctl run --config config.toml --profile balanced
time pmctl run --config config.toml --profile quality
```

Example output for 10K events:

```
fast:       0.01s (10ms)
balanced:   0.03s (30ms)
quality:    0.40s (400ms)
```

## See Also

- [How-To: Choose Algorithm](../how-to/choose-algorithm.md)
- [Reference: Benchmarks](../reference/benchmarks.md)
- [Reference: Algorithm Matrix](../reference/algorithms.md)
