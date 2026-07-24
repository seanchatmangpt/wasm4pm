# Treemap: Hierarchical Allocation

**Pattern ID:** `29-treemap`  
**Mermaid standing:** Stable Mermaid grammar  
**Architecture view:** current, target, diagnostic, or doctrine as stated below

> **Pattern statement:** Use a treemap when a bounded quantity is distributed through a hierarchy and relative area is useful.

## Context

Repository surface, test inventory, evidence volume, or maintenance cost can be allocated across subsystems and subareas.

## Problem

A flat pie chart cannot show both hierarchy and proportion.

## Forces

- Area must encode one quantity.
- Hierarchy must be real.
- Labels must remain legible.
- The chart must not imply causation or standing.

The forces should not be resolved by deleting one of them. The purpose of the pattern is to hold them in a stable relationship. When one force dominates, select a neighboring diagram that restores the missing dimension.

## Solution

Choose a single bounded metric and nest subsystem allocations beneath the total.

Apply the solution in four passes:

1. State the primary question in one sentence.
2. Select only entities needed to answer that question.
3. Label every relationship with its semantic type or evidence status.
4. Write the falsifier before treating the diagram as an architectural claim.

## wasm4pm case

The example is a diagnostic view of documentation attention across doctrine, architecture, behavior, evidence, and operations.

The case is not automatically a claim about the current repository. Target components, diagnostic values, and illustrative scenarios are deliberately retained because they expose the next law-complete design. Their standing must remain visible in reviews and generated reports.

## Mermaid source

```mermaid
treemap-beta
"wasm4pm book"
  "Doctrine": 18
    "Observation": 6
    "Authority": 6
    "Standing": 6
  "Architecture": 28
    "C4": 15
    "Structure": 13
  "Behavior": 24
  "Evidence": 18
  "Operations": 12
```

The canonical standalone source is [`diagrams/29-treemap.mmd`](../diagrams/29-treemap.mmd).

## Reading the diagram

Read this diagram from the perspective of **hierarchical allocation**. Do not infer class ownership from a behavioral diagram, runtime order from a structural diagram, or measured performance from a planning diagram. The pattern becomes stronger when paired with neighbors that answer those adjacent questions explicitly.

## Falsifier

Mixed units or categories that overlap invalidate the area comparison.

A falsifier is not a warning label. It is the test that gives the diagram standing. Where the evidence cannot be obtained, the diagram remains `BLOCKED` or `UNKNOWN`; it does not become true by repetition.

## Evidence checklist

- Identify the exact source files, traces, datasets, or decisions supporting each nontrivial relationship.
- Record whether the diagram describes current code, a target composition, or a diagnostic hypothesis.
- Verify that refusal, authority, and evidence boundaries are not hidden for visual simplicity.
- Re-run the relevant proof ladder after source drift.
- Bind renderer results to the exact `.mmd` source and Mermaid version.

## Neighboring patterns

Combine with [09-pie](../patterns/09-pie.md), [18-mindmap](../patterns/18-mindmap.md), [21-sankey](../patterns/21-sankey.md), [34-treeview](../patterns/34-treeview.md).

The combination should be monotonic: the neighboring pattern may add a dimension, but it must not silently change the meaning of existing entities or edges. When two views disagree, treat the disagreement as an architecture defect or a standing mismatch, not as stylistic variation.

## Extension questions

- What information is intentionally absent from this view?
- Which edge is most likely to be aspirational rather than observed?
- What typed carrier crosses each boundary?
- Which proof, test, receipt, or trace would promote this view to `ALIVE`?
- Which neighboring pattern would reveal a bypass that this grammar cannot show?
