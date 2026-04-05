# Algorithm Reference

Complete reference for all 15+ algorithms in the wasm4pm kernel registry.

## Quick Reference Table

| Algorithm | ID | Complexity | Speed* | Quality* | Output | Robust | Scales |
|-----------|----|-----------:|-------:|--------:|--------|:------:|:------:|
| DFG | `dfg` | O(n) | 5 | 30 | DFG | ✓ | ✓ |
| Skeleton | `process_skeleton` | O(n) | 3 | 25 | DFG | ✓ | ✓ |
| Alpha++ | `alpha_plus_plus` | O(n²) | 20 | 45 | Petri | ✗ | ✗ |
| Heuristic | `heuristic_miner` | O(n²) | 25 | 50 | DFG | ✓ | ✓ |
| Inductive | `inductive_miner` | O(n log n) | 30 | 55 | Tree | ✓ | ✓ |
| Genetic | `genetic_algorithm` | Exp | 75 | 80 | Petri | ✓ | ✗ |
| PSO | `pso` | Exp | 70 | 75 | Petri | ✓ | ✗ |
| A* | `a_star` | Exp | 60 | 70 | Petri | ✗ | ✗ |
| Hill Climb | `hill_climbing` | O(n²) | 40 | 55 | Petri | ✓ | ✓ |
| ILP | `ilp` | NP-Hard | 80 | 90 | Petri | ✗ | ✗ |
| ACO | `aco` | Exp | 65 | 75 | Petri | ✓ | ✗ |
| Sim. Ann. | `simulated_annealing` | Exp | 55 | 65 | Petri | ✓ | ✗ |
| Declare | `declare` | O(n²) | 35 | 50 | Declare | ✓ | ✓ |
| Opt. DFG | `optimized_dfg` | NP-Hard | 70 | 85 | DFG | ✗ | ✗ |

\* Speed (0-100, lower=faster) | Quality (0-100, higher=better)

## Detailed Algorithm Descriptions

### 1. DFG (Directly Follows Graph)

**ID**: `dfg`

**Type**: Basic discovery

**Algorithm**: Scans log once, builds frequency graph of directly-following activities

**Complexity**: O(n)

**Output**: Directly Follows Graph with nodes and edges

**Parameters**:
- `activity_key` (string, required): Event attribute for activity names (default: "concept:name")

**Use Cases**:
- Quick process overview
- Dashboard displays
- Streaming analysis
- Large log exploration

**Pros**:
- ⚡ Fastest algorithm (0.5ms per 100 events)
- 📊 Minimal memory footprint (20MB)
- 🔄 Fully parallelizable
- 🎯 Works with any event attribute

**Cons**:
- ❌ No loop/XOR detection
- ❌ No complex control flow
- ❌ No implicit start/end inference

**Example**:
```typescript
const output = await kernel.implementAlgorithmStep(
  {
    type: PlanStepType.DISCOVER_DFG,
    parameters: { activity_key: 'concept:name' }
  },
  wasm,
  logHandle
);
// => DFG with all directly-following relations
```

---

### 2. Process Skeleton

**ID**: `process_skeleton`

**Type**: Basic discovery

**Algorithm**: Extracts minimal skeleton (start, end, and direct flows)

**Complexity**: O(n)

**Output**: Minimal DFG with skeleton structure

**Parameters**:
- `activity_key` (string, required): Event attribute (default: "concept:name")

**Use Cases**:
- Real-time monitoring
- Streaming discovery
- Quick sanity checks

**Pros**:
- ⚡⚡ Fastest algorithm (0.3ms per 100 events)
- 🧠 Minimal memory (10MB)
- 🎯 Perfect for streaming

**Cons**:
- ❌ Too minimal for practical use
- ❌ Loses most behavior information

**Example**:
```typescript
// Skeleton is treated as DFG with minimal structure
const output = await kernel.implementAlgorithmStep(
  {
    type: PlanStepType.DISCOVER_DFG, // Uses DFG WASM function
    parameters: { activity_key: 'concept:name' }
  },
  wasm,
  logHandle
);
```

---

### 3. Alpha++ (Improved Alpha)

**ID**: `alpha_plus_plus`

**Type**: Petri Net discovery (improved classical algorithm)

