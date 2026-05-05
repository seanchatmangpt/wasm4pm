# wasm4pm Integration Testing & Certification Plan

**Version:** v26.4.17  
**Status:** COMPREHENSIVE E2E TESTING & QUALITY CERTIFICATION ROADMAP  
**Last Updated:** 2026-05-05  
**Agent:** Agent 9 (Integration Testing & Certification Gates)

---

## Executive Summary

This document defines the comprehensive end-to-end testing and certification strategy for pictl's ML/AI/RL system. The goal is to establish:

1. **15+ end-to-end test scenarios** covering happy path, edge cases, and error conditions
2. **Mutation score ≥80%** for critical paths (discovery, conformance, RL)
3. **100% determinism validation** via seeded RNG (100 runs, 5+ seeds)
4. **Parity verification** for all 41 algorithms (explain() == plan())
5. **100% OTEL coverage** with proper span attribution and error status
6. **Performance baseline** with regression detection
7. **Error handling validation** for all code paths

---

## Critical Path Mapping

### Layer 1: Perception (Event Log Processing)

**Critical functions:**
- `EventLog::from_xes()` — Parse and validate event log
- `EventLog::to_json()` — Serialize to intermediate format
- `RlState::from_features()` — Extract 8-dimensional state vector
- `compute_event_rate()` — Normalize event timing to [0,1]

**Failure modes:**
- Invalid XES: malformed XML, missing timestamps, missing activities
- Empty logs: zero traces, zero events per trace
- Data quality: missing attributes, non-numeric fields

**Test scenarios:** E2E-01 to E2E-03

---

### Layer 2: Discovery (Algorithm Selection & Execution)

**Critical functions:**
- `Kernel::run(algorithm, log, params)` — Execute discovery algorithm
- `Algorithm::execute(config)` — Run algorithm with given hyperparameters
- `PlannerLike::plan(config)` → `ExecutionPlan` — Create execution DAG
- `explain(config)` → string explanation

**Algorithms (41 total):**
- Fast (tier 1): dfg, process_skeleton, simd_streaming_dfg
- Balanced (tier 2): alpha_plus_plus, heuristic_miner, inductive_miner
- Quality (tier 3): simulated_annealing, a_star, aco, pso, genetic_algorithm, ilp
- ML (6): ml_classify, ml_cluster, ml_forecast, ml_anomaly, ml_regress, ml_pca
- Analysis (20+): conformance, simulation, drift, social, temporal

**Parity constraint:** explain() output must exactly match plan() execution (bitwise).

**Test scenarios:** E2E-04 to E2E-06

---

### Layer 3: Prediction (6 Perspectives)

**Critical functions:**
- `PredictionDispatcher::execute(request)` — Run prediction task
- `NextActivityPredictor::fit_predict()` — Top-k activity prediction
- `RemainingTimePredictor::fit_predict()` — Weibull regression
- `DriftDetector::detect()` — EWMA concept drift
- `FeatureExtractor::extract()` — Prefix-based feature engineering
- `OutcomePredictor::predict()` — Anomaly boundary detection

**Perspectives:**
1. `next_activity` — Beam search, n-gram order 1-3
2. `remaining_time` — Hazard rate, exponential/Weibull
3. `outcome` — Binary classification (default/anomaly)
4. `drift` — Jaccard distance, EWMA smoothing
5. `features` — Prefix features + rework score
6. `resource` — Bandit-based resource prediction

**Invariants:**
- Probabilities sum to 1.0 (±0.01 tolerance for float rounding)
- Remaining time is non-negative and monotonically decreasing
- Drift scores bounded to [0,1]
- Feature vectors are normalized to [0,1]

**Test scenarios:** E2E-07 to E2E-09

---

### Layer 4: Reinforcement Learning (5 Agents)

**Critical functions:**
- `RlOrchestrator::select_action(state)` — LinUCB agent selection
- `QLearning::select_action(state)` — ε-greedy exploration
- `QLearning::update(s, a, r, s', done)` — Bellman update
- `compute_reward(old_h, new_h, alerts, ...)` — Reward calculation
- `RlState::from_features(feat, health, rework)` — State construction

