# Autonomic Healing (AutoInstincts) Observability Audit — Complete Analysis

**Date:** 2026-05-18  
**Status:** ✅ RESEARCH COMPLETE — 3 critical observability gaps identified and analyzed (no code changes)  
**Requested By:** User audit request on autonomic healing observability  
**Scope:** RL convergence visibility, SPC rule classification, circuit breaker causality correlation  
**Chicago TDD Compliance:** All 3 gaps violate Rank-1 or Rank-2 oracle requirements

---

## Executive Summary

Comprehensive audit of autonomic healing observability across three critical subsystems identified **3 critical gaps** where OTEL instrumentation is incomplete or missing, blocking mathematical proof of the autonomic healing system's correctness per chicago-tdd.md doctrine.

**Key Finding:** Current instrumentation can prove *that* the system transitioned states, but **cannot prove causality** between SPC alerts → RL actions → health improvements due to fragmented span contexts.

---

## Gap OBS-1: RL Convergence Invisible (CRITICAL)

### Location
`wasm4pm/src/rl_orchestrator.rs:779-850` (`rl.run_cycle` span emission)

### Issue
The main per-cycle span lacks TD error, Q-value statistics, weight update magnitudes, and learning rate—the five key metrics required to prove RL convergence per the Bellman equation theorem (Rank-1 oracle).

### Root Cause
Convergence metrics ARE computed elsewhere:
- `rl.linucb_update()` (lines 668-678) DOES emit `linucb_td_error`, `linucb_weight_delta`, `linucb_convergence_signal`, `learning_rate_current`
- BUT these emit in a separate SPAN every cycle, not in the main `rl.run_cycle` span
- Auditors must correlate two separate span contexts to reconstruct convergence trajectory
- No single span provides "RL learning status" snapshot per cycle

### Example Code (Current)
```rust
// wasm4pm/src/rl_orchestrator.rs:779-850
let _cycle_span = tracing::info_span!(
    "rl.run_cycle",
    health_before = state.health_level,
    health_after = next_state.health_level,
    agent = self.telemetry.active_agent_name.as_str(),
    agent_id = self.telemetry.active_agent_name.as_str(),
    spc_alerts = spc_alert_count,
    service_name = "wpm",
    status = "ok",
).entered();
```

**Missing attributes:**
- `td_error` (f32) — Bellman residual, should trend → 0
- `q_value_max` (f32) — current max Q-value for state
- `q_value_change` (f32) — magnitude of Q-value update this cycle
- `linucb_weight_delta` (f32) — L2 norm change per agent
- `learning_rate_current` (f32) — current exploration/exploitation α_t
- `convergence_status` (string) — "learning" | "converged"

### Severity: CRITICAL

**Chicago TDD Violation:** Blocks Rank-1 mathematical oracle (Bellman convergence theorem)
- Theorem: `|δ_t| = |r + γ max_a' Q(s',a') - Q(s,a)| → 0` as cycles increase
- Current proof: None — no TD error trajectory visible to auditor
- Test risk: Code could report "reward increased" but auditor has no independent proof agent is learning vs. just getting lucky rewards

**FM-5 Risk:** Tests can claim "RL learned" without proving TD error convergence. Self-referential: derive expected from reward, test reward.

### Example Failing Trace
```
Cycle 100: health=3, reward=0.2 (reported in rl.run_cycle span)
Cycle 101: health=2, reward=0.5 (health improved!)
Cycle 102: health=1, reward=0.8 (continuing to improve!)
Claimed: "RL learning is working"
Auditor's view: No TD error, no Q-value trends, no proof learning occurred
Jaeger query cannot answer: "Is convergence happening?"
```

### Instrumentation Required
Emit TD error + Q-value + weight norm statistics in main `rl.run_cycle` span every cycle:

```rust
let td_error = reward - old_q + gamma * next_max_q;
let q_change = (new_q - old_q).abs();

tracing::info_span!(
    "rl.run_cycle",
    health_before = state.health_level,
    health_after = next_state.health_level,
    agent = self.telemetry.active_agent_name.as_str(),
    // NEW: Convergence metrics
    td_error = td_error,
    td_error_magnitude = td_error.abs(),
    q_value_max = max_q,
    q_value_change = q_change,
    learning_rate = self.learning_rate_schedule(cycle_count),
    convergence_status = if td_error.abs() > 0.1 { "learning" } else { "converged" },
    service_name = "wpm",
    status = "ok",
)
```

---

## Gap OBS-2: SPC Rule Type Lost in Quantization (HIGH)

### Location (Part A: SPC Span Emission)
`wasm4pm/src/lib.rs:1251-1363` (Western Electric rule detection spans)

