# Quadrant Chart: Two-Axis Work Selection

**Pattern ID:** `10-quadrant`  
**Mermaid standing:** Stable Mermaid grammar  
**Architecture view:** current, target, diagnostic, or doctrine as stated below

> **Pattern statement:** Use a quadrant chart when two independent dimensions produce different action policies.

## Context

DCM distinguishes standing from reversibility. A candidate may be highly reversible but weakly proven, or strongly proven but operationally irreversible.

## Problem

Single priority scores collapse distinct risks and can rank direct mutation above reversible exploration.

## Forces

- Axes must be independent enough to be useful.
- Quadrant names must imply actions.
- Positions must be evidence-based or labeled diagnostic.
- The chart must not erase uncertainty.

The forces should not be resolved by deleting one of them. The purpose of the pattern is to hold them in a stable relationship. When one force dominates, select a neighboring diagram that restores the missing dimension.

## Solution

Place work by standing and reversibility. Use quadrants to decide manufacture, prove, explore, or refuse.

Apply the solution in four passes:

1. State the primary question in one sentence.
2. Select only entities needed to answer that question.
3. Label every relationship with its semantic type or evidence status.
4. Write the falsifier before treating the diagram as an architectural claim.

## wasm4pm case

CONSTRUCT candidates belong in Explore; kernel-admitted theorems approach Manufacture; direct unreceipted mutation belongs in Refuse or quarantine.

The case is not automatically a claim about the current repository. Target components, diagnostic values, and illustrative scenarios are deliberately retained because they expose the next law-complete design. Their standing must remain visible in reviews and generated reports.

## Mermaid source

```mermaid
quadrantChart
    title wasm4pm work selection by standing and reversibility
    x-axis Low reversibility --> High reversibility
    y-axis Low standing --> High standing
    quadrant-1 Manufacture now
    quadrant-2 Prove before scale
    quadrant-3 Refuse or quarantine
    quadrant-4 Explore in graph
    "Receipt replay": [0.82, 0.90]
    "CONSTRUCT candidate": [0.92, 0.45]
    "Direct filesystem mutation": [0.12, 0.18]
    "Kernel admitted theorem": [0.70, 0.98]
    "Unscoped authority grant": [0.20, 0.35]
```

The canonical standalone source is [`diagrams/10-quadrant.mmd`](../diagrams/10-quadrant.mmd).

## Reading the diagram

Read this diagram from the perspective of **two-axis work selection**. Do not infer class ownership from a behavioral diagram, runtime order from a structural diagram, or measured performance from a planning diagram. The pattern becomes stronger when paired with neighbors that answer those adjacent questions explicitly.

## Falsifier

If axis scores are arbitrary yet treated as measurements, the chart is only a workshop prompt, not evidence.

A falsifier is not a warning label. It is the test that gives the diagram standing. Where the evidence cannot be obtained, the diagram remains `BLOCKED` or `UNKNOWN`; it does not become true by repetition.

## Evidence checklist

- Identify the exact source files, traces, datasets, or decisions supporting each nontrivial relationship.
- Record whether the diagram describes current code, a target composition, or a diagnostic hypothesis.
- Verify that refusal, authority, and evidence boundaries are not hidden for visual simplicity.
- Re-run the relevant proof ladder after source drift.
- Bind renderer results to the exact `.mmd` source and Mermaid version.

## Neighboring patterns

Combine with [27-radar](../patterns/27-radar.md), [33-cynefin](../patterns/33-cynefin.md), [32-wardley](../patterns/32-wardley.md), [08-gantt](../patterns/08-gantt.md).

The combination should be monotonic: the neighboring pattern may add a dimension, but it must not silently change the meaning of existing entities or edges. When two views disagree, treat the disagreement as an architecture defect or a standing mismatch, not as stylistic variation.

## Extension questions

- What information is intentionally absent from this view?
- Which edge is most likely to be aspirational rather than observed?
- What typed carrier crosses each boundary?
- Which proof, test, receipt, or trace would promote this view to `ALIVE`?
- Which neighboring pattern would reveal a bypass that this grammar cannot show?
