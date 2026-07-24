# C4 Context: System Boundary And External Actors

**Pattern ID:** `13-c4-context`  
**Mermaid standing:** Experimental or beta grammar  
**Architecture view:** current, target, diagnostic, or doctrine as stated below

> **Pattern statement:** Use C4 Context to define what wasm4pm is, who uses it, and which external systems exchange responsibilities with it.

## Context

Before discussing crates, routes, or adapters, the architecture must identify the system of interest and its external actors.

## Problem

Component-first diagrams make external authority and verification dependencies look internal or optional.

## Forces

- The diagram must fit on one page.
- Only systems and people appear.
- Relationships describe value or responsibility.
- Target and current external systems must be distinguished.

The forces should not be resolved by deleting one of them. The purpose of the pattern is to hold them in a stable relationship. When one force dominates, select a neighboring diagram that restores the missing dimension.

## Solution

Place wasm4pm at the center, name human actors, projection engines, and independent verifiers, and label each relationship with the exchanged responsibility.

Apply the solution in four passes:

1. State the primary question in one sentence.
2. Select only entities needed to answer that question.
3. Label every relationship with its semantic type or evidence status.
4. Write the falsifier before treating the diagram as an architectural claim.

## wasm4pm case

The context view treats ggen as a projection engine and the verifier as an independent evidence boundary rather than implementation details.

The case is not automatically a claim about the current repository. Target components, diagnostic values, and illustrative scenarios are deliberately retained because they expose the next law-complete design. Their standing must remain visible in reviews and generated reports.

## Mermaid source

```mermaid
C4Context
    title wasm4pm system context
    Person(researcher, "Researcher", "States intent and reviews standing")
    System(wasm4pm, "wasm4pm", "Proof-carrying process manufacturing")
    System_Ext(ggen, "ggen", "Projects admitted graphs into artifacts")
    System_Ext(verifier, "Verifier", "Runs tests, proofs, and replay")
    Rel(researcher, wasm4pm, "Submits bounded observations")
    Rel(wasm4pm, ggen, "Requests reversible projection")
    Rel(ggen, verifier, "Requests evidence")
    Rel(verifier, researcher, "Returns standing and receipts")
```

The canonical standalone source is [`diagrams/13-c4-context.mmd`](../diagrams/13-c4-context.mmd).

## Reading the diagram

Read this diagram from the perspective of **system boundary and external actors**. Do not infer class ownership from a behavioral diagram, runtime order from a structural diagram, or measured performance from a planning diagram. The pattern becomes stronger when paired with neighbors that answer those adjacent questions explicitly.

## Falsifier

If a supposedly external verifier is actually in-process and controlled by the same mutable state as execution, the trust boundary is false.

A falsifier is not a warning label. It is the test that gives the diagram standing. Where the evidence cannot be obtained, the diagram remains `BLOCKED` or `UNKNOWN`; it does not become true by repetition.

## Evidence checklist

- Identify the exact source files, traces, datasets, or decisions supporting each nontrivial relationship.
- Record whether the diagram describes current code, a target composition, or a diagnostic hypothesis.
- Verify that refusal, authority, and evidence boundaries are not hidden for visual simplicity.
- Re-run the relevant proof ladder after source drift.
- Bind renderer results to the exact `.mmd` source and Mermaid version.

## Neighboring patterns

Combine with [14-c4-container](../patterns/14-c4-container.md), [07-user-journey](../patterns/07-user-journey.md), [32-wardley](../patterns/32-wardley.md), [34-treeview](../patterns/34-treeview.md).

The combination should be monotonic: the neighboring pattern may add a dimension, but it must not silently change the meaning of existing entities or edges. When two views disagree, treat the disagreement as an architecture defect or a standing mismatch, not as stylistic variation.

## Extension questions

- What information is intentionally absent from this view?
- Which edge is most likely to be aspirational rather than observed?
- What typed carrier crosses each boundary?
- Which proof, test, receipt, or trace would promote this view to `ALIVE`?
- Which neighboring pattern would reveal a bypass that this grammar cannot show?
