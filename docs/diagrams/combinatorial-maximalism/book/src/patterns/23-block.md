# Block Diagram: Spatial Composition

**Pattern ID:** `23-block`  
**Mermaid standing:** Stable Mermaid grammar  
**Architecture view:** current, target, diagnostic, or doctrine as stated below

> **Pattern statement:** Use a block diagram when adjacency, grouping, and relative composition matter more than call semantics.

## Context

DCM systems contain interchangeable engines, bounded stores, and explicit boundary blocks.

## Problem

A class or C4 diagram may over-specify semantics when the immediate question is how major regions fit together.

## Forces

- Blocks must represent comparable abstraction levels.
- Spatial grouping should encode a real boundary.
- Connections should be few and meaningful.
- The diagram must not imply timing.

The forces should not be resolved by deleting one of them. The purpose of the pattern is to hold them in a stable relationship. When one force dominates, select a neighboring diagram that restores the missing dimension.

## Solution

Use large blocks for observation, construction, authority, actuation, and evidence, with the broker occupying the narrow boundary before effects.

Apply the solution in four passes:

1. State the primary question in one sentence.
2. Select only entities needed to answer that question.
3. Label every relationship with its semantic type or evidence status.
4. Write the falsifier before treating the diagram as an architectural claim.

## wasm4pm case

The arrangement makes BRCE a physical choke point and keeps graph exploration separate from machine mutation.

The case is not automatically a claim about the current repository. Target components, diagnostic values, and illustrative scenarios are deliberately retained because they expose the next law-complete design. Their standing must remain visible in reviews and generated reports.

## Mermaid source

```mermaid
block-beta
  columns 5
  O["O"] OStar["O*"] Construct["CONSTRUCT"] Broker["BRCE"] Act["ACT"]
  space:2 Evidence["Evidence plane: tests + proofs + receipts + replay"]:3
  O --> OStar
  OStar --> Construct
  Construct --> Broker
  Broker --> Act
  Act --> Evidence
  Construct --> Evidence
```

The canonical standalone source is [`diagrams/23-block.mmd`](../diagrams/23-block.mmd).

## Reading the diagram

Read this diagram from the perspective of **spatial composition**. Do not infer class ownership from a behavioral diagram, runtime order from a structural diagram, or measured performance from a planning diagram. The pattern becomes stronger when paired with neighbors that answer those adjacent questions explicitly.

## Falsifier

If execution can connect around the broker block, the composition is false.

A falsifier is not a warning label. It is the test that gives the diagram standing. Where the evidence cannot be obtained, the diagram remains `BLOCKED` or `UNKNOWN`; it does not become true by repetition.

## Evidence checklist

- Identify the exact source files, traces, datasets, or decisions supporting each nontrivial relationship.
- Record whether the diagram describes current code, a target composition, or a diagnostic hypothesis.
- Verify that refusal, authority, and evidence boundaries are not hidden for visual simplicity.
- Re-run the relevant proof ladder after source drift.
- Bind renderer results to the exact `.mmd` source and Mermaid version.

## Neighboring patterns

Combine with [04-class](../patterns/04-class.md), [15-c4-component](../patterns/15-c4-component.md), [26-architecture](../patterns/26-architecture.md), [34-treeview](../patterns/34-treeview.md).

The combination should be monotonic: the neighboring pattern may add a dimension, but it must not silently change the meaning of existing entities or edges. When two views disagree, treat the disagreement as an architecture defect or a standing mismatch, not as stylistic variation.

## Extension questions

- What information is intentionally absent from this view?
- Which edge is most likely to be aspirational rather than observed?
- What typed carrier crosses each boundary?
- Which proof, test, receipt, or trace would promote this view to `ALIVE`?
- Which neighboring pattern would reveal a bypass that this grammar cannot show?
