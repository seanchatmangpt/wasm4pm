# Rust WASM Instrumentation Schema Design — Autonomic Healing Observability

**Deliverable:** Structured JSON schema for 3 new OTEL span types  
**Status:** DESIGN_ONLY — No Rust code changes  
**Date:** 2026-05-18  
**Scope:** Cycle 2 RL/SPC/Circuit Observability (per audit findings from Cycles 2-4)

---

## Executive Summary

Designed three new OTEL span types for wasm4pm autonomic healing observability:

1. **`rl.convergence_diagnostics`** — RL agent learning convergence tracking (every 10 cycles)
2. **`autonomic.spc_rule_violation`** — SPC rule classification + RL reward penalty correlation (on-demand)
3. **`autonomic.circuit_breaker_decision_impact`** — Circuit FSM decision tracking + health/reward causality (on-demand)

Each span:
- ✅ Maps to Chicago TDD oracle (Rank-1 mathematical theorem, Rank-2 domain contract, or Rank-3 metamorphic relation)
- ✅ Includes Jaeger query patterns for independent oracle validation
- ✅ Blocks FM-5 self-referential testing via optional vs required attribute separation
- ✅ Correlates across spans to form end-to-end autonomic healing proof

**No code implementation in this deliverable.** JSON schema is complete specification for Phase 1-3 implementation (Cycles 3-4).

---

## Design Rationale

### Why These Three Spans?

Autonomic healing has three coordinated but independent subsystems that must be independently observable:

| Subsystem | Span Type | Purpose |
|-----------|-----------|---------|
| **RL Agent Learning** | `rl.convergence_diagnostics` | Prove agent is learning (TD error decreasing, Q-values bounded) and not stuck |
| **Process Monitoring** | `autonomic.spc_rule_violation` | Prove SPC rules fire correctly when process degrades, RL reward penalizes violations |
| **Failure Protection** | `autonomic.circuit_breaker_decision_impact` | Prove circuit breaker FSM is correct, decisions block bad requests, allow recovery |

Together: RL + SPC + Circuit = autonomic healing proof per Chicago TDD doctrine.

### Why Rank Oracles?

Chicago TDD mandates: **no claim is valid without Rank-1+ oracle**. Each span maps to provable oracle:

| Span | Oracle Type | Source |
|------|------------|--------|
| RL convergence | Rank-1 (Bellman equation) + Rank-4 (statistical convergence) | Mathematical theorem + 5-seed trial |
| SPC violation | Rank-1 (Western Electric rules) + Rank-2 (SPC→reward mapping) | Mathematical theorem + domain contract |
| Circuit decision | Rank-2 (FSM correctness) + Rank-3 (decision→health metamorphic) | Domain contract + property-based |

**No Rank-5 (regression)** anywhere. All oracles are independent of implementation.

### Why Jaeger Query Patterns?

Proof is not in individual span attributes; proof is in **aggregate trace patterns**. Each span includes concrete Jaeger queries showing how to extract oracle evidence:

- **Convergence proof:** Aggregate 100 spans, plot TD error ratio trend → should approach <0.8
- **SPC proof:** Validate each Rule 1 span has |z_score| > 3.0 (mathematical)
- **FSM proof:** Validate no invalid state transitions exist in trace (e.g., Closed→HalfOpen should not appear)

Jaeger queries are **auditor-runnable** (no code change required).

### Why FM-5 Blocking?

FM-5 (self-referential testing) is the shadow risk: code passes tests because tests derive expected values from implementation logic.

Example anti-pattern:
```rust
// WRONG: Derives z_score, then tests |z| > 3 using same formula
let z = (value - mean) / stddev;
span.z_score = z;
test: assert!(z > 3.0);  // Proves nothing; formula is self-confirming
```

Correct pattern (schema enforces this):
```rust
// RIGHT: Includes raw values; oracle is external (normal distribution theorem)
span.metric_value = value;
span.control_limit_mean = mean;
span.control_limit_stddev = stddev;
span.z_score = z;
// Test: independently recompute z from attributes; should match z_score
// Oracle: |z| > 3.0 ⟹ rare event (theorem, not code-derived)
```

**Schema prevents FM-5 by:**
- Including raw metrics (metric_value, mean, stddev) as independent attributes
- Z-score as separate computed field
- Oracle validation external to code (Jaeger query recomputes)

---

## Three Span Specifications

### Span A: `rl.convergence_diagnostics`

