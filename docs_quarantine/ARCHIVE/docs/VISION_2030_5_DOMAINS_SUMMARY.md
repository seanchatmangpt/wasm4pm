# Vision 2030: 5 Domains × Objectives/Changes/Verification Matrix

**Quick Reference for Architects and Developers**

---

## Executive Summary

Vision 2030 organizes autonomous process mining into 5 orthogonal domains, each with clear objectives, architectural changes, and verification criteria. This matrix provides a bird's-eye view of how each domain contributes to the MAPE-K loop.

---

## Domain Matrix

### Domain 1: Process Mining (wasm4pm Algorithms)

| Aspect | Details |
|--------|---------|
| **Problem** | Human selection of discovery algorithm (DFG vs Genetic) is a bottleneck; no real-time adaptation to log changes |
| **Objectives** | (1) Discover models autonomously; (2) measure fitness/precision; (3) detect drift; (4) recalculate on-demand |
| **Architectural Changes** | MAPE-K loop selects algorithm based on RL policy; SPC feedback drives scale/fallback decisions; results auto-saved with receipt hashes |
| **Key Decisions** | Which algorithm? (5 options: DFG, Heuristic, Alpha++, Genetic, ILP); When to upgrade/downgrade? (health transition + SPC alerts) |
| **Quality Metrics** | Fitness ≥ 0.85, Precision ≥ 0.90, Generalization balanced, Simplicity (element count) minimized |
| **Verification Methods** | (1) Chicago TDD: every test asserts conformance; (2) OTEL spans: every kernel.run tagged; (3) Weaver schema check |
| **Failure Mode** | Algorithm times out or produces zero-fitness model → fallback to DFG, emit circuit-breaker event |
| **Testing Categories** | Conformance (A6–A9), integration (G1–G3), determinism (seeded RNG), parity (explain == plan) |
| **Dependencies** | SPC system (for Rule 3 drift detection), Circuit Breaker (for timeout protection), RL system (for algorithm selection) |

---

### Domain 2: Reinforcement Learning (Policy Improvement)

| Aspect | Details |
|--------|---------|
| **Problem** | No principled algorithm selection; humans hardcode best-guess policies; policies don't adapt to changing log distributions |
| **Objectives** | (1) Learn which RL agent (QL/SARSA/DQ/ES/RF) works best; (2) optimize action selection (C/S/R/F/Rr); (3) adapt exploration rate |
| **Architectural Changes** | 5 RL agents run in parallel, LinUCB bandit recommends best; Q-tables persisted across sessions; reward signal derived from health + SPC |
| **Key Decisions** | Which agent? (5 options via LinUCB); How to explore? (ε-greedy, decay 0.995/cycle); When to exploit? (ε_min = 0.01) |
| **Quality Metrics** | Policy improvement (mean reward last-10-cycles > first-10), convergence time (<500 cycles), Q-table divergence bounded |
| **Verification Methods** | (1) Bellman correctness: Q(s,a) changes predictably after update; (2) Statistical oracle: convergence trend analysis; (3) Determinism: seeded RNG |
| **Failure Mode** | Q-table explodes (unbounded reward) or collapses (all actions = 0) → reset epsilon to 1.0, clear transient state |
| **Testing Categories** | Bellman correctness (A1–A3), policy improvement (B1–B3), convergence (E1–E3), determinism (F1–F3) |
| **Dependencies** | RL Orchestrator (holds 5 agents), LinUCB (agent selection), Reward Function (health + SPC signal) |

---

### Domain 3: Statistical Process Control (SPC)

