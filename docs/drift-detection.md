# Drift Detection Guide

Concept drift is the silent killer of process-mining models — yesterday's model
no longer fits today's behaviour. pictl provides a streaming drift detector
based on **EWMA smoothing** over a **windowed Jaccard-distance** series.

This guide covers the underlying theory, the public API, configuration and
tuning, performance characteristics, and a set of example scenarios.

> Source of truth: `wasm4pm/src/prediction_drift.rs`. Native unit tests:
> `wasm4pm/tests/prediction_drift_oracles.rs`. TS contract tests:
> `packages/kernel/__tests__/drift.test.ts`. Benchmarks:
> `wasm4pm/benches/drift_bench.rs`.

---

## 1. How it works

```
                  ┌───────────────┐
   event stream → │ window buffer │ → activity set Aₜ
                  └───────────────┘
                         │
                         ▼
                  ┌───────────────┐
                  │ Jaccard(Aₜ,Aₜ₋₁)│   sliding pairwise comparison
                  └───────────────┘
                         │
                         ▼   d_t  (∈ [0,1])
                  ┌───────────────┐
                  │ EWMA smoothing│   α ≈ 0.3 by default
                  └───────────────┘
                         │
                         ▼  s_t
                  ┌────────────────┐
                  │ threshold test │  alert if  s_t > τ
                  └────────────────┘
```

| Stage      | Symbol | Role                                                      |
|------------|--------|-----------------------------------------------------------|
| Window     | `Aₜ`   | Activity set of the most recent `window_size` traces.     |
| Distance   | `dₜ`   | Jaccard distance between consecutive windows: `1 − |A∩B|/|A∪B|`. |
| Smoothing  | `sₜ`   | EWMA of `d`: `s_t = α d_t + (1−α) s_{t−1}`.               |
| Alert      | `τ`    | Alert threshold; default `0.3`.                           |

### Jaccard distance

For finite sets `A`, `B`:

```
J(A, B) = |A ∩ B| / |A ∪ B|        ← similarity
d(A, B) = 1 − J(A, B)              ← distance, in [0, 1]
```

`d(∅, ∅) = 0` by convention (no activities, then still no activities, is
"no change"). `d` is a true metric: identity, symmetry, and the triangle
inequality all hold (verified in `prediction_drift_oracles.rs`).

### EWMA

Exponentially Weighted Moving Average:

```
s[0]   = x[0]
s[i+1] = α · x[i+1] + (1 − α) · s[i]              α ∈ (0, 1]
```

Higher `α` ⇒ more weight on recent samples (less smoothing).
Lower `α` ⇒ heavier smoothing, slower response to genuine drift.

Convergence: for any constant tail `x[i] = c (i ≥ k)`, `s[i] → c`
geometrically with rate `(1 − α)`.

The `compute_ewma` export clamps `α` into `(0, 1]` defensively (a value of
`0` is mapped to `f64::MIN_POSITIVE`, values `> 1` are mapped to `1`, and
`NaN` is treated as `1`).

---

## 2. Public API

### Rust / WASM

```rust
// wasm4pm/src/prediction_drift.rs

#[wasm_bindgen]
pub fn detect_drift(
    log_handle: &str,
    activity_key: &str,
    window_size: usize,    // clamped to >= 1
) -> Result<JsValue, JsValue>;

#[wasm_bindgen]
pub fn compute_ewma(
    values_json: &str,     // JSON array of numbers
    alpha: f64,            // clamped into (0, 1]
) -> Result<JsValue, JsValue>;
```

`detect_drift` JSON response:

```json
{
  "drifts_detected": 2,
  "drifts": [
    { "position": 10, "distance": 0.45, "type": "concept_drift" }
  ],
  "window_size": 5,
  "method": "jaccard_window",
  "threshold": 0.3
}
```

`compute_ewma` JSON response:

