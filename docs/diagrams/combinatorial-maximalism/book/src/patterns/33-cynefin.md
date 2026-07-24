# Cynefin Diagram: Decision Mode By Domain Uncertainty

**Pattern ID:** `33-cynefin`  
**Mermaid standing:** Stable Mermaid grammar  
**Architecture view:** current, target, diagnostic, or doctrine as stated below

> **Pattern statement:** Use a Cynefin diagram when different problems require different decision modes rather than one universal engineering method.

## Context

wasm4pm work ranges from obvious file changes to complicated proof engineering, complex open-ended construction, and chaotic production failures.

## Problem

Applying deterministic planning to complex discovery or exploratory agents to obvious operations wastes effort and can increase risk.

## Forces

- Classification is contextual and revisable.
- Each domain implies a different action pattern.
- Disorder must be resolved before execution.
- Chaotic work requires containment before optimization.

The forces should not be resolved by deleting one of them. The purpose of the pattern is to hold them in a stable relationship. When one force dominates, select a neighboring diagram that restores the missing dimension.

## Solution

Classify work as Clear, Complicated, Complex, Chaotic, or Confused and assign the corresponding response: sense-categorize-respond, sense-analyze-respond, probe-sense-respond, or act-sense-respond.

Apply the solution in four passes:

1. State the primary question in one sentence.
2. Select only entities needed to answer that question.
3. Label every relationship with its semantic type or evidence status.
4. Write the falsifier before treating the diagram as an architectural claim.

## wasm4pm case

Generated file normalization is Clear; Lean boundary repair is Complicated; CONSTRUCT exploration is Complex; unreceipted production actuation is Chaotic and must be contained.

The case is not automatically a claim about the current repository. Target components, diagnostic values, and illustrative scenarios are deliberately retained because they expose the next law-complete design. Their standing must remain visible in reviews and generated reports.

## Mermaid source

```mermaid
cynefin-beta
    title wasm4pm decision domains
    clear "Deterministic formatting" "Known release commands"
    complicated "Lean proof repair" "Performance profiling"
    complex "CONSTRUCT search" "Ontology composition"
    chaotic "Unbrokered production effect" "Corrupted receipt ledger"
    confused "Unclassified user intent" "Unknown standing"
    action clear "Sense - categorize - respond"
    action complicated "Sense - analyze - respond"
    action complex "Probe - sense - respond"
    action chaotic "Act - sense - respond"
```

The canonical standalone source is [`diagrams/33-cynefin.mmd`](../diagrams/33-cynefin.mmd).

## Reading the diagram

Read this diagram from the perspective of **decision mode by domain uncertainty**. Do not infer class ownership from a behavioral diagram, runtime order from a structural diagram, or measured performance from a planning diagram. The pattern becomes stronger when paired with neighbors that answer those adjacent questions explicitly.

## Falsifier

If all work is classified to justify a preferred method, the diagram is being used ideologically rather than diagnostically.

A falsifier is not a warning label. It is the test that gives the diagram standing. Where the evidence cannot be obtained, the diagram remains `BLOCKED` or `UNKNOWN`; it does not become true by repetition.

## Evidence checklist

- Identify the exact source files, traces, datasets, or decisions supporting each nontrivial relationship.
- Record whether the diagram describes current code, a target composition, or a diagnostic hypothesis.
- Verify that refusal, authority, and evidence boundaries are not hidden for visual simplicity.
- Re-run the relevant proof ladder after source drift.
- Bind renderer results to the exact `.mmd` source and Mermaid version.

## Neighboring patterns

Combine with [10-quadrant](../patterns/10-quadrant.md), [25-kanban](../patterns/25-kanban.md), [31-ishikawa](../patterns/31-ishikawa.md), [18-mindmap](../patterns/18-mindmap.md).

The combination should be monotonic: the neighboring pattern may add a dimension, but it must not silently change the meaning of existing entities or edges. When two views disagree, treat the disagreement as an architecture defect or a standing mismatch, not as stylistic variation.

## Extension questions

- What information is intentionally absent from this view?
- Which edge is most likely to be aspirational rather than observed?
- What typed carrier crosses each boundary?
- Which proof, test, receipt, or trace would promote this view to `ALIVE`?
- Which neighboring pattern would reveal a bypass that this grammar cannot show?