| Aspect | Details |
|--------|---------|
| **Problem** | No automated detection of process drift or instability; humans manually inspect trends; SPC rules are domain-specific, not general |
| **Objectives** | (1) Detect special causes (outliers, trends, shifts); (2) alert on instability; (3) drive circuit breaker decisions; (4) measure stability thresholds |
| **Architectural Changes** | Ring buffer (100 snapshots) enables 6-point trend detection (Western Electric Rule 3); SPC alert fires reward penalty (-0.3); circuit opens on alert_level ≥ 2 |
| **Key Decisions** | Which rule? (Rule 1: 1pt >3σ, Rule 2: 9 consecutive on side, Rule 3: 6 consecutive trend); When to alert? (threshold = rule fired) |
| **Quality Metrics** | Rule 3 fires at exactly 6th point, false positive rate <5%, alert lag <1 cycle, ring buffer capacity = 100 |
| **Verification Methods** | (1) Mathematical oracle: Rule 3 fires at exact point; (2) time-series analysis: verify timestamp parsing (not string length); (3) integration: confirm alert → reward penalty |
| **Failure Mode** | Ring buffer overflows (100 → 101) or old entries not evicted → drop oldest, emit warning, continue |
| **Testing Categories** | Rule correctness (C1–C4), ring buffer integrity (C5–C7), integration with circuit (D1–D3) |
| **Dependencies** | Perception system (feeds DFG metrics), Circuit Breaker (acts on alerts), RL system (penalizes reward) |

---

### Domain 4: Autonomic Protection (Circuit Breaker + Guards)

| Aspect | Details |
|--------|---------|
| **Problem** | No cascade failure isolation; transient failures cause repeated retries that exhaust resources; permanent failures are not distinguished from transient |
| **Objectives** | (1) Isolate failures quickly; (2) prevent retry storms; (3) enable gradual recovery; (4) guard against invalid operation sequences |
| **Architectural Changes** | Circuit breaker FSM (Closed → Open → HalfOpen → Closed); Guard Rule 3 blocks execution if SPC alert_level ≥ 2; explicit timeout on all blocking ops |
| **Key Decisions** | When to open? (3 consecutive failures); When to probe? (timeout = 1s); When to close? (probe succeeds); When to block? (guard_pass = false) |
| **Quality Metrics** | State transitions occur as scheduled (within 100ms), guard blocking accuracy = 100%, recovery lag <1s, no false positives |
| **Verification Methods** | (1) FSM model checking: transitions follow declared model; (2) guard validation: when guard_pass = false, action blocked; (3) chaos testing: inject failures, verify isolation |
| **Failure Mode** | Circuit breaker stuck in Open (clock never advances) → explicit advance_clock() call; probe always fails → escalate to operator |
| **Testing Categories** | State machine (D1–D4), guard validation (D5–D7), integration (E1–E3), chaos (G1–G3) |
| **Dependencies** | SPC system (fires Rule 3 → triggers guard), RL system (computes reward penalty for guard failure), Timeout mechanism (triggers fallback) |

---

### Domain 5: Persistent State & Recovery

| Aspect | Details |
|--------|---------|
| **Problem** | RL learning lost on CLI restart; no audit trail of decisions; state recovery requires manual intervention; distributed replay impossible |
| **Objectives** | (1) Survive restarts without losing RL progress; (2) persist decision audit trail; (3) enable deterministic replay; (4) support multi-session learning |
| **Architectural Changes** | State serialized to `.wasm4pm/state/rl_orchestrator.json` after each cycle; Q-tables exported/restored; SPC ring buffer persisted; telemetry includes cycle_count, cumulative_reward |
| **Key Decisions** | What to persist? (telemetry, Q-tables, SPC rings, circuit state); When to save? (after every cycle); Where? (.wasm4pm/state/); How? (JSON + serde) |
| **Quality Metrics** | Restore fidelity = 100% (loaded ≡ saved), continuity = monotonic cycle_count, file size <10MB (10K cycles), restore time <100ms |
| **Verification Methods** | (1) Deterministic comparison: loaded state === saved state; (2) continuity: cycle_count increments; (3) bounds: file size <10MB |
| **Failure Mode** | Restore file corrupted (malformed JSON) → warn user, start fresh; restore fails → fallback to new orchestrator, log warning |
| **Testing Categories** | Serialization (H1–H3), restore accuracy (H4–H6), continuity (H7–H9), bounds (H10–H11) |
| **Dependencies** | RL Orchestrator (all state comes from here), File system (save/restore), Engine state machine (checkpoints after cycles) |

---

## Cross-Domain Dependencies

