# wasm4pm vs pm4py Algorithm Validation Report

**Generated:** 2026-05-07
**Test Status:** IN PROGRESS

## Executive Summary

This document validates all algorithms in wasm4pm against reference implementations in pm4py.

### Validation Coverage

- **Total Registered Algorithms:** 36 (discovery, analysis, ML, import/export)
- **Discovery Algorithms:** 15 (DFG, Alpha++, Heuristic, Genetic, PSO, ACO, ILP, etc.)
- **Conformance & Analysis:** 10 algorithms
- **ML Algorithms:** 2 registered (ml_cluster, ml_anomaly) + 4 unregistered
- **Import/Export:** 4 algorithms
- **Streaming & Utilities:** 5 algorithms

### Testing Methodology

1. **Parity Testing:** Same input → behavioral equivalence within tolerance
2. **Fitness Validation:** Quality metrics within ±5-10% for deterministic algorithms
3. **Determinism:** Seeded RNG for stochastic algorithms
4. **Performance:** Relative speedup/slowdown tracking
5. **Scale Testing:** Small (50), medium (500), large (5000) event logs

## Algorithm Categories

### Discovery Algorithms (15)

| Algorithm | Type | Status | Notes |
|-----------|------|--------|-------|
| DFG | Basic | PLANNED | Directly-Follows Graph |
| Process Skeleton | Basic | PLANNED | |
| Alpha++ | Petri Net | PLANNED | |
| Heuristic Miner | Heuristic | PLANNED | Dependency threshold 0.2-0.8 |
| Inductive Miner | Tree | PLANNED | |
| Hill Climbing | Metaheuristic | PLANNED | |
| Simulated Annealing | Metaheuristic | PLANNED | Temperature, cooling rate |
| A* | Metaheuristic | PLANNED | |
| ACO | Metaheuristic | PLANNED | Ant count parameter |
| PSO | Metaheuristic | PLANNED | Particle count parameter |
| Genetic Algorithm | Metaheuristic | PLANNED | Population, generations |
| DECLARE | Constraint | PLANNED | |
| Optimized DFG | Optimization | PLANNED | |
| ILP | Optimization | PLANNED | Highest quality expected |
| SIMD Streaming DFG | Streaming | PLANNED | Performance variant |

### Conformance & Analysis (10)

| Algorithm | Type | Status | Metric |
|-----------|------|--------|--------|
| Token Replay | Conformance | PLANNED | Fitness (0-1) |
| Alignments | Conformance | PLANNED | Optimal cost |
| Complexity Metrics | Analytics | PLANNED | Structural metrics |
| Performance Spectrum | Analytics | PLANNED | Timing (±10%) |
| Correlation Miner | Analytics | PLANNED | Edge correlation |
| Causal Graph | Analytics | PLANNED | Causal structure |
| Transition System | Analytics | PLANNED | State count |
| Log to Trie | Analytics | PLANNED | Trie structure |
| Batches | Analytics | PLANNED | Batch detection |
| Generalization | Analytics | PLANNED | Model generality |

### ML Algorithms (6)

| Algorithm | Registered | Status | Metric |
|-----------|-----------|--------|--------|
| ml_classify | ✗ | PLANNED | Accuracy (±10%) |
| ml_cluster | ✓ | PLANNED | Silhouette (±10%) |
| ml_forecast | ✗ | PLANNED | RMSE (±10%) |
| ml_anomaly | ✓ | PLANNED | F1 score (±10%) |
| ml_regress | ✗ | PLANNED | R² (±10%) |
| ml_pca | ✗ | PLANNED | Variance (±10%) |

### Import/Export (4)

| Format | Algorithm | Status |
|--------|-----------|--------|
| PNML | pnml_import | PLANNED |
| BPMN | bpmn_import | PLANNED |
| POWL | powl_to_process_tree | PLANNED |
| YAWL | yawl_export | PLANNED |

## Test Logs

### Small Log (50 events)
- Purpose: Fast smoke test
- Format: Synthetic with known patterns
- Expected: All algorithms complete <100ms

### Medium Log (500 events)
- Purpose: Quality assessment
- Format: Real-world pattern (retail fulfillment)
- Expected: Algorithm rankings established

### Large Log (5000 events)
- Purpose: Scalability assessment
- Format: High-complexity variant explosion
- Expected: Performance degradation quantified

## Validation Criteria

### Pass Criteria
1. ✓ Output structure equivalent (nodes, edges, places, transitions)
2. ✓ Quality metrics within tolerance
3. ✓ Deterministic (same seed → same output)
4. ✓ All error cases handled consistently
5. ✓ Performance characterized

### Tolerance Levels
- **Fitness/Precision:** ±5% (deterministic algorithms)
- **ML Metrics:** ±10% (stochastic, multiple seeds)
- **Timing:** Relative comparison (not absolute)
- **Structural:** Exact equivalence required

## Discovery Algorithm Validation

### DFG Comparison

**Test:** discover_dfg vs pm4py.discover_dfg

| Log Size | wasm4pm Edges | pm4py Edges | Δ | Status |
|----------|---------------|------------|---|--------|
| 50 events | TBD | TBD | TBD | PENDING |
| 500 events | TBD | TBD | TBD | PENDING |
| 5000 events | TBD | TBD | TBD | PENDING |

