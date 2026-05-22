# wasm4pm Algorithm Validation Guide

**Comprehensive framework for validating all 36 algorithms against pm4py reference implementations.**

## Quick Start

### Generate Test Logs

```bash
cd /Users/sac/wasm4pm
python3 validation/scripts/generate_test_logs.py --output /tmp/wasm4pm_test_logs
```

**Output:**
- `log_50_events.xes` (50 events, 5 traces)
- `log_500_events.xes` (500 events, 50 traces)
- `log_5000_events.xes` (5000 events, 500 traces)
- JSON versions of each

### Run PM4py Validation

```bash
python3 validation/scripts/run_pm4py_validation.py \
  --log /tmp/wasm4pm_test_logs/log_500_events.xes \
  --output /tmp/pm4py_validation_results
```

**Output:** `pm4py_log_500_events_results.json`

### Run wasm4pm Validation (Next Phase)

```bash
cd /Users/sac/wasm4pm/apps/wasm4pm
npm test -- validation
```

## Architecture

### Three-Layer Validation

```
Layer 1: Test Log Generation (Python + pm4py)
         ├─ Small log (50 events)
         ├─ Medium log (500 events)
         └─ Large log (5000 events)
              │
              ▼
Layer 2: PM4py Reference Execution (Python)
         ├─ discover_dfg()
         ├─ discover_alpha_plus_plus()
         ├─ discover_heuristic_net()
         ├─ conformance.token_based_replay()
         └─ ... (other algorithms)
              │
              ▼
Layer 3: wasm4pm Execution (TypeScript + WASM)
         ├─ discover_dfg()
         ├─ discover_alpha_plus_plus()
         ├─ discover_heuristic_miner()
         ├─ check_token_based_replay()
         └─ ... (other algorithms)
              │
              ▼
         Comparison & Analysis
         ├─ Output structure equivalence
         ├─ Quality metrics (±5-10%)
         ├─ Performance benchmarks
         └─ Determinism verification
```

## File Structure

```
validation/
├── scripts/
│   ├── generate_test_logs.py          # Generate XES test logs
│   ├── run_pm4py_validation.py        # Execute pm4py algorithms
│   └── run_wasm4pm_validation.ts      # Execute wasm4pm algorithms (TODO)
├── pm4py_comparison_harness.ts         # Main test harness
├── results/
│   ├── validation_config.json          # Test configuration
│   ├── pm4py_*.json                    # PM4py results
│   ├── wasm4pm_*.json                  # wasm4pm results
│   └── validation_report.html          # HTML summary
└── README.md                           # This guide

docs/
├── PM4PY_VALIDATION_TEST_PLAN.md       # Detailed test plan (60+ pages)
├── PM4PY_ALGORITHM_VALIDATION.md       # Report template
└── ALGORITHM_VALIDATION_GUIDE.md       # This guide
```

## Test Coverage

### Discovery Algorithms (15)

| Algorithm | Status | Test Plan | pm4py Equivalent |
|-----------|--------|-----------|-----------------|
| DFG | ✓ READY | ✓ Detailed | `discover_dfg()` |
| Process Skeleton | PLANNED | ✓ Detailed | `discover_process_skeleton()` |
| Alpha++ | ✓ READY | ✓ Detailed | `discover_petri_net_alpha_plus_plus()` |
| Heuristic | ✓ READY | ✓ Detailed | `discover_heuristic_net()` |
| Inductive | ✓ READY | ✓ Detailed | `discover_process_tree()` |
| Hill Climbing | PLANNED | ✓ Detailed | Manual implementation |
| Simulated Annealing | PLANNED | ✓ Detailed | Manual implementation |
| A* | PLANNED | ✓ Detailed | Manual implementation |
| ACO | PLANNED | ✓ Detailed | Manual implementation |
| PSO | PLANNED | ✓ Detailed | Manual implementation |
| Genetic | PLANNED | ✓ Detailed | `discover_petri_net_genetic()` |
| DECLARE | PLANNED | ✓ Detailed | `discover_declare()` |
| Optimized DFG | PLANNED | ✓ Detailed | Manual (vs regular DFG) |
| ILP | PLANNED | ✓ Detailed | `discover_petri_net_ilp()` |
| SIMD Streaming DFG | PLANNED | ✓ Detailed | Manual (vs regular DFG) |

### Conformance & Analysis (10)

| Algorithm | Status | Test Plan | pm4py Equivalent |
|-----------|--------|-----------|-----------------|
| Token Replay | ✓ READY | ✓ Detailed | `conformance.token_based_replay()` |
| Alignments | PLANNED | ✓ Detailed | `conformance.alignments()` |
| Complexity Metrics | PLANNED | ✓ Detailed | Manual |
| Performance Spectrum | PLANNED | ✓ Detailed | Manual |
| Correlation Miner | PLANNED | ✓ Detailed | Manual |
| Causal Graph | PLANNED | ✓ Detailed | Manual |
| Transition System | PLANNED | ✓ Detailed | Manual |
| Log to Trie | PLANNED | ✓ Detailed | Manual |
| Batches | PLANNED | ✓ Detailed | Manual |
| Generalization | PLANNED | ✓ Detailed | Manual |

