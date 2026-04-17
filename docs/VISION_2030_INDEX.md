# Vision 2030 Documentation Index

**Enterprise Autonomy Through Process Mining**

---

## Core Architecture Documents

### 1. VISION_2030_ARCHITECTURE.md (652 lines)
**What:** Complete MAPE-K autonomic loop specification with ASCII diagrams  
**For:** Architects, RL engineers, system designers  
**Contains:**
- MAPE-K 5-phase loop ASCII diagram with feedback cycle
- Phase 1 (Perception): 8D feature extraction, health state computation, SPC sampling
- Phase 2 (Decision): 5 RL agents, action selection (Continue/Scale/Retry/Fallback/Restart), LinUCB bandit
- Phase 3 (Protection): Guard Rule 3 validation, circuit breaker FSM, SPC alert penalties
- Phase 4 (Optimization): Reward function, Bellman updates, Q-table persistence, LinUCB updates
- Phase 5 (Execution): Action dispatch, state serialization, OTEL instrumentation
- Data flow diagram (Log → State → Action → Results)
- Key metrics: cycle latency (~34ns theoretical, 10-500ms practical), state space (460,800), reward bounds ([-5.3, +1.1])
- Implementation references to source files

**Key Insight:** All five phases execute as one indivisible operation, with feedback from SPC and guards driving reward signals that improve RL policy over time.

---

### 2. VISION_2030_5_DOMAINS_SUMMARY.md (196 lines)
**What:** Quick-reference matrix of 5 domains with objectives/changes/verification  
**For:** Team leads, reviewers, integration engineers  
**Contains:**
- Domain 1 (Process Mining): Algorithm selection, fitness checking, drift detection
- Domain 2 (RL System): Agent learning, Q-table persistence, policy improvement
- Domain 3 (SPC): Western Electric rules, ring buffer, alert thresholds
- Domain 4 (Circuit Breaker + Guards): FSM, failure isolation, recovery
- Domain 5 (Persistence): State serialization, restore fidelity, continuity
- Cross-domain dependencies (algorithm selection → RL → SPC → circuit breaker → state save)
- Verification checklist (18 items per domain)
- Test coverage matrix (158 total tests across 6 categories)

**Key Insight:** 5 orthogonal domains that fit together to form a complete autonomic system. Each domain has clear success criteria and failure modes.

---

## Related Documentation

### In This Directory

- `vision-2030-hyperthesis.md` (80KB) — 7-pillar foundational theory (Chatman Equation, Signal Theory, External Verifiability, Knowledge Hooks, Closed Claw Constitution, KGC 4D, HDIT)
- `THESIS-V2.md` (78KB) — Operational autonomy thesis with RL formulations
- `pictl-phd-thesis.md` (49KB) — Benchmarks and algorithmic complexity analysis
- `API.md` (38KB) — Complete WASM API reference (70+ functions)
- `DEPLOYMENT.md` (11KB) — Feature flags, deployment profiles (browser/iot/edge/fog/cloud)

### In Project Root

- `.claude/CLAUDE.md` — Project-level CLAUDE.md with pictl versioning, testing layers, feature flags
- `.claude/rules/ml-rl-testing.md` — Statistical oracles (Rank 1-5), Bellman correctness tests
- `.claude/rules/chicago-tdd.md` — Van der Aalst methodology, adversarial test categories A-H
- `.claude/rules/critical-constraints.md` — MTTR <1s, TPS compliance, WASM constraints

---

## Quick Navigation

### For Architects
1. Start: `VISION_2030_ARCHITECTURE.md` § Overview
2. Dive: § MAPE-K 5-Phase Loop (diagram + phases 1-5)
3. Deep: `VISION_2030_5_DOMAINS_SUMMARY.md` § Domain Matrix
4. Foundation: `vision-2030-hyperthesis.md` § Part II (The Seven Pillars)

### For RL Engineers
1. Start: `VISION_2030_ARCHITECTURE.md` § Phase 2 (Decision) + Phase 4 (Optimization)
2. Theory: `THESIS-V2.md` § RL Formulations (Q-Learning, SARSA, Policy Gradient)
3. Testing: `.claude/rules/ml-rl-testing.md` § Statistical Oracles + Adversarial Plan
4. Implementation: `wasm4pm/src/rl_orchestrator.rs`, `reinforcement.rs`, `ml.rs` (LinUCB)

