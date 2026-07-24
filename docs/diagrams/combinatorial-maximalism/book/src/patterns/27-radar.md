# Radar Chart: Multi-Dimensional Capability Profile

**Pattern ID:** `27-radar`  
**Mermaid standing:** Stable Mermaid grammar  
**Architecture view:** current, target, diagnostic, or doctrine as stated below

> **Pattern statement:** Use a radar chart when several dimensions describe one capability profile and tradeoffs matter more than a single rank.

## Context

A wasm4pm subsystem can be assessed across determinism, authority closure, replay, accessibility, performance, and source grounding.

## Problem

A single maturity score hides which invariant is weak.

## Forces

- Axes must share a meaningful scale.
- Profiles should be compared cautiously.
- Scores require evidence or diagnostic labels.
- More area is not automatically better.

The forces should not be resolved by deleting one of them. The purpose of the pattern is to hold them in a stable relationship. When one force dominates, select a neighboring diagram that restores the missing dimension.

## Solution

Define a bounded rubric, score each dimension from evidence, and compare current and target profiles only when supported.

Apply the solution in four passes:

1. State the primary question in one sentence.
2. Select only entities needed to answer that question.
3. Label every relationship with its semantic type or evidence status.
4. Write the falsifier before treating the diagram as an architectural claim.

## wasm4pm case

The example is a diagnostic profile for the target InterviewRuntime, emphasizing authority and replay closure.

The case is not automatically a claim about the current repository. Target components, diagnostic values, and illustrative scenarios are deliberately retained because they expose the next law-complete design. Their standing must remain visible in reviews and generated reports.

## Mermaid source

```mermaid
radar-beta
    title wasm4pm runtime evidence profile - diagnostic
    axis Determinism, Authority, Replay, Accessibility, Performance, Grounding
    curve Current{3,2,2,3,4,4}
    curve Target{5,5,5,5,4,5}
    max 5
    min 0
```

The canonical standalone source is [`diagrams/27-radar.mmd`](../diagrams/27-radar.mmd).

## Reading the diagram

Read this diagram from the perspective of **multi-dimensional capability profile**. Do not infer class ownership from a behavioral diagram, runtime order from a structural diagram, or measured performance from a planning diagram. The pattern becomes stronger when paired with neighbors that answer those adjacent questions explicitly.

## Falsifier

Uncalibrated axes or scores derived from intuition alone make the chart a workshop aid, not assessment evidence.

A falsifier is not a warning label. It is the test that gives the diagram standing. Where the evidence cannot be obtained, the diagram remains `BLOCKED` or `UNKNOWN`; it does not become true by repetition.

## Evidence checklist

- Identify the exact source files, traces, datasets, or decisions supporting each nontrivial relationship.
- Record whether the diagram describes current code, a target composition, or a diagnostic hypothesis.
- Verify that refusal, authority, and evidence boundaries are not hidden for visual simplicity.
- Re-run the relevant proof ladder after source drift.
- Bind renderer results to the exact `.mmd` source and Mermaid version.

## Neighboring patterns

Combine with [10-quadrant](../patterns/10-quadrant.md), [05-state](../patterns/05-state.md), [22-xychart](../patterns/22-xychart.md), [11-requirement](../patterns/11-requirement.md).

The combination should be monotonic: the neighboring pattern may add a dimension, but it must not silently change the meaning of existing entities or edges. When two views disagree, treat the disagreement as an architecture defect or a standing mismatch, not as stylistic variation.

## Extension questions

- What information is intentionally absent from this view?
- Which edge is most likely to be aspirational rather than observed?
- What typed carrier crosses each boundary?
- Which proof, test, receipt, or trace would promote this view to `ALIVE`?
- Which neighboring pattern would reveal a bypass that this grammar cannot show?
