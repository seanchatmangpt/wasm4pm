# ML & RL FAQ

Common questions about ML algorithms, RL system, and prediction tasks.

---

## ML Algorithms

### Q: Which ML algorithm should I use?

**A:** Depends on your goal:

- **Predicting labels** (e.g., approved/rejected) → `classify`
- **Finding groups** (e.g., customer segments) → `cluster`
- **Predicting numbers** (e.g., duration) → `regress`
- **Looking for outliers** (e.g., fraud detection) → `anomaly`
- **Too many features** (e.g., 50+) → `pca` first, then classify/regress
- **Predicting capacity** (e.g., event rate) → `forecast`

See [`docs/tutorials/tutorial-ml-selection.md`](../tutorials/tutorial-ml-selection.md) for a decision tree.

---

### Q: How many features should I have?

**A:** Depends on trace count:

| Traces | Feature count range |
|--------|-------------------|
| <100 | 5-10 (avoid overfitting) |
| 100-1K | 10-30 |
| 1K-10K | 30-80 |
| 10K+ | Can go higher, but prefer <100 |

**Rule:** Fewer features are usually better. If accuracy is poor with 50 features, try PCA first to reduce to 5-10, then retrain.

---

### Q: What does "holdout fraction" mean?

**A:** In classification/regression:
- `holdoutFraction: 0.2` = Use 80% for training, 20% for testing
- Typical: 0.1-0.3 (smaller logs benefit from larger holdout)
- Higher holdout = more rigorous testing, but less training data

---

### Q: How do I interpret R² score?

**A:** Regression quality metric:
- `R² = 1.0` → Perfect predictions (unlikely)
- `R² > 0.7` → Strong model (duration is predictable)
- `R² 0.3-0.7` → Moderate (some signal, but noisy)
- `R² < 0.3` → Weak (other factors not in features)

**If R² is low:** Either add better features, or the process duration truly depends on unmeasurable factors.

---

### Q: What if all predictions are the same class?

**A:** Classifier degenerated (saw only one class in training data).

**Fixes:**
1. Check if data is imbalanced (90% approve, 10% reject)
2. If imbalanced, use stratified sampling or class weights
3. Try a different method (e.g., `decision_tree` instead of `naive_bayes`)
4. Ensure holdoutFraction is small enough to capture both classes

---

### Q: Can I use the same log twice (train and test)?

**A:** Not recommended. Always split train/test.

**Why:** Model appears accurate on training data, but may not generalize.

**Do this instead:**
```typescript
const result = await classifyTraces(matrix, {
  method: 'naive_bayes',
  holdoutFraction: 0.2,  // Auto-splits for you
});
```

---

### Q: What if I have categorical features (activity names)?

**A:** `buildFeatureMatrix` auto-encodes them:
- Activity names → one-hot encoding (activity_Approve=1 or 0)
- Result has both numeric and one-hot columns
- All ready for ML algorithms

---

### Q: How do I extract feature importance?

**A:** After classification, check `modelInfo`:

```typescript
const result = await classifyTraces(matrix, { method: 'decision_tree' });
console.log(result.modelInfo.importances);  // Top features
```

**Note:** Not all methods expose importances. Decision tree and random forest do; naive Bayes doesn't.

---

### Q: My clustering has `noiseCount > 0`. What does that mean?

**A:** Some traces are far from any cluster center.

**Interpretation:**
- DBSCAN marks outliers as noise
- K-means assigns everything, so `noiseCount` is always 0
- If noise is >10%, log may have true outliers; investigate

---

### Q: How do I handle missing data in features?

**A:** Currently, `buildFeatureMatrix` assumes complete data.

**Workarounds:**
1. Pre-process log to remove incomplete traces
2. Impute missing values (e.g., fill with mean)
3. Report the issue; we may add imputation in future versions

---

## RL System

### Q: What is the RL system for?

**A:** Autonomous process health management. It learns which actions (Continue, Scale, Retry, Fallback, Restart) best improve process health.

**Think of it as:** An invisible operator that watches your process and makes smart decisions to keep it healthy.

---

### Q: What are the 5 RL agents?

**A:**

| Agent | Type | Best for |
|-------|------|----------|
| Q-Learning | Off-policy | General purpose; fastest convergence |
| SARSA | On-policy | Conservative; avoids risky moves |
| Double Q-Learning | Off-policy | Avoids overestimation bias |
| Expected SARSA | On-policy | Smoother than SARSA |
| REINFORCE | Policy gradient | When you have policy constraints |