### For SPC / Process Experts
1. Start: `VISION_2030_ARCHITECTURE.md` § Phase 3 (Protection)
2. Details: `VISION_2030_5_DOMAINS_SUMMARY.md` § Domain 3 (SPC)
3. Implementation: `wasm4pm/src/spc.rs`, `spc_history.rs`
4. Testing: `.claude/rules/chicago-tdd.md` § Category C (SPC Time-Series)

### For DevOps / Deployment
1. Start: `VISION_2030_5_DOMAINS_SUMMARY.md` § Domain 5 (Persistence)
2. Details: `VISION_2030_ARCHITECTURE.md` § Phase 5 (Execution) + Data Flow
3. Deployment: `DEPLOYMENT.md` (feature flags, profile selection)
4. Build: `.claude/CLAUDE.md` § Build Commands

---

## Key Diagrams

### MAPE-K Loop
- **Location:** `VISION_2030_ARCHITECTURE.md` § ASCII Diagram
- **Shows:** All 5 phases with feedback from Knowledge Base (RL state, SPC history, Q-tables)
- **Action types:** Continue, Scale, Retry, Fallback, Restart

### Data Flow
- **Location:** `VISION_2030_ARCHITECTURE.md` § Data Flow section
- **Shows:** Log → Perception → RlState → Decision → Action → Execution → Results
- **Feedback:** Results → Knowledge Base → next cycle

### Cross-Domain Dependencies
- **Location:** `VISION_2030_5_DOMAINS_SUMMARY.md` § Cross-Domain Dependencies
- **Shows:** Process Mining ← RL System → SPC → Circuit Breaker → Persistence → Process Mining (cycle)

### State Space
- **Location:** `VISION_2030_ARCHITECTURE.md` § Phase 1 (Perception)
- **Dimensions:** 5 × 8 × 8 × 4 × 3 × 8 × 3 × 4 = 460,800 states
- **Practical coverage:** 5-15% after 1000 cycles

---

## Key Metrics

| Metric | Value | Source |
|--------|-------|--------|
| **Cycle Latency** | ~34ns (theoretical), 10-500ms (practical) | VISION_2030_ARCHITECTURE.md § Key Metrics |
| **MTTR** | <1 second | .claude/CLAUDE.md § MTTR Requirements |
| **State Space** | 460,800 reachable states | VISION_2030_ARCHITECTURE.md § Phase 1 |
| **Reward Bounds** | [-5.3, +1.1] | VISION_2030_ARCHITECTURE.md § Phase 4 |
| **Fitness Threshold** | ≥0.85 (van der Aalst) | VISION_2030_5_DOMAINS_SUMMARY.md § Domain 1 |
| **Test Coverage** | 158 tests (63 unit, 67 integration, 28 chaos) | VISION_2030_5_DOMAINS_SUMMARY.md § Test Coverage |
| **Learning Convergence** | 50-500 cycles | VISION_2030_ARCHITECTURE.md § Key Metrics |

---

## Verification Standards

### Chicago TDD (Process Mining)
- **Rule:** Every test must assert conformance via event log analysis
- **Reference:** `.claude/rules/chicago-tdd.md`
- **Implementation:** `packages/testing/src/harness/` (parity, determinism, CLI harness)

### Van der Aalst Soundness (Algorithms)
- **Rule:** Algorithm output must prove deadlock-free, liveness-guaranteed execution
- **Reference:** `.claude/rules/wvda-soundness.md`
- **Implementation:** Fitness ≥ 0.85, Precision ≥ 0.90, temporal conformance

### OTEL Instrumentation (Observability)
- **Rule:** 100% of operations must emit OTEL spans with status field
- **Reference:** `.claude/rules/verification.md`
- **Implementation:** `packages/observability/src/instrumentation.ts`