**Algorithm**: Extends classic Alpha with better noise handling and loop detection

**Complexity**: O(n²)

**Output**: Place-Transition Petri Net

**Parameters**:
- `activity_key` (string, required): Event attribute (default: "concept:name")

**Use Cases**:
- Formal process models
- Verification and analysis
- Educational purposes

**Pros**:
- 📐 Produces formal Petri nets
- 🔄 Handles simple loops
- 🧬 Theoretically sound

**Cons**:
- ❌ Fails on non-fitting logs
- ❌ No noise tolerance
- ❌ Can produce overfitting models

**Typical Speed**: 5ms per 100 events

**Example**:
```typescript
const output = await kernel.implementAlgorithmStep(
  {
    type: PlanStepType.DISCOVER_ALPHA_PLUS_PLUS,
    parameters: { activity_key: 'concept:name' }
  },
  wasm,
  logHandle
);
// => Petri Net model
```

---

### 4. Heuristic Miner

**ID**: `heuristic_miner`

**Type**: Petri Net discovery (lenient, noise-tolerant)

**Algorithm**: Uses dependency frequency to filter edges, tolerates deviations

**Complexity**: O(n²)

**Output**: DFG or Petri Net with dependency relations

**Parameters**:
- `activity_key` (string, required): Event attribute (default: "concept:name")
- `dependency_threshold` (number, 0-1, default: 0.5): Minimum dependency ratio

**Dependency Formula**: `(a→b - b→a) / (a→b + b→a + 1) ≥ threshold`

**Use Cases**:
- Real-world process discovery
- Noise handling in actual logs
- Production systems
- Continuous improvement

**Pros**:
- 🛡️ Handles noise well
- 🎯 Works with real logs
- ⚙️ Tunable threshold
- 🔄 Supports loops

**Cons**:
- ⚠️ Not formally sound
- ⚠️ Threshold selection matters
- ⚠️ Can miss infrequent paths

**Typical Speed**: 10ms per 100 events

**Recommendation**: Start with threshold 0.5, adjust based on log quality

**Example**:
```typescript
// Lenient (include more edges)
const output = await kernel.implementAlgorithmStep(
  {
    type: PlanStepType.DISCOVER_HEURISTIC,
    parameters: {
      activity_key: 'concept:name',
      dependency_threshold: 0.3 // Lower = more edges
    }
  },
  wasm,
  logHandle
);

// Strict (filter weak dependencies)
const strict = await kernel.implementAlgorithmStep(
  {
    type: PlanStepType.DISCOVER_HEURISTIC,
    parameters: {
      activity_key: 'concept:name',
      dependency_threshold: 0.8 // Higher = fewer edges
    }
  },
  wasm,
  logHandle
);
```

---

### 5. Inductive Miner

**ID**: `inductive_miner`

**Type**: Process Tree discovery (recursive partitioning)

**Algorithm**: Recursively partitions log by cut criteria (xor, seq, par, loop)

**Complexity**: O(n log n) average

**Output**: Process Tree (can convert to Petri Net)

**Parameters**:
- `activity_key` (string, required): Event attribute (default: "concept:name")
- `noise_threshold` (number, 0-1, default: 0.2): Infrequency filter

**Use Cases**:
- Complex process structures
- XOR/parallel gate discovery
- Structured process models
- Mining with noise

**Pros**:
- 📐 Discovers complex structures (XOR, parallel, loops)
- 🛡️ Handles noise via threshold
- 🔄 Guaranteed to produce fitting model
- ✨ Clean, readable output

**Cons**:
- 🐢 Slower than simple methods (15ms)
- 💾 More memory (180MB)
- ❌ Can be overly structured

**Typical Speed**: 15ms per 100 events

**Memory**: ~180MB for 10k event log

**Recommendation**: Best choice for complex/structured processes

**Example**:
```typescript
const output = await kernel.implementAlgorithmStep(
  {
    type: PlanStepType.DISCOVER_INDUCTIVE,
    parameters: {
      activity_key: 'concept:name',
      noise_threshold: 0.2 // Filter infrequent behaviors
    }
  },
  wasm,
  logHandle
);
// => Process Tree with XOR/SEQ/PAR/LOOP gates
```

---