**Agents (5 total):**
- QLearning (off-policy TD)
- SARSA (on-policy TD)
- DoubleQLearning (reduced overestimation)
- ExpectedSARSA (expected value update)
- REINFORCE (policy gradient)

**State space:** 8D (health, event_rate, activity_count, spc_alert, drift, rework, circuit, cycle) = 460,800 states

**Reward function:**
- Health improvement: +1.0
- Health stability: +0.2
- Health degradation: -1.0
- SPC alert penalty: -0.3 per alert (max -1.5)
- Guard pass + circuit allowed: +0.1
- Guard fail or circuit blocked: -0.5
- Terminal state (health=4): -2.0
- **Range:** [-3.5, +1.1]

**Critical bugs to test for:**
- FM-1: Same-state Bellman (next_state == state) — causes self-referential Q-table
- TS-1: String::len() instead of timestamp parsing — wrong duration computation
- SP-1: SPC one-shot vs historical — circuit breaker never transitions
- CB-1: Step counter never advances — Open→HalfOpen never fires

**Test scenarios:** E2E-10 to E2E-12

---

### Layer 5: Observability (OTEL)

**Critical functions:**
- `Instrumentation::createSpan(name, attrs)` — Create span with attributes
- `Instrumentation::endSpan()` — End span and record status
- `OtelCapture::captureSpan()` — Capture span for verification
- `redactSecrets()` — Remove sensitive data from spans

**Required span attributes:**
- `service.name`: "wpm" or package name
- `span.name`: operation name (e.g., "healing.diagnosis")
- `status`: "ok" or "error"
- `duration_ms`: execution time
- `operation_params`: key parameters (algorithm, log_size, etc.)

**Coverage target:** 100% of operations (596 functions total)

**Current status:** 0% (0/596 instrumented)

**Critical gaps:**
- config (37 functions)
- contracts (102 functions)
- engine (81 functions)
- kernel (37 functions)
- ml (19 functions)
- observability (48 functions)
- planner (27 functions)
- swarm (29 functions)
- testing (216 functions)

**Test scenarios:** E2E-13 to E2E-14

---

### Layer 6: CLI Integration

**Critical functions:**
- `main()` — Parse command-line args
- `runCommand(cmd, args)` — Execute command (run, predict, ml, etc.)
- `resolveConfig()` — 5-layer config resolution
- `formatOutput()` — Human vs JSON output formatting
- `exitWithCode()` — Return proper exit code

**Commands (20 total):**
- Core: run, compare, diff, watch
- Prediction: predict, drift-watch
- Analysis: ml, powl
- Quality: quality, conformance, validate
- Analysis+: simulate, temporal, social
- Autonomic: autoprocess, status, doctor, explain
- Utility: init, results

**Exit codes:**
- 0: SUCCESS
- 1: CONFIG_ERROR
- 2: SOURCE_ERROR
- 3: EXECUTION_ERROR
- 4: PARTIAL_FAILURE
- 5: SYSTEM_ERROR

**Config precedence (5-layer):**
1. CLI arguments (highest priority)
2. TOML config file (wasm4pm.toml)
3. JSON config file (wasm4pm.json)
4. Environment variables (WASM4PM_* prefix)
5. Defaults (lowest priority)

**Test scenarios:** E2E-15 onwards

---

## End-to-End Test Scenarios (15+)

### E2E-01: Basic Event Log Loading (Happy Path)

**Objective:** Verify event log parsing and validation works correctly.

**Inputs:**
- Sample XES file (100-1000 events)
- Valid attributes: concept:name, time:timestamp, org:resource

**Steps:**
1. Load XES file via CLI: `wpm run sample.xes --format json`
2. Verify EventLog structure: traces, events, activities
3. Verify attributes are parsed correctly
4. Verify timestamps are ISO-8601 and valid

**Expected outputs:**
- Exit code: 0 (SUCCESS)
- JSON: { status: "success", data: { event_count, trace_count, activities } }
- Timing: <1s for logs <10K events

**Oracle:** Event count matches XES, all attributes present

**Status:** ⏳ TODO — Create test file in playground/scenarios/

---

### E2E-02: Event Log with Missing Attributes (Edge Case)

**Objective:** Verify graceful handling of incomplete event logs.

**Inputs:**
- XES missing concept:name attribute
- XES with empty traces
- XES with single event

