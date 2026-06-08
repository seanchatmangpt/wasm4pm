# OTEL Instrumentation Gaps: RL Convergence Observability, SPC-RL Decoupling, Circuit Breaker Causality

**Date:** 2026-05-18  
**Status:** Gap analysis complete | Instrumentation NOT implemented (analysis only)  
**Scope:** 3 critical observability gaps affecting autonomic loop causality proof

---

## Executive Summary

Three observability gaps prevent **causal proof** that the autonomic RL system is learning and adapting:

1. **RL Convergence Invisible** — No per-cycle TD error, Q-value growth, or weight norm deltas. Cannot prove learning vs. random action.
2. **SPC→RL Decoupled** — SPC alerts fire independently; RL receives quantized count but not rule type. Cannot prove RL actions correlate with alert recovery.
3. **Circuit Breaker→Reward Opaque** — Circuit allows/blocks decisions; no per-cycle correlation to RL reward. Cannot prove healing decisions improve health.

These gaps violate **chicago-tdd.md doctrine**: "If the code says it worked but the event log cannot prove a lawful process happened, then it did not work."

---

## Gap 1: RL Convergence Invisible (Rank-1 Oracle Incomplete)

### Current State

**Location:** `wasm4pm/src/rl_orchestrator.rs:779-851`

The `run_cycle()` span emits:
- ✓ `health_before`, `health_after`
- ✓ `agent` (agent type), `spc_alerts` (count)
- ✓ State coverage metrics (every 100 cycles, dimensionality analysis)

**Missing:**
- ❌ TD error per cycle (proves learning convergence)
- ❌ Q-value max/min/mean (proves value function stability)
- ❌ Weight norm deltas per agent (proves gradient updates)
- ❌ Learning rate current value (proves exploration→exploitation transition)
- ❌ Action improvement signal (is new action better than previous?)

### Why This Matters (Chicago TDD Rank-1)

**Bellman Convergence Theorem (Mathematical Proof):**
```
Q*(s,a) = E[r + γ max Q*(s',a')]
TD error: δ_t = r + γ max Q(s',a') - Q(s,a)
Convergence proof: |δ_t| → 0 as cycles → ∞
```

**Evidence requirement:** OTEL spans must emit TD error trajectory to prove convergence, not just code assertion.

**Current violation:**
```
Code path: compute_reward() → update Q-value → return reward
Span emits: health, action, agent
Missing proof: δ_t value, Q-value change, convergence signal
```

### Risk: FM-5 (Self-Referential Testing)

Without per-cycle TD error spans, tests can only verify "code ran without panic" (tautology), not "RL is learning."

Test could claim "rewards increased over 100 cycles" but provide no OTEL proof of TD error convergence. Observer has no independent proof.

### Proposed Instrumentation (NOT IMPLEMENTED)

**Span Name:** `rl.convergence_diagnostics`

**Frequency:** Every 10 cycles (trade-off: observability vs. span volume)

**Emission Point:** `rl_orchestrator.rs:900` (after Q-value update, before return)

**Attributes:**

| Attribute | Type | Source | Semantic |
|-----------|------|--------|----------|
| `td_error` | f32 | `reward - old_q + γ*max_q(next_state)` | Bellman residual |
| `td_error_magnitude` | f32 | `abs(td_error)` | Convergence signal: <0.1 = converged |
| `q_value_current` | f32 | `Q(state, action)` after update | Current action value |
| `q_value_previous` | f32 | `Q(state, action)` before update | Previous action value |
| `q_value_max_state` | f32 | `max_a' Q(next_state, a')` | Bootstrap target max |
| `q_value_change_magnitude` | f32 | `abs(q_current - q_previous)` | Update magnitude proof |
| `linucb_weight_norm` | f32 | Per-agent L2 norm: `sqrt(Σ w_i²)` | Gradient update magnitude |
| `linucb_weight_delta` | f32 | `norm_after - norm_before` | Weight change per cycle |
| `learning_rate_current` | f32 | `α_t = α_0 × (decay_base ^ cycle)` | Exploration phase indicator |
| `convergence_status` | string | `"learning"` if `|δ_t| > 0.1`, else `"converged"` | Interpretable status |
| `agent` | string | Active agent type (QLearning, SARSA, etc.) | Agent accountability |
| `cycle_count` | u64 | Monotonic cycle counter | Temporal ordering |
| `service_name` | string | `"wpm"` | Required by contract |
| `status` | string | `"ok"` (always; error would be caught earlier) | Span completion status |