**Default:** LinUCB contextual bandit automatically selects best agent per cycle.

---

### Q: How do I know if the RL system is converging?

**A:** Compare mean reward over time:

```typescript
const first10 = rewards.slice(0, 10).reduce((a, b) => a + b) / 10;
const last10 = rewards.slice(-10).reduce((a, b) => a + b) / 10;
const improved = last10 > first10;

console.log(`Converged? ${improved ? 'YES' : 'NO'}`);
```

**If `improved = true`:** Policy is learning. Run more cycles.
**If `improved = false`:** System may have hit local optimum or telemetry is poor.

---

### Q: What should I pass to `run_cycle()`?

**A:** A JSON string with 8 telemetry fields:

```typescript
{
  "event_count": 1000,           // Total events in log
  "trace_count": 50,             // Completed cases
  "unique_activities": 8,        // Distinct activity names
  "spc_alerts": 1,               // Western Electric rule hits (0-5)
  "drift_status": 0,             // 0=none, 1=low, 2=high
  "rework_ratio": 0.05,          // 0.0-1.0
  "guard_pass": true,            // Validation passed?
  "circuit_allowed": true        // Circuit breaker allows?
}
```

**Where to get each field:**
- `event_count`: `log.length`
- `trace_count`: Count distinct case IDs
- `unique_activities`: `new Set(activities).size`
- `spc_alerts`: Run Western Electric rules on recent metrics
- `drift_status`: Use drift detector (or hardcode for testing)
- `rework_ratio`: (repeated activities) / (total)
- `guard_pass`: Do all business rules pass?
- `circuit_allowed`: Is circuit breaker closed?

---

### Q: What reward range should I expect?

**A:** -2.0 (worst) to +1.1 (best).

**Typical ranges:**
- `+1.0 to +1.1` — Excellent (health improving, no alerts)
- `+0.2 to +0.5` — Good (stable, minor issues)
- `-0.5 to +0.2` — Mixed signals
- `-1.0 to -0.5` — Poor (health degrading)
- `< -1.0` — Very bad (terminal state)

---

### Q: How many cycles do I need to run?

**A:** Minimum 50, ideally 100+.

**Why:** RL needs time to explore actions and learn.
- 10-20 cycles: Policy still random
- 50 cycles: Detects patterns
- 100+ cycles: Convergence visible

---

### Q: What's the difference between health and reward?

**A:**
- **Health** (0-4): Current state (Normal, Warning, Degraded, Critical, Failed)
- **Reward** (-2.0 to +1.1): Feedback signal from last cycle

**Example:**
```
Cycle 1: health=1 (Warning), reward=+0.3 (stable warning state)
Cycle 2: health=0 (Normal), reward=+1.0 (improved!)
```

---

### Q: Can I force a specific agent?

**A:** Not in the public API. LinUCB always selects best agent.

**To test a specific agent:** Use Rust directly (research only).

---

### Q: What if all actions are 'Continue'?

**A:** Agent is conservative (still learning or no clear benefit to other actions).

**Likely causes:**
1. Telemetry is all green (no problems detected)
2. System needs more cycles to learn
3. Other actions have no observed benefit

**Fix:** Inject more realistic telemetry or run more cycles.

---

### Q: How does the circuit breaker work?

**A:** Prevents cascading failures:
- After 3 failed operations → State = Open (reject new requests)
- After timeout → State = HalfOpen (probe with 1 request)
- If probe succeeds → State = Closed (normal)
- If probe fails → State = Open again

**In RL:** Circuit state is part of observation; agent learns when to respect breaker.

---

## Prediction Tasks

### Q: Which prediction task should I use?

**A:**

| Task | Question | When to use |
|------|----------|------------|
| `next-activity` | What happens next? | Routing, alert systems |
| `remaining-time` | How long until done? | SLA protection, scheduling |
| `outcome` | Success or failure? | Escalation, approvals |
| `drift` | Behavior changed? | Model retraining triggers |
| `features` | What predicts outcome? | Diagnosis, improvement |
| `resource` | Who handles next? | Workload balancing |

---

### Q: Why is my next-activity prediction always the same?

**A:** Log is too linear (same sequence every time).

**Check:**
```bash
wpm compare dfg,alpha_plus_plus -i log.xes
```

