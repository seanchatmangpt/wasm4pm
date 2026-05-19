# AGENT9-001: Implement E2E Test Scenarios

**Status:** 🔴 BLOCKER  
**Priority:** P0 — Critical  
**Effort:** 60 hours  
**Complexity:** High  
**Type:** Test Implementation  

## Summary

Agent 9 (Integration Testing) created a comprehensive 7-week plan with 15+ E2E scenarios but implementation is 0%. All scenarios are **designs only**, not executable code. Critical bugs (FM-1, TS-1, CB-1) are not formalized as test cases.

## Problem Statement

Current state:
- ✅ Planning documents complete (INTEGRATION_TESTING_PLAN.md, etc.)
- ✅ 7 critical paths identified
- ✅ 15 E2E scenario designs created
- ❌ 0% implementation (no test code written)
- ❌ Critical bugs not formalized as test cases
- ❌ No E2E testing framework wired up

Impact:
- ❌ FM-1 bug (Bellman self-reference) not guaranteed to be caught
- ❌ TS-1 bug (string::len timestamp) could slip into release
- ❌ CB-1 bug (circuit breaker step counter) not formalized
- ❌ No proof that critical paths work end-to-end

## 15 E2E Scenarios to Implement

### Discovery Path (3 scenarios)
1. **E2E-01:** DFG discovery → all 15 discovery algorithms work
2. **E2E-02:** Petrinet discovery → all 15 Petrinet variants work
3. **E2E-03:** Edge case discovery → empty logs, single event, degenerate cases

### Prediction Path (3 scenarios)
4. **E2E-04:** Next-activity prediction → all beam widths, n-grams
5. **E2E-05:** Remaining-time prediction → accuracy on real logs
6. **E2E-06:** Drift detection → abrupt/gradual/seasonal scenarios

### RL Path (2 scenarios)
7. **E2E-07:** Agent convergence → all 5 agents improve over 100 cycles
8. **E2E-08:** LinUCB selection → correct agent chosen >70% of time

### Quality Path (2 scenarios)
9. **E2E-09:** Conformance checking → token replay fitness > 0.85
10. **E2E-10:** Bellman correctness → RL updates improve Q-values

### Config Path (2 scenarios)
11. **E2E-11:** 5-layer resolution → CLI > TOML > JSON > ENV > defaults
12. **E2E-12:** Profile validation → algorithm check against profile constraints

### ML Path (2 scenarios)
13. **E2E-13:** ML classification → accuracy on real features
14. **E2E-14:** ML clustering → silhouette score > 0.5

### CLI Path (1 scenario)
15. **E2E-15:** Exit code contract → correct codes for all error types

## Acceptance Criteria

### 1. E2E Test Structure
```rust
// wasm4pm/tests/e2e_discovery.rs
#[tokio::test]
async fn e2e_01_dfg_discovery() {
  // 1. Load real event log (BPI2020)
  // 2. Run DFG discovery
  // 3. Validate DFG structure (SHACL)
  // 4. Assert nodes > 0 && edges > 0
  // 5. Check OTEL spans emitted
  assert!(result.nodes.len() > 0);
  assert!(result.edges.len() > 0);
}

#[tokio::test]
async fn e2e_02_petrinet_discovery() {
  // Similar for all Petrinet variants
}
```

### 2. Critical Bug Scenarios
```rust
// wasm4pm/tests/e2e_critical_bugs.rs

#[tokio::test]
async fn e2e_10_bellman_correctness() {
  // FM-1 bug: next_state == state makes Q-table self-referential
  // Test: After action, verify Q-value changes
  let state = State { health: 2, ..Default::default() };
  let q_before = agent.q_table[&state][&action];
  agent.update(state, action, reward, next_state);
  let q_after = agent.q_table[&state][&action];
  assert_ne!(q_before, q_after, "Q-table not updating (FM-1 bug)");
}

#[tokio::test]
async fn e2e_critical_spc_position() {
  // TS-1 bug: String::len() used instead of timestamp parsing
  // Test: Verify SPC detects drift at correct position
  let events = vec![...];  // Known drift at event 50
  let result = detect_drift(&events);
  assert_eq!(result.drift_position, 50);
}

#[tokio::test]
async fn e2e_circuit_breaker_timeout() {
  // CB-1 bug: Step counter not advanced, timeout never fires
  // Test: Verify circuit breaker transitions to HalfOpen after timeout
  let mut breaker = CircuitBreaker::new();
  for _ in 0..3 { breaker.record_failure(); }  // Open state
  assert_eq!(breaker.state(), State::Open);
  breaker.advance_clock(31_000);  // 30s timeout + 1s
  assert_eq!(breaker.state(), State::HalfOpen);
}
```

