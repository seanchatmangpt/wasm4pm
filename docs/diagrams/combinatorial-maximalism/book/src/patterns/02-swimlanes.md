# Swimlanes: Ownership-Preserving Handoff

**Pattern ID:** `02-swimlanes`  
**Mermaid standing:** Experimental or beta grammar  
**Architecture view:** current, target, diagnostic, or doctrine as stated below

> **Pattern statement:** Use swimlanes when the primary risk is responsibility leakage across observation, admission, construction, authority, execution, and verification.

## Context

wasm4pm is deliberately multi-boundary. A candidate may be observed by one surface, normalized by another, admitted by a policy engine, constructed by a graph engine, and actuated by a brokered executor.

## Problem

A normal flowchart can show order but not clearly show who owns each decision. When ownership is blurred, direct calls and hidden authority leaks become difficult to detect.

## Forces

- Ordering and ownership must appear simultaneously.
- The broker must be the only owner of DO.
- Verification must remain independent of execution.
- A refused handoff must terminate rather than silently fall through.

The forces should not be resolved by deleting one of them. The purpose of the pattern is to hold them in a stable relationship. When one force dominates, select a neighboring diagram that restores the missing dimension.

## Solution

Give every authority domain a lane. Permit cross-lane edges only when a typed carrier crosses the boundary. Label the carrier or decision on every crossing.

Apply the solution in four passes:

1. State the primary question in one sentence.
2. Select only entities needed to answer that question.
3. Label every relationship with its semantic type or evidence status.
4. Write the falsifier before treating the diagram as an architectural claim.

## wasm4pm case

The wasm4pm lanes make the missing InterviewRuntime composition root visible: components exist in distinct lanes, but no admitted carrier currently binds all of them into one transaction.

The case is not automatically a claim about the current repository. Target components, diagnostic values, and illustrative scenarios are deliberately retained because they expose the next law-complete design. Their standing must remain visible in reviews and generated reports.

## Mermaid source

```mermaid
swimlane-beta LR
subgraph Observer [Observer]
    capture[Capture observation]
end
subgraph Admission [Admission boundary]
    normalize[Normalize canonical event]
    admit{Admit into O*?}
end
subgraph Construction [Reversible construction]
    construct[Expand candidate graph]
end
subgraph Broker [Authority broker]
    authorize{Scoped authority?}
    refusal[Emit typed refusal]
end
subgraph Execution [Actuation]
    actuate[Perform one authorized effect]
end
subgraph Verification [Verification]
    receipt[Append receipt]
    verify[Replay and assign standing]
end
capture --> normalize --> admit
admit -->|No| refusal
admit -->|Yes| construct --> authorize
authorize -->|No| refusal
authorize -->|Yes| actuate --> receipt --> verify
```

The canonical standalone source is [`diagrams/02-swimlanes.mmd`](../diagrams/02-swimlanes.mmd).

## Reading the diagram

Read this diagram from the perspective of **ownership-preserving handoff**. Do not infer class ownership from a behavioral diagram, runtime order from a structural diagram, or measured performance from a planning diagram. The pattern becomes stronger when paired with neighbors that answer those adjacent questions explicitly.

## Falsifier

Any implementation in which the Construction or UI lane invokes the executor directly falsifies the ownership model.

A falsifier is not a warning label. It is the test that gives the diagram standing. Where the evidence cannot be obtained, the diagram remains `BLOCKED` or `UNKNOWN`; it does not become true by repetition.

## Evidence checklist

- Identify the exact source files, traces, datasets, or decisions supporting each nontrivial relationship.
- Record whether the diagram describes current code, a target composition, or a diagnostic hypothesis.
- Verify that refusal, authority, and evidence boundaries are not hidden for visual simplicity.
- Re-run the relevant proof ladder after source drift.
- Bind renderer results to the exact `.mmd` source and Mermaid version.

## Neighboring patterns

Combine with [01-flowchart](../patterns/01-flowchart.md), [03-sequence](../patterns/03-sequence.md), [13-c4-context](../patterns/13-c4-context.md), [16-c4-dynamic](../patterns/16-c4-dynamic.md).

The combination should be monotonic: the neighboring pattern may add a dimension, but it must not silently change the meaning of existing entities or edges. When two views disagree, treat the disagreement as an architecture defect or a standing mismatch, not as stylistic variation.

## Extension questions

- What information is intentionally absent from this view?
- Which edge is most likely to be aspirational rather than observed?
- What typed carrier crosses each boundary?
- Which proof, test, receipt, or trace would promote this view to `ALIVE`?
- Which neighboring pattern would reveal a bypass that this grammar cannot show?