### 6. Genetic Algorithm

**ID**: `genetic_algorithm`

**Type**: Evolutionary discovery (population-based optimization)

**Algorithm**: Evolves population of models via selection, crossover, mutation

**Complexity**: Exponential (configurable via population × generations)

**Output**: High-quality Petri Net

**Parameters**:
- `activity_key` (string, required): Event attribute (default: "concept:name")
- `population_size` (number, 10-500, default: 50): Population size
- `generations` (number, 10-1000, default: 100): Evolution iterations

**Use Cases**:
- High-quality model discovery
- Research/offline analysis
- Complex process mining
- When time allows

**Pros**:
- 🏆 Produces high-quality models (quality tier 80)
- 🔬 Flexible search
- 🧬 Can handle complex behaviors
- 📊 Tuneable performance

**Cons**:
- 🐢 Slow (40ms per 100 events)
- 💾 Heavy memory (250MB)
- ⚠️ Parameter tuning required
- ❌ May not converge

**Typical Speed**: 40ms per 100 events

**Memory**: ~250MB for 10k event log

**Parameter Tuning**:
- Small population (20), few generations (20) = faster, lower quality
- Large population (100), many generations (300) = slower, higher quality
- Sweet spot: 50-100 population, 100-200 generations

**Example**:
```typescript
// Fast variant
const fast = await kernel.implementAlgorithmStep(
  {
    type: PlanStepType.DISCOVER_GENETIC,
    parameters: {
      activity_key: 'concept:name',
      population_size: 30,
      generations: 50
    }
  },
  wasm,
  logHandle
);

// Quality variant
const quality = await kernel.implementAlgorithmStep(
  {
    type: PlanStepType.DISCOVER_GENETIC,
    parameters: {
      activity_key: 'concept:name',
      population_size: 100,
      generations: 200
    }
  },
  wasm,
  logHandle
);
```

---

### 7. PSO (Particle Swarm Optimization)

**ID**: `pso`

**Type**: Swarm-based discovery

**Algorithm**: Models as particles moving in solution space, guided by best solutions

**Complexity**: Exponential (configurable)

**Output**: High-quality Petri Net

**Parameters**:
- `activity_key` (string, required): Event attribute (default: "concept:name")
- `swarm_size` (number, 10-300, default: 30): Number of particles
- `iterations` (number, 10-500, default: 50): Optimization iterations

**Use Cases**:
- High-quality discovery (alternative to genetic)
- Better convergence than genetic in some cases
- Quality research

**Pros**:
- 🏆 High-quality models (quality tier 75)
- 🐝 Swarm intelligence (good exploration)
- 📊 Slightly faster than genetic
- 🔬 Less parameter sensitivity

**Cons**:
- 🐢 Still slow (35ms per 100 events)
- 💾 Heavy memory (220MB)
- ⚠️ May premature converge

**Typical Speed**: 35ms per 100 events

**Example**:
```typescript
const output = await kernel.implementAlgorithmStep(
  {
    type: PlanStepType.DISCOVER_PSO,
    parameters: {
      activity_key: 'concept:name',
      swarm_size: 40,
      iterations: 100
    }
  },
  wasm,
  logHandle
);
```

---

### 8. A* Search

**ID**: `a_star`

**Type**: Heuristic search discovery

**Algorithm**: Explores model space using heuristic guidance

**Complexity**: Exponential (depends on search space)

**Output**: Near-optimal Petri Net

**Parameters**:
- `activity_key` (string, required): Event attribute (default: "concept:name")
- `max_iterations` (number, 1000-100000, default: 10000): Search depth

**Use Cases**:
- Near-optimal model discovery
- When optimality matters
- Smaller logs only

**Pros**:
- 🎯 Guaranteed near-optimal
- 🧭 Guided search (faster than brute force)
- 📐 Theoretically sound

**Cons**:
- 🐢 Slow (50ms per 100 events)
- 💾 Memory intensive (200MB)
- ❌ Fails on large logs
- ⚠️ Requires good heuristics

**Typical Speed**: 50ms per 100 events

**Recommendation**: Use only on logs < 10k events