### Location (Part B: RL State Construction)
`wasm4pm/src/lib.rs:1622` (SPC → RL state quantization)

### Issue (Part A)
SPC Western Electric rule violations are detected and emitted in OTEL spans, but the rule type is **NOT classified** as an explicit string. Instead:
- `cause = ?c` emits the SpecialCause enum (Debug format): `"Outlier { z_score: 3.5 }"`
- Auditors must pattern-match enum Debug output to extract rule type
- z_score and rule metadata are NOT span attributes (buried in Debug string)

### Root Cause (Part A)
```rust
// wasm4pm/src/lib.rs:1256-1264
let causes = spc::check_western_electric_rules(&chart_data);
for c in &causes {
    tracing::warn!(
        target: "autonomic.spc",
        kind = "event_rate",
        cause = ?c,  // ← SpecialCause enum, Debug formatted only
        service_name = "wpm",
        status = "error",
        "Western Electric rule violation"
    );
}
```

**Missing attributes:**
- `rule_violated` (string): "rule_1_outlier" | "rule_2_shift" | "rule_3_trend" | "rule_4_two_of_three"
- `rule_number` (u8): 1, 2, 3, or 4
- `z_score` (f64): numeric quantification (e.g., 3.58 for outlier)
- `consecutive_points` (u32): for Rule 2/3 (e.g., 9 points for Rule 2)
- `trend_length` (u32): for Rule 3 monotonic sequence

### Issue (Part B)
RL state construction quantizes the entire SPC context into a single scalar:
```rust
// wasm4pm/src/lib.rs:1622
let spc_alert_level = (all_special_causes.len() as f32 / 10.0).min(1.0);
// Quantizes to [0-3]: spc_alert_level = Self::quantize_spc_alerts(normalized_alerts)
```

This collapses **rule type information**:
- Rule 1 fires (outlier, single event) → `spc_alert_count = 1` → `spc_alert_level = 0`
- Rule 2 fires (shift, 9 consecutive points) → `spc_alert_count = 1` → `spc_alert_level = 0`
- RL agent cannot distinguish which rule fired; receives identical quantized state
- Optimal RL action for outlier (Retry/Scale) ≠ optimal for trend (Scale/Restart)
- Agent learns "average best action" across all rule types (suboptimal convergence)

### Severity: HIGH

**Chicago TDD Violation:** Blocks Rank-2 domain contract
- Contract: "Rule type → RL action type" mapping must be observable
- Current proof: None — rule type not in RL state features
- Risk: RL cannot learn rule-specific recovery policies; policy lock-in on suboptimal generalization

**FM-5 Risk:** Tests see "reward increased when alert fired" without proving the action was optimal for that rule type.

### Example Failing Trace
```
Cycle 240: SPC detects Rule 2 shift (9 consecutive event_rate readings above CL)
          SPC span: cause = ?SpecialCause::Shift { direction: Above, count: 9 }
          (no rule_violated attribute)
          RL state: spc_alert_level = 0 (identical to Rule 1 outlier)
          RL agent selects: action = "Continue" (wrong for shift; should be "Scale")

Cycle 241: SPC alert still fires (continue wasn't effective)
          Reward = -0.3 (penalty for SPC violation still active)
          RL sees: reward decreased, agent takes different action
          
Auditor's view: Cannot correlate "Rule 2 shift → Scale action" because:
  1. Rule type not in RL span (rule_violated missing)
  2. RL state doesn't encode rule type (spc_alert_level is count only)
  3. Action selection not visible to auditor
  
Jaeger query fails: "Which actions work best for Rule 2 vs Rule 3?"
```

### Instrumentation Required

**Part A: Classify SPC rules in span emission**
```rust
// Pattern match SpecialCause enum to explicit rule string
for c in &causes {
    let (rule_violated, rule_metadata) = match c {
        SpecialCause::Outlier { z_score } => (
            "rule_1_outlier",
            json!({ "z_score": z_score, "rule_number": 1 })
        ),
        SpecialCause::Shift { direction, count } => (
            "rule_2_shift",
            json!({ "direction": ?direction, "consecutive_points": count, "rule_number": 2 })
        ),
        SpecialCause::Trend { length } => (
            "rule_3_trend",
            json!({ "monotonic_sequence_length": length, "rule_number": 3 })
        ),
        SpecialCause::TwoOfThree { count } => (
            "rule_4_two_of_three",
            json!({ "consecutive_count": count, "rule_number": 4 })
        ),
    };
    
    tracing::warn!(
        rule_violated = rule_violated,
        rule_number = rule_metadata["rule_number"],
        metric_value = metric_current,
        control_limit_mean = chart_mean,
        control_limit_stddev = chart_stddev,
        z_score = rule_metadata.get("z_score"),
        consecutive_points = rule_metadata.get("consecutive_points"),
        // ... other metadata ...
        "Western Electric rule violation"
    );
}
```