### Bellman Correctness (RL)
- **Rule:** Q(s,a) must change predictably after update with s ≠ s'
- **Reference:** `.claude/rules/ml-rl-testing.md` § Rank 1 — Mathematical Theorem
- **Implementation:** Seeded RNG tests verify bit-exact reproducibility

---

## Contributing to Vision 2030

### Before Modifying a Domain

1. **Read the domain spec** in `VISION_2030_5_DOMAINS_SUMMARY.md`
2. **Understand objectives and failure modes** — what should NOT happen
3. **Identify verification method** — which oracle validates the change
4. **Write test first** (Chicago TDD) — RED phase before implementation

### Checklist for Merges

- [ ] Chicago TDD: Failing test exists, then passes with implementation
- [ ] OTEL: All operations emit spans with status field
- [ ] Weaver: Schema conformance check passes (`weaver registry check -r ./semconv/model`)
- [ ] Determinism: Seeded RNG produces identical results
- [ ] Domain verification: Matches checklist in `VISION_2030_5_DOMAINS_SUMMARY.md`

### Common Patterns

**Adding an RL Agent:**
1. Implement `Agent` trait in `wasm4pm/src/reinforcement.rs`
2. Add variant to `AgentType` enum in `rl_orchestrator.rs`
3. Register in `RlOrchestrator::select_action()` and `update()`
4. Add tests: Bellman correctness (Category A) + policy improvement (Category B)

**Extending SPC:**
1. Implement new Western Electric rule in `wasm4pm/src/spc.rs`
2. Add to ring buffer detection in `spc_history.rs`
3. Wire alert level to reward penalty in `rl_orchestrator.rs::compute_reward()`
4. Test: rule fires at exact threshold (Category C)

**Adding Persistent State:**
1. Add field to `CycleTelemetry` struct
2. Implement `serde::Serialize` + `Deserialize`
3. Add save/restore in `rl_orchestrator.rs`
4. Test: restore fidelity + continuity (Category H)

---

## FAQ

**Q: How do the 5 phases execute in parallel vs sequentially?**  
A: All 5 phases execute sequentially in a tight loop (Perception → Decision → Protection → Optimization → Execution → repeat). No parallelism — each phase depends on the previous one's output.

**Q: What happens when the circuit breaker opens?**  
A: Execution phase checks `circuit_allowed`. If false, action is skipped, reward penalty applied (-0.5), and circuit remains open until timeout (default ~1s) then transitions to HalfOpen.

**Q: Can RL state be restored across different CLI commands?**  
A: Yes. `.pictl/state/rl_orchestrator.json` persists Q-tables, telemetry, and circuit state. When pictl starts, it auto-loads the state (unless `--no-restore` flag is passed).

**Q: What's the difference between "Guard Rule 3" and the SPC "Rule 3"?**  
A: Guard Rule 3 is a guard that *blocks* execution if SPC Rule 3 fires (6-point trend detected). SPC Rule 3 is the Western Electric rule that detects the trend. Guard uses SPC as input.

**Q: How does LinUCB select which RL agent to use?**  
A: LinUCB maintains a confidence bound estimate for each of the 5 agents. Given the current 8D feature vector, it selects the agent with the highest upper confidence bound. After cycle completion, it updates that agent's estimate with the reward received.

---

## Document Versions

| Document | Version | Last Updated | Author |
|----------|---------|--------------|--------|
| VISION_2030_ARCHITECTURE.md | v1.0 | 2026-04-16 | Claude Code |
| VISION_2030_5_DOMAINS_SUMMARY.md | v1.0 | 2026-04-16 | Claude Code |
| vision-2030-hyperthesis.md | v26.4.10 | 2026-04-10 | Sean Chatman |
| THESIS-V2.md | v26.4.10 | 2026-04-13 | Sean Chatman |

---

## How to Use This Index

1. **New to Vision 2030?** Start with § Quick Navigation → For Architects
2. **Working on a specific domain?** Go to § Key Navigation → your role
3. **Implementing a feature?** Check § Contributing to Vision 2030 → Common Patterns
4. **Debugging an issue?** Find the domain in § VISION_2030_5_DOMAINS_SUMMARY.md § Failure Mode
5. **Need a quick fact?** Consult § Key Metrics

