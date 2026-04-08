# Explanation: Predictive Process Mining

**Time to read**: 20 minutes
**Level**: Intermediate

## From "What Happened?" to "What Will Happen?"

Traditional process mining answers a retrospective question: given an event log, what was the process? You discover a model, check conformance, find bottlenecks. This is valuable, but it is inherently backward-looking.

Predictive process mining flips the question forward. Given the history recorded in an event log, what can we say about events that have not happened yet? This is the distinction Wil van der Aalst draws between **descriptive** and **predictive** analytics in the process mining domain.

wasm4pm implements six prediction perspectives, each answering a different forward-looking question that a process analyst actually asks in practice.

```
  Traditional Process Mining              Predictive Process Mining
  ─────────────────────────               ──────────────────────────
  "What happened?"           ──────►      "What will happen next?"
  "Was this normal?"         ──────►      "Will this case succeed?"
  "What is the model?"       ──────►      "When will this case finish?"
  "Are there bottlenecks?"   ──────►      "Is the process changing?"
                                          "What patterns matter?"
                                          "When will resources free up?"
```

---

## The Six Perspectives

### 1. Next Activity Prediction

**Question**: "Given what has happened so far in this case, what happens next?"

This is the most intuitive prediction task. A case (a single process instance) has already executed activities A, B, C. What is likely to come next?

The technique is an **n-gram model** -- the same idea that powers autocomplete on your phone, applied to process traces instead of text. An n-gram of order k looks at the last k activities in a trace and predicts the (k+1)th.

```
Order 1 (unigram):   Count how often each activity appears overall.
                     "Register" → 45%, "Submit" → 30%, "Review" → 25%

Order 2 (bigram):    Look at the last 1 activity to predict the next.
                     [Register] → "Submit" (92%)
                     [Submit]   → "Review" (78%), "Reject" (22%)

Order 3 (trigram):   Look at the last 2 activities.
                     [Register, Submit] → "Review" (95%)
                     [Review, Revise]  → "Submit" (88%), "Reject" (12%)
```

**The trade-off**: Higher-order n-grams capture more context, but they suffer from data sparsity. A trigram `[Review, Negotiate, Approve]` may only appear 3 times in your log, making its statistics unreliable. Bigrams (order 2) are the sweet spot for most real-world logs: enough context to be useful, enough observations to be robust.

In wasm4pm, n-gram models are built on-the-fly from the event log inside the WASM runtime. You control the order with the `ngramOrder` config field or the `--ngram-order` CLI flag.

```
pmctl predict next-activity -i orders.xes --prefix "Register,Submit" --ngram-order 2
```

The output ranks candidate activities by probability, returning the top-k most likely next steps.

---

### 2. Remaining Time Prediction

**Question**: "This case is halfway through. How long until it completes?"

This matters for customer-facing SLAs, capacity planning, and bottleneck detection. If you can predict that 40% of open cases will miss their deadline, you can intervene before the deadline arrives.

wasm4pm uses a **bucket-based model**. The idea is straightforward:

1. Group historical cases by their prefix length (how many activities they had completed at each stage).
2. For each bucket, compute the average remaining time from that point to completion.

```
  Bucket (prefix length)    Avg remaining time    Cases in bucket
  ──────────────────────    ───────────────────   ────────────────
  After activity 1          14.2 hours             1,200
  After activity 2          11.8 hours             1,180
  After activity 3           8.4 hours             1,100
  After activity 4           5.1 hours               980
  After activity 5           2.3 hours               850
  After activity 6           0.4 hours               800
```

Given a running case that has completed 3 activities, you look up bucket 3 and predict roughly 8.4 hours remaining.

This is a deliberately simple approach. More sophisticated methods (regression on prefix features, LSTM sequence models) exist, but the bucket model has two advantages: it is interpretable (you can explain *why* the prediction is what it is) and it works well with the modest data volumes common in process mining.

```
pmctl predict remaining-time -i claims.xes --prefix "Register,Assess,Approve"
```

---

### 3. Outcome Prediction

**Question**: "Will this case finish normally, or is something going wrong?"

This perspective sits at the intersection of process mining and anomaly detection. The core idea: discover what the "normal" process looks like (a DFG), then score each trace by how well it conforms to that normal model.

wasm4pm's approach has two components:

**DFG-based anomaly scoring**: After discovering a DFG from the full event log, each trace is scored by checking how many of its directly-follows edges exist in the DFG, weighted by edge frequency. A trace that follows only high-frequency edges scores close to 0.0 (normal). A trace that traverses rare or nonexistent edges scores closer to 1.0 (anomalous).

**N-gram log-likelihood**: Independently, the n-gram model can score how probable a trace's activity sequence is under the learned transition probabilities. Low log-likelihood means the sequence is statistically unusual.

```
  Trace: Register → Submit → Review → Revise → Revise → Revise → Reject
                                                ↑          ↑
                                          Anomaly: rework loop detected

  Anomaly score: 0.78 (above 0.5 threshold → flagged)
  Log-likelihood: -12.3 (low → statistically unusual)
```

