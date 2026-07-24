# State Diagram: Standing Transition Law

**Pattern ID:** `05-state`  
**Mermaid standing:** Stable Mermaid grammar  
**Architecture view:** current, target, diagnostic, or doctrine as stated below

> **Pattern statement:** Use a state diagram when the vocabulary itself is a transition system and every promotion or degradation requires evidence.

## Context

wasm4pm avoids binary done/not-done labels. A component can be UNKNOWN, PARTIAL_ALIVE, ALIVE, BUILD_BROKEN, BLOCKED, or UNSUPPORTED, and evidence moves it between those states.

## Problem

Backlogs and PR bodies often inflate standing by treating source existence as runtime proof or by treating a blocked test as a failure.

## Forces

- Promotion must require evidence.
- Regression must be representable.
- Blocked and unsupported must remain distinct.
- The same vocabulary must work across code, diagrams, tests, and releases.

The forces should not be resolved by deleting one of them. The purpose of the pattern is to hold them in a stable relationship. When one force dominates, select a neighboring diagram that restores the missing dimension.

## Solution

Draw only legal standing transitions and label each with its evidence event. Make ALIVE reversible when drift is detected. Do not draw a direct UNKNOWN -> ALIVE shortcut.

Apply the solution in four passes:

1. State the primary question in one sentence.
2. Select only entities needed to answer that question.
3. Label every relationship with its semantic type or evidence status.
4. Write the falsifier before treating the diagram as an architectural claim.

## wasm4pm case

This state machine governs the diagram atlas itself: source coverage can be ALIVE while parser and renderer standing remain UNKNOWN.

The case is not automatically a claim about the current repository. Target components, diagnostic values, and illustrative scenarios are deliberately retained because they expose the next law-complete design. Their standing must remain visible in reviews and generated reports.

## Mermaid source

```mermaid
stateDiagram-v2
    [*] --> UNKNOWN
    UNKNOWN --> PARTIAL_ALIVE: source located
    PARTIAL_ALIVE --> ALIVE: proof ladder passes
    PARTIAL_ALIVE --> BUILD_BROKEN: integration fails
    UNKNOWN --> UNSUPPORTED: capability absent
    BUILD_BROKEN --> PARTIAL_ALIVE: repair admitted
    ALIVE --> PARTIAL_ALIVE: drift detected
    PARTIAL_ALIVE --> BLOCKED: evidence unavailable
    BLOCKED --> PARTIAL_ALIVE: evidence restored
    UNSUPPORTED --> PARTIAL_ALIVE: capability implemented
```

The canonical standalone source is [`diagrams/05-state.mmd`](../diagrams/05-state.mmd).

## Reading the diagram

Read this diagram from the perspective of **standing transition law**. Do not infer class ownership from a behavioral diagram, runtime order from a structural diagram, or measured performance from a planning diagram. The pattern becomes stronger when paired with neighbors that answer those adjacent questions explicitly.

## Falsifier

Any report that promotes an item to ALIVE solely because a file exists violates the state law.

A falsifier is not a warning label. It is the test that gives the diagram standing. Where the evidence cannot be obtained, the diagram remains `BLOCKED` or `UNKNOWN`; it does not become true by repetition.

## Evidence checklist

- Identify the exact source files, traces, datasets, or decisions supporting each nontrivial relationship.
- Record whether the diagram describes current code, a target composition, or a diagnostic hypothesis.
- Verify that refusal, authority, and evidence boundaries are not hidden for visual simplicity.
- Re-run the relevant proof ladder after source drift.
- Bind renderer results to the exact `.mmd` source and Mermaid version.

## Neighboring patterns

Combine with [01-flowchart](../patterns/01-flowchart.md), [25-kanban](../patterns/25-kanban.md), [27-radar](../patterns/27-radar.md), [33-cynefin](../patterns/33-cynefin.md).

The combination should be monotonic: the neighboring pattern may add a dimension, but it must not silently change the meaning of existing entities or edges. When two views disagree, treat the disagreement as an architecture defect or a standing mismatch, not as stylistic variation.

## Extension questions

- What information is intentionally absent from this view?
- Which edge is most likely to be aspirational rather than observed?
- What typed carrier crosses each boundary?
- Which proof, test, receipt, or trace would promote this view to `ALIVE`?
- Which neighboring pattern would reveal a bypass that this grammar cannot show?
