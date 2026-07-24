# Architecture Diagram: Services, Groups, And Directional Interfaces

**Pattern ID:** `26-architecture`  
**Mermaid standing:** Stable Mermaid grammar  
**Architecture view:** current, target, diagnostic, or doctrine as stated below

> **Pattern statement:** Use the Mermaid Architecture diagram when service groups and interfaces are the principal concern and C4 semantics are unnecessary.

## Context

wasm4pm can be viewed as groups for observation, knowledge construction, authority, execution, and evidence.

## Problem

General flowcharts do not distinguish services from groups or ports; C4 may introduce more taxonomy than needed.

## Forces

- Groups must represent trust or deployment regions.
- Services should have clear roles.
- Edges should connect interfaces, not merely boxes.
- The diagram should stay implementation-neutral.

The forces should not be resolved by deleting one of them. The purpose of the pattern is to hold them in a stable relationship. When one force dominates, select a neighboring diagram that restores the missing dimension.

## Solution

Group services by domain and connect the event gateway, graph engine, broker, executor, and ledger through directional interfaces.

Apply the solution in four passes:

1. State the primary question in one sentence.
2. Select only entities needed to answer that question.
3. Label every relationship with its semantic type or evidence status.
4. Write the falsifier before treating the diagram as an architectural claim.

## wasm4pm case

The architecture view emphasizes BRCE between reversible construction and effectful execution.

The case is not automatically a claim about the current repository. Target components, diagnostic values, and illustrative scenarios are deliberately retained because they expose the next law-complete design. Their standing must remain visible in reviews and generated reports.

## Mermaid source

```mermaid
architecture-beta
    group observe(cloud)[Observation]
    group construct(cloud)[Construction]
    group authority(cloud)[Authority]
    group execute(cloud)[Execution]
    group evidence(database)[Evidence]
    service gateway(server)[Gateway] in observe
    service graph(server)[Graph Engine] in construct
    service broker(server)[BRCE Broker] in authority
    service runner(server)[Bounded Executor] in execute
    service ledger(database)[Receipt Ledger] in evidence
    gateway:R --> L:graph
    graph:R --> L:broker
    broker:R --> L:runner
    runner:B --> T:ledger
```

The canonical standalone source is [`diagrams/26-architecture.mmd`](../diagrams/26-architecture.mmd).

## Reading the diagram

Read this diagram from the perspective of **services, groups, and directional interfaces**. Do not infer class ownership from a behavioral diagram, runtime order from a structural diagram, or measured performance from a planning diagram. The pattern becomes stronger when paired with neighbors that answer those adjacent questions explicitly.

## Falsifier

A service edge that bypasses the authority group contradicts the architecture.

A falsifier is not a warning label. It is the test that gives the diagram standing. Where the evidence cannot be obtained, the diagram remains `BLOCKED` or `UNKNOWN`; it does not become true by repetition.

## Evidence checklist

- Identify the exact source files, traces, datasets, or decisions supporting each nontrivial relationship.
- Record whether the diagram describes current code, a target composition, or a diagnostic hypothesis.
- Verify that refusal, authority, and evidence boundaries are not hidden for visual simplicity.
- Re-run the relevant proof ladder after source drift.
- Bind renderer results to the exact `.mmd` source and Mermaid version.

## Neighboring patterns

Combine with [14-c4-container](../patterns/14-c4-container.md), [17-c4-deployment](../patterns/17-c4-deployment.md), [23-block](../patterns/23-block.md), [32-wardley](../patterns/32-wardley.md).

The combination should be monotonic: the neighboring pattern may add a dimension, but it must not silently change the meaning of existing entities or edges. When two views disagree, treat the disagreement as an architecture defect or a standing mismatch, not as stylistic variation.

## Extension questions

- What information is intentionally absent from this view?
- Which edge is most likely to be aspirational rather than observed?
- What typed carrier crosses each boundary?
- Which proof, test, receipt, or trace would promote this view to `ALIVE`?
- Which neighboring pattern would reveal a bypass that this grammar cannot show?
