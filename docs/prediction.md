# Prediction Tasks Guide

`wpm predict <task>` runs *predictive* process mining — answering questions
about what is *about to happen* in a running case.

Six perspectives are supported, each addressing a distinct managerial question.

---

## Task overview

| Task              | Question answered                              | Output                          |
|-------------------|------------------------------------------------|---------------------------------|
| `next-activity`   | What is the most likely next step?             | Top-k activities + probability  |
| `remaining-time`  | How long until this case finishes?             | Seconds + confidence interval   |
| `outcome`         | Will this case end in success / SLA breach?    | Class label + score             |
| `drift`           | Has process behaviour changed recently?        | Drift score + flag              |
| `features`        | Which signals best predict the outcome?        | Feature importance ranking      |
| `resource`        | Who should handle the next event?              | Resource recommendation + score |

CLI form: `wpm predict <task> -i <log.xes> [--task-options]`.

---

## 1. `next-activity`

**Method:** n-gram language model over activity sequences with optional beam
search. Configure via `prediction.ngramOrder` (default `3`).

**Tuning:**

- Increase order to 4–5 if you have ≥10 000 traces and need more specificity.
- Decrease to 2 for tiny logs to avoid sparse-distribution failures.

**Example output:**

```json
{
  "caseId": "case_42",
  "predictions": [
    { "activity": "Approve", "probability": 0.62 },
    { "activity": "Reject",  "probability": 0.21 },
    { "activity": "Escalate","probability": 0.17 }
  ],
  "modelOrder": 3
}
```

## 2. `remaining-time`

**Method:** Weibull regression over completed traces; for each running case,
estimate remaining duration with a hazard-rate adjustment.

**Output:** seconds (float) plus optional confidence interval.

**Accuracy expectation:** MAE typically 10–30 % of trace length on
well-structured logs. Wider on noisy logs.

## 3. `outcome`

**Method:** Combination of anomaly score and boundary-coverage classifier on
prefix features.

**Output:** outcome class (e.g. `approved` / `rejected`) plus probability.

## 4. `drift`

**Method:** EWMA over activity-distribution Jaccard distance between sliding
windows. See [`drift-detection.md`](./drift-detection.md).

**Output:** drift score + threshold-crossed flag. Combine with `wasm4pm
drift-watch` for streaming.

## 5. `features`

**Method:** Computes prefix features (n-gram presence, rework score, time
gaps, resource entropy) and reports importance via mutual information.

Use this *first* when bringing up predictive analytics on a new log — it tells
you whether you have signal at all.

## 6. `resource`

**Method:** M/M/1 queue model + UCB1 contextual bandit. Recommends a resource
likely to maximise expected throughput while keeping queues balanced.

---

## Configuration

In `wasm4pm.toml`:

```toml
[prediction]
enabled = true
activityKey = "concept:name"
ngramOrder = 3
driftWindowSize = 100
tasks = ["next-activity", "remaining-time", "drift"]
```

ENV equivalents: `WASM4PM_PREDICTION_ENABLED`, `WASM4PM_PREDICTION_TASKS`,
`WASM4PM_PREDICTION_NGRAM_ORDER`, `WASM4PM_PREDICTION_DRIFT_WINDOW`,
`WASM4PM_PREDICTION_ACTIVITY_KEY`.

Auto-saves to `.wasm4pm/results/<timestamp>-predict-<task>.json`.

## Accuracy expectations

| Task              | Typical accuracy / error          | Best on                       |
|-------------------|-----------------------------------|-------------------------------|
| `next-activity`   | top-1: 55–80 %, top-3: 85–95 %   | Logs with low variant count   |
| `remaining-time`  | MAE 10–30 % of mean duration     | Logs with stable cycle time   |
| `outcome`         | Accuracy 70–90 %                 | Balanced class distribution   |
| `drift`           | Detects drift within 1–3 windows | Stationary baseline available |
| `features`        | n/a (descriptive)                | Any                           |
| `resource`        | 5–15 % throughput uplift         | Logs with `org:resource`      |

These are typical numbers; your data may vary.

## See also

- [`drift-detection.md`](./drift-detection.md).
- [`how-to/configure-predictions.md`](./how-to/configure-predictions.md).
- [`tutorials/predictive-analytics.md`](./tutorials/predictive-analytics.md).
