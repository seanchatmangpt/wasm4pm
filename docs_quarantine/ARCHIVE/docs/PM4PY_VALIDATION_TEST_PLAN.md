# wasm4pm vs pm4py Algorithm Validation Test Plan

**Version:** 1.0
**Date:** 2026-05-07
**Status:** PLANNED

## Overview

This document defines the comprehensive test plan for validating all 36 registered algorithms in wasm4pm against their pm4py reference implementations.

### Objectives

1. **Behavioral Equivalence:** Verify that wasm4pm algorithms produce equivalent results to pm4py
2. **Quality Metrics:** Confirm fitness, precision, and other quality metrics are within tolerance
3. **Determinism:** Validate that algorithms are deterministic (same input = same output)
4. **Performance:** Measure relative performance (speedup/slowdown)
5. **Scalability:** Test with logs of 50, 500, and 5000 events
6. **Error Handling:** Verify consistent error handling across implementations

## Test Infrastructure

### 1. Test Log Generation

**Framework:** pm4py (Python)

**Test Logs Generated:**

| Log Name | Events | Traces | Max Trace Length | Characteristics | File |
|----------|--------|--------|-----------------|-----------------|------|
| Small | 50 | 5 | 10 | Simple patterns, no loops | `log_50_events.xes` |
| Medium | 500 | 50 | 10 | Real-world patterns | `log_500_events.xes` |
| Large | 5000 | 500 | 10 | Variant explosion, loops | `log_5000_events.xes` |

**Generation Script:** See `validation/scripts/generate_test_logs.py`

All logs are generated with `random.seed(42)` for reproducibility.

### 2. WASM Loader

**Language:** TypeScript
**Framework:** wasm4pm kernel API

**Setup Steps:**
1. Load WASM module (browser profile)
2. Initialize engine
3. Load test log (XES format)
4. Get log handle
5. Execute algorithm
6. Capture output + timing

**Code Location:** `validation/pm4py_comparison_harness.ts`

### 3. PM4py Reference Executor

**Language:** Python
**Framework:** pm4py >= 2.2

**Setup Steps:**
1. Load test log (XES format)
2. Execute algorithm with identical parameters
3. Capture output + timing
4. Serialize results to JSON

**Code Location:** `validation/scripts/run_pm4py_algorithm.py`

## Algorithm Test Coverage

### Category 1: Discovery Algorithms (15 tests)

#### 1.1 DFG (Directly-Follows Graph)

**wasm4pm:** `discover_dfg(handle, activity_key)`
**pm4py:** `pm4py.discover_dfg(log)`

**Parameters:**
- activity_key: "concept:name"

**Expected Output Structure:**
```typescript
{
  edges: Map<string, Map<string, number>>,  // activity -> activity -> count
  activities: Set<string>,
  startActivities: Set<string>,
  endActivities: Set<string>
}
```

**Comparison Metrics:**
- Edge count (exact match or ±1)
- Activity count (exact)
- Start/end activities (exact)

**Test Data:**
| Log | wasm4pm Edges | pm4py Edges | Expected Δ |
|-----|---------------|------------|-----------|
| 50 | TBD | TBD | ≤1 |
| 500 | TBD | TBD | ≤1 |
| 5000 | TBD | TBD | ≤1 |

**Pass Criteria:** Edge count match, activity count match

**Determinism:** Run 3x with same seed, verify output hash is identical

---

#### 1.2 Process Skeleton

**wasm4pm:** `discover_process_skeleton(handle, activity_key)`
**pm4py:** `pm4py.discover_process_skeleton(log)` (if available)

**Expected Output:** DFG-like structure (simplified)

**Comparison Metrics:**
- Edge count vs DFG (should be ≤ DFG edges)
- Activity count (should match)

**Pass Criteria:** No more edges than DFG; same activities

---

#### 1.3 Alpha++ (Petri Net)

**wasm4pm:** `discover_alpha_plus_plus(handle, activity_key)`
**pm4py:** `pm4py.discover_petri_net_alpha_plus_plus(log)`

**Expected Output Structure:**
```typescript
{
  places: number,
  transitions: number,
  arcs: number,
  initialMarking: Map<string, number>,
  finalMarking: Map<string, number>
}
```

**Comparison Metrics:**
- Place count (±2 tolerance)
- Transition count (±2 tolerance)
- Arc count (±3 tolerance)

**Test Data:**
| Log | wasm4pm Places | pm4py Places | Δ | Status |
|-----|----------------|-------------|---|--------|
| 50 | TBD | TBD | TBD | PENDING |
| 500 | TBD | TBD | TBD | PENDING |
| 5000 | TBD | TBD | TBD | PENDING |

**Conformance Metric:** Token-based replay fitness ≥0.80

