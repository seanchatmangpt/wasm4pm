# End-to-End Test Harness Implementation Guide

**Version:** v26.4.17  
**Status:** IMPLEMENTATION ROADMAP & PATTERNS  
**Last Updated:** 2026-05-05  
**Agent:** Agent 9 (Integration Testing & Certification Gates)

---

## Overview

This guide provides step-by-step instructions to implement 15+ E2E test scenarios across the wasm4pm platform. Tests are split between:

1. **Rust integration tests** (`wasm4pm/tests/e2e_*.rs`) — Test WASM core directly
2. **TypeScript E2E tests** (`playground/scenarios/e2e-*.test.ts`) — Test full CLI stack
3. **Certification gates** (`packages/testing/src/certification.ts`) — Quality gates for release

---

## Test Infrastructure

### Existing Testing Framework

**@wasm4pm/testing package:**
```typescript
// CLI testing harness
import { runCli, assertExitCode, assertJsonOutput, createCliTestEnv, EXIT_CODES } from '@wasm4pm/testing';

// Harnesses
import { checkParity, checkParityBatch } from '@wasm4pm/testing';
import { checkDeterminism, stableReceiptHash, receiptsMatch } from '@wasm4pm/testing';
import { OtelCapture, createOtelCapture } from '@wasm4pm/testing';
import { CertificationGate, runCertification } from '@wasm4pm/testing';
```

**Fixtures location:**
- Rust: `wasm4pm/tests/fixtures/*.xes`
- TypeScript: `lab/fixtures/sample-logs/*.xes`

**Test database:**
- BPI 2020 (13K events, 262 traces) — Medium complexity
- Loan Process (262 events, 13 traces) — Simple
- Road Traffic (561K events, 456K cases) — Large

---

## E2E Test Template

### Rust Test Template (wasm4pm/tests/)

```rust
//! E2E-XX: [Test Name]
//!
//! Scenario: [Describe what this tests]
//! Expected outcome: [What should happen]
//! Critical checks: [What invariants must hold]

use std::fs;
use wasm4pm::models::EventLog;
use wasm4pm::discovery::{discover_dfg, DiscoveryConfig};

#[test]
fn test_e2e_xx_name() {
    // Arrange: Load fixture and create test data
    let fixture_path = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/simple.xes");
    let xes_content = fs::read_to_string(fixture_path)
        .expect("Failed to load fixture");
    
    let log: EventLog = serde_json::from_str(&xes_content)
        .expect("Failed to parse log");
    
    // Act: Execute the operation
    let result = discover_dfg(&log, "concept:name", DiscoveryConfig::default());
    
    // Assert: Verify invariants
    assert!(result.is_ok(), "DFG discovery should succeed");
    let dfg = result.unwrap();
    
    // Check 1: Non-empty output
    assert!(!dfg.nodes.is_empty(), "DFG should have nodes");
    assert!(!dfg.edges.is_empty(), "DFG should have edges");
    
    // Check 2: Edge validity
    for edge in &dfg.edges {
        assert!(dfg.nodes.contains(&edge.source), "Edge source should exist");
        assert!(dfg.nodes.contains(&edge.target), "Edge target should exist");
        assert!(edge.frequency > 0, "Edge frequency should be positive");
    }
    
    // Check 3: OTEL span (optional: if instrumentation exists)
    // let spans = capture_spans(|| result);
    // assert!(spans.iter().any(|s| s.name == "kernel.run"), "Should emit kernel.run span");
}

// Helper: Create test state with defaults
fn make_test_log(traces: usize, events_per_trace: usize) -> EventLog {
    let mut log = EventLog::new();
    for i in 0..traces {
        let mut trace = Trace::new(format!("trace-{}", i));
        for j in 0..events_per_trace {
            let mut event = Event::new(format!("A{}", j % 3)); // Repeat A, B, C
            trace.add_event(event);
        }
        log.add_trace(trace);
    }
    log
}
```

### TypeScript E2E Template (playground/scenarios/)

