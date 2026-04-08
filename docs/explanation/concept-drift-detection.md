# Explanation: Concept Drift Detection

**Time to read**: 15 minutes
**Level**: Intermediate

## What Is Concept Drift?

A process model is a snapshot. You discover a DFG from an event log, and it represents the process *as it was during the period the log covers*. But real processes are not static -- they evolve. New regulations take effect. Software deployments change workflows. Seasonal patterns shift demand. Teams adopt (or abandon) practices.

When the underlying process changes, a model built from old data becomes progressively less accurate. This decay is called **concept drift**: the concept (the process) has drifted away from what the model captures.

```
  Time ──────────────────────────────────────────────►

  January:   Register → Assess → Approve → Pay
  February:  Register → Assess → Verify → Approve → Pay    ← "Verify" step added
  March:     Register → Assess → Verify → Approve → Pay    ← stable
  April:     Register → Auto-Approve → Pay                  ← process simplified
```

A model discovered from January data would flag every February and April trace as anomalous -- not because the traces are wrong, but because the process changed and the model did not keep up.

---

## Types of Concept Drift

Not all drift looks the same. Understanding the shape of drift helps you interpret detection results correctly.

### Sudden Drift

The process changes abruptly at a specific point in time. A new regulation takes effect on March 1st, and every case after that date follows a different workflow.

```
  Process A  ████████████│
                      │  ████████████  Process B
  ─────────────────────┼─────────────────────── Time
                   Drift point (known or inferrable)
```

Sudden drift is the easiest to detect: the Jaccard distance between the window before and after the change point spikes sharply.

### Gradual Drift

The process slowly evolves. A new team member introduces a slightly different way of working. Over weeks, the old pattern fades and the new pattern dominates. There is no single change point -- the drift is distributed across many traces.

```
  Process A  ██████████████████
                       ████████████████████  Process B (growing)
  ──────────────────────────────────────────────── Time
                 ← gradual transition →
```

Gradual drift produces a sustained moderate distance between consecutive windows, rather than a single spike.

### Recurring Drift

The process oscillates between states. This is common with seasonal patterns: end-of-quarter processing differs from mid-quarter processing, but both recur predictably.

```
  Process A  ████████        ████████        ████████
                   ████████        ████████
  ──────────────────────────────────────────────── Time
              Process B (recurring)
```

Recurring drift shows up as periodic spikes in Jaccard distance that return to baseline. EWMA smoothing (discussed below) helps distinguish recurring drift from noise.

---

## How wasm4pm Detects Drift: Jaccard-Window Method

wasm4pm uses a three-step approach: window, discover, compare.

### Step 1: Sliding Windows

The event log is divided into windows of N consecutive traces (controlled by `driftWindowSize` in config, or `--drift-window` on the CLI). The default is 10 traces per window.

```
  Event log (sorted by timestamp):

  Trace 1   Trace 2   ...   Trace 10  |  Trace 11  Trace 12  ...  Trace 20  |  ...
  ──────────────────────────────────  ─────────────────────────────────────  ──
            Window 1                              Window 2                Window 3
```

Windows are contiguous and non-overlapping. Each window captures a time slice of the process.

### Step 2: DFG Discovery

A directly-follows graph (DFG) is discovered from each window independently. Each DFG captures the process structure *as observed in that time slice*.

```
  Window 1 DFG:                    Window 2 DFG:
  Register → Assess → Approve      Register → Assess → Verify → Approve
                                   (new "Verify" node and edges)
```

### Step 3: Jaccard Distance Comparison

Adjacent window DFGs are compared using **Jaccard distance** on their edge sets. If E1 is the set of edges in Window 1's DFG and E2 is the set of edges in Window 2's DFG:

```
  Jaccard similarity:   J = |E1 intersection E2| / |E1 union E2|
  Jaccard distance:     d = 1 - J
```

Interpretation of the similarity score J:

| J value | Meaning |
|---------|---------|
| 1.0 | Identical edge sets -- no drift |
| 0.8 - 1.0 | Minor variations within normal noise |
| 0.7 - 0.8 | Moderate change -- possible drift onset |
| Below 0.7 | Significant structural change -- drift detected |

wasm4pm flags drift when Jaccard similarity drops below 0.7 (distance above 0.3) between consecutive windows.

**Example**: If Window 1 has edges {A->B, B->C, C->D} and Window 2 has edges {A->B, B->C, C->D, B->D, C->E}:

```
  Intersection: {A->B, B->C, C->D}              = 3 edges
  Union:        {A->B, B->C, C->D, B->D, C->E}   = 5 edges
  Similarity:   3 / 5 = 0.6
  Distance:     1 - 0.6 = 0.4                     ← drift detected (> 0.3)
```

Two new edges (B->D, C->E) appeared in Window 2, indicating the process gained new paths.

