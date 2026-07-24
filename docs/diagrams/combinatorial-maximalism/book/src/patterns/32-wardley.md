# Wardley Map: User Need, Value Chain, And Evolution

**Pattern ID:** `32-wardley`  
**Mermaid standing:** Stable Mermaid grammar  
**Architecture view:** current, target, diagnostic, or doctrine as stated below

> **Pattern statement:** Use a Wardley map when strategic choices depend on both user value and the evolutionary maturity of components.

## Context

wasm4pm combines novel doctrine with commodity infrastructure such as filesystems, compilers, and CI.

## Problem

Architecture plans often custom-build commodity capabilities or treat novel proof-carrying mechanisms as ordinary implementation tasks.

## Forces

- The vertical axis must follow user need.
- The horizontal axis must represent evolution.
- Dependencies form a value chain.
- Positions are strategic hypotheses requiring review.

The forces should not be resolved by deleting one of them. The purpose of the pattern is to hold them in a stable relationship. When one force dominates, select a neighboring diagram that restores the missing dimension.

## Solution

Map user need at the top, trace dependencies downward, and position each component from genesis to commodity.

Apply the solution in four passes:

1. State the primary question in one sentence.
2. Select only entities needed to answer that question.
3. Label every relationship with its semantic type or evidence status.
4. Write the falsifier before treating the diagram as an architectural claim.

## wasm4pm case

Proof-carrying manufacturing and BRCE remain differentiating, while BLAKE3, Git, subprocesses, and CI are mature utilities to consume rather than reinvent.

The case is not automatically a claim about the current repository. Target components, diagnostic values, and illustrative scenarios are deliberately retained because they expose the next law-complete design. Their standing must remain visible in reviews and generated reports.

## Mermaid source

```mermaid
wardley-beta
    title wasm4pm strategic value chain
    anchor Researcher [0.95, 0.55]
    component ArtifactWithStanding [0.82, 0.42]
    component ProofCarryingManufacturing [0.68, 0.25]
    component BRCE [0.58, 0.30]
    component PublicOntologies [0.48, 0.62]
    component BLAKE3 [0.35, 0.88]
    component GitCI [0.25, 0.92]
    Researcher -> ArtifactWithStanding
    ArtifactWithStanding -> ProofCarryingManufacturing
    ProofCarryingManufacturing -> BRCE
    ProofCarryingManufacturing -> PublicOntologies
    BRCE -> BLAKE3
    BRCE -> GitCI
```

The canonical standalone source is [`diagrams/32-wardley.mmd`](../diagrams/32-wardley.mmd).

## Reading the diagram

Read this diagram from the perspective of **user need, value chain, and evolution**. Do not infer class ownership from a behavioral diagram, runtime order from a structural diagram, or measured performance from a planning diagram. The pattern becomes stronger when paired with neighbors that answer those adjacent questions explicitly.

## Falsifier

If positions do not reflect market or ecosystem maturity, the map cannot justify build-versus-buy decisions.

A falsifier is not a warning label. It is the test that gives the diagram standing. Where the evidence cannot be obtained, the diagram remains `BLOCKED` or `UNKNOWN`; it does not become true by repetition.

## Evidence checklist

- Identify the exact source files, traces, datasets, or decisions supporting each nontrivial relationship.
- Record whether the diagram describes current code, a target composition, or a diagnostic hypothesis.
- Verify that refusal, authority, and evidence boundaries are not hidden for visual simplicity.
- Re-run the relevant proof ladder after source drift.
- Bind renderer results to the exact `.mmd` source and Mermaid version.

## Neighboring patterns

Combine with [10-quadrant](../patterns/10-quadrant.md), [13-c4-context](../patterns/13-c4-context.md), [08-gantt](../patterns/08-gantt.md), [27-radar](../patterns/27-radar.md).

The combination should be monotonic: the neighboring pattern may add a dimension, but it must not silently change the meaning of existing entities or edges. When two views disagree, treat the disagreement as an architecture defect or a standing mismatch, not as stylistic variation.

## Extension questions

- What information is intentionally absent from this view?
- Which edge is most likely to be aspirational rather than observed?
- What typed carrier crosses each boundary?
- Which proof, test, receipt, or trace would promote this view to `ALIVE`?
- Which neighboring pattern would reveal a bypass that this grammar cannot show?