```typescript
/**
 * E2E-XX: [Test Name]
 *
 * Scenario: [Describe what this tests]
 * Expected outcome: [What should happen]
 * Critical checks: [What invariants must hold]
 *
 * Uses @wasm4pm/testing CLI harness and real XES fixtures.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs/promises';
import {
  runCli,
  assertExitCode,
  assertJsonOutput,
  createCliTestEnv,
  EXIT_CODES,
} from '@wasm4pm/testing';

const PROJECT_ROOT = path.join(__dirname, '../..');
const FIXTURE_LOG = path.join(PROJECT_ROOT, 'lab/fixtures/sample-logs/simple.xes');
const CLI_PATH = path.join(PROJECT_ROOT, 'apps/wasm4pm/dist/bin/wpm.js');

async function runPictl(args: string[], cwd: string) {
  const fullArgs = [CLI_PATH, ...args];
  return runCli(fullArgs, {
    cwd,
    cliPath: 'node',
    timeout: 30000,
  });
}

describe('E2E-XX: [Test Name]', () => {
  let testEnv: Awaited<ReturnType<typeof createCliTestEnv>>;

  beforeEach(async () => {
    testEnv = await createCliTestEnv();
  });

  afterEach(async () => {
    await testEnv.cleanup();
  });

  it('should [describe what happens]', async () => {
    const result = await runPictl(
      ['run', FIXTURE_LOG, '--format', 'json'],
      testEnv.tempDir
    );

    // Check 1: Exit code
    assertExitCode(result, EXIT_CODES.SUCCESS);

    // Check 2: Output structure
    const output = assertJsonOutput(result);
    expect(output).toBeDefined();
    expect(output).toHaveProperty('status');
    expect(output.status).toBe('success');

    // Check 3: Data validity
    const data = (output as any).data;
    expect(data).toHaveProperty('event_count');
    expect(data.event_count).toBeGreaterThan(0);

    // Check 4: Timing
    expect(data).toHaveProperty('timing');
    expect(data.timing.total_ns).toBeGreaterThan(0);
  });
});
```

---

## Implementation Checklist

### Phase 1: Discovery Path (E2E-01 to E2E-06)

**E2E-01: Basic Event Log Loading**
- [ ] Create `wasm4pm/tests/e2e_01_load_log.rs`
- [ ] Test: load valid XES, verify EventLog structure
- [ ] Invariants: event_count > 0, trace_count > 0, all activities non-empty
- [ ] Fixtures: use `tests/fixtures/simple.xes` (small, fast)

**E2E-02: Missing Attributes**
- [ ] Create test fixture: `tests/fixtures/missing_concept_name.xes` (manually created)
- [ ] Test: attempt to load, verify SOURCE_ERROR exit code
- [ ] Invariants: error message mentions missing attribute name
- [ ] Test: empty traces are accepted but skipped

**E2E-03: Corrupted Data**
- [ ] Create test fixture: `tests/fixtures/corrupted.xml` (invalid XML)
- [ ] Create test fixture: `tests/fixtures/bad_timestamps.xes` (negative timestamps)
- [ ] Test: load fails with SOURCE_ERROR
- [ ] Invariants: error is specific (XML parsing, timestamp validation)
- [ ] Verify: system doesn't hang or crash

**E2E-04: Discovery Execution (All Algorithms)**
- [ ] Create `wasm4pm/tests/e2e_04_discovery_all_algorithms.rs`
- [ ] Loop over all 41 algorithms
- [ ] For each: call `kernel.run(algo, log)`, verify output
- [ ] Invariants: no panics, output is non-null, output structure matches algo family
- [ ] Fixture: use BPI 2020 (medium complexity)

**E2E-05: Parity (explain vs plan)**
- [ ] Create `wasm4pm/tests/e2e_05_parity_all_algorithms.rs`
- [ ] Use existing `comprehensive_parity_tests.rs` as reference
- [ ] For each algorithm: call explain() and plan(), compare outputs
- [ ] Invariants: algorithm names match, parameters match, quality scores match

**E2E-06: CLI Discovery Integration**
- [ ] Create `playground/scenarios/e2e-06-discovery.test.ts`
- [ ] Test: `wpm run sample.xes --algorithm dfg --format json`
- [ ] Test: `wpm run sample.xes --algorithm heuristic_miner`
- [ ] Test: `wpm run sample.xes --algorithm unknown` → CONFIG_ERROR
- [ ] Invariants: exit codes correct, output structure valid, timing captured

**Estimated effort:** 20 hours

---

### Phase 2: Prediction Path (E2E-07 to E2E-09)

**E2E-07: Next-Activity Prediction**
- [ ] Create `playground/scenarios/e2e-07-predict-next-activity.test.ts`
- [ ] Test: `wpm predict next-activity -i log.xes --prefix "A"`
- [ ] Invariants:
  - Probabilities sum to 1.0 ± 0.01
  - All probabilities in [0, 1]
  - Top candidate is most frequent successor
