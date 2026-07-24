# Requirement Diagram: Obligation-To-Evidence Traceability

**Pattern ID:** `11-requirement`  
**Mermaid standing:** Stable Mermaid grammar  
**Architecture view:** current, target, diagnostic, or doctrine as stated below

> **Pattern statement:** Use a requirement diagram when the central question is which design element satisfies which obligation and how satisfaction is verified.

## Context

wasm4pm doctrine contains hard invariants such as zero unreceipted actuation, bounded observation, and deterministic replay.

## Problem

Prose requirements drift away from code and tests. A component may be named as satisfying an invariant without a verification method or traceable source.

## Forces

- Requirements need stable identifiers.
- Risk and verification method must be explicit.
- Target elements must not be confused with existing files.
- Satisfaction links require evidence.

The forces should not be resolved by deleting one of them. The purpose of the pattern is to hold them in a stable relationship. When one force dominates, select a neighboring diagram that restores the missing dimension.

## Solution

Model requirements, constraints, and elements separately. Link elements to requirements with satisfies, verifies, or derives relationships and include doc references.

Apply the solution in four passes:

1. State the primary question in one sentence.
2. Select only entities needed to answer that question.
3. Label every relationship with its semantic type or evidence status.
4. Write the falsifier before treating the diagram as an architectural claim.

## wasm4pm case

BRCE-001 is satisfied only when the broker is structurally on every actuation path, not merely because an authority module exists.

The case is not automatically a claim about the current repository. Target components, diagnostic values, and illustrative scenarios are deliberately retained because they expose the next law-complete design. Their standing must remain visible in reviews and generated reports.

## Mermaid source

```mermaid
requirementDiagram
    direction LR
    requirement zero_unreceipted_actuation {
        id: BRCE-001
        text: Every actuation is brokered and receipted.
        risk: high
        verifymethod: test
    }
    functionalRequirement deterministic_replay {
        id: RPL-001
        text: Replay independently revalidates every admitted transition.
        risk: high
        verifymethod: demonstration
    }
    designConstraint bounded_observation {
        id: OBS-001
        text: Only bounded canonical observations influence construction.
        risk: medium
        verifymethod: analysis
    }
    element broker { type: Rust module docref: authority_broker.rs }
    element runtime { type: composition root docref: interview/runtime.rs }
    element gateway { type: boundary docref: interview/event.rs }
    broker - satisfies -> zero_unreceipted_actuation
    runtime - satisfies -> deterministic_replay
    gateway - satisfies -> bounded_observation
```

The canonical standalone source is [`diagrams/11-requirement.mmd`](../diagrams/11-requirement.mmd).

## Reading the diagram

Read this diagram from the perspective of **obligation-to-evidence traceability**. Do not infer class ownership from a behavioral diagram, runtime order from a structural diagram, or measured performance from a planning diagram. The pattern becomes stronger when paired with neighbors that answer those adjacent questions explicitly.

## Falsifier

A requirement marked satisfied without an executable verifier, proof, or source-grounded trace link invalidates the satisfaction edge.

A falsifier is not a warning label. It is the test that gives the diagram standing. Where the evidence cannot be obtained, the diagram remains `BLOCKED` or `UNKNOWN`; it does not become true by repetition.

## Evidence checklist

- Identify the exact source files, traces, datasets, or decisions supporting each nontrivial relationship.
- Record whether the diagram describes current code, a target composition, or a diagnostic hypothesis.
- Verify that refusal, authority, and evidence boundaries are not hidden for visual simplicity.
- Re-run the relevant proof ladder after source drift.
- Bind renderer results to the exact `.mmd` source and Mermaid version.

## Neighboring patterns

Combine with [04-class](../patterns/04-class.md), [05-state](../patterns/05-state.md), [15-c4-component](../patterns/15-c4-component.md), [27-radar](../patterns/27-radar.md).

The combination should be monotonic: the neighboring pattern may add a dimension, but it must not silently change the meaning of existing entities or edges. When two views disagree, treat the disagreement as an architecture defect or a standing mismatch, not as stylistic variation.

## Extension questions

- What information is intentionally absent from this view?
- Which edge is most likely to be aspirational rather than observed?
- What typed carrier crosses each boundary?
- Which proof, test, receipt, or trace would promote this view to `ALIVE`?
- Which neighboring pattern would reveal a bypass that this grammar cannot show?