The two signals complement each other. The anomaly score catches structural deviations (activities in wrong order, unexpected loops). The log-likelihood catches statistical deviations (rare activity sequences that happen to use valid edges).

Without a `--prefix`, wasm4pm scores every trace in the log and reports the top-k most anomalous. With a `--prefix`, it scores that specific partial trace, letting you ask "is this running case on track?"

---

### 4. Concept Drift Detection

**Question**: "Is the process itself changing over time?"

Processes are not static. Regulations change, software updates deploy, seasonal patterns emerge, teams adopt new practices. A model discovered from January data may be irrelevant by March.

wasm4pm detects drift using a **Jaccard-window** approach: divide the event log into sliding windows, discover a DFG from each window, and compare adjacent DFGs using Jaccard distance on their edge sets. When the distance between consecutive windows exceeds a threshold, drift is detected.

This is a rich enough topic to warrant its own explanation. See [Concept Drift Detection](./concept-drift-detection.md) for the full treatment.

```
pmctl predict drift -i production.xes --drift-window 20
```

---

### 5. Feature Extraction

**Question**: "What numeric properties of a trace predict its outcome?"

Process mining produces structured data, but ML models need numeric features. Feature extraction bridges that gap by computing quantitative descriptors of each trace.

wasm4pm extracts features from traces such as:

| Feature | Description |
|---------|-------------|
| Trace length | Total number of events |
| Unique activities | Distinct activity types (lower = more routine) |
| Rework count | Number of repeated activities (higher = more problems) |
| Inter-event times | Average and variance of gaps between events |
| Self-loop count | Activities that repeat consecutively |

These features feed into the transition probability matrix (which activities follow which, and how often). The matrix itself is a feature: the probability distribution over next activities for a given prefix is a compact numeric representation of process state.

```
pmctl predict features -i incidents.xes --prefix "Open,Triage"
```

Feature extraction is the bridge between process mining and data science. Once you have numeric features per trace, you can train classifiers, build regression models, or cluster cases -- all using standard ML tooling outside wasm4pm.

---

### 6. Resource Prediction

**Question**: "Given current workload, how long will cases wait in queue?"

This perspective uses **queueing theory** rather than process discovery. The simplest model is M/M/1: a single server with Poisson arrivals and exponential service times.

Given two parameters:

- **Arrival rate** (lambda): how many cases arrive per time unit
- **Service rate** (mu): how many cases a resource can process per time unit

The M/M/1 model yields:

```
  Utilization:    rho = lambda / mu
  Average wait:   Wq = rho / (mu - lambda)
  Average time:   W  = 1 / (mu - lambda)
  Stable when:    lambda < mu  (arrival rate must be less than service rate)
```

When utilization approaches 1.0, wait times grow exponentially. A system at 90% utilization does not wait 10% longer than a system at 80% -- it waits roughly 4x longer. This nonlinearity is why capacity planning matters.

wasm4pm's resource prediction reports queue delay, utilization, and stability status. In practice, arrival and service rates would be estimated from the event log's inter-event times and activity durations. The current implementation uses configurable demonstration defaults.

```
pmctl predict resource -i support-tickets.xes
```

---

## How It All Fits Together

The six perspectives are not isolated. They share underlying data structures and build on each other:

```
                        Event Log (XES)
                             |
                   ┌─────────┴──────────┐
                   |                    |
              DFG Discovery        N-gram Builder
                   |                    |
          ┌────────┼────────┐     ┌─────┴──────┐
          |        |        |     |            |
      Anomaly   Drift    Diff   Next-Activity  Remaining
      Scoring  Detection  Compare Prediction   Time
          |                                    |
          └──────────────┬─────────────────────┘
                         |
                   Feature Extraction
                         |
                   Resource Model (M/M/1)
```

- **DFG discovery** feeds anomaly scoring, drift detection, and diff comparison.
- **N-gram models** feed next-activity prediction, log-likelihood scoring, and feature extraction.
- **Feature extraction** is the output interface to external ML pipelines.

All computation runs inside the WASM runtime (Rust compiled to WebAssembly). There is no Python dependency, no external ML library, no GPU requirement. The algorithms are lightweight enough to run on event logs with thousands of traces in milliseconds.

---

## When to Use Each Perspective

| Situation | Perspective | Why |
|-----------|------------|-----|
| "This case feels stuck" | Next activity | See what is likely to happen, or identify that no clear path exists |
| "Will we hit the SLA?" | Remaining time | Predict completion time for running cases |
| "Are there problem cases?" | Outcome | Flag anomalous traces before they become escalations |
| "Did last month's update change anything?" | Drift | Detect process changes across time windows |
| "I want to build a classifier" | Features | Extract numeric features for external ML models |
| "Is the team overloaded?" | Resource | Estimate queue delays from arrival/service rates |

---

## See Also

- [Explanation: Concept Drift Detection](./concept-drift-detection.md) -- deep dive on drift detection methodology
- [Explanation: Process Model Comparison](./process-model-comparison.md) -- how `pmctl diff` compares two event logs
- [Explanation: OCPM](./ocpm.md) -- object-centric extensions to predictive mining
- [Explanation: Profiles](./profiles.md) -- how execution profiles affect discovery quality