**Pass Criteria:** Structure within tolerance; fitness ≥0.80

---

#### 1.4 Heuristic Miner

**wasm4pm:** `discover_heuristic_miner(handle, activity_key, threshold=0.3)`
**pm4py:** `pm4py.discover_heuristic_net(log, dependency_threshold=0.3)`

**Parameters:**
- dependency_threshold: 0.3 (test also with 0.5, 0.7)

**Expected Output:** DFG-like with filtered edges

**Comparison Metrics:**
- Edge count (should be ≤ DFG)
- Activity count
- Dependency metric consistency

**Pass Criteria:** Edge count ≤ DFG; consistent with threshold

**Threshold Sensitivity Test:**
| Threshold | wasm4pm Edges | pm4py Edges | Δ |
|-----------|---------------|------------|---|
| 0.3 | TBD | TBD | TBD |
| 0.5 | TBD | TBD | TBD |
| 0.7 | TBD | TBD | TBD |

---

#### 1.5 Inductive Miner

**wasm4pm:** `discover_inductive_miner(handle, activity_key)`
**pm4py:** `pm4py.discover_process_tree(log)`

**Expected Output:** Process tree structure

**Comparison Metrics:**
- Tree depth (±1)
- Node count (±2)
- Recursion indicators

**Pass Criteria:** Structure depth within tolerance

---

#### 1.6-1.10 Metaheuristic Algorithms (5 tests)

**Stochastic algorithms requiring seeded RNG:**
- Hill Climbing
- Simulated Annealing
- A*
- ACO
- PSO

**Common Approach:**
1. Run with 5 different seeds: [42, 123, 456, 789, 2024]
2. Collect fitness scores from all runs
3. Calculate mean and std deviation
4. Compare with pm4py mean fitness

**Parameters:**
- Hill Climbing: iterations=100 (default)
- Simulated Annealing: temperature=0.95, cooling_rate=0.99
- A*: max_iterations=1000
- ACO: num_ants=20, iterations=50
- PSO: num_particles=20, iterations=50

**Test Table Template:**
| Seed | wasm4pm Fitness | pm4py Fitness | Δ | Status |
|------|-----------------|---------------|---|--------|
| 42 | TBD | TBD | TBD | PENDING |
| 123 | TBD | TBD | TBD | PENDING |
| 456 | TBD | TBD | TBD | PENDING |
| 789 | TBD | TBD | TBD | PENDING |
| 2024 | TBD | TBD | TBD | PENDING |
| **MEAN** | **TBD** | **TBD** | **TBD** | **PENDING** |

**Pass Criteria:** Mean fitness within ±5% of pm4py

---

#### 1.11 Genetic Algorithm

**wasm4pm:** `discover_genetic_algorithm(handle, activity_key, generations, population)`
**pm4py:** `pm4py.discover_genetic(log, ...)`

**Parameters:**
- generations: 50
- population_size: 30

**Determinism Requirement:** Seeded RNG

**Test Table:**
| Log | wasm4pm Mean Fitness | pm4py Mean Fitness | Δ | Status |
|-----|--------|--------|---|--------|
| 50 | TBD | TBD | TBD | PENDING |
| 500 | TBD | TBD | TBD | PENDING |
| 5000 | TBD | TBD | TBD | PENDING |

**Pass Criteria:** Mean fitness (5 seeds) within ±5%

---

#### 1.12 DECLARE

**wasm4pm:** `discover_declare(handle, activity_key)`
**pm4py:** `pm4py.discover_declare(log)`

**Expected Output:** Declare constraint set

**Comparison Metrics:**
- Constraint count
- Constraint types (existence, choice, precedence, etc.)

**Pass Criteria:** Constraint set consistency

---

#### 1.13 Optimized DFG

**wasm4pm:** `discover_optimized_dfg(handle, activity_key)`
**pm4py:** Manual (not available; compare against pm4py DFG)

**Expected Output:** DFG with optimization heuristics

**Comparison Metrics:**
- Edge count (should be ≤ DFG)
- Edge weights consistency

**Pass Criteria:** Structure equivalent to or simpler than DFG

---

#### 1.14 ILP (Integer Linear Programming)

**wasm4pm:** `discover_ilp(handle, activity_key)`
**pm4py:** `pm4py.discover_ilp_petri_net(log)`

**Expected Output:** Highest-quality Petri net

**Comparison Metrics:**
- Fitness score (should be highest among all algorithms)
- Place/transition count
- Simplicity metric

**Pass Criteria:** Fitness ≥0.90; simplicity competitive

---

#### 1.15 SIMD Streaming DFG

**wasm4pm:** `discover_simd_streaming_dfg(handle, activity_key)`
**pm4py:** `pm4py.discover_dfg(log)` (reference)