```json
{
  "smoothed":   [1.0, 1.3, 1.96, ...],
  "trend":      "rising",          // "rising" | "falling" | "stable"
  "last_value": 1.96,              // null on empty input
  "alpha":      0.3
}
```

Pure-Rust helpers (also `pub`, for native testing):

```rust
pub fn jaccard_distance(a: &HashSet<String>, b: &HashSet<String>) -> f64;
pub fn ewma_series(values: &[f64], alpha: f64) -> Vec<f64>;
pub fn classify_trend(smoothed: &[f64]) -> &'static str;

pub const DEFAULT_DRIFT_THRESHOLD: f64 = 0.3;
pub const TREND_STABILITY_FRACTION: f64 = 0.05;
```

### TypeScript / CLI

```bash
# One-shot drift report
wpm predict drift -i log.xes

# Streaming watcher
wpm drift-watch -i live.xes \
    --window 50 \
    --interval 5000 \
    --alpha 0.3 \
    --threshold 0.3 \
    --activity-key concept:name \
    [--json] [--enhanced]
```

`drift-watch` flags:

| Flag             | Default        | Meaning                                          |
|------------------|----------------|--------------------------------------------------|
| `--input, -i`    | *(required)*   | XES file to monitor.                             |
| `--window, -w`   | `50`           | Sliding window size in traces.                   |
| `--interval, -n` | `5000` ms      | Poll interval.                                   |
| `--alpha`        | `0.3`          | EWMA smoothing factor.                           |
| `--threshold`    | `0.3`          | EWMA-distance value above which to alert.        |
| `--activity-key` | `concept:name` | Event-attribute holding the activity name.       |
| `--json`         | off            | Newline-delimited JSON instead of human output.  |
| `--enhanced`     | off            | Add ML peak-detection on the drift series.       |

---

## 3. Tuning guide

### Choosing `window_size`

| `window_size`       | Behaviour                                | When to use                  |
|---------------------|------------------------------------------|------------------------------|
| Small (5–20 traces) | Fast reaction, more noise                | High-velocity logs           |
| Medium (50–100)     | Balanced — the default range             | Most operational dashboards  |
| Large (200+)        | Smooth, slow to react                    | Low-velocity logs, batch ETL |

A `window_size` of `0` is silently treated as `1`.

### Choosing `α`

| α    | Behaviour                                 | When to use                        |
|------|-------------------------------------------|------------------------------------|
| 0.1  | Very smooth, very slow to react           | Very noisy logs                    |
| 0.3  | Balanced — the default                    | Most workloads                     |
| 0.6  | Reactive, prone to brief false positives  | Compliance / regulated flows       |
| 1.0  | No smoothing (identity-with-lag)          | Diagnostic / debugging only        |

### Choosing the alert threshold τ

| τ      | Behaviour                              | When to use                  |
|--------|----------------------------------------|------------------------------|
| `0.10` | Very sensitive — many alerts           | Compliance / regulated flows |
| `0.30` | Default — balanced                     | Most operational dashboards  |
| `0.50` | Conservative — only major drifts       | Noisy logs, exploratory      |

Empirical recipe: replay a known-stable period; pick τ at ≈ `1.5 × max(s_t)`
observed over that period.

The alert rule is a strict greater-than: `alert ⇔ s_t > τ`. Equality does
not fire.

---

## 4. Interpreting drift signals

| Pattern                                     | Likely cause                          |
|---------------------------------------------|---------------------------------------|
| Sudden jump from baseline                   | Process change, new release           |
| Gradual ramp (`trend = rising`)             | Seasonal effect or onboarding cohort  |
| Oscillation around threshold                | Noisy reference; widen window or α↓   |
| Single-window spike, then quiet             | Outlier batch; ignore                 |
| Persistent high drift after re-baselining   | Genuine stable shift — update model   |

The `trend` field of `compute_ewma` is a coarse classifier:

- `rising`   ⇒ last sample exceeds first by ≥ 5 % of the larger magnitude.
- `falling`  ⇒ first exceeds last by the same margin.
- `stable`   ⇒ all other cases (including series shorter than 2 samples).