- [ ] Fixture: use simple log with known patterns (A→B, A→C)

**E2E-08: Remaining-Time Prediction**
- [ ] Create `playground/scenarios/e2e-08-predict-remaining-time.test.ts`
- [ ] Test: multiple prefixes of same case, verify remaining time decreases
- [ ] Invariants:
  - remaining_time ≥ 0
  - Longer prefix → shorter remaining_time (monotonic)
  - Timing is in valid units (ms or seconds)
- [ ] Fixture: log with timestamps (e.g., 1000ms intervals)

**E2E-09: Drift Detection**
- [ ] Create `playground/scenarios/e2e-09-predict-drift.test.ts`
- [ ] Create fixture: 2-phase log (phase 1: A→B→C, phase 2: A→C, skip B)
- [ ] Test: `wpm predict drift -i two_phase_log.xes`
- [ ] Invariants:
  - Drift score increases in phase 2
  - All scores in [0, 1]
  - Detection is based on Jaccard distance
- [ ] Fixture: manually create synthetic 2-phase log

**Estimated effort:** 15 hours

---

### Phase 3: RL Path (E2E-10 to E2E-12)

**E2E-10: Bellman Update Correctness**
- [ ] Use existing `wasm4pm/tests/rl_bellman_oracle_tests.rs` as reference
- [ ] Verify: Q(state, action) increases after update with positive reward
- [ ] Verify: next_state is used in bootstrap, not state (test FM-1 bug)
- [ ] Seeded RNG: use seed=42 for determinism

**E2E-11: RL Convergence**
- [ ] Use existing `wasm4pm/tests/rl_convergence_tests.rs` as reference
- [ ] Run 50 cycles, verify policy improves
- [ ] Invariants: mean_reward[40:50] > mean_reward[0:10]
- [ ] Multiple seeds: test with 5 different seeds

**E2E-12: Circuit Breaker State Machine**
- [ ] Use existing `wasm4pm/tests/circuit_breaker_state_machine_tests.rs` as reference
- [ ] Test state transitions: Closed → Open → HalfOpen → Closed
- [ ] Test FM-1 bug: advance_clock() is called to transition Open→HalfOpen
- [ ] Invariants: state follows correct transitions, timeouts are respected

**Estimated effort:** 5 hours (mostly existing)

---

### Phase 4: CLI Integration (E2E-13 to E2E-15)

**E2E-13: OTEL Span Emission**
- [ ] Create `packages/testing/__tests__/e2e-otel.test.ts`
- [ ] Use OtelCapture harness to capture spans during CLI execution
- [ ] Test: `wpm run sample.xes --format json`
- [ ] Invariants:
  - ≥5 spans emitted (kernel.run, discovery.*, output.format, etc.)
  - All spans have status field ("ok" or "error")
  - All spans have attributes (algorithm, log_size, duration_ms, etc.)
  - No null or empty attribute values

**E2E-14: Config Resolution (5-Layer Precedence)**
- [ ] Create `playground/scenarios/e2e-14-config-resolution.test.ts`
- [ ] Test with all 4 sources present:
  - TOML: algorithm=alpha_plus_plus
  - JSON: algorithm=heuristic_miner
  - ENV: WASM4PM_ALGORITHM=dfg
  - CLI: --algorithm inductive_miner
- [ ] Verify: final config.algorithm == "inductive_miner" (CLI wins)
- [ ] Repeat without CLI arg: verify ENV wins
- [ ] Repeat without ENV: verify JSON wins
- [ ] Repeat without JSON: verify TOML wins
- [ ] Fixture: create test config files

**E2E-15: Exit Codes for All Commands**
- [ ] Create `playground/scenarios/e2e-15-exit-codes.test.ts`
- [ ] Test each of 20 commands with valid and invalid inputs:
  - Valid input → EXIT_CODE=0
  - Invalid config → EXIT_CODE=1
  - Invalid source → EXIT_CODE=2
  - Execution error → EXIT_CODE=3
- [ ] Fixture: create minimal valid and invalid files for each command

**Estimated effort:** 20 hours

---

## Test Data & Fixtures

### Fixture Inventory

