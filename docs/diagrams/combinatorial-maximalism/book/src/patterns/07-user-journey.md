# User Journey: Human Effort And Confidence

**Pattern ID:** `07-user-journey`  
**Mermaid standing:** Stable Mermaid grammar  
**Architecture view:** current, target, diagnostic, or doctrine as stated below

> **Pattern statement:** Use a user journey when the design must account for cognitive burden, confidence, and accessibility across the proof-carrying workflow.

## Context

A mathematically sound system can still fail if the researcher cannot understand why an observation was refused, what evidence is missing, or what standing an artifact has.

## Problem

Technical diagrams optimize machine composition while hiding the human cost of interpreting policies, waiting for verification, or recovering from a refusal.

## Forces

- The user must understand refusal without reading internals.
- Evidence should increase confidence, not merely add output.
- Accessibility is part of the path, not an afterthought.
- Automation must reduce repeated decisions without hiding authority.

The forces should not be resolved by deleting one of them. The purpose of the pattern is to hold them in a stable relationship. When one force dominates, select a neighboring diagram that restores the missing dimension.

## Solution

Map the journey through Admit, Construct, Prove, Actuate, and Replay. Score each step and name the responsible human or system actor. Use low scores to locate interaction redesign opportunities.

Apply the solution in four passes:

1. State the primary question in one sentence.
2. Select only entities needed to answer that question.
3. Label every relationship with its semantic type or evidence status.
4. Write the falsifier before treating the diagram as an architectural claim.

## wasm4pm case

InterviewAssist uses the journey to evaluate whether cognition clarification, editor execution, and receipt presentation form one accessible session rather than isolated features.

The case is not automatically a claim about the current repository. Target components, diagnostic values, and illustrative scenarios are deliberately retained because they expose the next law-complete design. Their standing must remain visible in reviews and generated reports.

## Mermaid source

```mermaid
journey
    title wasm4pm contributor path from intent to standing
    section Admit
      Capture bounded observation: 5: Researcher
      Validate ontology and policy: 4: Runtime, Verifier
    section Construct
      Explore reversible graph: 5: Runtime
      Request authority: 3: Broker
    section Prove
      Execute and receipt: 4: Executor
      Replay and verify: 5: Verifier
```

The canonical standalone source is [`diagrams/07-user-journey.mmd`](../diagrams/07-user-journey.mmd).

## Reading the diagram

Read this diagram from the perspective of **human effort and confidence**. Do not infer class ownership from a behavioral diagram, runtime order from a structural diagram, or measured performance from a planning diagram. The pattern becomes stronger when paired with neighbors that answer those adjacent questions explicitly.

## Falsifier

If usability evidence shows that receipts or standings confuse users, a high-confidence journey score is invalid regardless of backend correctness.

A falsifier is not a warning label. It is the test that gives the diagram standing. Where the evidence cannot be obtained, the diagram remains `BLOCKED` or `UNKNOWN`; it does not become true by repetition.

## Evidence checklist

- Identify the exact source files, traces, datasets, or decisions supporting each nontrivial relationship.
- Record whether the diagram describes current code, a target composition, or a diagnostic hypothesis.
- Verify that refusal, authority, and evidence boundaries are not hidden for visual simplicity.
- Re-run the relevant proof ladder after source drift.
- Bind renderer results to the exact `.mmd` source and Mermaid version.

## Neighboring patterns

Combine with [18-mindmap](../patterns/18-mindmap.md), [19-timeline](../patterns/19-timeline.md), [25-kanban](../patterns/25-kanban.md), [33-cynefin](../patterns/33-cynefin.md).

The combination should be monotonic: the neighboring pattern may add a dimension, but it must not silently change the meaning of existing entities or edges. When two views disagree, treat the disagreement as an architecture defect or a standing mismatch, not as stylistic variation.

## Extension questions

- What information is intentionally absent from this view?
- Which edge is most likely to be aspirational rather than observed?
- What typed carrier crosses each boundary?
- Which proof, test, receipt, or trace would promote this view to `ALIVE`?
- Which neighboring pattern would reveal a bypass that this grammar cannot show?
