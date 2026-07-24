# Event Modeling: Event-Command-Read-Model Chronology

**Pattern ID:** `28-event-modeling`  
**Mermaid standing:** Experimental or beta grammar  
**Architecture view:** current, target, diagnostic, or doctrine as stated below

> **Pattern statement:** Use Event Modeling when the system is event-driven and the design must connect commands, events, policies, and read models over time.

## Context

wasm4pm sessions are naturally expressed as observed events, admitted facts, commands for bounded action, receipts, and projections.

## Problem

Sequence diagrams show one trace but not the reusable event vocabulary or how read models derive from it.

## Forces

- Events are immutable facts.
- Commands can be refused.
- Read models are projections, not sources of truth.
- Time order and causality must be explicit.

The forces should not be resolved by deleting one of them. The purpose of the pattern is to hold them in a stable relationship. When one force dominates, select a neighboring diagram that restores the missing dimension.

## Solution

Lay out events on a timeline and attach the commands, policies, and projections that create or consume them.

Apply the solution in four passes:

1. State the primary question in one sentence.
2. Select only entities needed to answer that question.
3. Label every relationship with its semantic type or evidence status.
4. Write the falsifier before treating the diagram as an architectural claim.

## wasm4pm case

The pattern separates semantic session replay from receipt-chain verification by giving each its own event and projection role.

The case is not automatically a claim about the current repository. Target components, diagnostic values, and illustrative scenarios are deliberately retained because they expose the next law-complete design. Their standing must remain visible in reviews and generated reports.

## Mermaid source

```mermaid
eventModel-beta
    title wasm4pm bounded actuation event model
    event "ObservationCaptured"
    command "AdmitObservation"
    event "ObservationAdmitted"
    command "ConstructCandidates"
    event "CandidateDerived"
    command "AuthorizeCapability"
    event "AuthorityGranted"
    command "Actuate"
    event "ArtifactProduced"
    event "ReceiptAppended"
    event "StandingAssigned"
```

The canonical standalone source is [`diagrams/28-event-modeling.mmd`](../diagrams/28-event-modeling.mmd).

## Reading the diagram

Read this diagram from the perspective of **event-command-read-model chronology**. Do not infer class ownership from a behavioral diagram, runtime order from a structural diagram, or measured performance from a planning diagram. The pattern becomes stronger when paired with neighbors that answer those adjacent questions explicitly.

## Falsifier

If a read model can mutate source events or a command is recorded as an event before admission, the model is invalid.

A falsifier is not a warning label. It is the test that gives the diagram standing. Where the evidence cannot be obtained, the diagram remains `BLOCKED` or `UNKNOWN`; it does not become true by repetition.

## Evidence checklist

- Identify the exact source files, traces, datasets, or decisions supporting each nontrivial relationship.
- Record whether the diagram describes current code, a target composition, or a diagnostic hypothesis.
- Verify that refusal, authority, and evidence boundaries are not hidden for visual simplicity.
- Re-run the relevant proof ladder after source drift.
- Bind renderer results to the exact `.mmd` source and Mermaid version.

## Neighboring patterns

Combine with [03-sequence](../patterns/03-sequence.md), [06-er](../patterns/06-er.md), [12-gitgraph](../patterns/12-gitgraph.md), [19-timeline](../patterns/19-timeline.md).

The combination should be monotonic: the neighboring pattern may add a dimension, but it must not silently change the meaning of existing entities or edges. When two views disagree, treat the disagreement as an architecture defect or a standing mismatch, not as stylistic variation.

## Extension questions

- What information is intentionally absent from this view?
- Which edge is most likely to be aspirational rather than observed?
- What typed carrier crosses each boundary?
- Which proof, test, receipt, or trace would promote this view to `ALIVE`?
- Which neighboring pattern would reveal a bypass that this grammar cannot show?
