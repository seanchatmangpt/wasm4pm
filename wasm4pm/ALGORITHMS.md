# wasm4pm Algorithms Reference

Complete catalog of all 20+ process discovery and analytics methods.

## Discovery Algorithms (14 Methods)

### Classical Process Discovery

**DFG (Directly-Follows Graph)**

- Type: Graph-based
- Speed: Ultra-fast (< 5ms)
- Use: Quick process overview

```typescript
log.discoverDFG({ minFrequency: 1 });
```

**Alpha++**

- Type: Petri net mining
- Speed: Fast (< 50ms)
- Use: Sound models with noise tolerance

```typescript
log.discoverAlphaPlusPlus({ minSupport: 0.1 });
```

**DECLARE**

- Type: Constraint mining
- Speed: Fast (< 100ms)
- Use: Temporal constraint discovery

```typescript
log.discoverDECLARE();
```

**Heuristic Miner**

- Type: Dependency-based
- Speed: Fast (< 100ms)
- Use: Noisy/incomplete logs

```typescript
log.discoverHeuristicMiner({ dependencyThreshold: 0.5 });
```

**Inductive Miner**

- Type: Recursive structure
- Speed: Fast (< 50ms)
- Use: Well-structured processes

```typescript
log.discoverInductiveMiner();
```

### Optimization & Search-Based

**ILP (Integer Linear Programming)**

- Type: Constraint optimization
- Speed: Medium (100-500ms)
- Use: Optimal Petri nets

```typescript
log.discoverILPPetriNet();
```

**A\* Search**

- Type: Informed search
- Speed: Medium (100-300ms)
- Use: Guided optimal discovery

```typescript
log.discoverAStar({ maxIterations: 1000 });
```

**Hill Climbing**

- Type: Greedy local optimization
- Speed: Very fast (< 50ms)
- Use: Quick local optima

```typescript
log.discoverHillClimbing();
```

### Metaheuristic Algorithms

**Genetic Algorithm**

- Type: Population evolution
- Speed: Medium (200-500ms)
- Use: Diverse solution exploration

```typescript
log.discoverGeneticAlgorithm({ populationSize: 50, generations: 20 });
```

**Particle Swarm Optimization**

- Type: Swarm intelligence
- Speed: Medium (200-500ms)
- Use: Continuous optimization

```typescript
log.discoverPSOAlgorithm({ swarmSize: 30, iterations: 50 });
```

**Ant Colony Optimization**

- Type: Pheromone-based
- Speed: Medium (100-300ms)
- Use: Distributed path discovery

```typescript
log.discoverAntColony({ numAnts: 20, iterations: 10 });
```

**Simulated Annealing**

- Type: Thermal search
- Speed: Medium (100-300ms)
- Use: Escape local optima

```typescript
log.discoverSimulatedAnnealing({ temperature: 100, coolingRate: 0.95 });
```

### Model Filtering

**Process Skeleton**

- Type: Frequency-based filtering
- Speed: Ultra-fast (< 5ms)
- Use: Minimal model extraction

```typescript
log.extractProcessSkeleton({ minFrequency: 2 });
```

**Optimized DFG**

- Type: Weighted optimization
- Speed: Fast (< 50ms)
- Use: Balance fitness vs simplicity

```typescript
log.discoverOptimizedDFG({ fitnessWeight: 0.7, simplicityWeight: 0.3 });
```

---

## Analytics Functions (20+ Methods)

### Process Variants & Patterns

**Trace Variants**

- Extract unique process paths
- Rank by frequency
- Coverage analysis

```typescript
log.getTraceVariants();
// Returns: total_variants, top_variants, coverage
```

**Variant Complexity**

- Shannon entropy calculation
- Normalized diversity metric
- Top-10 path coverage

```typescript
log.getVariantComplexity();
// Returns: entropy, normalized_entropy, top_10_coverage
```

**Sequential Pattern Mining**

- Find frequent activity sequences
- Configurable pattern length
- Minimum support filtering

```typescript
log.mineSequentialPatterns({ minSupport: 0.01, patternLength: 3 });
// Returns: top patterns with support
```

**Activity Cooccurrence**

- Activities happening together
- Pairwise association
- Strength ranking

```typescript
log.getActivityCooccurrence();
// Returns: top cooccurrence pairs
```

### Temporal & Performance

**Process Speedup Analysis**

- Identify acceleration patterns
- Percentile-based speedup ranges
- Performance variance

```typescript
log.analyzeProcessSpeedup({ windowSize: 50 });
// Returns: avg_gap, p25, p75, speedup_range
```

**Temporal Bottlenecks**

- Identify slow activities
- Duration-based analysis
- Timestamp correlation

```typescript
log.getTemporalBottlenecks();
// Returns: bottleneck activities with durations
```

**Concept Drift Detection**

- Identify process changes
- Jaccard-based distance
- Time-windowed analysis

```typescript
log.detectConceptDrift({ windowSize: 50 });
// Returns: drift positions and magnitudes
```

### Relationships & Dependencies

**Activity Start/End Analysis**

- Entry point activities
- Exit point activities
- Common start-end patterns

```typescript
log.getStartEndActivities();
// Returns: top starts, ends, pairs
```

**Activity Dependencies**

- Predecessor relationships
- Successor relationships
- Dependency counts

```typescript
log.getActivityDependencies();
// Returns: predecessors and successors per activity
```

**Activity Ordering**

- Mandatory predecessor extraction
- Partial order discovery
- Sequence constraints

```typescript
log.getActivityOrdering();
// Returns: mandatory predecessors per activity
```

**Transition Matrix**

- Markov chain probabilities
- Activity flow probabilities
- Transition counts