```
┌─────────────────────────────────────────────────────────────────┐
│                    Vision 2030 Architecture                      │
└─────────────────────────────────────────────────────────────────┘

Domain 1: Process Mining
    ▲
    │ (algorithm selection)
    │
Domain 2: RL System
    │ (reward signal from health + SPC)
    ├──────────┬──────────┬──────────┐
    │          │          │          │
    ▼          ▼          ▼          ▼
Domain 3:  Domain 4:   Domain 5:  (implicit)
   SPC      Circuit      State
            Breaker    Persistence
    │          │          │
    └──────────┼──────────┘
               │
               ▼
         Domain 1 (again)
         (feeds back to algorithm
          selection via reward)
```

**Key Flows:**

1. **Algorithm Selection Flow:** Domain 1 ← Domain 2 (RL picks algorithm)
2. **Feedback Loop:** Domain 1 (results) → Domain 3 (SPC detects drift) → Domain 4 (circuit opens) → Domain 2 (reward penalty) → Domain 1 (fall back to simpler algorithm)
3. **Persistence Flow:** Every cycle produces Domain 5 (save state) → enables Domain 2 (restore Q-tables on restart)
4. **Protection Flow:** Domain 3 (SPC alert) → Domain 4 (guard blocks execution) → Domain 2 (reward penalty)

---

## Verification Checklist (Pre-Merge)

### Domain 1: Process Mining
- [ ] Chicago TDD: conformance test passes (fitness ≥ 0.85)
- [ ] OTEL span emitted: `kernel.run` with algorithm, fitness, precision
- [ ] Weaver schema check: span attributes conform to semconv
- [ ] Determinism: same input + same seed → identical output (BLAKE3 hash)

### Domain 2: RL System
- [ ] Bellman correctness: Q(s,a) changes predictably (Rank-1 oracle)
- [ ] Policy improvement: mean reward last-10-cycles > first-10 (statistical oracle)
- [ ] Convergence: epsilon decays as expected (0.995/cycle, bounded ≥ 0.01)
- [ ] Determinism: seeded RNG produces identical action sequences

### Domain 3: SPC System
- [ ] Western Electric Rule 3: fires at exactly 6th consecutive point (mathematical oracle)
- [ ] Ring buffer: capacity = 100, drops oldest on overflow
- [ ] Alert level: incremented on rule fire, bounded [0,3]
- [ ] Timestamp parsing: duration computed in time units (not string length)

### Domain 4: Circuit Breaker + Guards
- [ ] State transitions: Closed → Open (3 failures), Open → HalfOpen (timeout), HalfOpen → Closed (success)
- [ ] Guard blocking: when guard_pass = false, action blocked (reward -0.5)
- [ ] Guard Rule 3: blocks when SPC alert_level ≥ 2
- [ ] Timeout protection: explicit timeout on all blocking operations

### Domain 5: Persistent State
- [ ] Serialization: state file created after every cycle
- [ ] Restore fidelity: loaded state === saved state (bit-exact)
- [ ] Continuity: cycle_count increments monotonically across restarts
- [ ] Bounds: state file size <10MB even after 10K cycles

---

## Test Coverage by Domain

| Domain | Unit Tests | Integration Tests | Chaos Tests | Total |
|--------|------------|-------------------|-------------|-------|
| **Process Mining (1)** | 15 | 12 | 3 | 30 |
| **RL System (2)** | 18 | 15 | 5 | 38 |
| **SPC (3)** | 12 | 8 | 4 | 24 |
| **Circuit Breaker (4)** | 10 | 8 | 6 | 24 |
| **Persistence (5)** | 8 | 6 | 2 | 16 |
| **Integration (Cross-domain)** | 0 | 18 | 8 | 26 |
| **Total** | 63 | 67 | 28 | 158 |

**Coverage targets:**
- Unit tests: ≥70% line coverage per domain
- Integration tests: ≥80% behavior coverage (MAPE-K phases)
- Chaos tests: ≥5 failure modes injected per domain

---

## Conclusion

The 5 domains of Vision 2030 form a coherent whole:

1. **Process Mining** discovers models autonomously
2. **RL System** learns which algorithm works best
3. **SPC** detects when processes go out of control
4. **Circuit Breaker** prevents cascade failures
5. **Persistence** ensures learning survives restarts

Together, they enable machines to operate process mining systems without human intervention, with full observability and provable correctness guarantees.