**Expected Output:** DFG structure identical to regular DFG

**Comparison Metrics:**
- Edge count (exact match to regular DFG)
- Performance (should be faster)

**Test Table:**
| Log | DFG Time | Streaming Time | Speedup |
|-----|----------|----------------|---------|
| 50 | TBD | TBD | TBD |
| 500 | TBD | TBD | TBD |
| 5000 | TBD | TBD | TBD |

**Pass Criteria:** Output matches DFG; execution faster

---

### Category 2: Conformance & Analysis (10 tests)

#### 2.1 Token-Based Replay

**wasm4pm:** `check_token_based_replay(handle, activity_key)`
**pm4py:** `pm4py.conformance.token_based_replay(log, net, im, fm)`

**Prerequisite:** A Petri net model (use Alpha++ discovery result)

**Expected Output:**
```typescript
{
  fitness: number,  // 0-1
  missingTokens: number,
  consumedTokens: number,
  remainingTokens: number,
  producedTokens: number
}
```

**Comparison Metrics:**
- Fitness score (±5% tolerance)
- Individual token metrics

**Test Data:**
| Log | wasm4pm Fitness | pm4py Fitness | Δ | Status |
|-----|-----------------|---------------|---|--------|
| 50 | TBD | TBD | TBD | PENDING |
| 500 | TBD | TBD | TBD | PENDING |
| 5000 | TBD | TBD | TBD | PENDING |

**Pass Criteria:** Fitness within ±5%

---

#### 2.2-2.10 Analysis Algorithms (9 tests)

**Algorithms:**
- Complexity Metrics
- Performance Spectrum
- Correlation Miner
- Causal Graph
- Transition System
- Log to Trie
- Batches
- Generalization
- Temporal

**Common Test Approach:**
1. Load test log
2. Run algorithm
3. Verify output structure
4. Compare key metrics with pm4py (if available)

**Pass Criteria:** Output structure valid; metrics within tolerance

---

### Category 3: ML Algorithms (6 tests)

#### 3.1 Classification (ml_classify)

**Status:** Unregistered in registry (Phase 4 audit)

**Expected:** Classify traces based on features

**Comparison Metrics:**
- Accuracy (±10%)
- Precision/Recall (±10%)

---

#### 3.2 Clustering (ml_cluster)

**Status:** Registered

**Expected:** Cluster traces/activities

**Comparison Metrics:**
- Silhouette score (±10%)
- Cluster count consistency

---

#### 3.3 Forecasting (ml_forecast)

**Status:** Unregistered in registry

**Expected:** Time series prediction

**Comparison Metrics:**
- RMSE (±10%)
- MAE (±10%)

---

#### 3.4 Anomaly Detection (ml_anomaly)

**Status:** Registered

**Expected:** Identify anomalous traces

**Comparison Metrics:**
- F1 score (±10%)
- Detection rate consistency

---

#### 3.5 Regression (ml_regress)

**Status:** Unregistered in registry

**Expected:** Predict numeric value

**Comparison Metrics:**
- R² score (±10%)

---

#### 3.6 PCA (ml_pca)

**Status:** Unregistered in registry

**Expected:** Dimensionality reduction

**Comparison Metrics:**
- Variance explained (±10%)

---

### Category 4: Import/Export (4 tests)

#### 4.1 PNML Import

**wasm4pm:** `pnml_import(pnml_content)`
**pm4py:** `pm4py.read_pnml(file)`

**Test:** Round-trip fidelity (read PNML → export → read → compare)

---

#### 4.2 BPMN Import

**wasm4pm:** `bpmn_import(bpmn_content)`
**pm4py:** `pm4py.read_bpmn(file)`

**Test:** Round-trip fidelity

---

#### 4.3 POWL

**wasm4pm:** `powl_to_process_tree(powl_content)`
**pm4py:** `pm4py.POWL` (if available)

**Test:** Structure preservation

---

#### 4.4 YAWL Export

**wasm4pm:** `yawl_export(net, im, fm)`
**pm4py:** Manual validation

**Test:** Format compliance

---

## Test Execution Plan

### Phase 1: Infrastructure Setup (1-2 hours)

1. ✓ Generate test logs (3 sizes)
2. ✓ Create validation harness
3. ✓ Create PM4py wrapper scripts
4. ✓ Create WASM loader

**Deliverable:** Ready-to-run test harness

### Phase 2: Discovery Algorithm Validation (2-3 hours)

1. Run DFG validation
2. Run Alpha++ validation
3. Run Heuristic Miner validation
4. Run metaheuristic algorithms (Hill Climbing, SA, A*, ACO, PSO)
5. Run Genetic Algorithm validation
6. Run ILP validation
7. Run DECLARE validation
8. Run SIMD Streaming DFG performance comparison