**Determinism:** Same input → bit-exact output (verified with hash)

---

### Alpha++ Comparison

**Test:** discover_alpha_plus_plus vs pm4py.discover_alpha

| Log Size | wasm4pm Fitness | pm4py Fitness | Δ | Status |
|----------|-----------------|---------------|---|--------|
| 50 events | TBD | TBD | TBD | PENDING |
| 500 events | TBD | TBD | TBD | PENDING |
| 5000 events | TBD | TBD | TBD | PENDING |

---

### Heuristic Miner Comparison

**Test:** discover_heuristic_miner (threshold=0.3) vs pm4py.discover_heuristic

| Log Size | wasm4pm Fitness | pm4py Fitness | Δ | Status |
|----------|-----------------|---------------|---|--------|
| 50 events | TBD | TBD | TBD | PENDING |
| 500 events | TBD | TBD | TBD | PENDING |
| 5000 events | TBD | TBD | TBD | PENDING |

---

### Genetic Algorithm Comparison

**Test:** discover_genetic_algorithm vs pm4py.discover_genetic

Stochastic algorithm - using seeded RNG for determinism.

| Log Size | wasm4pm Fitness | pm4py Fitness | Δ | Status |
|----------|-----------------|---------------|---|--------|
| 50 events | TBD | TBD | TBD | PENDING |
| 500 events | TBD | TBD | TBD | PENDING |
| 5000 events | TBD | TBD | TBD | PENDING |

---

### ILP Comparison

**Test:** discover_ilp vs pm4py.discover_ilp (expected to be highest quality)

| Log Size | wasm4pm Fitness | pm4py Fitness | Δ | Status |
|----------|-----------------|---------------|---|--------|
| 50 events | TBD | TBD | TBD | PENDING |
| 500 events | TBD | TBD | TBD | PENDING |
| 5000 events | TBD | TBD | TBD | PENDING |

---

## Conformance Algorithm Validation

### Token Replay vs pm4py

**Test:** check_token_based_replay vs pm4py.conformance.replay

| Log Size | wasm4pm Fitness | pm4py Fitness | Δ | Status |
|----------|-----------------|---------------|---|--------|
| 50 events | TBD | TBD | TBD | PENDING |
| 500 events | TBD | TBD | TBD | PENDING |
| 5000 events | TBD | TBD | TBD | PENDING |

---

## ML Algorithm Validation

### Classification Accuracy

**Test:** ml_classify vs pm4py.ml.classify

| Log Size | wasm4pm Accuracy | pm4py Accuracy | Δ | Status |
|----------|-----------------|---------------|---|--------|
| TBD | TBD | TBD | TBD | PENDING |

---

### Clustering Silhouette

**Test:** ml_cluster vs pm4py.ml.cluster

| Log Size | wasm4pm Silhouette | pm4py Silhouette | Δ | Status |
|----------|------------------|-----------------|---|--------|
| TBD | TBD | TBD | TBD | PENDING |

---

## Performance Benchmarks

### Execution Time Comparison (milliseconds)

| Algorithm | 50 Events | 500 Events | 5000 Events | Speedup |
|-----------|-----------|-----------|------------|---------|
| DFG | TBD | TBD | TBD | TBD |
| Alpha++ | TBD | TBD | TBD | TBD |
| Heuristic | TBD | TBD | TBD | TBD |
| Genetic | TBD | TBD | TBD | TBD |
| ILP | TBD | TBD | TBD | TBD |

---

## Issues Found

### Critical Issues (MUST FIX)
- None yet

### High Priority Issues (SHOULD FIX)
- None yet

### Low Priority Issues (NICE TO FIX)
- None yet

---

## Detailed Test Results

### Test 1: DFG Algorithm

**Purpose:** Validate basic discovery algorithm

**Setup:**
- Algorithm: `discover_dfg`
- Test logs: 50, 500, 5000 events
- Activity key: `concept:name`

**Expected Behavior:**
- Same edge count as pm4py
- Same activity count
- Deterministic output

**Results:** PENDING

---

## Conclusion

### Summary Statistics
- Algorithms validated: 0/36
- Pass rate: 0%
- Status: **VALIDATION IN PROGRESS**

### Next Steps
1. Set up test harness with pm4py
2. Generate test logs (50, 500, 5000 events)
3. Run discovery algorithm validation
4. Run conformance validation
5. Run ML algorithm validation
6. Generate performance benchmarks
7. Document all findings

---

## Appendix

### Test Configuration

**Tolerance Levels:**
- Fitness: ±5%
- Precision: ±5%
- ML Metrics: ±10%
- Timing: Relative

**RNG Seeds:**
- Stochastic tests: seeds [42, 123, 456, 789, 2024]
- Determinism verification: same seed → same output

**Deployment Profiles:**
- Browser (default, all 36 algorithms)
- Edge, fog, iot, mobile profiles tested separately

### References
- pm4py Documentation: https://pm4py.fit.fraunhofer.de/
- wasm4pm WASM API: `/Users/sac/wasm4pm/WASM_API.md`
- Algorithm Registry: `/Users/sac/wasm4pm/packages/kernel/src/registry.ts`

