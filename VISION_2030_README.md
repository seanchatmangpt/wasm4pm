# Vision 2030 Architecture Documentation

**Autonomous Process Mining Through MAPE-K Autonomic Loops**

This directory contains complete architectural documentation for Vision 2030, pictl's autonomous process mining system. Start here.

---

## Three Core Documents

### 1. [VISION_2030_ARCHITECTURE.md](docs/VISION_2030_ARCHITECTURE.md) — The System Design
**Read this first if:** You want to understand how the system works end-to-end.

- **MAPE-K ASCII Diagram** with feedback loop
- **5 Phases in detail:** Perception (8D features) → Decision (RL agents) → Protection (guards) → Optimization (reward) → Execution (dispatch)
- **Key Metrics:** Cycle latency (~34ns theoretical, 10-500ms practical), state space (460,800), reward bounds ([-5.3, +1.1])
- **Data Flow Diagram:** Log → RlState → Action → Results → persistent state
- **Implementation references** to all source files

**Best for:** System architects, RL engineers, anyone designing new features.

### 2. [VISION_2030_5_DOMAINS_SUMMARY.md](docs/VISION_2030_5_DOMAINS_SUMMARY.md) — The Roadmap
**Read this if:** You want a quick reference or need to understand how domains fit together.

- **5 × 3 Matrix:** Process Mining × RL × SPC × Circuit Breaker × Persistence
- **Each domain:** Objectives, architectural changes, verification methods, failure modes
- **Cross-domain dependencies** diagram (how algorithm selection feeds back to RL reward)
- **Verification checklist:** 20 items (4 per domain)
- **Test coverage matrix:** 158 tests organized by type

**Best for:** Team leads, code reviewers, integration engineers, pre-merge checklists.

### 3. [VISION_2030_INDEX.md](docs/VISION_2030_INDEX.md) — The Navigation
**Read this if:** You're new to Vision 2030 or need to find something specific.

- **Quick navigation by role:** Architects, RL engineers, SPC experts, DevOps
- **FAQ** (11 questions)
- **Common patterns** for adding agents, extending SPC, persistence
- **Document version history**
- **Cross-references** to related documentation

**Best for:** First-time readers, contributors, anyone seeking a specific topic.

---

## Quick Facts

### MAPE-K Loop (One Cycle)
```
Perception (features from log) 
    ↓
Decision (RL agent picks action)
    ↓
Protection (guard rules block if needed)
    ↓
Optimization (compute reward, update Q-table)
    ↓
Execution (run algorithm, save state)
    ↓
[feedback → next cycle]
```

### 5 Domains
1. **Process Mining:** Algorithm selection, fitness checking, drift detection
2. **RL System:** 5 agents, Q-tables, policy improvement (continues across restarts)
3. **SPC:** Western Electric rules, ring buffer, drives circuit breaker
4. **Circuit Breaker:** Fault isolation, graceful degradation, recovery
5. **Persistence:** State saved to `.pictl/state/`, restored on restart

### Key Numbers
- **State space:** 460,800 reachable states (8 dimensions)
- **RL agents:** 5 (QLearning, SARSA, DoubleQLearning, ExpectedSARSA, REINFORCE)
- **LinUCB bandit:** Selects best agent per cycle
- **Reward range:** [-5.3, +1.1]
- **Tests:** 158 total (63 unit, 67 integration, 28 chaos)
- **MTTR:** <1 second

---

## By Role

### Architects
1. Read: `VISION_2030_ARCHITECTURE.md` (§ Overview + §§ Phases 1-5)
2. Reference: `VISION_2030_5_DOMAINS_SUMMARY.md` (§ Domain Matrix)
3. Deep dive: `docs/vision-2030-hyperthesis.md` (foundation theory)

### RL Engineers
1. Focus: `VISION_2030_ARCHITECTURE.md` (§ Phase 2 Decision + § Phase 4 Optimization)
2. Study: `docs/THESIS-V2.md` (RL math)
3. Test: `.claude/rules/ml-rl-testing.md` (statistical oracles)
4. Code: `wasm4pm/src/rl_orchestrator.rs`, `reinforcement.rs`

### SPC / Process Mining Experts
1. Focus: `VISION_2030_ARCHITECTURE.md` (§ Phase 3 Protection)
2. Reference: `VISION_2030_5_DOMAINS_SUMMARY.md` (§ Domain 3 SPC)
3. Code: `wasm4pm/src/spc.rs`, `spc_history.rs`

### DevOps / Integration
1. Start: `VISION_2030_5_DOMAINS_SUMMARY.md` (§ Domain 5 Persistence)
2. Details: `VISION_2030_ARCHITECTURE.md` (§ Phase 5 Execution)
3. Deploy: `docs/DEPLOYMENT.md` (feature flags)

---

## Related Documentation

In `docs/`:
- `vision-2030-hyperthesis.md` — 7-pillar foundation (Chatman Equation, Signal Theory, Closed Claw Constitution)
- `THESIS-V2.md` — Operational autonomy formulation
- `pictl-phd-thesis.md` — Benchmarks and complexity analysis
- `API.md` — WASM API reference (70+ functions)

In `.claude/`:
- `CLAUDE.md` — Project config, versioning, testing layers
- `rules/ml-rl-testing.md` — Statistical oracles (Rank 1-5), adversarial test plan
- `rules/chicago-tdd.md` — Van der Aalst methodology, test categories A-H
- `rules/critical-constraints.md` — MTTR, TPS, WASM constraints

---

## Pre-Merge Checklist

Before merging any change to a Vision 2030 domain:

- [ ] Chicago TDD: Test written first (RED), passes (GREEN), code refactored
- [ ] OTEL: Every operation emits span with status="ok"|"error"
- [ ] Weaver: `weaver registry check -r ./semconv/model` exits 0
- [ ] Determinism: Same input + same seed = identical output (BLAKE3 hash)
- [ ] Domain verification: Matches checklist in `VISION_2030_5_DOMAINS_SUMMARY.md`

---

## Filing Issues / Contributing

When opening an issue or PR:

1. **Identify the domain:** Process Mining (1), RL (2), SPC (3), Circuit Breaker (4), or Persistence (5)
2. **Check failure modes** in `VISION_2030_5_DOMAINS_SUMMARY.md` for that domain
3. **Propose verification method** (which oracle validates the fix?)
4. **Reference test category** from `.claude/rules/chicago-tdd.md` (A-H)

---

## Quick Links

| What | Where |
|------|-------|
| MAPE-K diagram | VISION_2030_ARCHITECTURE.md § ASCII Diagram |
| Reward function | VISION_2030_ARCHITECTURE.md § Phase 4 |
| Circuit breaker FSM | VISION_2030_ARCHITECTURE.md § Phase 3 |
| Test coverage | VISION_2030_5_DOMAINS_SUMMARY.md § Test Coverage |
| Failure modes | VISION_2030_5_DOMAINS_SUMMARY.md § Domain X: Failure Mode |
| Adding an RL agent | VISION_2030_INDEX.md § Common Patterns |
| SPC rules | VISION_2030_ARCHITECTURE.md § Phase 1 (Perception) |
| Persistent state | VISION_2030_ARCHITECTURE.md § Phase 5 (Execution) |

---

## Version

| Document | Version | Date |
|----------|---------|------|
| VISION_2030_ARCHITECTURE.md | 1.0 | 2026-04-16 |
| VISION_2030_5_DOMAINS_SUMMARY.md | 1.0 | 2026-04-16 |
| VISION_2030_INDEX.md | 1.0 | 2026-04-16 |

---

**Start with one of the three core documents above. They have everything you need.**