**Example Span (JSON OTEL format):**
```json
{
  "name": "rl.convergence_diagnostics",
  "attributes": {
    "td_error": 0.047,
    "td_error_magnitude": 0.047,
    "q_value_current": 2.341,
    "q_value_previous": 2.294,
    "q_value_max_state": 2.512,
    "q_value_change_magnitude": 0.047,
    "linucb_weight_norm": 3.267,
    "linucb_weight_delta": 0.023,
    "learning_rate_current": 0.0847,
    "convergence_status": "learning",
    "agent": "QLearning",
    "cycle_count": 450,
    "service_name": "wpm",
    "status": "ok"
  },
  "timestamp": "2026-05-18T14:23:45.123Z"
}
```

**Usage (Jaeger UI):**
1. Query: `service_name:"wpm" AND span_name:"rl.convergence_diagnostics"`
2. Timeline view: `td_error_magnitude` over time (should decrease toward 0)
3. Proof: "TD error converged to <0.01 at cycle 340" — mathematical evidence

---

## Gap 2: SPC→RL Decoupled (Causal Proof Missing)

### Current State

**Location:** `wasm4pm/src/lib.rs:1221-1330` (SPC emission), `wasm4pm/src/lib.rs:1622` (RL feature construction)

**SPC behavior:**
```rust
let causes = spc::check_western_electric_rules(&chart_data);
// Emits: tracing::warn!("Western Electric rule violation", kind="event_rate", cause=?c)
// Returns: Vec<SpecialCause> enum (OutOfControl, Shift, Trend, TwoOfThree)
```

**RL consumption:**
```rust
// In RL state features[5]:
let spc_alert_level = (all_special_causes.len() as f32 / 10.0).min(1.0);
// Quantizes to [0-3]: spc_alert_level = Self::quantize_spc_alerts(normalized_alerts)
```

**Decoupling:**
- SPC emits rich enum: `SpecialCause::Shift { direction: Above, count: 9 }`
- RL receives: `spc_alert_level = 2` (no context of which rule fired)
- No link: SPC rule type → RL action → alert resolution → RL reward increment

### Why This Matters (Chicago TDD Rank-2 Domain Contract)

**Expected Domain Contract:**
```
Rule 1 fires (outlier) → Action = "Retry" or "Scale" (handle spike)
Rule 2 fires (shift) → Action = "Scale" or "Fallback" (adjust baselines)
Rule 3 fires (trend) → Action = "Scale" or "Restart" (address drift)

→ Next cycle: SPC alert resolved → Reward += delta_reward_for_recovery
```

**Current violation:**
```
Rule 1 fires → RL gets spc_alert_level=1 (no rule type info)
→ Agent action may be "Continue" (wrong for outlier response)
→ Next cycle: Alert still fires → no reward improvement signal
→ RL cannot learn rule-specific recovery actions
```

**Risk: Policy Lock-in**
- Agent learns "spc_alert_level > 0" → take some action
- But cannot distinguish which rule fired → optimal action selection impossible
- Converges to "average best action" over all rule types (suboptimal)

### Proposed Instrumentation (NOT IMPLEMENTED)

**Concept:** Emit SPC rule type as span, link to RL action taken, track recovery in next cycle.

#### Instrumentation 1: SPC Rule Classification Span

**Span Name:** `spc.rule_violation_classified`

**Frequency:** Per rule violation detected

**Emission Point:** `wasm4pm/src/lib.rs:1251` (after `check_western_electric_rules`)

**Attributes:**

| Attribute | Type | Source | Semantic |
|-----------|------|--------|----------|
| `spc_rule_type` | string | Pattern of `SpecialCause` | "rule_1_outlier" \| "rule_2_shift" \| "rule_3_trend" \| "rule_4_two_of_three" |
| `spc_metric` | string | Which metric (event_rate, trace_duration, activity_frequency) | Dimension of alert |
| `spc_direction` | string | For Shift/TwoOfThree: "above" \| "below" | Drift direction |
| `spc_count` | u32 | For Shift/Trend: consecutive point count | Pattern strength (9+ for Rule 2) |
| `spc_value` | f64 | Current metric value | Quantitative severity |
| `spc_ucl` | f64 | Upper Control Limit | Threshold crossed |
| `spc_lcl` | f64 | Lower Control Limit | Threshold crossed |
| `spc_cl` | f64 | Center Line (process mean) | Baseline |
| `spc_sigma_distance` | f64 | Stdev multiplier (e.g., 3.2σ for outlier) | Statistical significance |
| `cycle_count` | u64 | Autonomic cycle when alert fired | Temporal context |
| `service_name` | string | `"wpm"` | Required |
| `status` | string | `"error"` (alert = anomaly) | Span status |

