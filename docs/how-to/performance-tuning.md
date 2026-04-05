# How-To: Performance Tuning

**Time required**: 20 minutes  
**Difficulty**: Advanced  

## Profile Selection

Fastest to slowest:

```toml
# 1. Fastest: DFG (0.1ms/100 events)
[discovery]
profile = "fast"

# 2. Balanced: Heuristic (3ms/100 events)
[discovery]
profile = "balanced"

# 3. Quality: Genetic (40ms/100 events)
[discovery]
profile = "quality"
```

## Algorithm Parameters

### DFG (Fastest)

```toml
[discovery]
algorithm = "dfg"
# No parameters
```

### Heuristic (Balanced)

```toml
[discovery]
algorithm = "heuristic"
noise_threshold = 0.2          # Filter noise (0.0-1.0)
dependency_threshold = 0.8
concurrency_threshold = 0.1
```

### Genetic (Quality)

```toml
[discovery]
algorithm = "genetic"
population_size = 50           # Reduce for speed
generations = 25               # Reduce for speed
timeout_ms = 30000            # Add timeout
```

## Memory Optimization

```toml
[discovery]
streaming = true              # Process incrementally
chunk_size = 1000             # Process 1000 events at a time
```

## Timeout Settings

```toml
[discovery]
timeout_ms = 30000    # 30 seconds (adjust as needed)
```

If timeout occurs, reduce algorithm complexity:

```toml
# Instead of
[discovery]
algorithm = "genetic"
population_size = 200
generations = 100

# Try
[discovery]
algorithm = "heuristic"
noise_threshold = 0.3
```

## Filtering

Reduce input size:

```toml
[source]
type = "file"
path = "events.xes"
filter = true

[source.filters]
# Only include specific activities
activities = ["A", "B", "C"]

# Only process recent events
min_date = "2024-01-01"
max_date = "2024-12-31"

# Minimum frequency
min_frequency = 2
```

## Parallel Processing

Use Web Workers (browser) or Worker Threads (Node.js):

```javascript
const worker = new Worker('worker.js');
worker.postMessage({ 
  config, 
  data: eventLog 
});
worker.onmessage = (event) => {
  console.log('Result:', event.data);
};
```

## Benchmarking

```bash
# Time a run
time pmctl run --config config.toml

# Profile execution
WASM4PM_TRACE_LEVEL=detailed pmctl run --config config.toml > trace.log
```

## Memory Monitoring

```bash
# Watch memory usage
watch -n 1 'ps aux | grep wasm4pm'

# Or via metrics
curl http://localhost:3001/metrics | grep memory
```

## See Also

- [How-To: Choose Algorithm](./choose-algorithm.md)
- [Explanation: Profiles](../explanation/profiles.md)
- [Reference: Benchmarks](../reference/benchmarks.md)
