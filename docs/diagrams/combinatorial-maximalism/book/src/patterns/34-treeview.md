# TreeView: Repository And Taxonomy Navigation

**Pattern ID:** `34-treeview`  
**Mermaid standing:** Stable Mermaid grammar  
**Architecture view:** current, target, diagnostic, or doctrine as stated below

> **Pattern statement:** Use TreeView when hierarchical containment or navigation is the primary information.

## Context

The wasm4pm repository contains crates, examples, docs, diagrams, ontology packs, tests, and generated projections.

## Problem

A mindmap emphasizes concepts and a treemap emphasizes quantity, but neither provides a precise navigable hierarchy.

## Forces

- Each node must have one parent in the shown hierarchy.
- Depth should remain bounded.
- The tree should reflect a real or target structure.
- Cross-cutting relationships require other diagrams.

The forces should not be resolved by deleting one of them. The purpose of the pattern is to hold them in a stable relationship. When one force dominates, select a neighboring diagram that restores the missing dimension.

## Solution

Show the book, repository, or ontology hierarchy as a tree and use links or adjacent patterns for cross-cutting dependencies.

Apply the solution in four passes:

1. State the primary question in one sentence.
2. Select only entities needed to answer that question.
3. Label every relationship with its semantic type or evidence status.
4. Write the falsifier before treating the diagram as an architectural claim.

## wasm4pm case

The tree provides a navigation model for this mdBook and its 34 Mermaid sources.

The case is not automatically a claim about the current repository. Target components, diagnostic values, and illustrative scenarios are deliberately retained because they expose the next law-complete design. Their standing must remain visible in reviews and generated reports.

## Mermaid source

```mermaid
treeView-beta
    root "Design for Combinatorial Maximalism"
      branch "Foundations"
        leaf "Observation and O*"
        leaf "CONSTRUCT"
        leaf "BRCE"
        leaf "Standing"
      branch "Behavior patterns"
        leaf "Flowchart"
        leaf "Sequence"
        leaf "State"
      branch "Architecture patterns"
        leaf "C4 family"
        leaf "Architecture"
        leaf "Block"
      branch "Evidence patterns"
        leaf "Requirement"
        leaf "Packet"
        leaf "Radar"
      branch "Strategy patterns"
        leaf "Wardley"
        leaf "Cynefin"
        leaf "Quadrant"
```

The canonical standalone source is [`diagrams/34-treeview.mmd`](../diagrams/34-treeview.mmd).

## Reading the diagram

Read this diagram from the perspective of **repository and taxonomy navigation**. Do not infer class ownership from a behavioral diagram, runtime order from a structural diagram, or measured performance from a planning diagram. The pattern becomes stronger when paired with neighbors that answer those adjacent questions explicitly.

## Falsifier

If nodes have multiple semantic parents or the filesystem differs from the tree, the view must be updated or labeled conceptual.

A falsifier is not a warning label. It is the test that gives the diagram standing. Where the evidence cannot be obtained, the diagram remains `BLOCKED` or `UNKNOWN`; it does not become true by repetition.

## Evidence checklist

- Identify the exact source files, traces, datasets, or decisions supporting each nontrivial relationship.
- Record whether the diagram describes current code, a target composition, or a diagnostic hypothesis.
- Verify that refusal, authority, and evidence boundaries are not hidden for visual simplicity.
- Re-run the relevant proof ladder after source drift.
- Bind renderer results to the exact `.mmd` source and Mermaid version.

## Neighboring patterns

Combine with [18-mindmap](../patterns/18-mindmap.md), [29-treemap](../patterns/29-treemap.md), [13-c4-context](../patterns/13-c4-context.md), [23-block](../patterns/23-block.md).

The combination should be monotonic: the neighboring pattern may add a dimension, but it must not silently change the meaning of existing entities or edges. When two views disagree, treat the disagreement as an architecture defect or a standing mismatch, not as stylistic variation.

## Extension questions

- What information is intentionally absent from this view?
- Which edge is most likely to be aspirational rather than observed?
- What typed carrier crosses each boundary?
- Which proof, test, receipt, or trace would promote this view to `ALIVE`?
- Which neighboring pattern would reveal a bypass that this grammar cannot show?