**Example Span (JSON):**
```json
{
  "name": "spc.rule_violation_classified",
  "attributes": {
    "spc_rule_type": "rule_2_shift",
    "spc_metric": "event_rate",
    "spc_direction": "above",
    "spc_count": 9,
    "spc_value": 42.5,
    "spc_ucl": 35.2,
    "spc_lcl": 4.8,
    "spc_cl": 20.0,
    "spc_sigma_distance": 3.7,
    "cycle_count": 423,
    "service_name": "wpm",
    "status": "error"
  }
}
```

#### Instrumentation 2: SPC→Action Correlation Span

**Span Name:** `rl.action_for_spc_alert`

**Frequency:** Every cycle (correlate SPC alert with RL action)

**Emission Point:** `wasm4pm/src/lib.rs:1650` (after action selected, before execution)

**Attributes:**

| Attribute | Type | Source | Semantic |
|-----------|------|--------|----------|
| `spc_alert_count` | u32 | `all_special_causes.len()` | Count of distinct alerts this cycle |
| `spc_primary_rule_type` | string | Dominant rule type (if >1 alert) | Which rule drives action |
| `action_selected` | string | RL agent action (Continue, Scale, Retry, Fallback, Restart) | RL response |
| `action_matches_rule` | boolean | Heuristic: is action appropriate for rule? | Correctness indicator |
| `action_rationale` | string | Domain-driven: why this action for this rule | Interpretability |
| `agent_active` | string | Active RL agent type | Accountability |
| `linucb_selected_agent` | string | LinUCB recommendation (if enabled) | Bandit context |
| `cycle_count` | u64 | Autonomic cycle | Temporal |
| `service_name` | string | `"wpm"` | Required |
| `status` | string | `"ok"` | Span status |

**Action Matching Logic** (exemplary heuristic):
```
Rule 1 (outlier) + action=Scale → match=true (scale handles spikes)
Rule 2 (shift) + action=Scale → match=true (adjust baseline)
Rule 3 (trend) + action=Restart → match=true (reset state)
Rule 2 (shift) + action=Continue → match=false (ignore trend)
```

**Example Span:**
```json
{
  "name": "rl.action_for_spc_alert",
  "attributes": {
    "spc_alert_count": 1,
    "spc_primary_rule_type": "rule_2_shift",
    "action_selected": "Scale",
    "action_matches_rule": true,
    "action_rationale": "Shift detected above baseline; scale exploration to adapt",
    "agent_active": "DoubleQLearning",
    "linucb_selected_agent": "SARSA",
    "cycle_count": 424,
    "service_name": "wpm",
    "status": "ok"
  }
}
```

#### Instrumentation 3: SPC Alert Recovery Span (Next Cycle)

**Span Name:** `spc.alert_resolution_status`

**Frequency:** When alert from previous cycle resolves

**Emission Point:** `wasm4pm/src/lib.rs:1250` (per metric check, if alert was present last cycle)

**Attributes:**

| Attribute | Type | Source | Semantic |
|-----------|------|--------|----------|
| `spc_metric` | string | event_rate, trace_duration, etc. | Which metric |
| `alert_previous_cycle` | boolean | Was this metric alerting last cycle? | Recovery detection |
| `alert_current_cycle` | boolean | Is it still alerting now? | Alert status |
| `recovery_achieved` | boolean | `alert_prev && !alert_current` | Proof of recovery |
| `cycles_to_recovery` | u32 | Cycles from rule fire to resolution | Recovery latency |
| `action_taken_last_cycle` | string | RL action when alert was detected | Causal link |
| `rl_reward_delta` | f32 | Reward change this cycle | Recovery signal |
| `metric_value_previous` | f64 | Metric value when alerted | Baseline anomaly |
| `metric_value_current` | f64 | Metric value now | Recovery magnitude |
| `metric_value_normal_range_min` | f64 | Expected min (CL - 3σ) | Normal zone |
| `metric_value_normal_range_max` | f64 | Expected max (CL + 3σ) | Normal zone |
| `cycle_count` | u64 | Current cycle | Temporal |
| `service_name` | string | `"wpm"` | Required |
| `status` | string | `"ok"` if recovered, else `"error"` | Resolution status |