**Part B: Preserve rule type in RL state (optional enhancement)**
Add per-rule-type quantization to state features, or emit separate span correlating rule type → RL action.

---

## Gap OBS-3: Circuit Breaker → Health Correlation Opaque (HIGH)

### Location (Part A: Circuit Decision Span)
`wasm4pm/src/self_healing.rs:346-393` (`circuit_breaker.allow_request` span)

### Location (Part B: RL Cycle Missing Linkage)
`wasm4pm/src/lib.rs:1671-1679` (RL health update after action execution)

### Issue (Part A)
Circuit breaker span emits state transitions and timeout logic, but **lacks linkage to health outcomes**:

```rust
// wasm4pm/src/self_healing.rs:347-357
let span = span!(
    Level::DEBUG,
    "circuit_breaker.allow_request",
    current_state = ?self.state,
    failure_count = self.failure_count,
    success_count = self.success_count,
    service_name = "wpm",
    status = if self.state as u8 != CircuitState::Open as u8 { "ok" } else { "error" },
    circuit.purpose = "healing_guard",
    circuit.role = "autonomous_recovery"
);
```

**Missing attributes:**
- `health_level_when_allowed` (u8) — health at time of request approval
- `health_delta_if_allowed` (i8) — predicted health change if allowed vs. blocked
- `action_could_execute` (bool) — was the healing action actually executed?
- `rl_reward_delta_after_block_recovery` (f32) — reward delta correlating to circuit recovery event

### Issue (Part B)
Circuit decision and RL health change are in **separate span contexts** (separate cycles):

```
Cycle 220:
  circuit_breaker.allow_request: state=Closed → Open (failure threshold exceeded)
  rl.run_cycle: health_before=2, health_after=3 (degraded, circuit blocking)

Cycles 221-249:
  Circuit remains Open, blocking all requests

Cycle 250:
  circuit_breaker.allow_request: state=Open → HalfOpen → Closed (timeout probe succeeded)
  (No explicit reward change signal here)

Cycle 251:
  rl.run_cycle: health_before=3, health_after=2 (recovered!)
  (But no span attribute correlating recovery to circuit change)
```

**Missing correlation:** No span bridge from "circuit allowed recovery" → "health improved" → "reward increased"

### Severity: HIGH

**Chicago TDD Violation:** Blocks Rank-2 domain contract and Rank-3 metamorphic oracle
- Contract: Circuit block duration correlates to health degradation
- Metamorphic: Circuit allowed → health should improve (input perturbation → output relation)
- Current proof: None — circuit and health change spans are isolated in time

**FM-5 Risk:** Tests see "health improved after circuit recovered" without proving the circuit decision caused it (could be random variance).

### Example Failing Trace
```
Cycle 200: health=2, circuit=Closed (normal state)
Cycle 201-204: SPC fires 4 times, RL selects actions (various)
Cycle 205: 
  failure_count reaches threshold
  circuit.allow_request() returns false (transition to Open)
  RL cannot execute healing action
  rl.run_cycle: health_before=2, health_after=3 (degraded, circuit blocked)

Cycles 206-234: 
  Circuit remains Open (blocking all requests)
  RL cycles run but guard_pass=false (circuit_allowed prevents execution)
  Health stays at 3 (terminal: no further degradation)

Cycle 235:
  Circuit timeout (60000ms) expires
  circuit.allow_request() allows probe (state=Open → HalfOpen)
  Probe request succeeds (guard_pass=true)
  Circuit transitions HalfOpen → Closed
  
Cycle 236:
  rl.run_cycle: health_before=3, health_after=2 (recovered!)
  reward = 0.3 (recovery signal)

Auditor's view: "Health improved" but cannot verify causality:
  1. Circuit span (cycle 235) has no health_delta_if_allowed attribute
  2. RL span (cycle 236) has no circuit_state_change context
  3. No timestamp correlation between circuit.allow_request and health change
  4. Could be coincidence: health recovered despite circuit, not because of it

Jaeger query fails:
  "Does circuit recovery directly cause health improvement?"
  "What's the MTBT (mean time between transitions) until health improves?"
  "Does blocking for 30 cycles always degrade health by X points?"
```

### Instrumentation Required

