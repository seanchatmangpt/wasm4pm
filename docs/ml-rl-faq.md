# ML & RL FAQ / Troubleshooting

Quick answers to common questions about the `@wasm4pm/ml` package, the
`wpm predict` command, and the RL orchestrator.

---

## General

### Q. Do I need to be an ML expert to use these features?
No. The CLI picks reasonable defaults and outputs human-readable summaries.
You only need to tune things if accuracy is unsatisfactory — in which case
[`ml-algorithms.md`](./ml-algorithms.md) has per-algorithm guidance.

### Q. Are the algorithms deterministic?
Yes — given the same input and seed. RL agents accept a seed via
`new_with_seed(seed: u64)`; ML algorithms are deterministic by construction
(no RNG except in `kmeans` initialisation, which uses a fixed seed by default).

### Q. What's the difference between `wpm ml` and `wpm predict`?
- `wpm ml <task>` — one-shot ML on a static log (classify, cluster, etc.).
- `wpm predict <task>` — *predictive* mining for in-flight cases
  (next-activity, remaining-time, etc.), often used in `drift-watch`/streaming.

### Q. Can these run in the browser?
Yes — the WASM build (`browser` profile, ~2.7 MB) ships every algorithm.

---

## ML

### Q. `wpm ml classify` returns accuracy ≈ 0.5 — what's wrong?
Either:
1. Classes are not predictable from the available features — run
   `wpm predict features -i log.xes` to see signal strength.
2. Class imbalance is severe — check `modelInfo.classDistribution`.
3. Too few traces — `naive_bayes` and `decision_tree` need ≥100 traces to
   stabilise.

### Q. `ml_cluster` always returns one big cluster.

> **Note:** `ml_cluster` is not yet exported to the JS API (internal only). The underlying clustering logic exists in `fast_discovery.rs` but has no `#[wasm_bindgen]` export and is not callable from JavaScript or the CLI.

If you are testing an internal build where it is exposed:
- For `kmeans`, increase `k`.
- For `dbscan`, your `eps` is too large — halve it and re-run.
- Scale features first if any feature has very different magnitude.

### Q. Why does `@wasm4pm/ml` accept empty arrays without complaining?
Intentional — the kernels are non-throwing (FAIL FAST is a TPS rule for
*pipelines*, not pure-function calls). Empty input → empty result. Your
caller decides what to do with it.

### Q. How big a log can I run?
Practical limits on a laptop:

| Algorithm     | Max events comfortably |
|---------------|------------------------|
| `ml_forecast` | 1 M (single pass)      |
| `ml_anomaly`  | 1 M                    |
| `ml_regress`  | 500 k                  |
| `ml_classify` | 100 k (excl. `knn`)    |
| `ml_cluster`  | **internal only — no JS export** |
| `ml_pca`      | 100 k                  |
| `knn`/`dbscan`| 10 k                   |

---

## RL

### Q. The orchestrator never converges.
Check, in order:

1. **Seed** — pass one for reproducible runs.
2. **Reward weights** — has `compute_reward` been customised? Re-derive.
3. **State aliasing** — too few discretisation buckets collapse distinct
   situations into the same state.
4. **Non-stationarity** — environment dynamics change faster than learning
   rate `α` can track. Lower `α` or switch to `REINFORCE`.

### Q. Circuit breaker stays Open forever.
You must call `advance_clock(threshold)` periodically — the WASM build has
no wall-clock. See `wasm4pm/src/self_healing.rs`.

### Q. Which agent should I pick?
Don't pick — let LinUCB do it. If you must hard-code:
- `QLearning` for stable, fully-observable environments.
- `DoubleQLearning` if Q-values look implausibly high.
- `REINFORCE` if your environment is highly non-stationary.

### Q. I see `next_state == state` warnings.
Symptom of bug FM-1 (see `process-mining-chicago-tdd.md`). Check
`compute_health_state` returns a *different* level when guards pass; if it
returns the same, the Bellman update is self-referential and learning stalls.

---

## Drift

### Q. Drift stays at zero even when I changed the process.
- The change might affect *attributes* (resource, timestamp), not the
  *activity distribution*. Add a second detector on the relevant axis.
- Window too large → smoothing dominates. Halve `driftWindowSize`.

### Q. Drift score oscillates around the threshold.
- The reference distribution is too narrow. Use a longer initial baseline.
- Lower λ in EWMA (more smoothing).

### Q. Multi-axis drift detection?
Run `wpm drift-watch` separately per axis (activity, resource, time) and
union the alerts.

---

## Prediction

### Q. `next-activity` predicts `END` for everything.
n-gram order is too high for the data — drop from 4 to 3 (or 2).

### Q. `remaining-time` MAE is enormous.
- The Weibull regressor needs *completed* traces — make sure your log has
  enough closed cases.
- Heavy-tailed durations? Switch to `ml_regress` with
  `exponential_regression`.

### Q. `outcome` predictions are biased toward the majority class.
Class imbalance. Either:
- Down-sample the majority class before training, or
- Use `ml_classify --method decision_tree` which is less biased.

---

## Performance

### Q. WASM build is slow.
Expected — WASM is 1.2–1.6× slower than native Node. For >1 M events use the
native Rust binary directly.

### Q. Memory grows over long `drift-watch` sessions.
The streaming buffer is bounded, but OTEL spans are queued. Make sure the
exporter is configured (`WASM4PM_OTEL_ENABLED=true`,
`WASM4PM_OTEL_ENDPOINT=…`); otherwise spans accumulate.

---

## Where to file bugs

GitHub Issues — include:
- `wasm4pm --version`
- `wpm doctor` output
- A minimal XES log that reproduces.
