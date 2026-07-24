# Flowchart: Lawful Transformation Path

**Pattern ID:** `01-flowchart`  
**Mermaid standing:** Stable Mermaid grammar  
**Architecture view:** current, target, diagnostic, or doctrine as stated below

> **Pattern statement:** Use a flowchart when the primary question is which transformations are permitted, refused, or conditionally admitted.

## Context

A wasm4pm increment begins with an observation but may end in a file, process, proof, deployment, or refusal. The route matters because the same artifact can be valid or invalid depending on whether it crossed the admission and authority boundaries.

## Problem

Ordinary pipeline drawings hide refusal paths and make irreversible execution look like just another arrow. That erases the difference between graph-domain exploration and machine-state actuation.

## Forces

- The picture must remain readable from left to right.
- Every irreversible edge must expose its authority boundary.
- Refusals are first-class outcomes rather than annotations.
- Standing must follow evidence, not narrative confidence.

The forces should not be resolved by deleting one of them. The purpose of the pattern is to hold them in a stable relationship. When one force dominates, select a neighboring diagram that restores the missing dimension.

## Solution

Draw the canonical morphism O -> O* -> CONSTRUCT -> BRCE -> actuation -> receipt -> standing. Branch at admission, authority, and verification. Use terminal nodes for typed refusals and degraded standings.

Apply the solution in four passes:

1. State the primary question in one sentence.
2. Select only entities needed to answer that question.
3. Label every relationship with its semantic type or evidence status.
4. Write the falsifier before treating the diagram as an architectural claim.

## wasm4pm case

The diagram is the shortest complete statement of the Chatman manufacturing equation as an operational path. It shows why CONSTRUCT may expand candidates freely while actuation remains brokered.

The case is not automatically a claim about the current repository. Target components, diagnostic values, and illustrative scenarios are deliberately retained because they expose the next law-complete design. Their standing must remain visible in reviews and generated reports.

## Mermaid source

```mermaid
flowchart LR
    O["O: observed world"] --> Gate{"Admit into O*?"}
    Gate -->|No| Refusal["Typed refusal"]
    Gate -->|Yes| OStar["O*: bounded observation"]
    OStar --> Construct["CONSTRUCT reversible graph"]
    Construct --> Broker["BRCE authority broker"]
    Broker -->|Denied| Refusal
    Broker -->|Granted| Act["Actuate artifact"]
    Act --> Receipt["Receipt + replay evidence"]
    Receipt --> Standing{"Standing proven?"}
    Standing -->|Yes| Alive["ALIVE"]
    Standing -->|No| Partial["PARTIAL_ALIVE / BUILD_BROKEN"]
```

The canonical standalone source is [`diagrams/01-flowchart.mmd`](../diagrams/01-flowchart.mmd).

## Reading the diagram

Read this diagram from the perspective of **lawful transformation path**. Do not infer class ownership from a behavioral diagram, runtime order from a structural diagram, or measured performance from a planning diagram. The pattern becomes stronger when paired with neighbors that answer those adjacent questions explicitly.

## Falsifier

A source path that reaches actuation without an authority decision, or a standing assignment that precedes receipt verification, falsifies the diagram.

A falsifier is not a warning label. It is the test that gives the diagram standing. Where the evidence cannot be obtained, the diagram remains `BLOCKED` or `UNKNOWN`; it does not become true by repetition.

## Evidence checklist

- Identify the exact source files, traces, datasets, or decisions supporting each nontrivial relationship.
- Record whether the diagram describes current code, a target composition, or a diagnostic hypothesis.
- Verify that refusal, authority, and evidence boundaries are not hidden for visual simplicity.
- Re-run the relevant proof ladder after source drift.
- Bind renderer results to the exact `.mmd` source and Mermaid version.

## Neighboring patterns

Combine with [02-swimlanes](../patterns/02-swimlanes.md), [03-sequence](../patterns/03-sequence.md), [05-state](../patterns/05-state.md), [11-requirement](../patterns/11-requirement.md).

The combination should be monotonic: the neighboring pattern may add a dimension, but it must not silently change the meaning of existing entities or edges. When two views disagree, treat the disagreement as an architecture defect or a standing mismatch, not as stylistic variation.

## Extension questions

- What information is intentionally absent from this view?
- Which edge is most likely to be aspirational rather than observed?
- What typed carrier crosses each boundary?
- Which proof, test, receipt, or trace would promote this view to `ALIVE`?
- Which neighboring pattern would reveal a bypass that this grammar cannot show?