### 3. Exit Code Validation
```rust
// wasm4pm/tests/e2e_cli_exit_codes.rs
#[tokio::test]
async fn e2e_15_exit_code_contract() {
  // File not found → exit code 2
  let exit = run_command("wpm run /nonexistent.xes");
  assert_eq!(exit, 2);  // SOURCE_ERROR
  
  // Invalid config → exit code 1
  let exit = run_command("wpm run --invalid-option log.xes");
  assert_eq!(exit, 1);  // CONFIG_ERROR
  
  // WASM not loaded → exit code 5
  let exit = run_command_no_wasm("wpm run log.xes");
  assert_eq!(exit, 5);  // SYSTEM_ERROR
}
```

## Definition of Done

- ✅ 15 E2E test scenarios implemented and passing
- ✅ Critical bug scenarios (FM-1, TS-1, CB-1) formalized as tests
- ✅ Real event logs used (BPI2020, not synthetic)
- ✅ All tests validate OTEL spans emitted
- ✅ Exit code contract tested for all error paths
- ✅ Performance within acceptable bounds
- ✅ Test suite runs in <5 minutes
- ✅ 100% pass rate

## Implementation Plan

### Phase 1: Discovery & Prediction (20 hours)
1. Create `wasm4pm/tests/e2e_discovery.rs`
2. Implement E2E-01 through E2E-06
3. Load BPI2020 data
4. Validate OTEL spans
5. Write 6 tests

### Phase 2: RL & Quality (16 hours)
1. Create `wasm4pm/tests/e2e_rl.rs`
2. Create `wasm4pm/tests/e2e_quality.rs`
3. Implement E2E-07 through E2E-10
4. Include critical bug scenarios
5. Write 4 tests

### Phase 3: Config & ML (12 hours)
1. Create `wasm4pm/tests/e2e_config.rs`
2. Create `wasm4pm/tests/e2e_ml.rs`
3. Implement E2E-11 through E2E-14
4. Test profile validation
5. Write 4 tests

### Phase 4: CLI & Exit Codes (8 hours)
1. Create `wasm4pm/tests/e2e_cli.rs`
2. Implement E2E-15 (exit code contract)
3. Test all error paths
4. Write 1 comprehensive test
5. Validate exit codes for all 20 commands

### Phase 5: Integration & Hardening (4 hours)
1. Run all E2E tests together
2. Optimize timeout values
3. Add retry logic for flaky tests
4. Document test execution procedure

## Metrics

- Lines of code: ~3,000
- Files created: 5 (e2e_discovery.rs, e2e_rl.rs, e2e_quality.rs, e2e_config.rs, e2e_cli.rs)
- Files modified: 2 (Cargo.toml, tests/mod.rs)
- Test count: 15 main scenarios + 20+ sub-tests per scenario
- Execution time: <5 minutes

## Dependencies

- `tokio` (async runtime)
- `@wasm4pm/*` (all packages)
- BPI2020 dataset (public)
- No new npm dependencies

## Blockers

- AGENT3-001: SHACL validator must be wired (used in E2E-01 validation)
- AGENT4-002: CLI commands must exist (E2E-15 tests them)

## Related Issues

- AGENT9-002: OTEL instrumentation (validates spans in E2E tests)
- AGENT9-003: Performance baselines (E2E tests measure timing)