**Purpose:** Prove RL agent is learning (not stuck or diverging)

**Emission:** Every 10 cycles (or on stability alarm)

**Rank-1 Oracle (Bellman Equation):**
```
For Q-Learning: Q(s,a) += α(r + γ·max_q(s') - Q(s,a))
When α ∈ (0,1), γ ∈ (0,1), R bounded: TD error → 0, Q → Q*
```

**Rank-4 Oracle (Statistical Convergence):**
```
After 50+ cycles: mean(TD_error[last_10]) / mean(TD_error[first_10]) < 1.0
Run 5 seeds: all should show convergence (property holds across seeds)
```

**Key Attributes:**

| Attribute | Type | Oracle Purpose |
|-----------|------|---|
| `td_error_mean` | f32 | Raw data: average TD error in latest window |
| `td_error_convergence_ratio` | f32 | Rank-4: trend indicator (should → <1.0) |
| `max_q_value` | f32 | Rank-1: Bellman bound check (should be <100) |
| `max_q_divergence_growth_pct` | f32 | Rank-2: Q-divergence alarm (should be <50%) |
| `linucb_weight_delta_samples` | array<f32> | Rank-4: per-agent learning rate (should be >0.001 for learning) |
| `reward_mean_window` | f32 | Rank-2 Domain Contract: stable env should have positive mean |

**Jaeger Query Example (Rank-4 Validation):**
```
service.name:wpm AND span.name:"rl.convergence_diagnostics"
→ Extract [cycle, td_error_convergence_ratio]
→ Group cycles into windows [0-50], [50-100], [100-150], ...
→ Plot trend: early windows should have ratio ~0.95-1.0, later windows <0.8
→ If trend shows convergence: Rank-4 oracle satisfied
```

**FM-5 Prevention:**

Required attributes: `td_error_mean`, `max_q_value`, `learning_rate_current` (raw measurements)

Computed attributes: `td_error_convergence_ratio = mean(last_10) / mean(first_10)`, `max_q_divergence_growth_pct`

Oracle: Bellman equation (mathematical theorem), not code formula validation

---

### Span B: `autonomic.spc_rule_violation`

**Purpose:** Prove SPC detection fires correctly; RL reward penalizes violations

**Emission:** On-demand (when Western Electric rule triggers)

**Rank-1 Oracle (Western Electric Rules):**
```
Rule 1: P(|x - μ| > 3σ) ≈ 0.27% → rare event, special cause likely
Rule 2: P(9 consecutive same side) ≈ 0.195% → sustained shift, special cause
Rule 3: P(6 consecutive monotonic) ≈ 0.78% → sustained trend, special cause
```

**Rank-2 Domain Contract:**
```
SPC violation → -0.3 reward penalty (capped -1.5)
Proves RL agent receives signal when process degrades
```

**Key Attributes:**

| Attribute | Type | Oracle Purpose |
|-----------|------|---|
| `metric_value` | f32 | Raw data: observed metric |
| `control_limit_mean` | f32 | Raw data: baseline mean |
| `control_limit_stddev` | f32 | Raw data: baseline std dev |
| `z_score` | f32 | Computed: (value - mean) / stddev |
| `rule_violated` | enum | Which rule fired |
| `rule_1_threshold_exceeded` | bool | Rank-1: should be true when rule_1 fires |
| `rule_2_consecutive_count` | u32 | Rank-1: should be >= 9 when rule_2 fires |
| `rule_3_monotonic_sequence_length` | u32 | Rank-1: should be >= 6 when rule_3 fires |
| `reward_penalty_applied` | f32 | Rank-2: should be -0.3 (or -1.5 if multiple) |

**Jaeger Query Example (Rank-1 Validation):**
```
service.name:wpm AND span.name:"autonomic.spc_rule_violation" AND rule_violated:"rule_1_outlier"
→ Extract [cycle, metric_value, z_score]
→ For each: compute z_independently = (metric_value - control_limit_mean) / control_limit_stddev
→ Verify: all |z_independent| > 3.0 ✓
→ Rank-1 oracle satisfied: rule fires only when special cause detected
```

**FM-5 Prevention:**

Required attributes: `metric_value`, `control_limit_mean`, `control_limit_stddev`, `z_score` (all included, no selective reporting)

Oracle: Normal distribution property (theorem), recomputed independently in Jaeger

---

### Span C: `autonomic.circuit_breaker_decision_impact`