| Name | Events | Traces | Complexity | Size | Location |
|------|--------|--------|------------|------|----------|
| simple.xes | 100 | 10 | Low | 10KB | tests/fixtures/ |
| loan_process.xes | 262 | 13 | Low | 25KB | tests/fixtures/ |
| BPI_2020.xes | 13K | 262 | Medium | 2MB | tests/fixtures/ |
| Road_Traffic.xes | 561K | 456K | High | 80MB | tests/fixtures/ |
| Two_Phase.xes | 1K | 20 | Synthetic (drift) | 100KB | (create) |
| Missing_Attr.xes | 100 | 10 | Invalid | 10KB | (create) |
| Bad_Timestamps.xes | 100 | 10 | Invalid | 10KB | (create) |

### Creating Custom Fixtures

**Template for creating XES fixture:**
```python
# tools/generate_xes_fixture.py
import xml.etree.ElementTree as ET

def create_xes(traces_list, filename):
    """
    traces_list: [
        { 'caseId': 'c1', 'events': [
            {'activity': 'A', 'timestamp': '2026-01-01T00:00:00'},
            {'activity': 'B', 'timestamp': '2026-01-01T00:01:00'},
        ]},
        ...
    ]
    """
    log_elem = ET.Element('log')
    for trace_data in traces_list:
        trace_elem = ET.SubElement(log_elem, 'trace')
        for event_data in trace_data['events']:
            event_elem = ET.SubElement(trace_elem, 'event')
            # Add attributes...
    
    tree = ET.ElementTree(log_elem)
    tree.write(filename)

# Create two-phase log (drift fixture)
create_xes([
    # Phase 1: A→B→C pattern (100 traces)
    *[{'caseId': f'c{i}', 'events': [
        {'activity': 'A', 'timestamp': f'2026-01-01T{i:02d}:00:00'},
        {'activity': 'B', 'timestamp': f'2026-01-01T{i:02d}:01:00'},
        {'activity': 'C', 'timestamp': f'2026-01-01T{i:02d}:02:00'},
    ]} for i in range(100)],
    # Phase 2: A→C pattern (skip B) (100 traces)
    *[{'caseId': f'c{i+100}', 'events': [
        {'activity': 'A', 'timestamp': f'2026-01-02T{i:02d}:00:00'},
        {'activity': 'C', 'timestamp': f'2026-01-02T{i:02d}:01:00'},
    ]} for i in range(100)],
], 'tests/fixtures/two_phase.xes')
```

---

## Test Execution

### Running Tests

**Rust E2E tests:**
```bash
cd wasm4pm
cargo test --test e2e_*
cargo test --test e2e_01_load_log -- --nocapture
cargo test e2e_04_discovery_all_algorithms
```

**TypeScript E2E tests:**
```bash
cd playground
pnpm test e2e-
pnpm test e2e-06-discovery.test.ts
```

**Specific test:**
```bash
cd playground
pnpm vitest run scenarios/e2e-14-config-resolution.test.ts
```

**With coverage:**
```bash
cargo tarpaulin --out Html --output-dir target/coverage -- --test-threads 1
pnpm vitest --coverage
```

---

## Mutation Testing Implementation

### FM-1: Same-State Bellman Bug Test

```rust
#[test]
fn test_mutation_1_would_be_caught() {
    // This test would FAIL if the mutation "next_state -> state" existed
    // Therefore, the test suite CATCHES this mutation.
    
    let mut agent = QLearning::with_hyperparams(0.1, 0.99, 0.0); // learning_rate, discount, exploration
    
    // Pre-populate next_state with high Q-values
    let next_state = health_state(0);
    for _ in 0..10 {
        agent.update(&next_state, &RlAction::Continue, 1.0, &next_state, false);
    }
    
    let current_state = health_state(2);
    let before_q = agent.get_q(&current_state, &RlAction::Continue);
    
    // Update with positive reward and valuable next_state
    agent.update(&current_state, &RlAction::Continue, 1.0, &next_state, false);
    
    let after_q = agent.get_q(&current_state, &RlAction::Continue);
    
    // If mutation existed: after_q == before_q (target = current Q = 0, delta = 0)
    // With correct code: after_q > before_q (bootstraps from next_state's high Q-values)
    assert!(after_q > before_q, "Q-value should increase due to bootstrapping from next_state");
}
```

### TS-1: String::len() Timestamp Bug Test