### ML Algorithms (6)

| Algorithm | Status | Registered | Test Plan | pm4py Equivalent |
|-----------|--------|-----------|-----------|-----------------|
| ml_classify | PLANNED | ✗ | ✓ Detailed | Manual |
| ml_cluster | PLANNED | ✓ | ✓ Detailed | Manual |
| ml_forecast | PLANNED | ✗ | ✓ Detailed | Manual |
| ml_anomaly | PLANNED | ✓ | ✓ Detailed | Manual |
| ml_regress | PLANNED | ✗ | ✓ Detailed | Manual |
| ml_pca | PLANNED | ✗ | ✓ Detailed | Manual |

### Import/Export (4)

| Format | Status | Test Plan |
|--------|--------|-----------|
| PNML | PLANNED | ✓ Detailed |
| BPMN | PLANNED | ✓ Detailed |
| POWL | PLANNED | ✓ Detailed |
| YAWL | PLANNED | ✓ Detailed |

## Test Metrics

### Pass Criteria

#### Discovery Algorithms
- ✓ Output structure equivalent (nodes, edges)
- ✓ Quality metrics within ±5% (fitness, precision)
- ✓ Deterministic (same seed → same output)
- ✓ Handles edge cases (empty logs, single trace)

#### Conformance & Analysis
- ✓ Fitness score within ±5%
- ✓ Output structure valid
- ✓ Consistent with quality standards

#### ML Algorithms
- ✓ Accuracy/F1/R² within ±10% (stochastic tolerance)
- ✓ Feature vectors properly normalized
- ✓ Cluster/class assignments consistent

#### Performance
- ✓ WASM execution <10s for 5000-event logs
- ✓ SIMD variant faster than regular algorithms
- ✓ No excessive memory usage

### Tolerance Levels

```typescript
const TOLERANCE = {
  fitness: 0.05,        // ±5% for deterministic algorithms
  precision: 0.05,      // ±5%
  edgeCount: 1,         // Allow 1 edge difference
  mlMetrics: 0.10,      // ±10% for stochastic ML
  timing: 0,            // Relative comparison only
  structuralEquiv: true // Exact structural match required
};
```

## Execution Timeline

### Phase 1: Test Infrastructure (COMPLETE ✓)
- [x] Test plan document (60+ pages)
- [x] Validation harness framework (TypeScript)
- [x] Test log generator (Python)
- [x] PM4py runner (Python)
- [x] This guide

**Deliverables:**
- `PM4PY_VALIDATION_TEST_PLAN.md` (detailed specifications)
- `PM4PY_ALGORITHM_VALIDATION.md` (report template)
- `pm4py_comparison_harness.ts` (main harness)
- `generate_test_logs.py` (log generation)
- `run_pm4py_validation.py` (PM4py runner)

### Phase 2: Test Log Generation (READY)
```bash
python3 validation/scripts/generate_test_logs.py
```

**Expected Output:**
- 3 XES files (50, 500, 5000 events)
- 3 JSON files (equivalent)
- Deterministic (seed=42)

### Phase 3: PM4py Validation (READY)
```bash
python3 validation/scripts/run_pm4py_validation.py \
  --log /tmp/wasm4pm_test_logs/log_500_events.xes \
  --output /tmp/pm4py_validation_results
```

**Expected Output:**
- `pm4py_log_500_events_results.json`
- Contains: DFG, Alpha++, Heuristic, Inductive, Genetic, Token Replay

### Phase 4: wasm4pm Validation (NEXT)
- [ ] Implement WASM loader
- [ ] Load test logs
- [ ] Execute wasm4pm algorithms
- [ ] Capture outputs + timing
- [ ] Compare with PM4py results

### Phase 5: Report Generation (NEXT)
- [ ] Aggregate all results
- [ ] Generate markdown report
- [ ] Generate HTML visualization
- [ ] Generate JSON machine-readable output

## Known Challenges

### 1. Stochastic Algorithms
**Challenge:** Genetic, PSO, ACO produce different results each run

**Solution:** Use seeded RNG for determinism
```rust
let mut rng = StdRng::seed_from_u64(42); // Deterministic
```

**Validation:** Run with 5 seeds [42, 123, 456, 789, 2024], compare means

### 2. Missing pm4py Equivalents
**Challenge:** Some wasm4pm algorithms don't have pm4py versions

**Solution:** Compare against logic specification or manual validation
- Hill Climbing: Verify fitness improvement over generations
- Simulated Annealing: Verify temperature decreases monotonically
- A*: Verify optimal solution property

### 3. WASM Performance
**Challenge:** WASM is slower than native Python

**Solution:** Use relative comparison (speedup/slowdown ratio)
- Expected: WASM ≈ 2-5x slower than pm4py
- Acceptable if structural equivalence confirmed