**Steps:**
1. Attempt load via CLI
2. Capture error message
3. Verify informative error is returned

**Expected outputs:**
- Exit code: 2 (SOURCE_ERROR) for missing required attributes
- Exit code: 0 (SUCCESS) for empty traces (accepted but skipped)
- JSON: { status: "error", code: "SOURCE_ERROR", message: "..." }

**Oracle:** Error codes match specification

**Status:** ⏳ TODO

---

### E2E-03: Event Log with Corrupted Data (Error Case)

**Objective:** Verify rejection of malformed event logs.

**Inputs:**
- Malformed XES (invalid XML)
- Negative timestamps
- Non-string activity names (numbers, null)

**Steps:**
1. Attempt load via CLI
2. Capture error and stack trace
3. Verify system doesn't crash or hang

**Expected outputs:**
- Exit code: 2 (SOURCE_ERROR)
- Error message: specific (XML parsing error, timestamp validation error, etc.)
- System stable (no threads hanging, no memory leaks)

**Oracle:** Exit code and error message are correct

**Status:** ⏳ TODO

---

### E2E-04: Discovery Algorithm Execution (Happy Path)

**Objective:** Verify discovery algorithm runs and produces valid output.

**Inputs:**
- BPI 2020 fixture (13K events, 262 traces)
- Algorithm: heuristic_miner
- Parameters: dependency_threshold=0.3

**Steps:**
1. Run via CLI: `wpm run BPI_2020.xes --algorithm heuristic_miner --format json`
2. Capture result JSON
3. Verify output structure
4. Validate DFG:
   - All edges have source and target
   - Edge frequencies are positive integers
   - Connectivity is valid (no isolated nodes)
5. Measure execution time

**Expected outputs:**
- Exit code: 0 (SUCCESS)
- DFG with ~30-50 nodes (sample expected from domain knowledge)
- Execution time: <5s (BPI 2020 is medium-complexity)
- OTEL span: kernel.run (algorithm, log_size, duration_ms)

**Oracle:** DFG structure is valid (no null edges, positive frequencies)

**Status:** ⏳ TODO

---

### E2E-05: Algorithm Parity (explain() vs plan())

**Objective:** Verify explain() output exactly matches plan() execution.

**Inputs:**
- Config: algorithm=dfg, profile=balanced
- Log: BPI 2020

**Steps:**
1. Call `explain(config)` → string explanation
2. Call `plan(config)` → ExecutionPlan
3. Compare:
   - Algorithm name must match
   - Parameters must match
   - Estimated quality must match

**Expected outputs:**
- explain() string contains algorithm name and parameters
- plan() ExecutionPlan.algorithm == config.algorithm
- plan() ExecutionPlan.params == config.algorithm.parameters

**Oracle:** String parsing of explain() output produces identical plan

**Status:** ⏳ TODO

---

### E2E-06: All 41 Algorithms Execute Without Crash

**Objective:** Verify every algorithm can be invoked and returns valid output.

**Inputs:**
- Sample log (1K events, 50 traces)
- Iterate over all 41 algorithm names

**Steps:**
1. For each algorithm:
   - Call `kernel.run(algorithm, log, {})`
   - Verify no exception is thrown
   - Verify output is non-null
   - Verify output structure matches algorithm family

**Expected outputs:**
- 41/41 algorithms return successfully
- Discovery algorithms return DFG/Petrinet/Tree
- ML algorithms return ml_result
- Conformance algorithms return fitness score

**Oracle:** All 41 algorithms execute without crashing

**Status:** ⏳ TODO

---

### E2E-07: Next-Activity Prediction (Happy Path)

**Objective:** Verify next-activity prediction returns valid probabilities.

**Inputs:**
- Log: 5 traces, A→B→C, A→C, A→B→D pattern
- Task: next_activity, ngramOrder=1
- Prefix: [A] (single activity)

**Steps:**
1. Run: `wpm predict next-activity -i log.xes --prefix A --format json`
2. Capture candidates (top-k activity predictions with probabilities)
3. Verify:
   - Probabilities sum to 1.0 (±0.01)
   - All probabilities in [0,1]
   - B is the most likely successor (appears 3x after A out of 4)