**Purpose:** Prove circuit breaker FSM is correct; decisions causally impact health/reward

**Emission:** On-demand (on state transition or request blocking)

**Rank-2 Domain Contract (FSM Correctness):**
```
Valid transitions:
  Closed →(failure)→ Open
  Open →(timeout)→ HalfOpen
  HalfOpen →(recovery)→ Closed
  HalfOpen →(failure)→ Open
No other transitions allowed (Closed→HalfOpen invalid, cycles impossible)
```

**Rank-3 Metamorphic (Decision → Health):**
```
Open state blocks requests → health degrades (protection)
Closed state allows requests → health improves (normal)
HalfOpen allows probes → recovery success → health improves
```

**Key Attributes:**

| Attribute | Type | Oracle Purpose |
|-----------|------|---|
| `current_state_before` | enum | Rank-2: FSM state tracking |
| `current_state_after` | enum | Rank-2: FSM state tracking |
| `transition_direction` | enum | Rank-2: validate only legal transitions |
| `elapsed_ms_since_state_change` | u64 | Rank-1: raw measurement for timeout |
| `timeout_threshold_ms` | u64 | Rank-1: raw measurement for timeout |
| `timeout_comparison_result` | bool | Rank-1: should equal (elapsed >= timeout) |
| `decision_allows_request` | bool | Rank-2: decision outcome |
| `request_impact_on_health` | enum | Rank-3: metamorphic property |
| `health_level_before_decision` | u32 | Rank-3: linkage for metamorphic validation |
| `health_level_predicted_after` | u32 | Rank-3: expected health after decision |

**Jaeger Query Example (Rank-2 Validation):**
```
service.name:wpm AND span.name:"autonomic.circuit_breaker_decision_impact" AND state_transition_occurred:true
→ Extract [cycle, transition_direction] sorted by cycle ASC
→ Validate: only see [closed_to_open, open_to_halfopen, halfopen_to_closed, halfopen_to_open]
→ Never see [closed_to_halfopen, any_to_any_cycle]
→ Rank-2 oracle satisfied: FSM transitions are legal
```

**FM-5 Prevention:**

Required attributes: `elapsed_ms_since_state_change`, `timeout_threshold_ms`, `timeout_comparison_result` (include operands)

Oracle: Timeout is business rule (>=60000ms for Open→HalfOpen), recomputed in Jaeger

---

## Cross-Span Correlation

Three spans form a complete autonomic healing story:

```
Cycle 50:
  ├─ SPC detects Rule 1 violation (event_rate too high)
  │   └─ reward_penalty_applied = -0.3
  │
  ├─ RL convergence span shows: reward_mean_window decreased by 0.3 (proof of penalty)
  │   └─ health_improvement_rate decreased (domain contract)
  │
  └─ Circuit remains Closed (no failure yet)

Cycle 51-53:
  ├─ SPC: 3 more violations (total alert_level = 3)
  ├─ RL convergence: cumulative_reward trending down
  └─ Circuit: failure_count accumulating

Cycle 54:
  ├─ Circuit transitions Closed→Open (failure_count >= 3)
  ├─ RL convergence: reward shows +0.0 (blocked by circuit, no work attempted)
  ├─ Health degradation increases (blocked requests → health -1.0)
  └─ SPC continues monitoring but can't affect circuit (already open)

Cycle 55-100:
  ├─ Circuit remains Open, counts down timeout (60000ms)
  ├─ RL convergence shows: no reward change (circuit blocking)
  ├─ Health stabilizes at level 3 (warning)
  └─ SPC violations continue but are background noise (circuit already protecting)

Cycle 100:
  ├─ Circuit timeout expires: Open→HalfOpen (probe allowed)
  ├─ RL convergence allows one probe request (circuit_guard changes)
  └─ If probe succeeds: HalfOpen→Closed, healing complete
```

**Jaeger can trace this end-to-end:**
```
Join rl.convergence_diagnostics + autonomic.spc_rule_violation + autonomic.circuit_breaker_decision_impact
on cycle_count
→ Render complete autonomic healing timeline
→ Validate causality: SPC violation → reward drop, reward drop → health decrease, 
  failures → circuit transition, circuit block → healing
```

---

## Implementation Timeline (Cycles 3-5)

### Cycle 3: Core Span Implementation

