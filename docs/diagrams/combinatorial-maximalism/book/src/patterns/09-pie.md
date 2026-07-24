# Pie Chart: Bounded Allocation

**Pattern ID:** `09-pie`  
**Mermaid standing:** Stable Mermaid grammar  
**Architecture view:** current, target, diagnostic, or doctrine as stated below

> **Pattern statement:** Use a pie chart only when categories are mutually exclusive parts of one explicitly bounded whole.

## Context

Evidence budgets, review time, or test allocation can be discussed as portions of a fixed capacity.

## Problem

Pie charts are easily abused to imply measured proportions where only illustrative planning weights exist.

## Forces

- The denominator must be named.
- Categories must not overlap.
- Illustrative values must be labeled diagnostic.
- No slice may be interpreted as standing.

The forces should not be resolved by deleting one of them. The purpose of the pattern is to hold them in a stable relationship. When one force dominates, select a neighboring diagram that restores the missing dimension.

## Solution

Use a pie chart for a single bounded allocation and accompany it with the denominator, measurement period, and evidence source.

Apply the solution in four passes:

1. State the primary question in one sentence.
2. Select only entities needed to answer that question.
3. Label every relationship with its semantic type or evidence status.
4. Write the falsifier before treating the diagram as an architectural claim.

## wasm4pm case

The atlas uses an illustrative evidence allocation to show that unverified narrative should be a small portion of the decision surface.

The case is not automatically a claim about the current repository. Target components, diagnostic values, and illustrative scenarios are deliberately retained because they expose the next law-complete design. Their standing must remain visible in reviews and generated reports.

## Mermaid source

```mermaid
pie showData
    title wasm4pm evidence allocation - diagnostic example
    "Source-bound observations" : 30
    "Executable tests" : 25
    "Kernel or model proofs" : 20
    "Receipt and replay evidence" : 20
    "Unverified narrative" : 5
```

The canonical standalone source is [`diagrams/09-pie.mmd`](../diagrams/09-pie.mmd).

## Reading the diagram

Read this diagram from the perspective of **bounded allocation**. Do not infer class ownership from a behavioral diagram, runtime order from a structural diagram, or measured performance from a planning diagram. The pattern becomes stronger when paired with neighbors that answer those adjacent questions explicitly.

## Falsifier

Overlapping categories or values not derived from a declared dataset invalidate the chart as evidence.

A falsifier is not a warning label. It is the test that gives the diagram standing. Where the evidence cannot be obtained, the diagram remains `BLOCKED` or `UNKNOWN`; it does not become true by repetition.

## Evidence checklist

- Identify the exact source files, traces, datasets, or decisions supporting each nontrivial relationship.
- Record whether the diagram describes current code, a target composition, or a diagnostic hypothesis.
- Verify that refusal, authority, and evidence boundaries are not hidden for visual simplicity.
- Re-run the relevant proof ladder after source drift.
- Bind renderer results to the exact `.mmd` source and Mermaid version.

## Neighboring patterns

Combine with [21-sankey](../patterns/21-sankey.md), [22-xychart](../patterns/22-xychart.md), [27-radar](../patterns/27-radar.md), [29-treemap](../patterns/29-treemap.md).

The combination should be monotonic: the neighboring pattern may add a dimension, but it must not silently change the meaning of existing entities or edges. When two views disagree, treat the disagreement as an architecture defect or a standing mismatch, not as stylistic variation.

## Extension questions

- What information is intentionally absent from this view?
- Which edge is most likely to be aspirational rather than observed?
- What typed carrier crosses each boundary?
- Which proof, test, receipt, or trace would promote this view to `ALIVE`?
- Which neighboring pattern would reveal a bypass that this grammar cannot show?
