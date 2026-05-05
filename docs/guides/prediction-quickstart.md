# Prediction Tasks Quickstart

Forecast process behavior in 5 steps.

**Time to first result:** ~3 minutes | **Difficulty:** Beginner

---

## What is prediction?

Prediction answers forward-looking questions about running cases:

| Task | Question | Output |
|------|----------|--------|
| `next-activity` | What's the most likely next step? | Top-k activities + probability |
| `remaining-time` | How long until case completion? | ETA + confidence interval |
| `outcome` | Will this case succeed? | Class (e.g., approved/rejected) + score |
| `drift` | Has process behavior changed? | Drift score 0.0-1.0 |
| `features` | Which factors predict success? | Top features ranked by importance |
| `resource` | Who should handle next event? | Resource recommendation |

Each task is **deterministic**, **sub-second**, and **self-contained** (no training phase needed).

---

## Step 1: Load your event log

```typescript
import { getRegistry } from '@wasm4pm/kernel';
import { readFileSync } from 'node:fs';

const xes = readFileSync('./my-process.xes', 'utf8');
const registry = getRegistry();
const handle = await registry.run('load_eventlog_from_xes', null, { xes });
```

---

## Step 2: Choose a prediction task

```typescript
// Example: Predict next activity for a running case

import { predictNextActivity } from '@wasm4pm/kernel';

const prediction = await predictNextActivity(handle, {
  activityKey: 'concept:name',
  ngramOrder: 3,           // Look back 3 activities (tune as needed)
  caseId: 'case_123',      // For a specific case
  prefix: ['A', 'B', 'C'], // Activities seen so far (optional)
});

console.log('Next activity predictions:');
for (const p of prediction.predictions) {
  console.log(`  ${p.activity}: ${(p.probability * 100).toFixed(1)}%`);
}
```

---

## Step 3: Choose parameters based on your log size

| Log Size | `ngramOrder` | `window_size` (drift) | `k` (clustering) |
|----------|--------------|----------------------|------------------|
| <1K events | 2 | 20 | 3 |
| 1K-10K | 3 | 50 | 5 |
| 10K-100K | 4 | 100 | 7 |
| 100K+ | 5 | 200 | 10 |

**Rule of thumb:** Order should be log₂(num_traces).

---

## Step 4: Interpret results for each task

### next-activity

```json
{
  "predictions": [
    { "activity": "Approve", "probability": 0.62 },
    { "activity": "Reject", "probability": 0.21 },
    { "activity": "Escalate", "probability": 0.17 }
  ]
}
```

**Interpretation:**
- `prob[0] > 0.8` → Confident; act on this prediction
- `prob[0] 0.5-0.8` → Likely; but confirm with business rules
- `prob[0] < 0.5` → Uncertain; fallback to process definition

### remaining-time

```json
{
  "remaining_seconds": 1234.5,
  "confidence_interval": { "lower": 900, "upper": 1600 },
  "model": "weibull_regression"
}
```

**Interpretation:**
- Width of CI: If `upper - lower > 2*mean` → unreliable; use baseline instead
- Confidence: How much past history overlaps current prefix
- Error: Typically ±10-30% of actual remaining time

### outcome

```json
{
  "predicted_outcome": "approved",
  "probability": 0.87,
  "anomaly_score": 0.12
}
```

**Interpretation:**
- `prob > 0.75` → Confident prediction
- `anomaly_score > 0.5` → Case is unusual; investigate
- If `prob ≈ 0.5` and anomaly high → Case is atypical; escalate

### drift

```json
{
  "drift_score": 0.35,
  "threshold": 0.3,
  "alert": true,
  "trend": "rising"
}
```

**Interpretation:**
- `alert: true` → Process has changed; retrain model
- `trend: rising` → Drift is accelerating; urgent
- `trend: stable` → Change has plateaued; monitor
- `trend: falling` → Process is returning to baseline

### features

```json
{
  "features": [
    { "name": "duration_seconds", "importance": 0.45 },
    { "name": "concept:name_Approve", "importance": 0.32 },
    { "name": "rework_count", "importance": 0.23 }
  ]
}
```

**Interpretation:**
- Importance > 0.2 → Influential feature
- Importance 0.05-0.2 → Secondary factors
- Importance < 0.05 → Noise; ignore

### resource

```json
{
  "recommended_resource": "alice@example.com",
  "score": 0.78,
  "reasoning": "Lowest queue depth, recent success rate 0.92"
}
```

**Interpretation:**
- Use recommendation if `score > 0.7` and queue depth < 3
- If recommended resource unavailable, take next-best (rerun with exclusion)

---

## Step 5: Integrate predictions into workflows

### Use case 1: SLA protection