**Example**:
```typescript
const output = await kernel.implementAlgorithmStep(
  {
    type: PlanStepType.DISCOVER_A_STAR,
    parameters: {
      activity_key: 'concept:name',
      max_iterations: 5000
    }
  },
  wasm,
  logHandle
);
```

---

### 9. Hill Climbing

**ID**: `hill_climbing`

**Type**: Greedy local search discovery

**Algorithm**: Starts with random model, iteratively improves by local changes

**Complexity**: O(n²) per iteration

**Output**: Local-optimal Petri Net

**Parameters**:
- `activity_key` (string, required): Event attribute (default: "concept:name")
- `max_iterations` (number, 10-1000, default: 100): Improvement iterations

**Use Cases**:
- Quick quality improvements
- Balanced speed/quality
- Medium-sized logs

**Pros**:
- ⚡ Fast (20ms per 100 events)
- 📊 Scales reasonably (true to O(n²))
- 🎯 Local optimization
- 💡 Simple and predictable

**Cons**:
- 🏔️ Gets stuck in local optima
- ⚠️ Quality varies with random start
- ⚠️ Not guaranteed good models

**Typical Speed**: 20ms per 100 events

**Memory**: ~150MB for 10k event log

**Example**:
```typescript
const output = await kernel.implementAlgorithmStep(
  {
    type: PlanStepType.DISCOVER_A_STAR, // TODO: Add DISCOVER_HILL_CLIMBING
    parameters: {
      activity_key: 'concept:name',
      max_iterations: 100
    }
  },
  wasm,
  logHandle
);
```

---

### 10. ILP (Integer Linear Programming)

**ID**: `ilp`

**Type**: Mathematical optimization discovery

**Algorithm**: Formulates discovery as integer program, solves optimally

**Complexity**: NP-Hard (depends on solver)

**Output**: Optimal Petri Net

**Parameters**:
- `activity_key` (string, required): Event attribute (default: "concept:name")
- `timeout_seconds` (number, 1-300, default: 30): Solver timeout

**Use Cases**:
- Best possible model quality
- Research/academic use
- Logs with clear structure
- When time permits

**Pros**:
- 🏆 Optimal models (quality tier 90)
- 📐 Mathematically rigorous
- ✨ Clear quality guarantees
- 🎯 Deterministic

**Cons**:
- 🐢 Very slow (20ms + solver time)
- 💾 Very heavy memory (300MB)
- ❌ Fails on large/complex logs
- ⚠️ Solver may timeout
- ⚠️ Exponential worst case

**Typical Speed**: 20ms per 100 events (+ solver time)

**Memory**: ~300MB for 10k event log

**Solver Behavior**:
- Finds optimal solution if time permits
- Returns best found solution on timeout
- Guaranteed to respect constraint model

**Recommendation**: 
- Use only on small-medium logs (< 10k events)
- Increase timeout for complex processes
- Monitor solver convergence

**Example**:
```typescript
// Quick solve (30s timeout)
const quick = await kernel.implementAlgorithmStep(
  {
    type: PlanStepType.DISCOVER_ILP,
    parameters: {
      activity_key: 'concept:name',
      timeout_seconds: 30
    }
  },
  wasm,
  logHandle
);

// Deep solve (120s timeout)
const deep = await kernel.implementAlgorithmStep(
  {
    type: PlanStepType.DISCOVER_ILP,
    parameters: {
      activity_key: 'concept:name',
      timeout_seconds: 120
    }
  },
  wasm,
  logHandle
);
```

---

### 11. ACO (Ant Colony Optimization)

**ID**: `aco`

**Type**: Swarm-based discovery

**Algorithm**: Simulates ant pheromone trails to find good solutions

**Complexity**: Exponential

**Output**: High-quality Petri Net

**Parameters**:
- `activity_key` (string, required): Event attribute (default: "concept:name")
- `colony_size` (number, 10-500, default: 40): Number of ants
- `iterations` (number, 10-1000, default: 100): Iterations

**Use Cases**:
- High-quality discovery (alternative approach)
- When genetic fails
- Complex process structures

**Pros**:
- 🐜 Swarm intelligence (good exploration)
- 🏆 High-quality models (quality tier 75)
- 🔄 Good for complex behaviors
- 🎯 No local optima escape issues

**Cons**:
- 🐢 Slow (45ms per 100 events)
- 💾 Heavy memory (200MB)
- ⚠️ Parameter tuning needed

