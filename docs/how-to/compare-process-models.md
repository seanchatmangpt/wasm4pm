# How-To: Compare Two Event Logs

**Time required**: 5 minutes
**Difficulty**: Beginner

## Problem

You have two event logs and need to understand how the underlying processes differ. Perhaps you are comparing logs from before and after a process change, or logs from two different teams performing the same workflow. `pmctl diff` computes a structural comparison of the two process models and reports the differences in a human-readable format.

---

## 1. Run a basic comparison

```bash
pmctl diff before-process.xes after-process.xes
```

What you should see:

```
Process Diff: before-process.xes -> after-process.xes
============================================================

  Structural similarity: 0.781  ▓▓▓▓▓▓░░  Minor structural changes (Jaccard 0.781)

Activities:
  + New:     Send Invoice, Archive Case
           (appeared in log2, 2 activities)
  - Removed: Manual Review
           (gone in log2, 1 activity)
  = Shared:  8 activities

Edges (directly-follows):
  + New:     Approve->Send Invoice (142)
  + New:     Archive Case->Close (98)
  - Removed: Approve->Manual Review (203)
  ~ Changed: Submit->Approve  450 -> 380  (-16%)

Traces:
  Unique variants  log1: 12  log2: 15  (+3)
  Shared variants: 9
  Only in log1:    3
  Only in log2:    6
```

---

## 2. Understand what is compared

`pmctl diff` discovers a directly-follows graph (DFG) for each log, then compares them on four dimensions:

### Activities

The set of activity nodes in each DFG. Reported as:
- **Added** -- activities that appear in log2 but not log1
- **Removed** -- activities in log1 that are gone in log2
- **Shared** -- activities present in both

### Edges

The directly-follows relationships (A -> B) and their occurrence counts. Reported as:
- **Added** -- new edges in log2
- **Removed** -- edges present in log1 but missing from log2
- **Changed** -- edges present in both logs but with different frequencies (shows count1 -> count2 and percentage change)

### Trace variants

Unique activity sequences across all cases. Reported as:
- **Total** per log
- **Shared** -- variants found in both logs
- **Only in log1 / log2** -- variants unique to each log

### Jaccard structural similarity

A single number from 0.0 to 1.0 computed over the DFG edge sets:

| Range | Interpretation |
|-------|---------------|
| 0.9 -- 1.0 | Nearly identical process structure |
| 0.7 -- 0.9 | Minor structural changes |
| 0.4 -- 0.7 | Significant structural drift |
| 0.0 -- 0.4 | Processes are more different than similar |

The formula is `|E1 intersect E2| / |E1 union E2|` where E1 and E2 are the edge sets of the two DFGs.

---

## 3. Get JSON output for programmatic use

```bash
pmctl diff log1.xes log2.xes --format json
```

What you should see:

```json
{
  "status": "success",
  "message": "Process diff complete",
  "data": {
    "log1": "log1.xes",
    "log2": "log2.xes",
    "activityKey": "concept:name",
    "diff": {
      "activities": {
        "added": ["Send Invoice", "Archive Case"],
        "removed": ["Manual Review"],
        "shared": ["Submit", "Approve", "Reject", "Close", "Notify", "Escalate", "Review", "Process"]
      },
      "edges": {
        "added": [{ "from": "Approve", "to": "Send Invoice", "count": 142 }],
        "removed": [{ "from": "Approve", "to": "Manual Review", "count": 203 }],
        "changed": [{ "from": "Submit", "to": "Approve", "count1": 450, "count2": 380, "pctChange": -15.56 }]
      },
      "variants": {
        "uniqueLog1": 3,
        "uniqueLog2": 6,
        "shared": 9,
        "totalLog1": 12,
        "totalLog2": 15
      },
      "jaccard": 0.781,
      "summary": "Minor structural changes (Jaccard 0.781)"
    }
  }
}
```

Extract the Jaccard score in a script:

```bash
pmctl diff v1.xes v2.xes --format json | jq '.data.diff.jaccard'
```

---

## 4. Use a custom activity key

If your XES log uses a non-standard attribute for activity names:

```bash
pmctl diff log1.xes log2.xes --activity-key "lifecycle:transition"
```

The default is `concept:name`.

---

## 5. Interpret the color-coded diff

In the human-readable output, changes are color-coded:

| Symbol | Color | Meaning |
|--------|-------|---------|
| `+` | Green | New in log2 (added) |
| `-` | Red | Gone in log2 (removed) |
| `~` | Cyan | Present in both but changed |
| `=` | Cyan | Unchanged |

Edge frequency changes show the direction: `-16%` in red means the edge occurs less often in log2.

---

## 6. Practical workflows

### Compare before/after a process change

```bash
pmctl diff pre-automation.xes post-automation.xes
```

Look for removed activities (steps that were eliminated) and changed edge frequencies (routing changes).

### Compare two teams doing the same process

```bash
pmctl diff team-a.xes team-b.xes
```

A low Jaccard score reveals that the two teams follow different process variants.

### Track process drift over time

```bash
# Split a large log into monthly chunks, then compare consecutive months
pmctl diff january.xes february.xes
pmctl diff february.xes march.xes
```

Rising `Only in log2` variant counts and falling Jaccard scores indicate progressive drift.

---

## See Also

- [How-To: Monitor Drift in Real-Time](./monitor-drift.md) -- continuous drift detection via streaming
- [How-To: Choose an Algorithm](./choose-algorithm.md) -- selecting a discovery algorithm for your log
- [Reference: Config Schema](../reference/config-schema.md) -- `--activity-key` and other config options