```rust
#[test]
fn test_mutation_ts1_would_be_caught() {
    // This test would FAIL if duration calculation used String::len() instead of timestamp parsing
    
    let data1 = spc_point("2026-01-01T00:00:00Z", 0.5, 0.5, 0.1); // Shorter ISO string
    let data2 = spc_point("2026-01-01T00:00:00.000000Z", 0.5, 0.5, 0.1); // Longer ISO string (same time)
    
    // Compute gap using CORRECT timestamp parsing
    let gap_correct = compute_duration(&data1, &data2);
    
    // Compute gap using WRONG String::len() (would give different result)
    let gap_wrong = (data2.timestamp.len() as i32 - data1.timestamp.len() as i32).abs();
    
    // gap_correct should be 0 (same timestamp)
    // gap_wrong would be 6 (length difference)
    assert_ne!(gap_correct, gap_wrong, "String::len() gives wrong result");
    assert_eq!(gap_correct, 0, "Same timestamp should have 0 gap");
}
```

### CB-1: Circuit Breaker Step Counter Test

```rust
#[test]
fn test_mutation_cb1_would_be_caught() {
    // This test would FAIL if step counter is never advanced
    
    let mut breaker = CircuitBreaker::new(
        CircuitBreakerConfig {
            failure_threshold: 3,
            success_threshold: 1,
            timeout: 100, // ms
        }
    );
    
    // Trigger 3 failures → Open
    for _ in 0..3 {
        breaker.on_failure();
    }
    assert_eq!(breaker.state(), CircuitState::Open);
    
    // Advance clock by timeout → should transition to HalfOpen
    advance_clock(100);
    assert_eq!(breaker.state(), CircuitState::HalfOpen, 
        "Should transition to HalfOpen after timeout");
    
    // If mutation existed (no advance_clock()), state would remain Open
    // Therefore this test CATCHES the mutation.
}
```

---

## OTEL Instrumentation Checklist

### Tier 1 (10 critical functions — must complete before release)

- [ ] `kernel.run()` — discovery dispatch
- [ ] `discovery.dfg()` — DFG algorithm
- [ ] `prediction.execute()` — prediction dispatcher
- [ ] `rl.select_action()` — agent selection
- [ ] `rl.update()` — Bellman update
- [ ] `config.resolve()` — config resolution
- [ ] `engine.bootstrap()` — WASM loader
- [ ] `planner.plan()` — execution planning
- [ ] `cli.run()` — command execution
- [ ] `output.format()` — output formatting

**Test:** For each function, verify span is emitted and contains correct attributes.

```typescript
// Test template
import { OtelCapture } from '@wasm4pm/testing';

test('kernel.run emits OTEL span', async () => {
  const capture = createOtelCapture();
  
  const result = await kernel.run('dfg', log, {});
  
  const spans = capture.getSpans('kernel.run');
  expect(spans).toHaveLength(1);
  expect(spans[0]).toHaveProperty('attributes.algorithm', 'dfg');
  expect(spans[0]).toHaveProperty('attributes.log_size');
  expect(spans[0]).toHaveProperty('attributes.duration_ms');
  expect(spans[0]).toHaveProperty('status', 'ok');
});
```

---

## Performance Baseline

### Baseline Metrics to Record

For each algorithm on BPI 2020:

```json
{
  "algorithm": "dfg",
  "fixture": "BPI_2020",
  "samples": [
    { "duration_ms": 2, "memory_mb": 5, "wasm_load_ms": 10 },
    { "duration_ms": 3, "memory_mb": 5, "wasm_load_ms": 10 },
    { "duration_ms": 2, "memory_mb": 5, "wasm_load_ms": 10 },
    ...
  ],
  "percentiles": {
    "p5": 2,
    "p50": 3,
    "p95": 5,
    "mean": 3.2,
    "std": 0.8
  },
  "regression_threshold": 6  // 2x p50
}
```

### Regression Detection

```typescript
// Sample test
test('performance: dfg does not regress >2x', () => {
  const baseline = require('./baseline.json').find(b => b.algorithm === 'dfg');
  const regression_threshold = baseline.percentiles.p50 * 2;
  
  const result = measureAlgorithm('dfg', BPI_2020_log);
  
  expect(result.duration_ms).toBeLessThan(regression_threshold);
});
```

---

## Certification Report Generation

### Report Template (docs/certification/REPORT_v26.4.17.md)

