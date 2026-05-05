# E2E Correctness Tests: ML, RL, Auto

## Overview

This document catalogs the end-to-end tests that validate ML, RL, and AutoProcess implementations actually work — not just that they exit 0, but that they produce correct, meaningful results for the process mining domain.

**Total:** 4 new test files, **50+ tests**, covering:
- ✅ `wpm autoprocess` command (TypeScript CLI)
- ✅ ML task correctness (classify, cluster, forecast, anomaly, regress)
- ✅ RL learning (Bellman correctness, reward monotonicity, cumulative learning)
- ✅ BPI 2020 real-scale validation (20-32 MB datasets)

---

## TypeScript Tests (Playground Scenarios)

### Scenario 20: `wpm autoprocess` Command

**File:** `playground/scenarios/20-autoprocess-command.ts`  
**Tests:** 25 + 5 real-scale = **30 tests**

**Purpose:** Validate the full Perception → Decision → Protection → Optimization autonomic control loop via CLI.

**Key assertions:**
- Error handling: missing input, nonexistent files
- Perception: event_count, trace_count, unique_activities, health_state all present and valid
- Decision: guard_result (boolean), pattern_result (string), pattern_ticks (≥0)
- Protection: circuit_state ∈ {Closed, Open, HalfOpen}, spc_results is an object, special_causes is an array
- Optimization: rl_action is non-empty string
- Timing: total_ns is a positive integer
- Determinism: two runs produce identical JSON structure and key metrics
- Real-scale: BPI 2020 (20 MB) processes without timeout, produces event_count ≥ 1000

**JTBD:** "I want to check if my process is healthy right now."

**Run:**
```bash
cd /Users/sac/chatmangpt/wasm4pm/playground
pnpm test scenarios/20-autoprocess-command.ts
```

---

### Scenario 21: ML Task Correctness

**File:** `playground/scenarios/21-ml-correctness.ts`  
**Tests:** **20 tests**

**Purpose:** Validate that ML algorithms produce meaningful, correct results — not just valid JSON.

**Tests per task:**

| Task | Assertions |
|------|-----------|
| **classify** | 3 tests: produces class labels, assigns every trace, deterministic with same k |
| **cluster** | 4 tests: produces assignments, has ≥1 cluster, respects k parameter, deterministic with same k |
| **forecast** | 2 tests: produces trend object, values are finite (no NaN/Inf) |
| **anomaly** | 2 tests: produces peakIndices array, all indices valid (<signal length) |
| **regress** | 3 tests: produces predictions for all traces with actual/predicted, values non-negative, error is reasonable |
| **Robustness** | 1 test: all 5 tasks handle running-example without crashing |

**Oracle types:**
- Rank 2: Domain contract (clustering should have k clusters, regression should predict remaining time)
- Rank 3: Metamorphic (error should not be massive relative to actual values)

**Run:**
```bash
cd /Users/sac/chatmangpt/wasm4pm/playground
pnpm test scenarios/21-ml-correctness.ts
```

---

## Rust Tests (WASM/RL Level)

### Integration: JTBD BPI 2020 Real-Scale Tests

**File:** `wasm4pm/tests/jtbd_bpi2020_tests.rs`  
**Tests:** **5 tests** (all `#[ignore]` — run with `--include-ignored`)

**Purpose:** Verify RL/Auto pipeline handles real government process data (20-32 MB) without panicking, NaN, or exceeding time budgets.

**Tests:**

| Test | JTBD | Data | Oracle |
|------|------|------|--------|
| `jtbd_travel_permits_log_is_healthy_scale` | "I want to know my travel permits process is healthy" | BPI 2020 Travel (20 MB) | health_state ≤ 2 (Rank-2) |
| `jtbd_rl_orchestrator_handles_bpi_scale_features` | "RL system should handle large-scale processes" | BPI 2020 Travel (20 MB) | 20 cycles, all finite rewards (Rank-2) |
| `jtbd_domestic_vs_international_health_comparison` | "Compare health across process variants" | Domestic (20 MB) + International (28 MB) | Both valid health states (Rank-3) |
| `jtbd_reward_computation_on_real_features` | "Reward should reflect process quality" | BPI 2020 Travel | reward(improve) > reward(stable) > reward(degrade) (Rank-1) |
| `jtbd_linucb_agent_selection_on_real_features` | "LinUCB selects best agent automatically" | BPI 2020 Travel | Agent ∈ [0..4], no NaN over 20 cycles (Rank-2) |

**Run:**
```bash
cd /Users/sac/chatmangpt/wasm4pm/wasm4pm
cargo test --test jtbd_bpi2020_tests -- --include-ignored
```

---

### Unit: RL Correctness Validation

**File:** `wasm4pm/tests/rl_correctness_validation.rs`  
**Tests:** **9 tests**

**Purpose:** Validate that the RL orchestrator correctly implements the Bellman equation and reward mechanism.

**Test groups:**

| Group | Tests | Key Assertions |
|-------|-------|----------------|
| **Reward Function Monotonicity** | 1 test | health_improve > stability > degradation |
| **Reward Function Bounds** | 1 test | All reward values finite, in [-50, 10] |
| **SPC Penalty** | 1 test | More SPC alerts → lower reward (monotone) |
| **RL Learning** | 3 tests | Monotone improvement yields positive cumulative reward, degradation yields lower cumulative than stability, all rewards finite |
| **Bellman Implementation** | 1 test | Default RL agent runs 50 cycles without NaN/Inf |
| **LinUCB Selection** | 1 test | Agent selection works in different feature contexts |
| **RlState Quantization** | 1 test | Edge cases (0.0, 1.0, mixed) handled safely, quantization is sound |