---

## EWMA Smoothing

Raw Jaccard distances between consecutive windows are noisy. A single unusual case in a small window can cause a spike that looks like drift but is not. **EWMA** (Exponentially Weighted Moving Average) smooths the distance signal to distinguish real drift from transient noise.

The formula:

```
  ewma_t = alpha * distance_t + (1 - alpha) * ewma_{t-1}

  Where:
    distance_t  = Jaccard distance between window t and window t-1
    alpha       = smoothing factor (0 < alpha <= 1)
    ewma_0      = distance_1 (first observation seeds the average)
```

**How alpha controls sensitivity**:

| Alpha | Behavior | Use when |
|-------|----------|----------|
| 0.1 | Heavily smoothed. Reacts slowly to changes. | Looking for long-term trends, filtering noisy logs |
| 0.3 | Moderate responsiveness (wasm4pm default). | General-purpose monitoring |
| 0.5 | Responsive. Follows rapid changes closely. | Detecting sudden drift in clean logs |

Think of alpha as a dial between "ignore noise" (low alpha) and "catch everything" (high alpha). A low alpha means the EWMA has a long memory -- a single spike barely moves the average. A high alpha means the EWMA is nearly the raw signal with minimal smoothing.

```
  Raw distances:   0.05  0.03  0.08  0.42  0.06  0.04
                                              ↑ single spike (noise)

  EWMA (alpha=0.3): 0.05  0.04  0.05  0.18  0.14  0.11
                                              ↑ spike dampened, but visible

  EWMA (alpha=0.1): 0.05  0.05  0.05  0.09  0.08  0.08
                                              ↑ spike nearly invisible
```

The EWMA is what wasm4pm actually uses to determine whether drift has occurred. A single window with high distance does not trigger a drift alert -- the smoothed signal must cross the threshold.

---

## Trend Interpretation

The shape of the EWMA curve over time tells you what kind of change is happening:

```
  EWMA
   ↑
   │          ╱╲               ╱╲
   │    ╱╲   ╱  ╲             ╱  ╲
   │   ╱  ╲ ╱    ╲           ╱    ╲
   │──╱    V       ╲─────────╱      ╲───── baseline
   │ ╱                         ╲   ╱
   │╱                             V
   └──────────────────────────────────────► Time

   Rising EWMA    → process is changing (new behaviors emerging)
   Stable EWMA    → process is steady-state
   Falling EWMA   → process returning to baseline (recurring drift)
   Spike + return → transient disruption, not structural change
```

**Rising EWMA** over multiple consecutive windows suggests gradual drift: the process is evolving away from its previous model. This is the pattern you see when a team slowly adopts a new workflow.

**Stable EWMA** near zero means the process is consistent. The DFG you discovered is still an accurate representation.

**Falling EWMA** after a spike suggests recurring drift: the process deviated temporarily (perhaps due to a holiday surge or system outage) and is returning to normal.

---

## When to Use Drift Detection

**Monitoring production processes**: In regulated industries (finance, healthcare, manufacturing), you need to know when actual process execution diverges from the documented process. Drift detection provides an automated signal.

**Validating process improvements**: After deploying a process change, drift detection confirms whether the change actually took hold. If you expected the "Verify" step to be removed but drift detection shows the old DFG still dominating, the change did not stick.

**Detecting system degradation**: When an upstream system starts failing silently, the downstream process may change (more rework, more exceptions). Drift detection catches this before it shows up in SLA dashboards.

**Understanding seasonal patterns**: Recurring drift with a regular period reveals seasonal process behavior that a single global model would mask.

---

## Limitations

- **Window size matters**: Too small, and each window has too few traces for a reliable DFG. Too large, and drift is diluted across many traces. The default of 10 traces is a starting point; adjust based on your log's trace density.
- **DFG comparison is structural only**: Jaccard distance on DFG edges captures added/removed paths, but not changes in edge frequency (a path used twice as often produces the same Jaccard score). For frequency-aware comparison, see [Process Model Comparison](./process-model-comparison.md).
- **No causal attribution**: Drift detection tells you *that* the process changed and *where* (which edges appeared/disappeared), but not *why*. Root cause analysis requires domain knowledge.
- **Requires chronological ordering**: Traces must be sorted by their start timestamp. If the log is unordered, the window boundaries do not correspond to time slices.

---

## See Also

- [Explanation: Predictive Process Mining](./predictive-process-mining.md) -- all six prediction perspectives including drift
- [Explanation: Process Model Comparison](./process-model-comparison.md) -- Jaccard-based comparison of two event logs with frequency deltas
- [Explanation: Profiles](./profiles.md) -- how discovery profile affects DFG quality (and thus drift sensitivity)
- [Explanation: Streaming](./streaming.md) -- real-time drift detection with `pmctl drift-watch`