If DFG is simple (few edges), log has limited variability. Prediction will be boring.

---

### Q: What ngram order should I use?

**A:** Depends on log size:

| Log size | Order |
|----------|-------|
| <100 traces | 2 |
| 100-1K | 3 |
| 1K-10K | 4 |
| 10K+ | 5 |

**Too low:** Overgeneralizes (high prob on many activities).
**Too high:** Overfits (exact match unlikely).

---

### Q: How accurate is remaining-time prediction?

**A:** Typically ±10-30% of actual duration.

**Depends on:**
- Log variance (homogeneous → narrow bounds)
- Prefix length (longer prefix → more accurate)
- External factors (not in log) that affect duration

---

### Q: What does drift threshold mean?

**A:** Alert if drift score > threshold.

**Typical:**
- `0.2` (strict) — Detects subtle changes
- `0.3` (balanced) — Default; catches real drift
- `0.4` (lenient) — Only major changes

---

### Q: How does the `features` task work?

**A:** Computes feature importance via mutual information.

**Output:** Ranking of which features best predict the outcome.

**Use:** First step in diagnosis: "What drives approval/rejection?"

---

### Q: Can I predict for a specific case?

**A:** Yes, for some tasks:

```typescript
const prediction = await predictRemainingTime(handle, {
  caseId: 'case_123',  // Specific case
});

const nextAct = await predictNextActivity(handle, {
  prefix: ['A', 'B', 'C'],  // Activities seen so far
});
```

---

## Drift Detection

### Q: What is concept drift?

**A:** Process behavior changes over time.

**Examples:**
- New regulation → activity ordering changes
- Staffing change → processing time increases
- System upgrade → some activities disappear

---

### Q: How do I tune drift detection?

**A:** Three parameters:

| Parameter | Interpretation | Typical |
|-----------|-----------------|---------|
| `window_size` | # traces per window | 50-200 |
| `alpha` | EWMA smoothing (0.1-1.0) | 0.3 |
| `threshold` | Alert if score > this | 0.3 |

**Quick tuning:**
1. Start with defaults
2. If too many false alarms → increase threshold to 0.4
3. If missing real drift → decrease threshold to 0.2
4. If too sluggish → increase alpha to 0.5

---

### Q: What's the difference between alpha and threshold?

**A:**
- **alpha** (0.1-1.0): How much you weight recent vs. historical drift
  - Low (0.1) = smooth, slow response
  - High (1.0) = responsive to recent changes
- **threshold** (0.0-1.0): When to raise an alert
  - Low (0.2) = sensitive, many alerts
  - High (0.4) = conservative, fewer alerts

---

### Q: Can drift be negative (improving)?

**A:** No. Drift score is always 0-1 (change magnitude).

**To detect improvement:** Track specific metrics (e.g., cycle time) separately.

---

## Troubleshooting

### Q: Model gives NaN or Infinity

**A:** Common causes:
- Empty log or feature matrix
- Division by zero (all traces identical)
- Numerical overflow in exponential model

**Fix:**
1. Validate log: `wpm validate -i log.xes`
2. Check feature matrix shape: ensure >0 rows and columns
3. Try different model method (e.g., linear instead of exponential)

---

### Q: Out of memory on large logs

**A:** WASM runs in limited memory.

**Solutions:**
1. Use faster profile: `WASM4PM_PROFILE=fast`
2. Reduce feature count (via PCA)
3. Sample log (analyze subset first)
4. Process on server with more memory

---

### Q: Performance is slow

**A:**
- **Classification slow?** → Try `naive_bayes` instead of `decision_tree`
- **Clustering slow?** → Reduce `k` or use `kmeans` instead of `dbscan`
- **Forecasting slow?** → Use `linear` instead of `exponential`

---

### Q: Results are non-deterministic

**A:** RL system uses RNG. Make it deterministic:

```typescript
const orch = new wasm.RlOrchestrator(42n);  // Seed for determinism
```

ML algorithms are deterministic by default; if not, check for randomness in feature matrix.

---

## Next Steps

- **ML Deep Dive:** [`docs/ml-complete.md`](../ml-complete.md)
- **RL Deep Dive:** [`docs/rl-complete.md`](../rl-complete.md)
- **Prediction Tuning:** [`docs/prediction-complete.md`](../prediction-complete.md)
- **Examples:** [`examples/`](../../examples/)

---

**Still have questions?** Open an issue on GitHub or check the relevant guide.