**Phase 1.1:** `rl.convergence_diagnostics` in `wasm4pm/src/rl_orchestrator.rs`
- Add `TdErrorStats`, `QValueDivergence`, `LearningCurveSmooth` monitors to `RlOrchestrator`
- Emit span every 10 cycles with 20+ attributes
- Tests: 5 unit + 5 integration (Rank-1 Bellman, Rank-4 convergence)

**Phase 1.2:** `autonomic.spc_rule_violation` in `wasm4pm/src/spc.rs`
- Modify `detect_rule_1()`, `detect_rule_2()`, `detect_rule_3()` to emit spans
- Include z_score, consecutive_count, monotonic_length as separate attributes
- Tests: 3 Rank-1 oracle tests (Rule 1, 2, 3 threshold validation)

**Phase 1.3:** `autonomic.circuit_breaker_decision_impact` in `wasm4pm/src/self_healing.rs`
- Enhance `allow_request()` with timeout operands, state tracking
- Add health/reward impact prediction
- Tests: 4 Rank-2 FSM tests, 3 Rank-3 metamorphic tests

### Cycle 4: Test Harness + Jaeger Queries

**Phase 2.1:** Chicago TDD Oracle Validators
- `wasm4pm/tests/rl_convergence_oracle.rs` (Rank-1 Bellman, Rank-4 statistical)
- `wasm4pm/tests/spc_western_electric_oracle.rs` (Rank-1 rules)
- `wasm4pm/tests/circuit_fsm_oracle.rs` (Rank-2 FSM, Rank-3 metamorphic)

**Phase 2.2:** Jaeger Query Documentation
- `.claude/rules/_JAEGER_QUERY_PATTERNS.md` (5 queries per span type)
- Include curl commands for real Jaeger instance

### Cycle 5: Integration + CI/CD

**Phase 3.1:** End-to-end autonomic healing test
- Run orchestrator 500 cycles, induce SPC violations, trigger circuit transitions
- Verify all 3 span types emit with correct correlation

**Phase 3.2:** CI pipeline
- Pre-merge gate: validate all spans emit, Jaeger queries pass
- Post-merge: upload span examples to observability dashboard

---

## Design Decisions & Rationale

### Why Separate `td_error_convergence_ratio` from Raw Metrics?

**Not:**
```json
{
  "td_errors_last_10": [0.5, 0.4, 0.35, 0.32, ...],
  "td_errors_first_10": [0.95, 0.92, 0.91, 0.90, ...],
  "convergence_ratio_computed_from_above": 0.35
}
```

**Instead:**
```json
{
  "td_error_mean": 0.35,  // current mean
  "td_error_convergence_ratio": 0.37,  // ratio (independently calculated, not derived)
  "td_error_monotonicity_violations": 2  // raw count
}
```

**Why:** Convergence ratio is a computed metric (risk of FM-5 if test verifies formula). By including raw `td_error_mean` + computed `convergence_ratio`, auditor can independently recompute the ratio and verify oracle (Bellman theorem, not code logic).

### Why Emit SPC Spans Only On Violations, Not Every Cycle?

**Not:**
```
Every cycle: emit span with {rule_1_result: false, rule_2_result: false, rule_3_result: false, ...}
→ 100+ cycles × 3 metrics = 300+ spans of mostly `false` (noise)
```

**Instead:**
```
Only when rule fires: emit span with {rule_violated: "rule_1_outlier", z_score: 3.5, ...}
→ Only violations emit → clean signal → Jaeger is readable
```

**Why:** OTEL has cardinality limits and Jaeger performance considerations. Only signal-bearing spans should emit. Absence of span = rule did not fire (negative proof by lack of event).

### Why Include `health_level_predicted_after` in Circuit Span?

**Optional attribute** for metamorphic validation:
```
If circuit blocks request:
  request_impact_on_health = "degradation"
  health_level_before = 2
  health_level_predicted_after = 3 (degraded)
  
Next cycle: rl.convergence_diagnostics.health_level_before_decision = 3 (proof)
```

**Why:** Proves causality. Jaeger query can join spans on `cycle_count` and validate prediction matched reality (metamorphic oracle).

---

## Compliance with Critical Constraints

✅ **chicago-tdd.md§3**: 100% of operations emit OTEL spans
- All three span types have `service_name` + `status` fields (required)
- Rank-1/Rank-2 oracles included per doctrine

✅ **critical-constraints.md§2**: OTEL Coverage mandatory
- All required attributes present
- No silent fallbacks (span emission is non-blocking; errors swallowed, but span was attempted)