**Oracle types:**
- Rank 1: Mathematical theorems (reward monotonicity, Bellman equation)
- Rank 2: Domain contracts (health improvement drives positive reward)
- Rank 3: Metamorphic relations (context → agent mapping)

**Run:**
```bash
cd /Users/sac/chatmangpt/wasm4pm/wasm4pm
cargo test --test rl_correctness_validation
```

---

## Test Data

### XES Fixtures Used

| File | Size | Tests | Purpose |
|------|------|-------|---------|
| `wasm4pm/tests/fixtures/running-example.xes` | 16 KB | Scenarios 20-21 | Fast, well-formed, deterministic |
| `wasm4pm/tests/fixtures/BPI_2020_Travel_Permits_Actual.xes` | 20 MB | Scenario 20 + JTBD tests | Real government data, 1000+ cases |
| `wasm4pm/tests/fixtures/BPI_2020_DomesticDeclarations.xes` | 20 MB | JTBD comparison test | Real expense data |
| `wasm4pm/tests/fixtures/BPI_2020_InternationalDeclarations.xes` | 28 MB | JTBD comparison test | Real expense data (larger variant) |

---

## Implementation Approach

### TypeScript Scenarios (20-21)

Pattern: Follow scenario 19-ml-command.ts exactly
- Real WASM (not mocked)
- Real XES files
- CLI invocation via `wpm()` helper
- JSON + human format validation
- Determinism assertions

**Oracle hierarchy:**
- Rank 2: Task-specific domain contracts (clustering should group similar traces, regression error should be < 2x baseline)
- Rank 3: Metamorphic relations (determinism, flag variations)

### Rust JTBD Tests (jtbd_bpi2020_tests.rs)

Pattern: Follow integration_autonomic_complete.rs exactly
- String-matching XES parser (trace count, event count, activities)
- Feature vector normalization
- RlOrchestrator.run_cycle() calls
- Telemetry assertions

**Oracle hierarchy:**
- Rank 1: Mathematical (reward monotonicity from Bellman equation)
- Rank 2: Domain contracts (BPI 2020 is a well-formed government process)
- Rank 3: Metamorphic (larger log ≠ healthier log)

### Rust Unit Tests (rl_correctness_validation.rs)

Pattern: Unit-level correctness of reward computation and RL dynamics
- Deterministic feature vectors (all [0.5] or all [0.0], etc.)
- SPC penalty verification (more alerts → lower reward)
- Learning trajectory validation (50 cycles, positive cumulative reward on improvement)
- Edge case handling (NaN, Infinity, boundary values)

---

## Verification Checklist

Before running e2e tests:

- [ ] WASM compiled: `cargo make build` from `wasm4pm/`
- [ ] TypeScript packages built: `pnpm build` from monorepo root
- [ ] wpm CLI built: `npm run build` from `apps/wasm4pm/`
- [ ] All test files exist (4 files, 50+ tests)

Run all tests:

```bash
# TypeScript: Scenarios 20-21
cd /Users/sac/chatmangpt/wasm4pm/playground
pnpm test scenarios/20-autoprocess-command.ts scenarios/21-ml-correctness.ts

# Rust: RL correctness (quick, ~5s)
cd /Users/sac/chatmangpt/wasm4pm/wasm4pm
cargo test --test rl_correctness_validation

# Rust: BPI 2020 real-scale (slow, ~2min per test, requires --include-ignored)
cargo test --test jtbd_bpi2020_tests -- --include-ignored
```

---

## Test Outcomes

### Expected Results

| Suite | Tests | Expected Pass | Oracle Type |
|-------|-------|---------------|------------|
| Scenario 20 (AutoProcess) | 30 | ✅ 30 | Rank 2-3 |
| Scenario 21 (ML Correctness) | 20 | ✅ 20 | Rank 2-3 |
| JTBD BPI 2020 | 5 | ✅ 5 (if BPI files exist) | Rank 1-3 |
| RL Correctness | 9 | ✅ 9 | Rank 1-3 |
| **Total** | **54+** | **✅ ~54** | — |

### Known Limitations

1. **PCA task** — Skipped in Scenario 20 (running-example.xes has insufficient features). Known limitation documented in scenario 19.
2. **BPI 2020 tests** — Require `#[ignore]` flag + `--include-ignored` CLI arg because files are 20-32 MB. Not run in CI by default.
3. **RL agent switching** — Tests use default QLearning agent. All 5 agents (QLearning, SARSA, DoubleQLearning, ExpectedSARSA, REINFORCE) tested at Rust level in integration_autonomic_complete.rs.

---

## Related Tests (Existing)

- **Scenario 19** (`playground/scenarios/19-ml-command.ts`) — ML task validation (error cases, JSON shape)
- **integration_autonomic_complete.rs** — Full pipeline with 10 autonomic cycles, all 5 RL agents
- **autonomic_loop_tests.rs** — Persistent state, telemetry, reward computation
- **rl_orchestrator_tests.rs** — Agent switching, action selection, LinUCB telemetry

---

## References

- Van der Aalst, W. M. P. (2016). *Process Mining: Data Science in Action*. Ch. 2: Soundness
- Chicago School TDD: Behavior verification, not mocking
- Oracle Taxonomy: Rank 1 (math) > Rank 2 (domain) > Rank 3 (metamorphic) > Rank 4 (regression)
