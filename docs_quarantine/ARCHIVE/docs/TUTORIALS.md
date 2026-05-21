# wpm (wasm4pm) Tutorials

Learn process mining step-by-step with real commands and concrete examples. Each tutorial takes 5–10 minutes.

---

## Tutorial 1: From Event Log to Process Model (Beginner — 5 min)

**Goal:** Discover your first process model from an event log and understand the output.

### Step 1: Prepare Your Log

```bash
# Download a sample XES log or use your own
ls *.xes
# Expected: process.xes (or similar)
```

### Step 2: Run Discovery with the Default Algorithm

```bash
wpm run process.xes
```

**What you see:**
- Discovered DFG (Directly-Follows Graph) or Petri net
- Activity count, edge count
- Elapsed time (milliseconds)

### Step 3: Discover with a Different Algorithm

```bash
# Try fast, simple discovery
wpm run process.xes --algorithm dfg

# Try slower, higher-quality discovery
wpm run process.xes --algorithm genetic
```

### Step 4: Save and Compare Results

```bash
# Save result to JSON file for later use
wpm run process.xes --algorithm heuristic -o result.json

# See what was saved
cat result.json | head -50
```

### Step 5: Measure Model Fitness

```bash
# Add quality metrics (fitness, precision, simplicity)
wpm run process.xes --with-quality
```

---

## Tutorial 2: Predictive Process Mining (Intermediate — 5 min)

**Goal:** Predict future process behavior (next activities, remaining time, anomalies).

**Prerequisites:** You have an event log in `process.xes`.

### Step 1: Predict the Next Activity

```bash
# Predict which activity comes next after "Submit" and "Approve"
wpm predict next-activity -i process.xes --prefix "Submit,Approve"
```

**What you see:**
- Top 3 predicted next activities
- Confidence scores (0.0–1.0)
- Historical frequency

### Step 2: Estimate Remaining Time

```bash
# How long until a case finishes after "Submit"?
wpm predict remaining-time -i process.xes --prefix "Submit"
```

### Step 3: Detect Concept Drift

```bash
# Has the process changed over time?
wpm predict drift -i process.xes

# Real-time monitoring (live EWMA drift detection)
wpm drift-watch -i process.xes
# (Press Ctrl+C to stop)
```

### Step 4: Spot Anomalous Cases

```bash
# Which cases deviate from the norm?
wpm predict outcome -i process.xes
```

---

## Tutorial 3: ML-Assisted Process Analysis (Intermediate — 7 min)

**Goal:** Use machine learning to cluster, classify, and forecast process behavior.

**Prerequisites:** You have an event log in `process.xes`.

### Step 1: Cluster Similar Cases

```bash
# Group traces by similarity
wpm ml cluster -i process.xes --method kmeans --k 5
```

**What you see:**
- Cluster assignments (0–4 for k=5)
- Silhouette score (0.0–1.0, higher is better)
- Cluster sizes

### Step 2: Classify Cases into Categories

```bash
# Predict which category a case belongs to (e.g., fast/slow, approved/rejected)
wpm ml classify -i process.xes --method logistic_regression
```

### Step 3: Forecast Throughput Trends

```bash
# Will throughput increase or decrease over time?
wpm ml forecast -i process.xes --method polynomial --periods 10
```

### Step 4: Detect Anomalies

```bash
# Which cases are statistical outliers?
wpm ml anomaly -i process.xes
```

---

## Tutorial 4: Conformance Checking — Does the Log Match the Model? (Intermediate — 5 min)

**Goal:** Measure how well an observed event log conforms to an expected process model.

**Prerequisites:** You have an event log (`process.xes`) and optionally a model.

### Step 1: Measure Log Fitness (How much of the model did we observe?)

```bash
wpm conformance -i process.xes
```

**What you see:**
- **Fitness** (0–1): What fraction of the model's behavior is seen in the log?
  - 1.0 = perfect fit
  - 0.8 = 80% fit (some model paths not executed)
- **Precision** (0–1): How many model paths were actually executed?
  - 1.0 = precise (no unused paths)
  - 0.6 = imprecise (many unused model paths)

### Step 2: Validate Your Log Before Discovery

```bash
wpm validate process.xes
```

**What you see:**
- Schema validation (required attributes present?)
- Data quality report (missing timestamps, invalid activity keys?)
- Variant count and unique activities

---

## Tutorial 5: Comparing Algorithms — Which One Fits Best? (Intermediate — 5 min)

**Goal:** Side-by-side comparison of multiple discovery algorithms on the same log.

**Prerequisites:** You have an event log in `process.xes`.

### Step 1: Compare Three Algorithms

```bash
wpm compare dfg,heuristic,genetic -i process.xes
```

**What you see:**
- A side-by-side table with speed, quality, fitness, precision for each algorithm
- ASCII sparklines showing performance trends

### Step 2: Add Quality Metrics to the Comparison

```bash
# Include fitness and precision scores
wpm compare dfg,heuristic,ilp -i process.xes --verbose
```

### Step 3: Explain Which Algorithm Fits Your Use Case

```bash
# Get recommendations for exploration, daily ops, conformance, or publication
wpm explain dfg
wpm explain genetic
```

---

## Tutorial 6: Advanced — Multi-Perspective Process Analysis (Advanced — 10 min)

**Goal:** Analyze time, resources, and data perspectives alongside control flow.

**Prerequisites:** You have an event log with timestamps and resource attributes.

### Step 1: Analyze Temporal Patterns

```bash
# When do activities happen? Which are slow?
wpm temporal -i process.xes
```

