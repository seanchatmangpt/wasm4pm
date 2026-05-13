# wasm4pm ML/RL Testing

**Statistical oracles, Bellman correctness, behavioral verification.**

## ML Algorithms (6 total)

| Algorithm | Input | Output | Key Metric |
|-----------|-------|--------|------------|
| `ml_classify` | Features + labels | Class assignments | Accuracy, F1 |
| `ml_cluster` | Features | Cluster assignments | Silhouette score |
| `ml_forecast` | Time series | Predicted values | MAE, RMSE, MAPE |
| `ml_anomaly` | Feature vectors | Anomaly scores | Precision, Recall |
| `ml_regress` | Features + target | Coefficients | R², MAE |
| `ml_pca` | Feature matrix | Reduced dimensions | Variance explained |

**Known behavior:** `@wasm4pm/ml` functions succeed with empty arrays. Don't assume rejection.

## Prediction Tasks (6 perspectives)

1. **Next Activity**: Top-k prediction, beam search
2. **Remaining Time**: Weibull regression, hazard rate
3. **Outcome**: Anomaly score, boundary coverage
4. **Drift**: EWMA, Jaccard window detection
5. **Features**: Prefix features, rework score
6. **Resource**: M/M/1 queue, UCB1 bandit

## RL System Testing

### 5 RL Agents

| Agent | Type | Characteristics |
|-------|------|----------------|
| `QLearning` | Off-policy TD | ε-greedy exploration |
| `SARSA` | On-policy TD | Follows policy during update |
| `DoubleQLearning` | Off-policy TD | Reduces overestimation bias |
| `ExpectedSARSA` | On-policy TD | Expected value over actions |
| `REINFORCE` | Policy gradient | Trajectory-based |

### 8D State Space (368,640 states — product of the level counts in the table below: 5×8×8×4×3×8×3×4)

| Dimension | Levels | Description |
|-----------|--------|-------------|
| `health_level` | 0-4 | Normal → Failed |
| `event_rate_q` | 0-7 | Quantized event rate |
| `activity_count_q` | 0-7 | Quantized activity count |
| `spc_alert_level` | 0-3 | SPC alert severity |
| `drift_status` | 0-2 | No/Low/High drift |
| `rework_ratio_q` | 0-7 | Quantized rework ratio |
| `circuit_state` | 0-2 | Closed/HalfOpen/Open |
| `cycle_phase` | 0-3 | Quantized cycle count |

### Reward Function

| Component | Value | Condition |
|-----------|-------|-----------|
| Health improvement | +1.0 | health decreased |
| Health stability | +0.2 | health unchanged |
| Health degradation | -1.0 | health increased |
| SPC alert penalty | -0.3 per alert | max -1.5 |
| Guard pass + circuit allowed | +0.1 | Both true |
| Guard fail or circuit blocked | -0.5 | Either false |
| Terminal state (health=4) | -2.0 | Failed |

**Reward range:** [-5.0, +1.1] (worst case: degrade -1.0 + SPC max -1.5 + guard fail -0.5 + terminal -2.0 = -5.0)

**Reward range:** [-3.5, +1.1]

### LinUCB Agent Selection

Contextual bandit that selects the best RL agent based on 8-dimensional feature vector. Uses upper confidence bound exploration-exploitation tradeoff.

### WASM Constraints
- `RefCell<HashMap>` instead of `Arc<RwLock<HashMap>>` (no threads in WASM)
- No async, single-threaded execution
- `fastrand` for WASM-compatible RNG
- No `std::time::Instant` — uses monotonic step counter

## Statistical Oracles

### Rank 1 — Mathematical Theorem
Properties that hold for any correct implementation.

**Bellman equation:** `Q*(s,a) = R(s,a) + γ max_a' Q*(s',a')`
- Verify: After update with s≠s', Q(s,a) changes in the predicted direction
- Terminal case: When done=true, target = r (no bootstrapping)

**Western Electric rules:**
- Rule 1: One point beyond 3σ → fires at exactly that point
- Rule 2: 9 consecutive points on one side of mean → fires at exactly the 9th
- Rule 3: 6 consecutive points increasing/decreasing → fires at exactly the 6th

**Feature normalization:** All 8 components must be in [0,1] for any valid input.

### Rank 2 — Domain Contract
Design-decided properties.

**Monotonic health degradation → monotonically decreasing reward.**
**Doubling SPC alerts → strictly lower reward than single alert.**
**Circuit breaker Open → strictly lower reward than Closed (identical health).**

### Rank 3 — Metamorphic Relation
Input perturbation → output relation.

**Test pattern:** Two calls with controlled perturbation, assert directional relationship. No absolute values required.

### Rank 4 — Statistical Property
Convergence trends over N trials.

**Example:** After 50 cycles with health=3, mean reward over last 10 cycles > mean reward over first 10 cycles.

## Critical Bugs to Test Against

### FM-1: `next_state == state` in Bellman Update
When `guard_pass && circuit_allowed`, the system sets `next_health_level = health_level`, making `rl_state == rl_next_state`. The Bellman update becomes self-referential.

**Detection:** Seeded RNG + construct states s≠s', verify Q(s,a) changes after update.

### TS-1: `String::len()` Timestamp Parsing
`final_analytics.rs` line 135-138 uses `String::len()` as proxy for time gaps. ISO-8601 strings have near-identical lengths regardless of actual time difference.

**Detection:** Inject timestamps with known time differences, verify duration computed in time units.

### CB-1: Circuit Breaker Step Counter
`advance_clock()` is caller-driven. If never called, Open→HalfOpen never fires.

**Detection:** Construct breaker in Open state, advance clock by threshold, assert `allow_request()` returns true.

## Non-Determinism Strategy

### Unit Tests (Categories A, C, D, F)
Inject seeded RNG at construction. Pass known seed, assert deterministic outcomes.

```rust
let mut agent = QLearning::new_with_seed(learning_rate: 0.1, discount: 0.99, seed: 42);
let result1 = agent.select_action(&state);
let result2 = agent.select_action(&state);
assert_eq!(result1, result2); // Deterministic
```

### Integration Tests (Categories E, G)
Statistical assertions with confidence bounds and multiple seeds.

```rust
// Run 50 cycles with 5 different seeds
for seed in [1, 2, 3, 4, 5] {
    let mut orch = RlOrchestrator::new_with_seed(seed);
    for _ in 0..50 {
        orch.run_cycle(...);
    }
    let first_10_avg = mean(&orch.rewards[0..10]);
    let last_10_avg = mean(&orch.rewards[40..50]);
    assert!(last_10_avg >= first_10_avg, "Policy not improving");
}
```

## GPU Testing (wgpu)

- WGSL shader validation (`gpu_wgsl_validation_test.rs`)
- Buffer correctness via conformance vectors (`gpu_conformance_vectors.rs`)
- Memory leak detection
- Performance benchmarking vs CPU
- Feature flag: `feature-gpu` (NOT for wasm32 target)