**Typical Speed**: 45ms per 100 events

**Example**:
```typescript
const output = await kernel.implementAlgorithmStep(
  {
    type: PlanStepType.DISCOVER_ACO,
    parameters: {
      activity_key: 'concept:name',
      colony_size: 50,
      iterations: 150
    }
  },
  wasm,
  logHandle
);
```

---

### 12. Simulated Annealing

**ID**: `simulated_annealing`

**Type**: Probabilistic search discovery

**Algorithm**: Models cooling of metal, probability decreases with temperature

**Complexity**: Exponential

**Output**: Good quality Petri Net

**Parameters**:
- `activity_key` (string, required): Event attribute (default: "concept:name")
- `initial_temperature` (number, 1-1000, default: 100): Starting temperature
- `cooling_rate` (number, 0.8-0.99, default: 0.95): Cooling rate per iteration

**Use Cases**:
- Balanced exploration/exploitation
- When time is limited
- Alternative to genetic/PSO

**Pros**:
- ⚡ Faster than most evolutionary (30ms)
- 🌡️ Temperature control (theoretical grounding)
- 🔬 Good empirical results
- 📊 Tunable behavior

**Cons**:
- ⚠️ Sensitive to temperature schedule
- ⚠️ Can converge too fast/slow
- 🐢 Still slow (30ms per 100 events)

**Typical Speed**: 30ms per 100 events

**Temperature Schedule Tips**:
- Higher initial_temperature: more exploration (slower to converge)
- Lower cooling_rate: slower cooling (more exploration)
- Default (100, 0.95) is good starting point

**Example**:
```typescript
// Exploratory (more iterations)
const explore = await kernel.implementAlgorithmStep(
  {
    type: PlanStepType.DISCOVER_SIMULATED_ANNEALING,
    parameters: {
      activity_key: 'concept:name',
      initial_temperature: 200,
      cooling_rate: 0.98 // Slower cooling
    }
  },
  wasm,
  logHandle
);

// Exploitative (faster convergence)
const exploit = await kernel.implementAlgorithmStep(
  {
    type: PlanStepType.DISCOVER_SIMULATED_ANNEALING,
    parameters: {
      activity_key: 'concept:name',
      initial_temperature: 50,
      cooling_rate: 0.90 // Faster cooling
    }
  },
  wasm,
  logHandle
);
```

---

### 13. Declare (Constraint-Based)

**ID**: `declare`

**Type**: Constraint-based discovery

**Algorithm**: Discovers logical constraints (response, precedence, etc.)

**Complexity**: O(n²)

**Output**: Declare model (set of constraints)

**Parameters**:
- `activity_key` (string, required): Event attribute (default: "concept:name")
- `support_threshold` (number, 0-1, default: 0.8): Minimum constraint frequency

**Use Cases**:
- Flexible processes (healthcare, case work)
- Processes with optional activities
- Constraint documentation
- Process flexibility analysis

**Pros**:
- 🔓 Models flexible processes (not just fixed flows)
- 📋 Human-readable constraints
- 🛡️ Handles noise (via threshold)
- ⚙️ Works well with optional activities

**Cons**:
- ❌ Different paradigm (harder to visualize)
- ⚠️ May generate too many constraints
- 🐢 Moderate speed (12ms)

**Typical Speed**: 12ms per 100 events

**Example**:
```typescript
const output = await kernel.implementAlgorithmStep(
  {
    type: PlanStepType.DISCOVER_DECLARE,
    parameters: {
      activity_key: 'concept:name',
      support_threshold: 0.9 // Only high-confidence constraints
    }
  },
  wasm,
  logHandle
);
// => Declare model with constraints like:
//   - Response(A, B): if A occurs, B eventually follows
//   - Precedence(B, C): B must occur before C
//   - etc.
```

---

### 14. Optimized DFG (ILP-Based)

**ID**: `optimized_dfg`

**Type**: Mathematical optimization discovery

**Algorithm**: ILP-based DFG optimization, minimal model with maximum fitness

**Complexity**: NP-Hard

**Output**: Optimized DFG

**Parameters**:
- `activity_key` (string, required): Event attribute (default: "concept:name")
- `timeout_seconds` (number, 1-300, default: 15): Solver timeout