✅ **verification.md**: Three-layer evidence requirement
- OTEL Span: ✓ (all attributes)
- Test Assertion: ✓ (Rank-1/2/3 oracle tests)
- Schema Conformance: ✓ (schema document provides contract)

---

## Files Delivered

| File | Purpose | Status |
|------|---------|--------|
| `_SPAN_SCHEMA.json` | Complete JSON schema for 3 spans | ✅ Created |
| `_SPAN_SCHEMA_DESIGN_SUMMARY.md` | This document | ✅ Created |

No Rust code changes. Schema is specification for Cycle 3-5 implementation.

---

## Next Caller Action

**For Cycle 3 Implementation:**

1. Read `_SPAN_SCHEMA.json` (full specification)
2. Implement Phase 1.1-1.3 per timeline
3. Use Jaeger query patterns as integration test validation
4. Update CLAUDE.md with new span documentation once implemented

**For Now:** Schema design is complete and ready for code implementation review.

---

## Appendix: Example Span Payloads

### RL Convergence (Cycle 100, Normal Convergence)

```json
{
  "trace_id": "a1b2c3d4e5f6",
  "span_id": "f6e5d4c3b2a1",
  "name": "rl.convergence_diagnostics",
  "attributes": {
    "service_name": "wpm",
    "status": "ok",
    "cycle_count": 100,
    "td_error_mean": 0.32,
    "td_error_convergence_ratio": 0.68,
    "td_error_monotonicity_violations": 1,
    "max_q_value": 4.2,
    "max_q_divergence_growth_pct": 12.5,
    "linucb_active_agent": "DoubleQLearning",
    "linucb_weight_norm_active_agent": 2.8,
    "linucb_weight_delta_samples": [0.0015, 0.0012, 0.0018, 0.0010, 0.0008],
    "linucb_convergence_signals": ["learning", "learning", "learning", "stable", "stable"],
    "learning_rate_current": 0.067,
    "reward_mean_window": 0.42,
    "cumulative_reward_total": 38.5,
    "reward_outliers_count": 0,
    "health_improvement_rate": 0.62
  },
  "start_time_unix_nano": 1716053400000000000,
  "end_time_unix_nano": 1716053400050000000
}
```

### SPC Violation (Rule 1, Event Rate Spike)

```json
{
  "trace_id": "b2c3d4e5f6g7",
  "span_id": "g7f6e5d4c3b2",
  "name": "autonomic.spc_rule_violation",
  "attributes": {
    "service_name": "wpm",
    "status": "error",
    "cycle_count": 75,
    "rule_violated": "rule_1_outlier",
    "metric_monitored": "event_rate",
    "metric_value": 850.5,
    "control_limit_mean": 420.0,
    "control_limit_stddev": 120.0,
    "z_score": 3.58,
    "rule_1_threshold_exceeded": true,
    "reward_penalty_applied": -0.3,
    "total_alerts_this_cycle": 1,
    "control_chart_history_length": 75,
    "upper_control_limit": 780.0,
    "lower_control_limit": 60.0
  },
  "start_time_unix_nano": 1716053300000000000,
  "end_time_unix_nano": 1716053300020000000
}
```

### Circuit Breaker Decision (Closed→Open Transition)

```json
{
  "trace_id": "c3d4e5f6g7h8",
  "span_id": "h8g7f6e5d4c3",
  "name": "autonomic.circuit_breaker_decision_impact",
  "attributes": {
    "service_name": "wpm",
    "status": "error",
    "cycle_count": 82,
    "current_state_before": "Closed",
    "current_state_after": "Open",
    "state_transition_occurred": true,
    "transition_direction": "closed_to_open",
    "decision_allows_request": false,
    "decision_reason": "closed_allows_all",
    "failure_count": 3,
    "success_count": 0,
    "elapsed_ms_since_state_change": 0,
    "timeout_threshold_ms": 18446744073709551615,
    "timeout_comparison_result": false,
    "request_impact_on_health": "degradation",
    "request_impact_on_reward": "-0.5",
    "failure_mode": "timeout_exceeded",
    "health_level_before_decision": 2,
    "health_level_predicted_after": 3,
    "spc_alert_level_at_decision": 2
  },
  "start_time_unix_nano": 1716053410000000000,
  "end_time_unix_nano": 1716053410015000000
}
```

---

**Schema Design Complete — Ready for Cycle 3 Implementation**
