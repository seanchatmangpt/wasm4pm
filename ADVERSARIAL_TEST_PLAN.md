# Adversarial Test Plan — wasm4pm Autonomic Process Control

**Testing an RL-based autonomic loop against itself.**

## Theoretical Foundation

The RL orchestrator controls process discovery through a feedback loop: observe state → select action → apply action → receive reward → update policy. The adversarial test plan attacks this loop at every stage.

### Hostile Assumptions

- The declared manufacturing pipeline is not the real runtime process
- Stages may be skipped or repeated without detection
- Receipts may be emitted outside lawful object lifecycles
- Proof gates may pass despite non-conforming execution
- The RL policy may appear converged while the event log reveals variant explosion
- Circuit breaker may permanently deny recovery (CB-1)
- Bellman updates may be self-referential (FM-1)
- SPC may never fire consecutive-point rules (SP-1)

## Failure Mode Taxonomy

### Category A — Bellman Correctness (Oracle Rank 1)

**Target:** All 5 RL agents (QLearning, SARSA, DoubleQLearning, ExpectedSARSA, REINFORCE)

**Oracle:** Mathematical theorem — the Bellman optimality equation must hold.

| Test | Property | Method |
|------|----------|--------|
| A1 | Non-terminal update moves Q(s,a) toward target | Seeded RNG, s≠s', verify direction |
| A2 | Terminal update: target = r (no bootstrapping) | Set done=true, verify no s' contribution |
| A3 | Self-referential update (FM-1 regression) | Construct guard_pass + circuit_allowed, verify Q doesn't diverge |
| A4 | Discount factor < 1 reduces future contribution | Compare Q with γ=0.99 vs γ=0.5 |
| A5 | Learning rate controls update magnitude | Compare Q delta with α=0.01 vs α=0.5 |

### Category B — Policy Improvement (Oracle Rank 2-4)

**Target:** RL Orchestrator cycle-to-cycle improvement

**Oracle:** Domain contract — monotonically improving reward trend over N cycles.

| Test | Property | Method |
|------|----------|--------|
| B1 | Reward trend improves over 50 cycles | Multi-seed, compare first 10 vs last 10 mean |
| B2 | LinUCB converges to best agent | Track agent selection frequency over 100 cycles |
| B3 | Policy doesn't degrade under health=3 | Sustained degraded input, reward remains stable |
| B4 | Recovery from health=4 (terminal) | Force terminal state, verify recovery path |

### Category C — SPC Time-Series (Oracle Rank 1)

**Target:** Western Electric rules engine with 100-snapshot ring buffer

**Oracle:** Mathematical theorem — rules fire at exactly specified points.

| Test | Property | Method |
|------|----------|--------|
| C1 | Rule 1: 3σ violation fires at exactly that point | Construct series ending with 3σ outlier |
| C2 | Rule 2: 9 consecutive fires at exactly 9th | Construct 9-point series above mean |
| C3 | Rule 3: 6 trending fires at exactly 6th | Construct 6-point monotonic series |
| C4 | Ring buffer evicts oldest (capacity 100) | Add 101 observations, verify count=100 |
| C5 | SP-1 regression: consecutive rules work | Verify Rule 2 and 3 fire after buffer accumulation |

### Category D — Circuit Breaker State Machine (Oracle Rank 1)

**Target:** Circuit breaker Closed/Open/HalfOpen lifecycle

**Oracle:** State machine invariant — all transitions valid per spec.

| Test | Property | Method |
|------|----------|--------|
| D1 | Closed → Open on failure threshold | Trip breaker, verify state |
| D2 | Open → HalfOpen after step threshold | Advance clock, verify transition |
| D3 | HalfOpen → Closed on success | Simulate success in HalfOpen |
| D4 | HalfOpen → Open on failure | Simulate failure in HalfOpen |
| D5 | CB-1 regression: advance_clock required | Construct Open, skip advance, verify stays Open |
| D6 | Reward impact: Open vs Closed | Identical health, Open has strictly lower reward |

### Category E — Metamorphic Relations (Oracle Rank 3)

**Target:** Full pipeline (log → discovery → analysis)

**Oracle:** Input perturbation produces directional output change.

| Test | Property | Method |
|------|----------|--------|
| E1 | Larger log → more DFG edges | Compare edge count for 100 vs 1000 events |
| E2 | Higher quality algorithm → higher fitness | Compare dfg vs ilp fitness on same log |
| E3 | More activities → larger state space | Compare 3-activity vs 8-activity state count |
| E4 | TS-1 regression: timestamp gap proportional to duration | Inject known time diffs, verify duration |

### Category F — Feature Normalization (Oracle Rank 1)

**Target:** RL state encoding (8D feature vector)

**Oracle:** Mathematical theorem — all components in [0,1].

| Test | Property | Method |
|------|----------|--------|
| F1 | Zero events → normalized near 0 | Empty event stream |
| F2 | Maximum events → normalized near 1 | Saturating input |
| F3 | Negative values clamped to 0 | Inject invalid state |
| F4 | All 8 dimensions independently bounded | Test each dimension at extremes |

### Category G — Integration Behavioral (Oracle Rank 2-4)

**Target:** Full autonomic loop (observe → select → act → reward → update)

| Test | Property | Method |
|------|----------|--------|
| G1 | Full cycle completes in <100ms | Measure wall-clock time |
| G2 | 50 consecutive cycles without crash | Run loop 50 times |
| G3 | Recovery after forced degradation | Degrade, then recover |
| G4 | Multiple seeds produce consistent convergence | Run 5 seeds, compare final reward distributions |

### Category H — Mutation Adequacy (Oracle Rank 5)

**Target:** Test suite sensitivity

| Test | Property | Method |
|------|----------|--------|
| H1 | Arithmetic operator replacement kills test | Change + to - in reward, verify test fails |
| H2 | Boundary condition mutation kills test | Change > to >=, verify test fails |
| H3 | Conditional negation kills test | Negate if condition, verify test fails |

## Non-Determinism Strategy

### Seeded Determinism (Categories A, C, D, F)
```rust
let agent = QLearning::new_with_seed(lr, gamma, 42);
// Same seed → same actions, same Q-values, same outcome
```

### Statistical Convergence (Categories B, G)
```rust
// 5 seeds × 50 cycles each
// Assert: P(last_10_mean > first_10_mean) > 0.8
```

### Metamorphic (Categories E, H)
```rust
// Input perturbation → directional output change
// No absolute values, no randomness needed
```

## Adequacy Criteria

| Criterion | Threshold | Measurement |
|-----------|-----------|-------------|
| Oracle coverage | All Rank 1 covered | Category count with Rank 1 tests |
| Bug regression | FM-1, TS-1, CB-1, SP-1 | Specific regression tests exist |
| Mutation score | >80% kill rate | Mutation testing tool |
| Convergence | Reward trend significant | p < 0.05 on Mann-Kendall |
| Cycle time | <100ms per autonomic cycle | Wall-clock measurement |

## Implementation Priority

1. **P0** (Critical): Categories A, C, D, F — Rank 1 oracles, deterministic detection
2. **P1** (High): Category E — Metamorphic, no randomness, easy to implement
3. **P2** (Medium): Categories B, G — Statistical, require multi-seed infrastructure
4. **P3** (Low): Category H — Mutation testing, requires tooling setup
