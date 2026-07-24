# XY Chart: Trend Or Comparison

**Pattern ID:** `22-xychart`  
**Mermaid standing:** Stable Mermaid grammar  
**Architecture view:** current, target, diagnostic, or doctrine as stated below

> **Pattern statement:** Use an XY chart when one ordered variable changes against another and the relationship matters.

## Context

wasm4pm can measure replay time, throughput, memory, receipt depth, or proof latency across controlled inputs.

## Problem

Architecture prose cannot show scaling behavior or regression trends.

## Forces

- Axes and units must be explicit.
- Points need a reproducible dataset.
- Trend is not causation.
- Benchmarks must bind environment and commit.

The forces should not be resolved by deleting one of them. The purpose of the pattern is to hold them in a stable relationship. When one force dominates, select a neighboring diagram that restores the missing dimension.

## Solution

Plot one dependent variable against one independent variable and attach the dataset and benchmark receipt.

Apply the solution in four passes:

1. State the primary question in one sentence.
2. Select only entities needed to answer that question.
3. Label every relationship with its semantic type or evidence status.
4. Write the falsifier before treating the diagram as an architectural claim.

## wasm4pm case

The example shows diagnostic replay latency as receipt count grows; it is not a measured repository benchmark.

The case is not automatically a claim about the current repository. Target components, diagnostic values, and illustrative scenarios are deliberately retained because they expose the next law-complete design. Their standing must remain visible in reviews and generated reports.

## Mermaid source

```mermaid
xychart-beta
    title "Diagnostic replay latency by receipt count"
    x-axis "Receipts" [1, 10, 100, 1000, 10000]
    y-axis "Relative latency" 0 --> 100
    line [1, 3, 8, 28, 92]
```

The canonical standalone source is [`diagrams/22-xychart.mmd`](../diagrams/22-xychart.mmd).

## Reading the diagram

Read this diagram from the perspective of **trend or comparison**. Do not infer class ownership from a behavioral diagram, runtime order from a structural diagram, or measured performance from a planning diagram. The pattern becomes stronger when paired with neighbors that answer those adjacent questions explicitly.

## Falsifier

Missing units, environment, or data source makes the chart illustrative only.

A falsifier is not a warning label. It is the test that gives the diagram standing. Where the evidence cannot be obtained, the diagram remains `BLOCKED` or `UNKNOWN`; it does not become true by repetition.

## Evidence checklist

- Identify the exact source files, traces, datasets, or decisions supporting each nontrivial relationship.
- Record whether the diagram describes current code, a target composition, or a diagnostic hypothesis.
- Verify that refusal, authority, and evidence boundaries are not hidden for visual simplicity.
- Re-run the relevant proof ladder after source drift.
- Bind renderer results to the exact `.mmd` source and Mermaid version.

## Neighboring patterns

Combine with [27-radar](../patterns/27-radar.md), [21-sankey](../patterns/21-sankey.md), [09-pie](../patterns/09-pie.md), [31-ishikawa](../patterns/31-ishikawa.md).

The combination should be monotonic: the neighboring pattern may add a dimension, but it must not silently change the meaning of existing entities or edges. When two views disagree, treat the disagreement as an architecture defect or a standing mismatch, not as stylistic variation.

## Extension questions

- What information is intentionally absent from this view?
- Which edge is most likely to be aspirational rather than observed?
- What typed carrier crosses each boundary?
- Which proof, test, receipt, or trace would promote this view to `ALIVE`?
- Which neighboring pattern would reveal a bypass that this grammar cannot show?
