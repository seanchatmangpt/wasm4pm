# Timeline: Architecture Evolution

**Pattern ID:** `19-timeline`  
**Mermaid standing:** Stable Mermaid grammar  
**Architecture view:** current, target, diagnostic, or doctrine as stated below

> **Pattern statement:** Use a timeline when the meaning of the current architecture depends on a sequence of conceptual closures.

## Context

wasm4pm doctrine accumulated through star-toml receipts, graphlaw, POWL, Lean admission, ggen projection, and InterviewAssist.

## Problem

A current snapshot can make mature invariants appear arbitrary because it hides the problems that caused them to emerge.

## Forces

- Events must be historically grounded.
- A timeline shows sequence, not causation.
- Milestones should be architectural, not merely chronological.
- Present standing must not be inferred from age.

The forces should not be resolved by deleting one of them. The purpose of the pattern is to hold them in a stable relationship. When one force dominates, select a neighboring diagram that restores the missing dimension.

## Solution

Record a small number of dated doctrine or capability milestones and link each to the pattern it introduced.

Apply the solution in four passes:

1. State the primary question in one sentence.
2. Select only entities needed to answer that question.
3. Label every relationship with its semantic type or evidence status.
4. Write the falsifier before treating the diagram as an architectural claim.

## wasm4pm case

The timeline frames BRCE, CONSTRUCT, proof-carrying process models, and the dual InterviewAssist rails as an evolving architecture.

The case is not automatically a claim about the current repository. Target components, diagnostic values, and illustrative scenarios are deliberately retained because they expose the next law-complete design. Their standing must remain visible in reviews and generated reports.

## Mermaid source

```mermaid
timeline
    title wasm4pm architecture evolution
    2026-06 : star-toml receipt discipline
            : zero unreceipted actuation
    2026-07 : ggen graph projection
            : Lean standing and proof receipts
            : PC-POWL2 partial-order verification
            : InterviewAssist session and Rust interview rails
            : all-Mermaid combinatorial pattern atlas
```

The canonical standalone source is [`diagrams/19-timeline.mmd`](../diagrams/19-timeline.mmd).

## Reading the diagram

Read this diagram from the perspective of **architecture evolution**. Do not infer class ownership from a behavioral diagram, runtime order from a structural diagram, or measured performance from a planning diagram. The pattern becomes stronger when paired with neighbors that answer those adjacent questions explicitly.

## Falsifier

Incorrect dates or retroactively assigned meanings turn the timeline into mythology.

A falsifier is not a warning label. It is the test that gives the diagram standing. Where the evidence cannot be obtained, the diagram remains `BLOCKED` or `UNKNOWN`; it does not become true by repetition.

## Evidence checklist

- Identify the exact source files, traces, datasets, or decisions supporting each nontrivial relationship.
- Record whether the diagram describes current code, a target composition, or a diagnostic hypothesis.
- Verify that refusal, authority, and evidence boundaries are not hidden for visual simplicity.
- Re-run the relevant proof ladder after source drift.
- Bind renderer results to the exact `.mmd` source and Mermaid version.

## Neighboring patterns

Combine with [12-gitgraph](../patterns/12-gitgraph.md), [28-event-modeling](../patterns/28-event-modeling.md), [32-wardley](../patterns/32-wardley.md), [18-mindmap](../patterns/18-mindmap.md).

The combination should be monotonic: the neighboring pattern may add a dimension, but it must not silently change the meaning of existing entities or edges. When two views disagree, treat the disagreement as an architecture defect or a standing mismatch, not as stylistic variation.

## Extension questions

- What information is intentionally absent from this view?
- Which edge is most likely to be aspirational rather than observed?
- What typed carrier crosses each boundary?
- Which proof, test, receipt, or trace would promote this view to `ALIVE`?
- Which neighboring pattern would reveal a bypass that this grammar cannot show?