```typescript
log.getTransitionMatrix();
// Returns: from, to, count, probability
```

### Clustering & Similarity

**Trace Clustering**

- Group similar traces
- K-means-style clustering
- Variant extraction

```typescript
log.clusterTraces({ numClusters: 5 });
// Returns: cluster sizes and composition
```

**Trace Similarity Matrix**

- Pairwise Jaccard similarity
- High-similarity pair ranking
- Distance computation

```typescript
log.getTraceSimilarityMatrix();
// Returns: similar trace pairs
```

### Quality & Deviation Analysis

**Rework Detection**

- Repeated activities in same trace
- Rework percentage
- Rework by activity

```typescript
log.detectRework();
// Returns: traces_with_rework, rework_by_activity
```

**Infrequent Paths**

- Rare process variants
- Outlier identification
- Anomaly ranking

```typescript
log.analyzeInfrequentPaths({ frequencyThreshold: 0.05 });
// Returns: infrequent paths sorted by rarity
```

**Bottleneck Detection**

- High-duration activities
- Long waiting times
- Performance hotspots

```typescript
log.detectBottlenecks();
// Returns: bottleneck activities, occurrences, avg/max duration
```

### Case-Level Analysis

**Case Attributes Analysis**

- Attribute value distribution
- Attribute-process correlation
- Categorical mapping

```typescript
log.getCaseAttributeAnalysis();
// Returns: case attributes and unique values
```

### Conformance & Fitness

**Token-Based Replay**

- Case-by-case fitness
- Deviation tracking
- Missing/remaining tokens

```typescript
log.checkConformance(petriNet);
// Returns: case_fitness, avg_fitness, conforming_cases
```

---

## Streaming DFG Builder

An IoT-oriented API that constructs a DFG incrementally without ever holding
the full event log in memory.

- Memory: O(open_traces × avg_trace_length) for buffers + O(A²) for count tables
- Events arrive in any order across interleaved cases
- `close_trace` frees the per-case buffer; counts are in compact tables

```javascript
const handle = pm.streaming_dfg_begin();

// Add events one-by-one or in batches
pm.streaming_dfg_add_event(handle, 'case-1', 'Register');
pm.streaming_dfg_add_batch(
  handle,
  JSON.stringify([
    { case_id: 'case-1', activity: 'Approve' },
    { case_id: 'case-2', activity: 'Register' },
  ])
);

// Close traces as cases complete (frees per-trace buffer)
pm.streaming_dfg_close_trace(handle, 'case-1');

// Live snapshot
const dfg = JSON.parse(pm.streaming_dfg_snapshot(handle));

// Finalize: flush + store DFG + free builder
const result = JSON.parse(pm.streaming_dfg_finalize(handle));
// result.dfg_handle → use with conformance checking, etc.
```

---

## Algorithm Comparison Matrix

| Algorithm | Type  | Speed  | Best For      | Noise | Optimality |
| --------- | ----- | ------ | ------------- | ----- | ---------- |
| DFG       | Graph | ⚡⚡⚡ | Overview      | Low   | N/A        |
| Alpha++   | Petri | ⚡⚡   | Sound         | Med   | Good       |
| Heuristic | Graph | ⚡⚡   | Noisy         | High  | Fair       |
| Inductive | Petri | ⚡⚡   | Structure     | Med   | Good       |
| ILP       | Petri | ⚡     | Optimal       | Low   | Excellent  |
| A\*       | Graph | ⚡⚡   | Guided        | Low   | Good       |
| Genetic   | Graph | ⚡     | Diverse       | High  | Fair       |
| PSO       | Graph | ⚡     | Continuous    | Med   | Fair       |
| ACO       | Graph | ⚡     | Distributed   | Med   | Fair       |
| SA        | Graph | ⚡     | Escape optima | High  | Fair       |

---

## Performance Benchmarks

**Real Measured Results** — Criterion benchmarks (2026-04-04) on Event Log with 1000 cases, 5000 events, 20 activities:

```
FAST ALGORITHMS (< 1ms):
  DFG:                 ~0.29 ms
  Process Skeleton:    ~0.25 ms
  Hill Climbing:       ~0.48 ms
  Optimized DFG:       ~0.31 ms

MEDIUM ALGORITHMS (1-10ms):
  Heuristic:           ~1.8 ms
  Inductive:           ~2.5 ms
  Genetic:             ~2.3 ms
  ACO:                 ~2.4 ms
  SA:                  ~3.6 ms
  PSO:                 ~6.3 ms

SLOW ALGORITHMS (10-100ms):
  A*:                  ~7.7 ms
  ILP:                 ~9.0 ms

ANALYTICS:
  All functions < 10ms (detection, bottlenecks, variants, complexity, etc.)
```

**Summary**: All algorithms scale linearly with event count. See [Benchmark Results](../../docs/PROJECT_STATUS.md#benchmark-results-2026-04-04) for comprehensive 4-size dataset analysis.

---

## Selection Guide

### For Speed

1. Process Skeleton
2. Hill Climbing
3. DFG
4. Heuristic Miner

### For Accuracy

1. ILP
2. Alpha++
3. Inductive Miner
4. A\* Search

### For Flexibility

1. Genetic Algorithm
2. PSO
3. Ant Colony
4. Simulated Annealing

### For Noisy Logs

1. Heuristic Miner
2. Genetic Algorithm
3. Ant Colony
4. Simulated Annealing

### For Analysis

1. Trace Variants
2. Activity Dependencies
3. Concept Drift
4. Similarity Matrix

---

**Version**: 26.4.4
**Total Methods**: 20+ discovery/analytics + 8 streaming
**Lines of Code**: 2500+
**Status**: Production Ready