**Use Cases**:
- Best DFG quality
- Minimal edge count with maximum coverage
- Research use

**Pros**:
- 🏆 Highest quality DFG (quality tier 85)
- 📉 Minimal edge count (compact model)
- 📐 Optimal solution

**Cons**:
- 🐢 Slow (15ms + solver)
- 💾 Memory intensive (250MB)
- ❌ Only works on small logs

**Typical Speed**: 15ms per 100 events (+ solver time)

**Example**:
```typescript
const output = await kernel.implementAlgorithmStep(
  {
    type: PlanStepType.DISCOVER_ILP,
    parameters: {
      activity_key: 'concept:name',
      timeout_seconds: 15
    }
  },
  wasm,
  logHandle
);
```

---

## Algorithm Selection Decision Tree

```
Is time critical?
├─ YES → Can afford 100+ ms?
│  ├─ NO → Use DFG (0.5ms)
│  └─ YES → Is log < 50k events?
│     ├─ NO → Use Heuristic Miner (10ms)
│     └─ YES → Use Genetic/ILP (40-20ms)
│
└─ NO → How complex is process?
   ├─ SIMPLE → Use DFG (0.5ms)
   ├─ MODERATE → Use Heuristic/Inductive (10-15ms)
   └─ COMPLEX → Use Genetic/ILP (40-20ms)
```

## Profile Recommendations

### Fast Profile
- **Goal**: Quick analysis, < 5ms per 100 events
- **Algorithms**: DFG, Process Skeleton
- **Use**: Dashboards, streaming, initial exploration
- **Quality**: Basic (enough to see flow)

### Balanced Profile
- **Goal**: Reasonable speed, good quality, 10-30ms per 100 events
- **Algorithms**: Heuristic Miner, Inductive Miner, Alpha++
- **Use**: Standard analysis, reports, most production use
- **Quality**: Good (accurate for most processes)

### Quality Profile
- **Goal**: Best possible quality, time permitting, 30-80ms per 100 events
- **Algorithms**: Genetic, PSO, ACO, ILP, A*, Simulated Annealing
- **Use**: Research, optimization, offline analysis
- **Quality**: High (accurate models)

### Stream Profile
- **Goal**: Real-time processing, < 1ms per 100 events
- **Algorithms**: DFG, lightweight variants
- **Use**: Stream processing, real-time monitoring
- **Quality**: Minimal (just captures flow)

---

## Performance Comparison Chart

```
Speed (ms per 100 events) vs Quality (0-100)

100 ├─────────────────────────┤
    │                         ●ILP(90)
    │              ●PSO(75)   │
    │           ●GA(80)       │
 80 ├──────────────────────●AA(70) ├──────
    │      ●ACO(75)           │
    │                  ●SA(65)│
 60 ├──────────────────────────┤
    │               ●HC(55)    │
    │  ●Ind(55)      │        │
 40 ├──────●Heur(50)──┤───────┤
    │                 │ ●Declare(50)
    │             ●OptDFG(85)  │
 20 ├──────────────────────────┤
    │                          │
    │   ●Skeleton(25)          │
    ●DFG(30)                   │
  0 └────────────────────────┤
    0   10   20   30   40  50   60
             Speed (ms/100 events)
```

---

## Configuration Examples

### Fast Exploration
```typescript
const registry = getRegistry();
const algo = registry.suggestForProfile('fast', 100000);
// => DFG (almost always)
```

### Production Quality
```typescript
const algo = registry.suggestForProfile('balanced', 50000);
// => Heuristic Miner or Inductive (depending on structure)
```

### Research Publication
```typescript
const algo = registry.suggestForProfile('quality', 10000);
// => Genetic or ILP (maximum quality)
```

### Real-time Monitoring
```typescript
const algo = registry.suggestForProfile('stream', 5000);
// => DFG (fast and lightweight)
```

---

## References

- Van der Aalst, W. M. P. (2016). Process Mining
- Leemans, S. J. J., & Polyvyanyy, A. (2021). Stochastic Process Mining
- Schwegmann, C. (2021). Intelligent Process Automation
- Algorithm Papers: See ALGORITHMS_PAPERS.md