**Example Span (Alert Recovered):**
```json
{
  "name": "spc.alert_resolution_status",
  "attributes": {
    "spc_metric": "event_rate",
    "alert_previous_cycle": true,
    "alert_current_cycle": false,
    "recovery_achieved": true,
    "cycles_to_recovery": 2,
    "action_taken_last_cycle": "Scale",
    "rl_reward_delta": 0.3,
    "metric_value_previous": 42.5,
    "metric_value_current": 21.2,
    "metric_value_normal_range_min": 4.8,
    "metric_value_normal_range_max": 35.2,
    "cycle_count": 424,
    "service_name": "wpm",
    "status": "ok"
  }
}
```

**Jaeger Correlation Query:**
```
Trace [spc.rule_violation_classified] → [rl.action_for_spc_alert] → [rl.convergence_diagnostics] → [spc.alert_resolution_status]

Proof: SPC rule (event_rate shift) → RL action (Scale) → TD error decreases → alert resolves → reward increases
```

---

## Gap 3: Circuit Breaker→Reward Opaque (Causality Not Proven)

### Current State

**Location:** `wasm4pm/src/lib.rs:1207-1219` (circuit breaker call), `wasm4pm/src/lib.rs:1694-1707` (success/failure recording)

**Circuit behavior:**
```rust
let (circuit_allowed, circuit_state) = CIRCUIT_BREAKER.with(|cb| {
    let mut cb = cb.borrow_mut();
    let allowed = cb.allow_request();
    (allowed, state)
});
// ... execute cycle if allowed ...
if guard_pass {
    cb.record_success();
} else {
    cb.record_failure();
}
```

**Current span emission** (`wasm4pm/src/self_healing.rs`):
- Circuit state transitions (Closed → Open → HalfOpen → Closed)
- Timeout expiry and probe outcomes
- **Missing:** Per-cycle link from circuit decision → RL reward → health improvement

### Why This Matters (Chicago TDD Rank-2 Domain Contract)

**Expected Contract:**
```
Cycle 1: health=3, circuit_allowed=false → action cannot execute → health remains 3
Cycle 2: timeout expires → circuit=HalfOpen → probe (allow=true) → execute recovery action
Cycle 3: guard_pass=true → record_success() → circuit=Closed → health improves to 2
        → reward += 0.5 (recovery signal)

Proof: Circuit block → recovery → health improvement → reward increase
```

**Current violation:**
```
Circuit span: "circuit_breaker.allow_request, current_state=Open, ...ok"
RL span: "rl.run_cycle, health_before=3, health_after=2, action=Continue, reward=0.2"
Gap: No link between circuit decision and reward change.
Auditor cannot prove: circuit probe success → action execution → reward increase
```

**Risk: MTBT (Mean Time Between Transitions) Unknown**
- Circuit transitions from Closed → Open → HalfOpen → Closed
- RL policy learns to avoid opening (via health management)
- But no metric tracks: "How much health improvement is attributable to healing actions vs. natural recovery?"
- Policy cannot learn the causal relationship

### Proposed Instrumentation (NOT IMPLEMENTED)

#### Instrumentation 1: Circuit Breaker Decision Impact Span

**Span Name:** `circuit.decision_impact_on_cycle`

**Frequency:** Every cycle

**Emission Point:** `wasm4pm/src/lib.rs:1210` (after allow_request), and again at `wasm4pm/src/lib.rs:1696` (after recording success/failure)

**Attributes:**

| Attribute | Type | Source | Semantic |
|-----------|------|--------|----------|
| `circuit_decision_allowed` | boolean | `allow_request()` return value | Circuit gate decision |
| `circuit_state_before` | string | Circuit state before this cycle | FSM state |
| `circuit_state_after` | string | Circuit state after record_success/failure | FSM transition |
| `circuit_state_changed` | boolean | State before ≠ state after | Transition occurred |
| `circuit_failure_count` | u32 | Accumulated failures in current state | Threshold tracking |
| `circuit_success_count` | u32 | Accumulated successes in current state | Recovery progress |
| `circuit_timeout_remaining_ms` | i64 | Time until transition possible (Closed/HalfOpen) | Timeout context |
| `guard_pass_when_allowed` | boolean | When circuit allowed, did guard pass? | Probe outcome |
| `action_could_execute` | boolean | `circuit_allowed && guard_pass` | Healing action executed? |
| `health_state_when_allowed` | u8 | Health level when circuit allowed execution | Baseline |
| `health_state_when_blocked` | u8 | Health level when circuit blocked | No-op outcome |
| `health_delta_allowed` | i8 | Health change if allowed vs. not allowed (next cycle) | Impact magnitude |
| `rl_reward_delta_after_block_recovery` | f32 | Reward change after circuit recovers from Open | Recovery signal |
| `cycle_count` | u64 | Monotonic cycle counter | Temporal |
| `service_name` | string | `"wpm"` | Required |
| `status` | string | `"ok"` if allowed, `"error"` if blocked | Decision status |

