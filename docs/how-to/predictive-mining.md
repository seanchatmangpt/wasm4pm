# How-To: Run Predictive Process Mining

**Time required**: 10 minutes
**Difficulty**: Intermediate

## Problem

You want to answer predictive questions about your process: what activity happens next, how long until a case completes, is a given trace anomalous, or is the process drifting over time. `pmctl predict` provides seven task types that each answer a different predictive question using the event log as training data.

---

## 1. Predict the next activity

Given a running case with a known prefix of completed activities, predict which activity is most likely to occur next.

```bash
pmctl predict next-activity -i orders.xes --prefix "Create Order,Check Stock"
```

What you should see:

```
Running prediction task: next-activity

  Rank  Activity                   Probability
  ────  ─────────────────────────  ───────────
     1  Ship Order                         42.3%
     2  Notify Customer                    28.1%
     3  Cancel Order                       15.6%
     4  Backorder                           9.4%
     5  Escalate                            4.6%

Result saved: .wasm4pm/results/20260406-143201-next-activity.json
```

Control how many predictions are returned:

```bash
pmctl predict next-activity -i orders.xes --prefix "Create Order" --top-k 5 --ngram-order 3
```

| Flag | Default | Description |
|------|---------|-------------|
| `--prefix` | (none) | Comma-separated list of activities already completed in the case |
| `--top-k` | `3` | Number of top predictions to return |
| `--ngram-order` | `2` | N-gram order -- higher values capture longer activity sequences |

Without `--prefix`, the model is built but no prediction is returned (it needs at least one observed activity to predict the next).

---

## 2. Estimate remaining time

Predict how long a case will take to complete based on the activities already performed.

```bash
pmctl predict remaining-time -i cases.xes --prefix "Submit,Review,Approve"
```

What you should see:

```
Running prediction task: remaining-time

  Estimated remaining time:  2.4 hours
  Confidence:                73.2%
  Method:                    mean_remaining

Result saved: .wasm4pm/results/20260406-143210-remaining-time.json
```

Without `--prefix`, the model is built but no duration estimate is produced -- it needs the prefix to know how far the case has progressed.

---

## 3. Detect anomalous cases

Score a specific trace prefix for anomaly likelihood, or scan the entire log for anomalous cases.

### Score a specific prefix

```bash
pmctl predict outcome -i process.xes --prefix "Register,Skip Approval,Close"
```

What you should see:

```
Running prediction task: outcome

  Anomaly score:    0.8731
  Is anomalous:     true
  Threshold:        0.5000
  Log-likelihood:   -4.2137

Result saved: .wasm4pm/results/20260406-143220-outcome.json
```

A score above the threshold (default 0.5) flags the trace as anomalous. The log-likelihood measures how probable the prefix is under the n-gram model -- lower values indicate more unusual sequences.

### Scan the entire log for anomalies

```bash
pmctl predict outcome -i process.xes
```

What you should see:

```
Running prediction task: outcome

  Case ID              Score     Anomalous
  ───────────────────  ────────  ─────────
  case-1042            0.8731  yes
  case-2187            0.6214  yes
  case-0091            0.5890  yes

Result saved: .wasm4pm/results/20260406-143225-outcome.json
```

Use `--top-k` to control how many anomalous cases are listed (default: 3).

---

## 4. Detect concept drift

Identify points in the event log where the process behavior changes.

```bash
pmctl predict drift -i timeseries.xes --drift-window 50
```

What you should see:

```
Running prediction task: drift

  Detected 3 drift point(s) (method: jaccard_window):
    Position 145  distance=0.3821  type=concept_drift
    Position 312  distance=0.5147  type=concept_drift
    Position 489  distance=0.2934  type=concept_drift

Result saved: .wasm4pm/results/20260406-143230-drift.json
```

| Flag | Default | Description |
|------|---------|-------------|
| `--drift-window` | `10` | Window size in traces for Jaccard distance computation |

Larger windows detect gradual drift; smaller windows detect sudden shifts.

For continuous real-time monitoring, see [How-To: Monitor Drift in Real-Time](./monitor-drift.md).

---

## 5. Extract features for machine learning

Build a transition probability matrix from the event log, optionally with prefix features for a specific case.

```bash
pmctl predict features -i training.xes --prefix "A,B,C"
```

What you should see:

```
Running prediction task: features

  Transition probabilities: 12 edge(s)
    {"from":"A","to":"B","probability":0.85}
    {"from":"B","to":"C","probability":0.72}
    {"from":"B","to":"D","probability":0.28}
    {"from":"C","to":"E","probability":0.91}
    {"from":"C","to":"F","probability":0.09}
    ... (7 more)

  Prefix features: {"length":3,"unique_activities":3,"has_loop":false}

Result saved: .wasm4pm/results/20260406-143240-features.json
```

Without `--prefix`, only the transition probability matrix is returned. Use the JSON output to pipe features into an external ML pipeline:

```bash
pmctl predict features -i training.xes --format json | jq '.data.transitions' > features.json
```

---

## 6. Predict resource assignment

Estimate queue delay and utilization for resource planning.

```bash
pmctl predict resource -i helpdesk.xes --prefix "Open,Assign"
```

What you should see:

```
Running prediction task: resource

  M/M/1 Queue Model Estimate:
    Wait time:    2.33s
    Utilization:  70.0%
    Stable:       true
  Transitions in model: 18

Result saved: .wasm4pm/results/20260406-143250-resource.json
```

The resource task uses an M/M/1 queue model to estimate wait times based on the transition structure of the log.

---

## 7. Use JSON output for automation

All tasks support `--format json`:

```bash
pmctl predict next-activity -i orders.xes --prefix "Create Order" --format json
```

```json
{
  "status": "success",
  "message": "Prediction complete: next-activity",
  "data": {
    "task": "next-activity",
    "input": "orders.xes",
    "activityKey": "concept:name",
    "predictions": [
      { "activity": "Ship Order", "probability": 0.423 },
      { "activity": "Notify Customer", "probability": 0.281 },
      { "activity": "Cancel Order", "probability": 0.156 }
    ]
  }
}
```

---

## 8. Manage saved results

Results are automatically saved to `.wasm4pm/results/`. Inspect the most recent result:

```bash
pmctl results --last
```

Skip saving entirely with `--no-save`:

```bash
pmctl predict next-activity -i orders.xes --prefix "Create Order" --no-save
```

---

## 9. Task summary

| Task | Input | Output | Use case |
|------|-------|--------|----------|
| `next-activity` | Event log + prefix | Ranked activity predictions with probabilities | What happens next in a running case? |
| `remaining-time` | Event log + prefix | Estimated hours remaining + confidence | When will this case finish? |
| `outcome` | Event log + optional prefix | Anomaly scores per case or per prefix | Is this case following the normal process? |
| `drift` | Event log | Drift points with positions and distances | Has the process changed over time? |
| `features` | Event log + optional prefix | Transition probability matrix + prefix features | What features describe this process for ML? |
| `resource` | Event log | Queue delay, utilization, stability | How loaded are the resources? |

---

## See Also

- [How-To: Monitor Drift in Real-Time](./monitor-drift.md) -- continuous drift monitoring via `pmctl drift-watch`
- [How-To: Compare Two Event Logs](./compare-process-models.md) -- structural comparison via `pmctl diff`
- [How-To: Choose an Algorithm](./choose-algorithm.md) -- selecting a discovery algorithm
- [Reference: Config Schema](../reference/config-schema.md) -- prediction config options (`prediction.ngramOrder`, `prediction.driftWindowSize`)