**Deliverable:** Discovery algorithm comparison matrix

### Phase 3: Conformance & Analysis Validation (2-3 hours)

1. Run token replay conformance
2. Run all 9 analysis algorithms
3. Validate output structures
4. Compare metrics

**Deliverable:** Conformance & analysis comparison matrix

### Phase 4: ML Algorithm Validation (1-2 hours)

1. Register missing ML algorithms (if needed)
2. Run classification validation
3. Run clustering validation
4. Run forecasting validation
5. Run anomaly detection validation
6. Run regression validation
7. Run PCA validation

**Deliverable:** ML algorithm comparison matrix

### Phase 5: Import/Export Validation (1 hour)

1. Run PNML round-trip test
2. Run BPMN round-trip test
3. Run POWL structure test
4. Run YAWL export test

**Deliverable:** Import/export validation results

### Phase 6: Performance Benchmark (1 hour)

1. Measure execution time for all algorithms
2. Calculate speedup/slowdown vs pm4py
3. Generate performance report

**Deliverable:** Performance benchmark table

### Phase 7: Report Generation (1 hour)

1. Aggregate all results
2. Generate markdown report
3. Generate HTML report
4. Generate JSON machine-readable output

**Deliverable:** `/Users/sac/wasm4pm/docs/PM4PY_ALGORITHM_VALIDATION.md`

---

## Pass/Fail Criteria

### Discovery Algorithms
- ✓ DFG: Edge count match (±1)
- ✓ Alpha++: Structure within ±2 places/transitions
- ✓ Heuristic: Edge count ≤ DFG
- ✓ Metaheuristic: Mean fitness within ±5% (5 seeds)
- ✓ ILP: Fitness ≥0.90

### Conformance & Analysis
- ✓ Token Replay: Fitness within ±5%
- ✓ Others: Output structure valid

### ML Algorithms
- ✓ Accuracy/F1/R²: Within ±10%
- ✓ Silhouette: Within ±10%

### Performance
- ✓ WASM algorithms complete within 10s for 5000-event log
- ✓ SIMD variant faster than regular DFG

### Determinism
- ✓ Same seed → same output (bit-exact)

---

## Expected Results

### Discovery Algorithm Summary

| Algorithm | 50 Events | 500 Events | 5000 Events | Expected Quality |
|-----------|-----------|-----------|------------|-----------------|
| DFG | <1ms | <5ms | <50ms | Low (baseline) |
| Alpha++ | ~5ms | ~50ms | ~500ms | Medium |
| Heuristic | ~5ms | ~50ms | ~500ms | Medium-High |
| Genetic | ~100ms | ~1000ms | ~10000ms | High |
| ILP | ~200ms | ~2000ms | TBD* | Very High |
| SIMD DFG | <0.5ms | <2ms | <20ms | Low (fast variant) |

*ILP may timeout on 5000-event logs; this is expected.

---

## Deliverables

1. **Markdown Report:** `/Users/sac/wasm4pm/docs/PM4PY_ALGORITHM_VALIDATION.md`
   - Human-readable summary
   - Detailed test results per algorithm
   - Performance benchmarks
   - Issues found

2. **HTML Report:** `validation/results/validation_report.html`
   - Interactive table views
   - Performance charts
   - Algorithm comparison visualizations

3. **JSON Output:** `validation/results/validation_results.json`
   - Machine-readable format
   - All test data and metrics
   - Ready for CI/CD integration

4. **Test Harness:** `validation/pm4py_comparison_harness.ts`
   - Reusable test framework
   - Ready for continuous validation
   - Configurable tolerance levels

---

## Known Limitations

1. **pm4py Missing Algorithms:** Some wasm4pm algorithms may not have pm4py equivalents
   - Fallback: Compare against logic specifications or manual validation

2. **Stochastic Algorithms:** Different RNG implementations may produce different results
   - Mitigation: Use seeded RNG, test with multiple seeds, compare means

3. **ILP on Large Logs:** May timeout (this is expected)
   - Fallback: Test only on small/medium logs

4. **WASM Performance:** WASM execution slower than native
   - Expectation: Slower than pm4py, but structurally equivalent

---

## Timeline

- **Start:** 2026-05-07
- **Infrastructure Ready:** 2026-05-07
- **Phase 2-7 Complete:** 2026-05-08
- **Final Report:** 2026-05-08

---

## References

- PM4py: https://pm4py.fit.fraunhofer.de/
- wasm4pm: `/Users/sac/wasm4pm/`
- Algorithm Registry: `packages/kernel/src/registry.ts`
- WASM API: `WASM_API.md`

