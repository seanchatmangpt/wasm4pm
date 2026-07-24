# Venn Diagram: Set Overlap And Distinction

**Pattern ID:** `30-venn`  
**Mermaid standing:** Stable Mermaid grammar  
**Architecture view:** current, target, diagnostic, or doctrine as stated below

> **Pattern statement:** Use a Venn diagram when exact set membership and overlap clarify concepts that are often conflated.

## Context

Tests, proofs, receipts, replay, and runtime execution overlap as evidence but are not interchangeable.

## Problem

Teams often treat any one evidence form as proof of all properties.

## Forces

- Sets must have explicit membership rules.
- Overlap must represent genuine shared members.
- The diagram should use few sets.
- Empty or unknown intersections must be stated.

The forces should not be resolved by deleting one of them. The purpose of the pattern is to hold them in a stable relationship. When one force dominates, select a neighboring diagram that restores the missing dimension.

## Solution

Choose two or three evidence sets and label the intersection with artifacts that satisfy all definitions.

Apply the solution in four passes:

1. State the primary question in one sentence.
2. Select only entities needed to answer that question.
3. Label every relationship with its semantic type or evidence status.
4. Write the falsifier before treating the diagram as an architectural claim.

## wasm4pm case

The diagram separates executable tests, formal proofs, and receipts while identifying proof-carrying artifacts at the intersection.

The case is not automatically a claim about the current repository. Target components, diagnostic values, and illustrative scenarios are deliberately retained because they expose the next law-complete design. Their standing must remain visible in reviews and generated reports.

## Mermaid source

```mermaid
venn-beta
    title Evidence forms in wasm4pm
    set Tests["Executable tests"]
    set Proofs["Formal proofs"]
    set Receipts["Receipts and replay"]
    Tests & Proofs["Verified behavior"]
    Proofs & Receipts["Proof-carrying evidence"]
    Tests & Receipts["Replayable execution"]
    Tests & Proofs & Receipts["Artifact with standing"]
```

The canonical standalone source is [`diagrams/30-venn.mmd`](../diagrams/30-venn.mmd).

## Reading the diagram

Read this diagram from the perspective of **set overlap and distinction**. Do not infer class ownership from a behavioral diagram, runtime order from a structural diagram, or measured performance from a planning diagram. The pattern becomes stronger when paired with neighbors that answer those adjacent questions explicitly.

## Falsifier

If membership criteria are vague, the overlap is rhetorical rather than analytical.

A falsifier is not a warning label. It is the test that gives the diagram standing. Where the evidence cannot be obtained, the diagram remains `BLOCKED` or `UNKNOWN`; it does not become true by repetition.

## Evidence checklist

- Identify the exact source files, traces, datasets, or decisions supporting each nontrivial relationship.
- Record whether the diagram describes current code, a target composition, or a diagnostic hypothesis.
- Verify that refusal, authority, and evidence boundaries are not hidden for visual simplicity.
- Re-run the relevant proof ladder after source drift.
- Bind renderer results to the exact `.mmd` source and Mermaid version.

## Neighboring patterns

Combine with [18-mindmap](../patterns/18-mindmap.md), [11-requirement](../patterns/11-requirement.md), [27-radar](../patterns/27-radar.md), [33-cynefin](../patterns/33-cynefin.md).

The combination should be monotonic: the neighboring pattern may add a dimension, but it must not silently change the meaning of existing entities or edges. When two views disagree, treat the disagreement as an architecture defect or a standing mismatch, not as stylistic variation.

## Extension questions

- What information is intentionally absent from this view?
- Which edge is most likely to be aspirational rather than observed?
- What typed carrier crosses each boundary?
- Which proof, test, receipt, or trace would promote this view to `ALIVE`?
- Which neighboring pattern would reveal a bypass that this grammar cannot show?