**Part A: Link circuit decision to health outcomes**
```rust
// wasm4pm/src/self_healing.rs: capture health state before/after circuit decision

let health_before_decision = compute_current_health();
let allow = self.allow_request();
let health_after_decision = compute_current_health();

let span = span!(
    Level::DEBUG,
    "circuit_breaker.allow_request",
    current_state = ?self.state,
    failure_count = self.failure_count,
    success_count = self.success_count,
    service_name = "wpm",
    status = if allow { "ok" } else { "error" },
    // NEW: Health linkage
    health_level_when_allowed = if allow { health_after_decision } else { null },
    health_delta = (health_after_decision as i8 - health_before_decision as i8),
    action_could_execute = allow, // Predicts if RL action can run
    service_name = "wpm",
);
```

**Part B: Emit recovery correlation span**
When circuit transitions from Open → HalfOpen → Closed, emit span with reward signal:

```rust
// In run_cycle(), after circuit decision and RL action execution:
if circuit_state_changed && circuit_allowed {
    let recovery_reward = /* compute reward for successful recovery */;
    tracing::info!(
        event = "circuit_breaker_recovery",
        cycles_blocked = cycles_in_open_state,
        health_recovered = health_after - health_during_block,
        rl_reward_delta = recovery_reward,
        circuit_state_transition = format!("{:?} -> {:?}", old_state, new_state),
        service_name = "wpm",
        status = "ok",
        "Circuit breaker recovery completed"
    );
}
```

---

## Compliance Matrix: Chicago TDD Oracles

| Gap | Violated Oracle | Rank | Proof Type | Current State |
|-----|-----------------|------|-----------|----------------|
| OBS-1 | Bellman convergence | Rank-1 (Mathematical) | TD error trajectory missing | ❌ PROOF BLOCKED |
| OBS-2 | SPC rule → action mapping | Rank-2 (Domain contract) | Rule type not in state/span | ❌ PROOF BLOCKED |
| OBS-3 | Circuit → health causality | Rank-2 (Domain contract) + Rank-3 (Metamorphic) | Spans isolated, no correlation | ❌ PROOF BLOCKED |

**Chicago TDD Doctrine Violated:** "If the code says it worked but the event log cannot prove a lawful process happened, then it did not work."

Currently:
- Code transitions states ✓
- Event log has isolated events ✓
- **Event log cannot prove causality between SPC → RL action → health improvement** ✗

---

## FM-5 Self-Referential Testing Risk Summary

| Gap | FM-5 Risk | Example Violation |
|-----|-----------|-------------------|
| OBS-1 | Derive expected TD error from code, test the code | Test claims "reward increased therefore RL learning" without TD error proof |
| OBS-2 | Derive action from rule type in code, test the code | Test claims "action matched rule" using same logic that selected it |
| OBS-3 | Derive recovery from state change, test the code | Test claims "circuit recovery improved health" using same state transition logic |

All three risks are **critical for deployment**: tests will pass even if autonomic healing is fundamentally broken (rewards could be random, actions suboptimal, circuit recovery ineffective).

---

## Integration Roadmap (Future Implementation)

### Phase 1 (Immediate — Week 1)
- [ ] Emit TD error + Q-value stats in `rl.run_cycle` span (OBS-1)
- [ ] Classify SPC rule type as explicit string in span attributes (OBS-2 Part A)

### Phase 2 (Next — Week 2)
- [ ] Link circuit decision to health outcomes in span (OBS-3)
- [ ] Emit circuit recovery correlation span (OBS-3)

### Phase 3 (Polish — Week 3)
- [ ] Add rule type to RL state features (OBS-2 Part B)
- [ ] Implement Jaeger query patterns for causality validation

---

## Key References

- **Chicago TDD:** `.claude/rules/chicago-tdd.md` (Van der Aalst process mining validation)
- **Critical Constraints:** `.claude/rules/critical-constraints.md` (OTEL coverage requirements)
- **RL Testing:** `.claude/rules/ml-rl-testing.md` (statistical oracles, Bellman correctness)
- **Verification Protocol:** `.claude/rules/verification.md` (three-layer evidence requirement)
- **OTEL Patterns:** `.claude/rules/_OTEL_INSTRUMENTATION_GAPS_REPORT.md` (gap analysis details)

---

## Notes

1. **No code changes made** per user request ("Do NOT write code — research only")
2. **All findings are research-backed** with file:line references and example failing traces
3. **Implementation is ready** pending code changes in Phase 1-3
4. **Audit is independent** of concurrent AutoML gap auditor work

---

**Exit Status:** ✅ RESEARCH COMPLETE — Ready for implementation planning and Phase 1 code changes.