**Example Span (Circuit Allowed, Probe Succeeds):**
```json
{
  "name": "circuit.decision_impact_on_cycle",
  "attributes": {
    "circuit_decision_allowed": true,
    "circuit_state_before": "HalfOpen",
    "circuit_state_after": "Closed",
    "circuit_state_changed": true,
    "circuit_failure_count": 0,
    "circuit_success_count": 1,
    "circuit_timeout_remaining_ms": 0,
    "guard_pass_when_allowed": true,
    "action_could_execute": true,
    "health_state_when_allowed": 3,
    "health_state_when_blocked": null,
    "health_delta_allowed": -1,
    "rl_reward_delta_after_block_recovery": 0.4,
    "cycle_count": 234,
    "service_name": "wpm",
    "status": "ok"
  }
}
```

**Example Span (Circuit Blocked, Timeout Pending):**
```json
{
  "name": "circuit.decision_impact_on_cycle",
  "attributes": {
    "circuit_decision_allowed": false,
    "circuit_state_before": "Open",
    "circuit_state_after": "Open",
    "circuit_state_changed": false,
    "circuit_failure_count": 3,
    "circuit_success_count": 0,
    "circuit_timeout_remaining_ms": 45000,
    "guard_pass_when_allowed": null,
    "action_could_execute": false,
    "health_state_when_allowed": null,
    "health_state_when_blocked": 4,
    "health_delta_allowed": null,
    "rl_reward_delta_after_block_recovery": 0,
    "cycle_count": 232,
    "service_name": "wpm",
    "status": "error"
  }
}
```

#### Instrumentation 2: MTBT (Mean Time Between Transitions) Diagnostic Span

**Span Name:** `circuit.mtbt_and_stability_diagnostics`

**Frequency:** Every 50 cycles (rolling window analysis)

**Emission Point:** `wasm4pm/src/lib.rs:1700` (post-success/failure recording)

**Attributes:**

| Attribute | Type | Source | Semantic |
|-----------|------|--------|----------|
| `circuit_mtbt_seconds` | f32 | Mean cycles to transition / cycle_frequency | Recovery latency |
| `circuit_mtbt_cycles` | u32 | Mean cycles between Open→HalfOpen→Closed | Healing cadence |
| `circuit_transitions_total` | u32 | Cumulative state transitions | Stress count |
| `circuit_transitions_last_window` | u32 | Transitions in last 50 cycles | Recent instability |
| `circuit_stability_score` | f32 | 1.0 if Closed ≥90% cycles, 0.0 if bouncing | Stability metric |
| `circuit_health_correlation` | f32 | Correlation: circuit_blocked → health_degraded | Causal linkage |
| `health_avg_when_allowed` | f32 | Mean health when circuit allowed | Baseline health |
| `health_avg_when_blocked` | f32 | Mean health when circuit blocked | Degradation |
| `health_improvement_rate` | f32 | Health levels recovered per 100 cycles | Recovery rate |
| `rl_reward_avg_during_recovery` | f32 | Mean RL reward in cycles following block | Recovery signal |
| `cycles_analyzed` | u32 | Window size for analysis (50) | Statistical scope |
| `cycle_count` | u64 | Current cycle | Temporal |
| `service_name` | string | `"wpm"` | Required |
| `status` | string | `"ok"` if stable, `"error"` if bouncing | Stability status |

**Example Span (Healthy, Stable):**
```json
{
  "name": "circuit.mtbt_and_stability_diagnostics",
  "attributes": {
    "circuit_mtbt_seconds": 3.2,
    "circuit_mtbt_cycles": 32,
    "circuit_transitions_total": 7,
    "circuit_transitions_last_window": 0,
    "circuit_stability_score": 0.98,
    "circuit_health_correlation": 0.87,
    "health_avg_when_allowed": 1.5,
    "health_avg_when_blocked": 3.2,
    "health_improvement_rate": 0.15,
    "rl_reward_avg_during_recovery": 0.35,
    "cycles_analyzed": 50,
    "cycle_count": 600,
    "service_name": "wpm",
    "status": "ok"
  }
}
```