```markdown
# Certification Report — wasm4pm v26.4.17

**Date:** 2026-05-05
**Tester:** Agent 9
**Status:** ✅ PASSED / ⚠️ PARTIAL / ❌ FAILED

## Executive Summary

| Category | Status | Target | Actual |
|----------|--------|--------|--------|
| E2E Tests | ✅ PASS | 15+ | 18 |
| Mutation Score | ✅ PASS | ≥80% | 87% |
| Determinism | ✅ PASS | 100% | 100% |
| Parity | ✅ PASS | 100% | 100% |
| OTEL Coverage | ⚠️ PARTIAL | 100% | 82% |
| Performance | ✅ PASS | 2x baseline | 1.2x baseline |
| Exit Codes | ✅ PASS | All 5 codes | ✅ |

## E2E Test Results

| Test | Scenario | Result | Time | Notes |
|------|----------|--------|------|-------|
| E2E-01 | Load simple log | ✅ PASS | 10ms | - |
| E2E-02 | Missing attributes | ✅ PASS | 5ms | - |
| E2E-03 | Corrupted data | ✅ PASS | 3ms | - |
| ... | ... | ... | ... | ... |

## Mutation Testing Results

| Mutation | Category | Result | Test |
|----------|----------|--------|------|
| FM-1: Same-state Bellman | Bellman | ✅ CAUGHT | test_mutation_1 |
| TS-1: String::len() | SPC | ✅ CAUGHT | test_mutation_ts1 |
| CB-1: Step counter | Circuit | ✅ CAUGHT | test_mutation_cb1 |
| DFG: Edge counting | Discovery | ✅ CAUGHT | test_mutation_dfg |
| ... | ... | ... | ... |

## OTEL Coverage

| Tier | Required | Instrumented | Gap |
|------|----------|---------------|-----|
| Tier 1 (Critical) | 10 | 10 | 0 |
| Tier 2 (High Value) | 30 | 25 | 5 |
| Tier 3 (Utilities) | 556 | 447 | 109 |
| **Total** | **596** | **482** | **114** |

## Risks & Recommendations

### High Priority
- [ ] Remaining 5 Tier 2 functions: (list functions)

### Medium Priority
- [ ] Tier 3 coverage at 80% — acceptable for release, improve in v26.5

## Sign-Off

- [ ] All critical tests pass
- [ ] No high-risk mutations escape
- [ ] OTEL Tier 1 coverage complete
- [ ] Performance baselines established
- [ ] Exit codes validated

**Certified by:** Agent 9  
**Date:** 2026-05-05  
**Status:** ✅ READY FOR RELEASE
```

---

## Timeline & Effort Estimate

| Phase | Tasks | Effort | Dates |
|-------|-------|--------|-------|
| 1: Discovery | E2E-01 to E2E-06 | 20 hrs | Week 1-2 |
| 2: Prediction | E2E-07 to E2E-09 | 15 hrs | Week 2-3 |
| 3: RL | E2E-10 to E2E-12 | 5 hrs | Week 3 |
| 4: CLI | E2E-13 to E2E-15 | 20 hrs | Week 3-4 |
| 5: Mutation | Critical paths | 15 hrs | Week 4-5 |
| 6: OTEL | Tier 1 + 2 | 30 hrs | Week 5-6 |
| 7: Report | Certification | 10 hrs | Week 6-7 |
| **TOTAL** | **135 hours** | | **7 weeks** |

---

## Quick Reference

### Test Command Cheatsheet

```bash
# Run all Rust E2E tests
cargo test --test e2e_ -- --nocapture

# Run all TypeScript E2E tests
pnpm test scenarios/e2e-

# Run specific test
cargo test e2e_01_load_log
pnpm test e2e-06-discovery

# Run with OTEL capture
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317 cargo test

# Generate coverage
cargo tarpaulin --out Html
pnpm vitest --coverage

# Check mutation score
cargo mutants --out csv > mutations.csv

# Run certification gates
pnpm test packages/testing/__tests__/certification.test.ts
```

### File Locations

| Item | Location |
|------|----------|
| Rust E2E tests | `wasm4pm/tests/e2e_*.rs` |
| TypeScript E2E tests | `playground/scenarios/e2e-*.test.ts` |
| Fixtures | `wasm4pm/tests/fixtures/` + `lab/fixtures/` |
| Testing package | `packages/testing/src/` |
| Certification gates | `packages/testing/src/certification.ts` |
| OTEL coverage report | `.wasm4pm/otel-coverage.md` |
| Performance baseline | `.wasm4pm/benchmarks/baseline.json` |
| Certification report | `docs/certification/REPORT_*.md` |

---

**Document Version:** 1.0  
**Agent:** Agent 9 (Integration Testing & Certification Gates)  
**Date:** 2026-05-05  
**Status:** READY FOR IMPLEMENTATION