**Expected outputs:**
- Exit code: 0 (SUCCESS)
- candidates: [{ activity: "B", probability: 0.6 }, { activity: "C", probability: 0.3 }, ...]
- probability sum: 0.99-1.01

**Oracle:** Probabilities are correct (domain-derived from trace statistics)

**Status:** ⏳ TODO

---

### E2E-08: Remaining-Time Prediction (Happy Path)

**Objective:** Verify remaining-time prediction is non-negative and monotonic.

**Inputs:**
- Log with timestamps (e.g., timestamps in seconds: A@0, B@100, C@200, End@400)
- Task: remaining_time
- Prefixes: [A], [A,B], [A,B,C]

**Steps:**
1. Predict remaining time for each prefix
2. Verify:
   - All values are non-negative
   - Remaining time decreases as prefix lengthens
   - Prediction is in valid units (seconds or milliseconds)

**Expected outputs:**
- remaining_time([A]): ~300s
- remaining_time([A,B]): ~200s
- remaining_time([A,B,C]): ~200s (end in 200s after C)
- All values ≥ 0

**Oracle:** Monotonicity invariant (prefix_len increases → remaining_time decreases or stays same)

**Status:** ⏳ TODO

---

### E2E-09: Drift Detection (Concept Drift Over Time)

**Objective:** Verify drift detection identifies process changes.

**Inputs:**
- Log with two distinct phases:
  - Phase 1 (first 50%): A→B→C pattern
  - Phase 2 (second 50%): A→C pattern (skipped B)

**Steps:**
1. Run: `wpm predict drift -i log.xes --format json`
2. Capture drift_score for phase 1 vs phase 2
3. Verify phase 2 has higher drift score (change detected)
4. Measure EWMA smoothing window

**Expected outputs:**
- drift_score: [0.1, 0.05, ..., 0.5, 0.6, 0.7] (increases in phase 2)
- drift_detected: true (in second half)

**Oracle:** Jaccard distance increases when process changes

**Status:** ⏳ TODO

---

### E2E-10: RL Agent Bellman Update (Correctness)

**Objective:** Verify Q-learning Bellman update computes correctly.

**Inputs:**
- State S1: health=2 (degraded), other features zeroed
- State S2: health=0 (normal), other features zeroed
- Action: Continue
- Reward: 1.0 (health improved)
- done: false

**Steps:**
1. Create QLearning agent with learning_rate=0.1, discount=0.99, exploration=0.0
2. Initialize Q(S2, *) with high values (pre-populate)
3. Get Q(S1, Continue) before update: expect 0.0
4. Update: agent.update(S1, Continue, 1.0, S2, false)
5. Get Q(S1, Continue) after update: expect > 0.0

**Expected outputs:**
- Before: Q(S1, Continue) = 0.0
- After: Q(S1, Continue) ≈ alpha * (1.0 + gamma * max_Q(S2)) ≈ 0.1 * (1.0 + 0.99 * high_value)