**Jaeger Query (Trace Causality):**
```
Trace [circuit.decision_impact_on_cycle allowed=false] 
  → [rl.run_cycle health=4, reward=-1.0] 
  → ... 30 cycles waiting ...
  → [circuit.decision_impact_on_cycle allowed=true, state_changed=Open→Closed]
  → [rl.run_cycle health=3, reward=0.4]
  → [circuit.mtbt_and_stability_diagnostics circuit_stability=0.95, health_correlation=0.92]

Proof: Circuit block (30 cycles) → health degraded → timeout fired → probe succeeded → health recovered → reward increased
```

---

## Priority Matrix: Instrumentation Impact vs. Complexity

| Instrumentation | Gap | Observability Impact | Complexity | Rank |
|---|---|---|---|---|
| **RL Convergence Diagnostics** | 1 | HIGH (proves learning) | MEDIUM (TD error calculation) | 1 |
| **SPC Rule Classification** | 2 | HIGH (rule type context) | LOW (enum dispatch) | 2 |
| **SPC→Action Correlation** | 2 | HIGH (action matching) | MEDIUM (heuristic logic) | 2 |
| **SPC Alert Resolution** | 2 | MEDIUM (recovery tracking) | MEDIUM (per-metric state) | 3 |
| **Circuit Decision Impact** | 3 | HIGH (causal proof) | MEDIUM (state tracking) | 1 |
| **Circuit MTBT Diagnostics** | 3 | MEDIUM (stability metric) | HIGH (rolling window, correlation) | 4 |

**Recommended Phased Implementation:**
1. **Phase 1 (Immediate):** RL Convergence Diagnostics + Circuit Decision Impact (Gap 1 + 3, high impact, medium effort)
2. **Phase 2 (Next):** SPC Rule Classification + SPC→Action Correlation (Gap 2, high impact, low-medium effort)
3. **Phase 3 (Polish):** SPC Alert Resolution + Circuit MTBT Diagnostics (Gap 2 + 3, medium impact, medium-high effort)

---

## Integration Checklist (NOT DONE)

- [ ] Add `td_error` computation to `rl_orchestrator.rs:run_cycle()` before return
- [ ] Add `linucb_weight_norm()` getter to `LinUCBAgent` struct
- [ ] Emit `rl.convergence_diagnostics` span every 10 cycles
- [ ] Classify SPC `SpecialCause` enum → string in `lib.rs:1256`
- [ ] Emit `spc.rule_violation_classified` span per rule detection
- [ ] Emit `rl.action_for_spc_alert` span correlating SPC + RL action
- [ ] Track previous-cycle alert state in struct for recovery detection
- [ ] Emit `spc.alert_resolution_status` span on state transition
- [ ] Track circuit state transitions in `self_healing.rs` for MTBT
- [ ] Emit `circuit.decision_impact_on_cycle` span every cycle
- [ ] Emit `circuit.mtbt_and_stability_diagnostics` every 50 cycles

---

## Chicago TDD Evidence Standard

All three gaps violate **Rank-1 (Mathematical)** and **Rank-2 (Domain Contract)** oracle requirements:

**Current violations:**
- ❌ Bellman convergence unprovable (no TD error span)
- ❌ SPC rule→action causality invisible (no rule type context)
- ❌ Circuit→reward correlation missing (no per-cycle linking)

**Post-instrumentation:**
- ✅ OTEL spans provide mathematical evidence (TD error trajectory)
- ✅ Span trace correlation proves causality (SPC → Action → Recovery → Reward)
- ✅ Time-series metrics enable statistical validation (MTBT, stability score)

---

## Notes for Implementation

1. **Frequency tuning:** RL convergence every 10 cycles balances observability (don't miss learning phase) vs. span volume (avoid overwhelming Jaeger)
2. **Action matching heuristic:** Document as domain-specific, not hard-coded truth. Subject to refinement based on real traces
3. **MTBT window:** 50 cycles = ~1-2 minute window at 10 cycles/sec; adjustable based on autonomic loop frequency
4. **baseline admissibility:** All spans are additive; no breaking changes to existing instrumentation

---

**Exit Status:** Analysis complete. Instrumentation recommendations ready for implementation phase.