### 4. Large Log Timeout
**Challenge:** ILP may timeout on 5000-event logs

**Solution:** Test only on small/medium logs; document expected timeout

### 5. Output Format Differences
**Challenge:** WASM returns JSON strings, pm4py returns objects

**Solution:** Normalize all outputs to JSON before comparison

## Tolerance Matrix

### Deterministic Algorithms (discovery, conformance)

| Metric | Tolerance | Rationale |
|--------|-----------|-----------|
| Edge count | ±1 | Minor variance in edge aggregation |
| Activity count | 0 | Exact match required |
| Place count | ±2 | Structural variance allowed |
| Transition count | ±2 | Structural variance allowed |
| Fitness score | ±5% | Numerical precision variance |
| Precision score | ±5% | Numerical precision variance |

### Stochastic Algorithms (genetic, PSO, ACO)

| Metric | Tolerance | Rationale |
|--------|-----------|-----------|
| Mean fitness (5 seeds) | ±5% | Convergence variance |
| Std deviation | ≤25% | Stability check |
| Min fitness | -10% | Occasional poor runs allowed |
| Max fitness | +10% | Occasional good runs expected |

### ML Algorithms

| Metric | Tolerance | Rationale |
|--------|-----------|-----------|
| Accuracy | ±10% | Stochastic + feature variance |
| F1 score | ±10% | Class imbalance effects |
| Silhouette | ±10% | Initialization effects |
| RMSE | ±10% | Numerical variance |
| MAE | ±10% | Numerical variance |
| R² | ±10% | Feature scaling effects |

## Results Interpretation

### Green Zone ✓
- All metrics within tolerance
- Determinism confirmed
- Performance acceptable
- **Action:** Algorithm APPROVED

### Yellow Zone ⚠️
- Some metrics at tolerance boundary
- Minor determinism variance
- Performance degraded but acceptable
- **Action:** Document and continue; flag for investigation

### Red Zone ✗
- Metrics outside tolerance
- Non-deterministic behavior
- Timeout or crash
- **Action:** Bug investigation required; DO NOT APPROVE

## Debugging Guide

### DFG Edge Count Mismatch

**Symptom:** wasm4pm finds 15 edges, pm4py finds 16

**Investigation:**
1. Check edge aggregation logic (sum vs max)
2. Check infrequent edge filtering (thresholds)
3. Check self-loop handling
4. Run with `--debug` flag to capture edge list

**Common Causes:**
- Rounding differences in frequency calculations
- Different handling of self-loops
- Threshold rounding variance

### Fitness Score Mismatch

**Symptom:** wasm4pm fitness=0.85, pm4py fitness=0.82 (4% delta)

**Investigation:**
1. Check token calculation formulas
2. Verify initial/final marking equivalence
3. Run per-trace replay, identify diverging traces
4. Compare missing/consumed/remaining token counts

**Common Causes:**
- Floating-point precision variance
- Different handling of complete traces
- Initial marking representation differences

### Determinism Failure

**Symptom:** Same seed produces different output on second run

**Investigation:**
1. Check global state (caches, static variables)
2. Check RNG seeding (is it actually seeded?)
3. Check floating-point hashing (not stable across runs)
4. Check thread ordering (if parallel)

**Common Causes:**
- Cache pollution between runs
- Uninitialized RNG seed
- HashMap iteration order variance (use BTreeMap)

## Continuous Integration

### Pre-commit Hook

```bash
#!/bin/bash
# Run small test logs locally before commit
python3 validation/scripts/generate_test_logs.py --output /tmp/test_logs
python3 validation/scripts/run_pm4py_validation.py --log /tmp/test_logs/log_50_events.xes
```

### CI/CD Pipeline

```yaml
validation:
  stage: test
  script:
    - python3 validation/scripts/generate_test_logs.py
    - python3 validation/scripts/run_pm4py_validation.py --log log_500_events.xes
    - npm test -- validation
  artifacts:
    - validation/results/validation_report.html
    - validation/results/validation_results.json
  timeout: 1h
```

## References

- **PM4py:** https://pm4py.fit.fraunhofer.de/
- **wasm4pm:** `/Users/sac/wasm4pm/`
- **Registry:** `packages/kernel/src/registry.ts` (36 registered algorithms)
- **WASM API:** `WASM_API.md` (70+ exported functions)
- **Test Plan:** `docs/PM4PY_VALIDATION_TEST_PLAN.md` (60+ pages, all algorithm specs)

## Support

For questions or issues with the validation framework:
1. Check `PM4PY_VALIDATION_TEST_PLAN.md` for detailed specifications
2. Review `DEBUGGING_GUIDE.md` (generated after first validation run)
3. Run with `--debug` flag for detailed logging
4. Contact: validation-team@wasm4pm.dev

---

**Next Step:** Generate test logs
```bash
python3 validation/scripts/generate_test_logs.py
```

