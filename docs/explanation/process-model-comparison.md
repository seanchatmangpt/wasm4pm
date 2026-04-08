# Explanation: Process Model Comparison

**Time to read**: 12 minutes
**Level**: Intermediate

## Why Compare Processes?

A single process model answers "what is the process?" But many real questions require comparing two models:

- **Before and after**: Did last month's process improvement actually change behavior?
- **Cross-organizational**: Does Team A follow the same process as Team B?
- **Temporal**: How does Q1 execution compare to Q2?
- **Variant detection**: What distinguishes the "happy path" (normal cases) from the exception path (cases that required manual intervention)?

`pmctl diff` answers these questions by computing a structured comparison of two event logs. The comparison is grounded in a single metric -- **Jaccard similarity on DFG edges** -- with additional detail on activities, edge frequencies, and trace variants.

---

## The Core Metric: Jaccard Similarity on DFG Edges

Given two event logs, wasm4pm discovers a DFG from each. Each DFG has a set of edges (directly-follows relationships). The Jaccard similarity between the two edge sets is:

```
  J(A, B) = |E_A intersection E_B| / |E_A union E_B|
```

Where E_A is the edge set from log A and E_B is the edge set from log B.

```
  Log A DFG:                  Log B DFG:
  A ──► B ──► C              A ──► B ──► C
  B ──► D                    B ──► C ──► D
                              A ──► D

  E_A = {A→B, B→C, B→D}             (3 edges)
  E_B = {A→B, B→C, C→D, A→D}        (4 edges)

  Intersection: {A→B, B→C}           (2 edges)
  Union:        {A→B, B→C, B→D, C→D, A→D}  (5 edges)

  J(A, B) = 2 / 5 = 0.40
```

**Interpretation scale**:

| J value | Interpretation |
|---------|---------------|
| 0.9 - 1.0 | Nearly identical processes. Minor noise-level differences. |
| 0.7 - 0.9 | Similar processes with meaningful but small differences. |
| 0.5 - 0.7 | Moderately different. Some shared structure, notable divergence. |
| 0.3 - 0.5 | Significantly different. Only partial overlap in process behavior. |
| 0.0 - 0.3 | Almost unrelated processes. May share activity names but very different flows. |

A single number is useful for quick assessment, but it hides the details. A Jaccard score of 0.70 could mean "one extra edge" or "30% of the process is different." That is why `pmctl diff` decomposes the comparison into four dimensions.

---

## The Four Comparison Dimensions

### 1. Activities

The simplest comparison: which activities appear in each log?

```
  Shared activities:    Register, Assess, Approve, Pay
  Added (log2 only):    Verify
  Removed (log1 only):  Fast-Track
```

Activity comparison is a necessary sanity check before looking at structural differences. If the two logs use completely different activity name vocabularies, the DFG comparison is misleading -- the processes may actually be similar but use different labels for the same work.

**Caveat**: wasm4pm compares activity names as exact strings. "Approve" and "Approval" are treated as different activities. There is no aliasing or fuzzy matching. This is by design: exact comparison is deterministic and reproducible. If you need normalized names, normalize them in the event log before running diff.

### 2. Edges

The structural heart of the comparison. Edges are the directly-follows relationships (A then B), and they define the process flow.

```
  Shared edges:    Register→Assess, Assess→Approve, Approve→Pay
  Added edges:     Assess→Verify, Verify→Approve
  Removed edges:   Assess→Pay
  Changed edges:   Register→Assess  (frequency: 95% → 87%, delta -8%)
```

**Edge frequency deltas** are where the comparison gets practically useful. Even when two logs share the same edge set (Jaccard = 1.0), the frequencies may differ:

```
  Edge "Approve → Pay":
    Log A: 450 out of 500 traces (90%)
    Log B: 350 out of 500 traces (70%)
    Delta: -20%

  Interpretation: 20% fewer cases go directly from Approve to Pay in Log B.
  Possible cause: More rework after approval? A new intermediate step?
```

A large frequency delta on a shared edge is often more actionable than a missing edge. It indicates that the process structure is the same but execution patterns are shifting -- a subtler and sometimes more important signal.

### 3. Trace Variants

A trace variant is a unique sequence of activities. Comparing variant distributions reveals behavioral differences that DFG comparison alone cannot capture.

```
  Shared variants:  Register,Assess,Approve,Pay  (appears in both logs)
  Log1 only:        Register,Fast-Track,Pay       (fast path removed in Log2)
  Log2 only:        Register,Assess,Verify,Approve,Pay  (new verification step)
```

Variant comparison is sensitive to ordering in a way that DFG comparison is not. A DFG says "A is sometimes followed by B." Variant comparison says "A is followed by B in this exact position within this exact sequence." This makes variants useful for detecting ordering changes that do not add or remove edges.

Consider two logs where both have edges {A→B, B→C, A→C}:

```
  Log A variants: [A,B,C] (80%), [A,C] (20%)
  Log B variants: [A,C] (80%), [A,B,C] (20%)

  DFG Jaccard: 1.0 (identical edge sets)
  Variant distribution: inverted
```

The DFG says "identical." The variant distribution says "completely different execution patterns." Both signals matter.

### 4. Jaccard Score

The single-number summary. It is useful for:

- **Triage**: "Is this comparison worth investigating?" (J < 0.8 usually means yes)
- **Tracking**: "How is the drift trend evolving?" (plot J over time)
- **Thresholding**: "Alert when J drops below 0.7" (automated monitoring)

But it should never be the only thing you look at. Always check the activity, edge, and variant details to understand *what* changed.

---

## How pmctl diff Works Internally

```
  Log A (XES)                    Log B (XES)
       │                               │
       ▼                               ▼
  Parse traces                   Parse traces
       │                               │
       ▼                               ▼
  Build DFG A                    Build DFG B
  (edge set E_A)                 (edge set E_B)
       │                               │
       └───────────┬───────────────────┘
                   │
                   ▼
         Compute Jaccard similarity J(A,B)
                   │
         ┌─────────┼─────────┐
         ▼         ▼         ▼
    Activity   Edge      Variant
    diff       diff      diff
    (names)   (with     (unique
               freq     sequences)
               deltas)
                   │
                   ▼
            Structured output
         (human or JSON format)
```

Both DFGs are discovered using the same algorithm (`dfg` -- the fast directly-follows graph). This ensures the comparison is apples-to-apples: any differences are due to the event logs, not the discovery algorithm.

---

## Reading the Output

### Human Format

```
  Process Model Comparison
  ───────────────────────

  Jaccard Similarity: 0.72

  Activities:
    Shared:   Register, Assess, Approve, Pay (4)
    Added:    Verify (1)
    Removed:  Fast-Track (1)

  Edges:
    Shared:   Register→Assess, Assess→Approve, Approve→Pay (3)
    Added:    Assess→Verify, Verify→Approve (2)
    Removed:  Assess→Pay (1)

  Frequency Deltas:
    Register→Assess:  95.0% → 87.0%  (Δ -8.0%)
    Assess→Approve:   78.0% → 65.0%  (Δ -13.0%)

  Trace Variants:
    Shared:  3 variants
    Log1 only: 1 variant
    Log2 only: 2 variants
```

### JSON Format

```json
{
  "jaccard": 0.72,
  "activities": {
    "shared": ["Register", "Assess", "Approve", "Pay"],
    "added": ["Verify"],
    "removed": ["Fast-Track"]
  },
  "edges": {
    "shared": ["Register→Assess", "Assess→Approve", "Approve→Pay"],
    "added": ["Assess→Verify", "Verify→Approve"],
    "removed": ["Assess→Pay"],
    "frequency_deltas": [
      { "edge": "Register→Assess", "log1": 0.95, "log2": 0.87, "delta": -0.08 }
    ]
  },
  "variants": {
    "shared": 3,
    "log1_only": 1,
    "log2_only": 2
  }
}
```

---

## Limitations

**Directly-follows only**: The DFG captures only directly-follows relationships (A is immediately followed by B). It does not capture concurrency (A and B happen in parallel), long-distance dependencies (A eventually leads to D but through an unknown path), or choice probability (when A is followed by either B or C, and why). More expressive models (Petri nets, process trees) capture these, but comparing them is significantly more complex and less stable.

**Exact activity name matching**: "Approve" and "APPROVED" and "approve_request" are three different activities. If your logs come from different systems with different naming conventions, you need to normalize before comparing.

**Log size affects significance**: A Jaccard score of 0.85 computed from two logs of 50 traces each is less reliable than the same score from two logs of 5,000 traces each. Small logs may not capture the full process behavior, so differences may be due to sampling rather than actual process divergence.

**No causal interpretation**: The comparison tells you *what* differs, not *why*. An edge appearing in Log B but not Log A could mean a new process step was added, or it could mean Log A simply did not have enough traces to observe that path. Domain context is essential for correct interpretation.

---

## Relationship to Other wasm4pm Features

**Drift detection** is concept drift detection applied within a single log over time (sliding windows). **Diff** is comparison applied between two separate logs. Both use Jaccard similarity on DFG edges, but they answer different questions:

- `pmctl predict drift`: "Is this single process changing over time?"
- `pmctl diff`: "Are these two logs from the same or different processes?"

**Conformance checking** compares a single trace against a reference model. Diff compares two models against each other. Conformance answers "does this case follow the rules?" Diff answers "are the rules themselves different?"

---

## See Also

- [Explanation: Predictive Process Mining](./predictive-process-mining.md) -- prediction perspectives including drift
- [Explanation: Concept Drift Detection](./concept-drift-detection.md) -- temporal drift within a single log
- [Explanation: OCPM](./ocpm.md) -- object-centric process mining for multi-object comparisons
- [Explanation: Profiles](./profiles.md) -- how discovery profile affects the DFGs being compared