**Oracle:** Bellman equation holds (target = r + gamma * max_Q(s'))

**Test for bug FM-1:** If mutation uses state instead of next_state, Q(S1, Continue) wouldn't increase

**Status:** ✅ EXISTING: wasm4pm/tests/rl_bellman_oracle_tests.rs

---

### E2E-11: RL Convergence Over 50 Cycles

**Objective:** Verify RL agent improves policy over multiple updates.

**Inputs:**
- Orchestrator with seeded RNG (seed=42)
- 50 simulation cycles
- Increasing health signal (reward becomes more positive)

**Steps:**
1. Run 50 cycles, capture reward per cycle
2. Compute mean reward: first 10 cycles vs last 10 cycles
3. Verify last 10 > first 10 (policy improvement)
4. Verify Q-values increase monotonically for visited states

**Expected outputs:**
- mean_reward[0:10]: ~-0.5
- mean_reward[40:50]: ~+0.5
- Trend: monotonically increasing

**Oracle:** Policy improves over time (statistical assertion with bounds)

**Status:** ✅ EXISTING: wasm4pm/tests/rl_convergence_tests.rs

---

### E2E-12: Circuit Breaker State Transitions (FM-1 Bug Test)

**Objective:** Verify circuit breaker transitions states correctly.

**Inputs:**
- CircuitBreakerConfig: failure_threshold=3, success_threshold=1, timeout=100ms

**Steps:**
1. Start in Closed state
2. Trigger 3 failures → assert state = Open
3. Advance clock by 100ms → assert state = HalfOpen
4. Trigger 1 success → assert state = Closed

**Expected outputs:**
- Closed → Open after 3 failures (fail_count=3)
- Open → HalfOpen after timeout (step counter > threshold)
- HalfOpen → Closed after 1 success

**Test for bug CB-1:** If advance_clock() is never called, Open→HalfOpen never happens

**Status:** ✅ EXISTING: wasm4pm/tests/circuit_breaker_state_machine_tests.rs

---

### E2E-13: OTEL Span Emission (All Operations)

**Objective:** Verify all 596 functions emit OTEL spans.

**Inputs:**
- Run full CLI command: `wpm run sample.xes --algorithm dfg --format json`
- Capture OTEL spans via OtelCapture harness

**Steps:**
1. Set OTEL exporter to in-memory capture
2. Run command
3. Verify spans emitted:
   - kernel.run (algorithm, log_size, duration_ms)
   - discovery.dfg (activity_count, edge_count)
   - output.format (format, destination)
4. Verify status field is present ("ok" or "error")
5. Verify attributes match expected types

**Expected outputs:**
- ≥5 spans emitted (one per major operation)
- All spans have status field
- All attributes are populated (no null/empty)

**Oracle:** OTEL span conformance (presence + status + attributes)

**Status:** ⏳ TODO — Create test in packages/testing/__tests__/

---

### E2E-14: Config Resolution (5-Layer Precedence)

**Objective:** Verify config resolution follows exact precedence order.

**Inputs:**
- wasm4pm.toml: algorithm=alpha_plus_plus
- wasm4pm.json: algorithm=heuristic_miner
- ENV: WASM4PM_ALGORITHM=dfg
- CLI: --algorithm inductive_miner

**Steps:**
1. Resolve config with all 4 sources present
2. Verify final config.algorithm == "inductive_miner" (CLI wins)
3. Repeat without CLI arg:
   - Verify config.algorithm == "dfg" (ENV wins)
4. Repeat without ENV:
   - Verify config.algorithm == "heuristic_miner" (JSON wins)
5. Repeat without JSON:
   - Verify config.algorithm == "alpha_plus_plus" (TOML wins)

**Expected outputs:**
- CLI > ENV > JSON > TOML > defaults (exact precedence)

**Oracle:** Precedence order is enforced

**Status:** ⏳ TODO

---

### E2E-15: CLI Exit Codes for All Commands

**Objective:** Verify each command returns correct exit code.

**Inputs:**
- Valid log: BPI 2020
- Invalid log: corrupted XES
- Configs: valid and invalid

**Steps:**
1. Run `wpm run valid.xes` → EXIT_CODE=0
2. Run `wpm run invalid.xes` → EXIT_CODE=2 (SOURCE_ERROR)
3. Run `wpm run valid.xes --algorithm unknown` → EXIT_CODE=1 (CONFIG_ERROR)
4. Run `wpm predict next-activity -i invalid.xes` → EXIT_CODE=2
5. Run `wpm ml classify -i log.xes --features bad_key` → EXIT_CODE=1

**Expected outputs:**
- All 20 commands respect exit code contract
- 0 for success, 1 for config error, 2 for source error, 3 for execution error

**Oracle:** Exit codes match specification

**Status:** ⏳ TODO

---

## Mutation Testing Strategy

### Scope: Critical Paths Only

We will focus mutation testing on **critical paths** to keep execution time <30 minutes:

1. **Discovery algorithms** (15 algorithms, top 5 most-used)
2. **Conformance checking** (token replay, alignments)
3. **RL orchestrator** (Bellman update, agent selection)
4. **Config resolution** (5-layer precedence)
5. **OTEL instrumentation** (span creation, status setting)

### Mutation Categories

| Category | Target | Mutations | Test Coverage | Estimated Time |
|----------|--------|-----------|----------------|-----------------|
| **Bellman** | RL update | same-state, wrong discount, wrong learning rate | rl_bellman_oracle_tests.rs | 2 min |
| **SPC Rules** | Western Electric | one-shot, missing history, wrong threshold | spc_exact_position_tests.rs | 3 min |
| **Circuit Breaker** | State machine | step counter, timeout, threshold | circuit_breaker_state_machine_tests.rs | 2 min |
| **DFG** | Discovery | edge counting, frequency, cycles | metamorphic_discovery_tests.rs | 3 min |
| **Config** | Resolution | layer order, precedence, override | config_sensitivity_tests.rs | 2 min |
| **Conformance** | Token replay | token counting, fitness formula | comprehensive_parity_tests.rs | 3 min |
| **OTEL** | Instrumentation | span creation, attributes, status | (new test) | 2 min |

**Total estimated time:** ~17 minutes

### Mutation Tools

We will simulate mutations by:
1. **Code inspection:** Identify high-risk code patterns
2. **Correctness tests:** Write tests that would fail if mutation existed
3. **Bellman verification:** Test that would catch FM-1 (same-state) bug
4. **SPC verification:** Test that would catch TS-1 (string::len) bug
5. **Circuit breaker verification:** Test that would catch CB-1 (step counter) bug

**Tools to integrate later:**
- `cargo-mutants` (Rust mutation testing, ~30 min per run)
- `stryker-js` (TypeScript mutation testing, ~15 min per run)

---

## Determinism Validation Strategy

### Test Matrix

Run every algorithm with **5 different seeds** and **multiple runs per seed**:

| Algorithm | Runs Per Seed | Seeds | Total Runs | Expected Time |
|-----------|---------------|-------|-----------|----------------|
| dfg | 3 | [1,2,3,4,5] | 15 | 0.5 min |
| heuristic_miner | 2 | [1,2,3,4,5] | 10 | 2 min |
| genetic_algorithm | 1 | [1,2,3,4,5] | 5 | 3 min |
| ml_classify | 3 | [1,2,3,4,5] | 15 | 1 min |
| RL agents (5) | 2 | [1,2,3,4,5] | 10 | 2 min |

**Total:** ~9 minutes

### Receipt Hash Comparison

For each run, compute:
- `config_hash = BLAKE3(config_json)`
- `input_hash = BLAKE3(log_xes)`
- `output_hash = BLAKE3(result_json)`
- `run_hash = BLAKE3(config_hash || input_hash || output_hash)`

**Invariants:**
- Same input + config → same output_hash (100%)
- Same seed + config → same run_hash (100%)
- Different seeds → same output_hash (determinism is seed-independent for discovery)

---

## Parity Verification Strategy

### All 41 Algorithms

For each algorithm:
1. Call `explain(config)` → string explanation
2. Parse explanation to extract: algorithm_name, parameters, profile
3. Call `plan(config)` → ExecutionPlan
4. Assert:
   - `explain_algorithm == plan_algorithm`
   - `explain_params == plan_params`
   - `explain_profile == plan_profile`

**Test coverage:**
- ✅ EXISTING: wasm4pm/tests/comprehensive_parity_tests.rs
- ✅ EXISTING: wasm4pm/tests/full_parity_tests.rs
- ⏳ TODO: Add parity tests for all 6 prediction perspectives

### All 6 Prediction Perspectives

For each perspective (next_activity, remaining_time, outcome, drift, features, resource):
1. Call `dispatcher.execute(request)` → PredictionResult
2. Verify output shape matches perspective-specific schema
3. Verify invariants hold (probabilities sum, non-negative, bounded)

**Test coverage:**
- ✅ EXISTING: packages/kernel/__tests__/prediction/integration.test.ts
- ⏳ TODO: Add negative test cases (missing data, degenerate inputs)

---

## Performance Baseline & Regression Detection

### Baseline Metrics (5th, 50th, 95th Percentile)

Run each algorithm on BPI 2020 (13K events) and capture:
- Execution time (ms)
- Memory peak (MB)
- WASM module load time (ms)
- Output size (KB)

| Algorithm | p5 (ms) | p50 (ms) | p95 (ms) | Regression Threshold |
|-----------|---------|---------|---------|----------------------|
| dfg | 2 | 5 | 8 | >10ms (2x p50) |
| heuristic_miner | 30 | 50 | 80 | >100ms (2x p50) |
| genetic_algorithm | 400 | 450 | 550 | >900ms (2x p50) |
| ml_classify | 50 | 100 | 150 | >200ms (2x p50) |

**CI/CD Gate:** Fail if any algorithm exceeds regression threshold on 3 consecutive runs.

---

## Error Handling Validation

### Recovery Paths

For each critical operation, test:
1. **Input validation** (reject bad data early)
2. **Graceful degradation** (fail with informative error)
3. **Recovery** (can operation be retried?)
4. **Idempotency** (is result the same after retry?)

### Error Code Coverage

Verify all error codes are used and tested:
- **2xx config:** CONFIG_ERROR (1)
- **3xx source:** SOURCE_ERROR (2)
- **4xx algorithm:** EXECUTION_ERROR (3)
- **5xx system:** SYSTEM_ERROR (5)

**Test matrix:**

| Error Type | Example | Exit Code | Recovery | Test |
|-----------|---------|-----------|----------|------|
| Missing config file | `wpm run -c missing.toml` | 1 | No (user action) | ⏳ TODO |
| Invalid XES | corrupted XML | 2 | No (user provides new log) | ⏳ TODO |
| Bad algorithm | `--algorithm unknown` | 1 | Yes (fallback to dfg) | ⏳ TODO |
| WASM load fail | Module corrupted | 5 | Yes (retry bootstrap) | ✅ EXISTING |
| OOM | Log too large | 5 | No (need more memory) | ⏳ TODO |

---

## OTEL Completeness Matrix

### Span Coverage Goal: 100% (596 → 596 functions)

Priority order (highest impact first):

**Tier 1 (10 functions, 100% critical):**
- kernel.run (discovery dispatch)
- kernel.stream (streaming dispatch)
- prediction.execute (prediction dispatcher)
- rl.select_action (agent selection)
- rl.update (Bellman update)
- config.resolve (config resolution)
- engine.bootstrap (WASM loader)
- engine.plan (execution planning)
- cli.run (command execution)
- output.format (output formatting)

**Tier 2 (30 functions, high value):**
- All discovery algorithms (15)
- All ML algorithms (6)
- Conformance checking (4)
- SPC analysis (3)
- Circuit breaker (2)

**Tier 3 (everything else):**
- Utility functions, helpers, internal implementations

**Current status:** 0% (0/596)

**Target:** 80% (480/596) by end of Q2 2026

---

## Test Execution Plan

### Phase 1: Happy Path Tests (Week 1-2)

Create 15 E2E test scenarios covering:
- Event log loading
- Discovery execution (all 41 algorithms)
- Prediction (all 6 perspectives)
- RL agent selection and update
- CLI integration
- Config resolution

**Expected output:** 15 passing tests, baseline metrics recorded

**Time estimate:** 40 hours

### Phase 2: Mutation Testing (Week 3)

Implement mutation adequacy validation for critical paths:
- Bellman correctness
- SPC rules
- Circuit breaker state machine
- DFG edge counting
- Config resolution
- OTEL span creation

**Expected output:** Mutation score ≥80% for critical paths

**Time estimate:** 20 hours

### Phase 3: Determinism & Parity (Week 4)

Validate all 41 algorithms are deterministic and parity-correct:
- Run each algorithm with 5 seeds
- Compare receipt hashes
- Verify explain() == plan()

**Expected output:** Determinism matrix (100% pass), Parity matrix (100% pass)

**Time estimate:** 15 hours

### Phase 4: OTEL Instrumentation (Week 5-6)

Add OTEL spans to all 596 functions:
- Tier 1 (10): 100% coverage
- Tier 2 (30): 100% coverage
- Tier 3 (556): 60% coverage (selected high-value functions)

**Expected output:** 480+ functions instrumented, test coverage ≥80%

**Time estimate:** 50 hours

### Phase 5: Certification Report (Week 7)

Generate comprehensive certification report:
- Mutation score matrix (per component)
- Determinism validation results
- Parity verification results
- Performance baseline with regression detection
- OTEL span completeness matrix
- Error handling validation matrix
- Risk assessment and recommendations

**Expected output:** docs/certification/REPORT_v26.4.17.md

**Time estimate:** 10 hours

---

## Success Criteria

### ✅ Acceptance Criteria

- [ ] 15+ E2E test scenarios created and passing
- [ ] Mutation score ≥80% for critical paths (Bellman, SPC, circuit breaker, DFG, config, conformance, OTEL)
- [ ] Determinism validated: 100 runs with 5+ seeds, same output_hash
- [ ] Parity verified: explain() == plan() for all 41 algorithms + 6 perspectives
- [ ] OTEL coverage: 100% of critical operations (Tier 1), ≥80% of high-value operations
- [ ] Performance baseline established: all algorithms within 2x p50 regression threshold
- [ ] Error handling: all error codes tested, recovery paths verified
- [ ] CI/CD gates defined and passing
- [ ] Certification report generated with risk assessment

### ⏳ Deliverables

| Deliverable | Location | Status |
|-------------|----------|--------|
| E2E test scenarios | playground/scenarios/e2e-*.test.ts + wasm4pm/tests/e2e_*.rs | ⏳ TODO |
| Mutation tests | wasm4pm/tests/mutation_adequacy_*.rs | ⏳ TODO (consolidate existing) |
| Determinism validation | packages/testing/__tests__/determinism.test.ts | ⏳ TODO |
| Parity verification | wasm4pm/tests/comprehensive_parity_tests.rs | ✅ EXISTING |
| OTEL instrumentation | packages/*/src/*.ts (all packages) | ⏳ TODO (40+ functions) |
| Performance baseline | .wasm4pm/benchmarks/baseline.json | ⏳ TODO |
| Certification report | docs/certification/REPORT_v26.4.17.md | ⏳ TODO |

---

## Critical Path Dependencies

### Must Complete Before Release

1. **E2E Happy Path (E2E-01 to E2E-06):** All discovery and basic CLI paths must work
2. **Bellman Correctness (E2E-10):** RL agent must pass Bellman oracle test
3. **OTEL Tier 1 (10 functions):** All critical operations must emit spans
4. **Exit Code Contract:** All commands must return correct exit codes
5. **Config Resolution (E2E-14):** 5-layer precedence must be verified

### Nice-to-Have Before Release

- Mutation score ≥80% for critical paths
- Determinism validation (100 runs)
- OTEL Tier 2 (30 functions)
- Performance baseline with regression detection

---

## Risk Assessment

### High Risk (must address)

- **FM-1: Same-state Bellman bug** — Detected by E2E-10, already tested via rl_bellman_oracle_tests.rs
- **TS-1: String::len() timestamp bug** — Detected by E2E-09, already tested via spc_exact_position_tests.rs
- **CB-1: Circuit breaker step counter** — Detected by E2E-12, already tested via circuit_breaker_state_machine_tests.rs

### Medium Risk (should address)

- **OTEL coverage at 0%** — 596 functions with no instrumentation. Priority: Tier 1 (10 functions) before release.
- **Performance regression undetected** — No baseline metrics. Priority: Establish baseline for top 10 algorithms.

### Low Risk (can defer)

- **Mutation score <80%** — Existing tests are good (674 unit tests), just need mutation-specific harness.
- **Determinism unvalidated** — Algorithms appear deterministic based on existing tests, just need formal validation.

---

## References

- **Van der Aalst Constitution:** See .claude/rules/chicago-tdd.md
- **Critical Constraints:** See .claude/rules/critical-constraints.md
- **Verification Protocol:** See .claude/rules/verification.md
- **ML/RL Testing:** See .claude/rules/ml-rl-testing.md
- **Existing test suite:** 49 Rust test files (674 tests), 9 TypeScript test packages
- **Certification gates:** packages/testing/src/certification.ts (7 placeholder gates)

---

## Next Steps

1. **Create E2E test scenarios** (E2E-01 to E2E-15) in playground/scenarios/ and wasm4pm/tests/
2. **Consolidate mutation tests** into mutation_adequacy_tests.rs
3. **Add OTEL instrumentation** for Tier 1 (10 critical functions)
4. **Establish performance baseline** for top 10 algorithms
5. **Generate certification report** with all metrics

**Estimated total effort:** 135 hours (distributed over 7 weeks, Phase 1-5)

---

**Document Version:** 1.0  
**Agent:** Agent 9 (Integration Testing & Certification Gates)  
**Date:** 2026-05-05  
**Status:** PLANNING PHASE — Ready for implementation