**What you see:**
- Average duration per activity
- Bottlenecks (slowest activities)
- Throughput (events per time unit)

### Step 2: Mine Social Networks

```bash
# Who hands off work to whom? Who works together?
wpm social -i process.xes
```

**What you see:**
- Handover-of-work network (direct task handoffs)
- Working-together network (same-case co-occurrence)
- Resource degree centrality

### Step 3: Simulate Alternative Processes

```bash
# What if we ran the discovered model 100 times?
wpm simulate -i process.xes --iterations 100
```

**What you see:**
- Simulated traces matching discovered model
- Statistical properties of simulated runs

---

## Tutorial 7: Autonomous Quality Assurance — Let the System Verify (Advanced — 5 min)

**Goal:** Use autonomic agents to detect and fix process violations.

**Prerequisites:** You have an event log in `process.xes`.

### Step 1: Run a Full Autonomic Control Loop

```bash
wpm autoprocess process.xes
```

**What you see:**
- **Perception**: Current process health (SPC alerts, anomalies)
- **Decision**: Which mitigations are recommended
- **Protection**: Circuit breaker status
- **Optimization**: Quality improvement actions

### Step 2: Execute a Specific Agent

```bash
# List available agents
wpm agent list

# Run a specific agent (e.g., drift detection)
wpm agent execute drift -i process.xes
```

### Step 3: Audit Corrections

```bash
# What actions did the system take?
wpm agent audit --last 10
```

---

## Tutorial 8: Object-Centric Process Mining (Advanced — 7 min)

**Goal:** Analyze processes with multiple object types (not just cases).

**Prerequisites:** You have an OCEL 2.0 JSON file (`log.ocel.json`).

### Step 1: Load and Explore an OCEL Log

```bash
# Discover per-object-type processes
wpm run log.ocel.json
```

**What you see:**
- Separate DFG for each object type
- Total event/object counts
- Per-type breakdowns

### Step 2: Flatten to Traditional Log (if needed)

```bash
# Convert OCEL back to XES for compatibility
wpm run log.ocel.json --algorithm dfg -o flattened.xes
```

### Step 3: Analyze Partial-Order Relationships

```bash
# Discover POWL (Partial-Order Workflow Language) model
wpm powl discover -i log.ocel.json
```

---

## Common Next Steps

After each tutorial, try these commands to extend your learning:

| After Tutorial | Try This | Purpose |
|---|---|---|
| 1 (Basic Discovery) | `wpm compare dfg,heuristic -i process.xes` | Explore algorithm trade-offs |
| 2 (Prediction) | `wpm drift-watch -i process.xes` | Real-time monitoring |
| 3 (ML Analysis) | `wpm quality -i process.xes` | Quality metrics |
| 4 (Conformance) | `wpm validate process.xes` | Data quality check |
| 5 (Algorithm Comparison) | `wpm algorithms` | See all 36 available algorithms |
| 6 (Multi-Perspective) | `wpm temporal -i process.xes && wpm social -i process.xes` | Combined analysis |
| 7 (Autonomic) | `wpm doctor` | System health check |
| 8 (OCEL) | `wpm results` | Browse all saved discoveries |

---

## Getting Help

| Task | Command |
|---|---|
| See all commands | `wpm --help` |
| Get help on a specific command | `wpm <command> --help` |
| List all 36 algorithms | `wpm algorithms` |
| Check system health | `wpm doctor` |
| Browse saved results | `wpm results` |
| View system status | `wpm status` |

---

## Key Concepts (Quick Reference)

### Control Flow Perspectives
- **DFG (Directly-Follows Graph)**: Activities and transitions (fast, simple)
- **Petri Net**: Places, transitions, tokens (detailed, complex)
- **Process Tree**: Nested control structures (hierarchical)
- **POWL**: Partial-order workflows (flexible, multi-object)

### Quality Dimensions (van der Aalst)
- **Fitness** (0–1): Fraction of model behavior observed in log. High = good coverage.
- **Precision** (0–1): Fraction of model paths actually executed. High = tight constraints.
- **Generalization** (0–1): Model doesn't overfit. High = reusable.
- **Simplicity**: Fewer places/transitions. Simpler = easier to understand.

### Algorithm Selection
- **Fast exploration**: `dfg`, `skeleton`, `simd-dfg` (~1–5ms)
- **Balanced**: `heuristic`, `alpha`, `inductive` (~25–30ms)
- **High quality**: `genetic`, `ilp`, `a-star` (~400–1000ms)

### Predictive Mining
- **next-activity**: Which activity happens next?
- **remaining-time**: How long until case completes?
- **outcome**: Will case succeed or fail?
- **drift**: Is the process changing?
- **features**: What are case characteristics?
- **resource**: Who handles each activity?

---

## Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| "Input file not found" | File path is wrong | `ls *.xes` to find the right file |
| "Algorithm not found" | Typo in algorithm name | `wpm algorithms` to see all 36 available |
| "WASM initialization failed" | WASM binary not loaded | `wpm doctor` to diagnose |
| "Empty log" | Log has zero events | Check that `wpm validate log.xes` passes |
| "Unsupported file extension" | Log format is wrong | Use `.xes`, `.xes.gz`, `.json`, or `.ocel.json` |

---

## Learn More

- **IEEE XES Standard**: https://www.xes-standard.org/
- **OCEL 2.0 Standard**: https://www.ocel-standard.org/
- **van der Aalst's Four Perspectives**: See `wpm explain <algorithm>`
- **Process Mining Book**: "Process Mining: Data Science in Action" (W.M.P. van der Aalst)