```typescript
const prediction = await predictRemainingTime(handle, { caseId: 'case_123' });
const slaThreshold = 3600; // 1 hour

if (prediction.remaining_seconds > slaThreshold * 0.8) {
  // Case is heading toward SLA breach
  escalate(caseId, 'High');
}
```

### Use case 2: Automated routing

```typescript
const prediction = await predictNextActivity(handle, { caseId: 'case_456' });
const nextActivity = prediction.predictions[0].activity;

if (nextActivity === 'Manager Approval') {
  route(caseId, 'managers-queue');
} else {
  route(caseId, 'general-queue');
}
```

### Use case 3: Quality gates

```typescript
const prediction = await predictOutcome(handle, { caseId: 'case_789' });

if (prediction.probability < 0.6 || prediction.anomaly_score > 0.5) {
  // High risk; apply extra validation
  applyQualityGate(caseId);
}
```

### Use case 4: Drift-triggered retraining

```typescript
const driftCheck = await predictDrift(handle, {
  activityKey: 'concept:name',
  windowSize: 100,
});

if (driftCheck.alert) {
  // Process has changed; schedule model retraining
  scheduleRetraining(handle);
}
```

---

## Configuration reference

Place this in `wasm4pm.toml` or pass via CLI:

```toml
[prediction]
enabled = true
activityKey = "concept:name"
timestampKey = "time:timestamp"
ngramOrder = 3
driftWindowSize = 100
driftAlpha = 0.3
driftThreshold = 0.3
tasks = ["next-activity", "remaining-time", "drift"]
```

**Environment variables:**
```bash
export WASM4PM_PREDICTION_ENABLED=true
export WASM4PM_PREDICTION_ACTIVITY_KEY=concept:name
export WASM4PM_PREDICTION_NGRAM_ORDER=3
export WASM4PM_PREDICTION_DRIFT_WINDOW=100
```

---

## Accuracy expectations

**next-activity:**
- Simple logs (linear): >90% top-1 accuracy
- Complex logs (loops, branches): 60-80% top-1, 85-95% top-3
- Very noisy logs: 40-60%

**remaining-time:**
- MAE typically 10-30% of mean trace duration
- CI width: If log is homogeneous, narrow; if heterogeneous, wide

**outcome:**
- Balanced classes: >80% accuracy
- Imbalanced (90% approve, 10% reject): Baseline accuracy high, but model may ignore minority class

**drift:**
- Synthetic drift (known change point): Detects within 10-50 events
- Real drift (gradual): May take 100+ events to reach threshold

**features:**
- Ranking stable if >1000 traces
- If <100 traces: Take top 3-5 features only (rest are noisy)

---

## Common patterns

### Pattern 1: Run all tasks together

```typescript
const config = { activityKey: 'concept:name', ngramOrder: 3 };
const [nextAct, remTime, outcome, drift, features, resource] = await Promise.all([
  predictNextActivity(handle, config),
  predictRemainingTime(handle, config),
  predictOutcome(handle, config),
  predictDrift(handle, config),
  predictFeatures(handle, config),
  predictResource(handle, config),
]);
```

### Pattern 2: Combine predictions for risk scoring

```typescript
const riskScore = (
  (1 - outcome.probability) * 0.4 +           // 40% weight: low approval prob
  (drift.drift_score / 1.0) * 0.3 +            // 30% weight: drift
  (anomaly.anomaly_score) * 0.3                // 30% weight: anomaly
);

if (riskScore > 0.6) {
  console.log('High-risk case; escalate');
}
```

### Pattern 3: Streaming predictions

```typescript
// For each new event in a running case:
const runningPrefix = case.activitySequence;
const prediction = await predictNextActivity(handle, {
  caseId: case.id,
  prefix: runningPrefix,
});

// Update UI or trigger actions
updateForecast(case.id, prediction);
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| All predictions same activity | Log is very linear or too small; increase ngramOrder |
| Remaining time very wide CI | Log has high variance; segment by variant first |
| Drift never triggers | Threshold too high; lower from 0.3 to 0.2 |
| Features all have low importance | Log is noisy; apply feature selection or preprocessing |
| Resource prediction incorrect | Insufficient historical data; wait for more cycles |

---

## Next steps

- **Deep dive:** [`prediction-complete.md`](../prediction-complete.md)
- **Drift tuning:** [`drift-detection-guide.md`](./drift-detection-guide.md)
- **API reference:** [`@wasm4pm/kernel.md`](../api/@wasm4pm/kernel.md)
- **Examples:** [`examples/prediction-*.ts`](../../examples/)

---

**Still have questions?** See [`prediction-faq.md`](../faq/prediction-faq.md).