---

## 5. Example scenarios

### A — Software release drifts the support process

A new chatbot is deployed; ticket categories shift. Drift score climbs from
`0.05` to `0.31` over five windows and stays there. The team re-baselines and
re-runs discovery; the new DFG includes a `Bot-Triage` activity that wasn't
present a week earlier.

### B — End-of-quarter throughput spike

Sales-order volume triples for two days. Activity *distribution* is unchanged,
so drift stays low (correctly) — the throughput forecaster, not the drift
detector, surfaces the volume change.

### C — Sensor outage

Resource attribute disappears for six hours. Drift on the *activity* axis is
zero, but if you also watch the `org:resource` axis it spikes immediately.
Configure two parallel detectors (one per attribute).

### D — Single spike vs sustained drift

```
distances = [0.0, 0.0, 0.0, 0.9, 0.0, 0.0, 0.0, 0.0]
ewma α=0.1 → s_n ≈ 0.075   ⇒ no alert  (correctly absorbed as noise)

distances = [0.0, 0.05, 0.45, 0.5, 0.55, 0.6, 0.62, 0.6]
ewma α=0.4 → s_n ≈ 0.55    ⇒ alert     (sustained drift confirmed)
```

This pattern is verified end-to-end in `packages/kernel/__tests__/drift.test.ts`.

---

## 6. Performance

Measured with `cargo bench --bench drift_bench` on Apple Silicon (`--quick`
mode; numbers are wall-clock medians):

### EWMA throughput (`ewma_series`)

| Series length | Time      | Throughput        |
|---------------|-----------|-------------------|
| 16            | ~37 ns    | ~430 Melem/s      |
| 256           | ~840 ns   | ~305 Melem/s      |
| 4 096         | ~10.8 µs  | ~380 Melem/s      |
| 65 536        | ~197 µs   | ~330 Melem/s      |

### Jaccard distance (`jaccard_distance`, ~50 % overlap)

| Set size | Time      | Throughput        |
|----------|-----------|-------------------|
| 8        | ~240 ns   | ~33 Melem/s       |
| 64       | ~1.79 µs  | ~36 Melem/s       |
| 512      | ~22.3 µs  | ~23 Melem/s       |
| 4 096    | ~177 µs   | ~23 Melem/s       |

### End-to-end (`detect_drift`, synthetic logs)

| Cases   | Total events | Time      |
|---------|--------------|-----------|
| 100     | ~1 000       | ~360 µs   |
| 1 000   | ~15 000      | ~5.9 ms   |
| 10 000  | ~150 000     | ~69 ms    |

Sub-second processing for logs up to ~100 K events; linear in event count for
fixed `window_size`.

---

## 7. Verification

| Layer                | File                                                   | Tests |
|----------------------|--------------------------------------------------------|-------|
| Rust unit            | `wasm4pm/src/prediction_drift.rs::tests`               | 15    |
| Rust integration     | `wasm4pm/tests/prediction_drift_oracles.rs`            | 13    |
| Rust behavioural     | `wasm4pm/tests/behavioral_drift_tests.rs`              | (preexisting) |
| TS contract          | `packages/kernel/__tests__/drift.test.ts`              | 23    |
| Criterion benchmarks | `wasm4pm/benches/drift_bench.rs`                       | 3 groups |

Oracles are explicitly Rank-1 (mathematical theorems: metric properties,
EWMA recurrence and convergence) plus Rank-3 metamorphic relations
(monotonicity under controlled perturbation).

---

## See also

- [`explanation/concept-drift-detection.md`](./explanation/concept-drift-detection.md)
- [`how-to/monitor-drift.md`](./how-to/monitor-drift.md)
- `apps/wasm4pm/src/commands/drift-watch.ts` — streaming CLI implementation
- `apps/wasm4pm/src/commands/drift.ts` — one-shot CLI implementation
