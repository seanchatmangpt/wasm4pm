# Gantt Chart: Evidence-Gated Schedule

**Pattern ID:** `08-gantt`  
**Mermaid standing:** Stable Mermaid grammar  
**Architecture view:** current, target, diagnostic, or doctrine as stated below

> **Pattern statement:** Use a Gantt chart when delivery order, dependency, and proof gates matter more than component topology.

## Context

wasm4pm increments cannot safely schedule release before admission, verification, and receipt composition. Some tasks are parallel; some are hard gates.

## Problem

Conventional schedules show dates but not epistemic dependency. A downstream task can appear on time while the evidence required to begin it does not exist.

## Forces

- Critical proof gates must be visible.
- Parallel reversible work should remain parallel.
- Blocked evidence must shift downstream work honestly.
- Calendar precision must not imply runtime certainty.

The forces should not be resolved by deleting one of them. The purpose of the pattern is to hold them in a stable relationship. When one force dominates, select a neighboring diagram that restores the missing dimension.

## Solution

Schedule the proof ladder, not just implementation tasks. Use dependencies for admission and release gates and mark actuation as critical.

Apply the solution in four passes:

1. State the primary question in one sentence.
2. Select only entities needed to answer that question.
3. Label every relationship with its semantic type or evidence status.
4. Write the falsifier before treating the diagram as an architectural claim.

## wasm4pm case

The DCM increment schedule makes release follow replay evidence. It can be reused for a crate, an InterviewAssist session feature, or a process-model projection.

The case is not automatically a claim about the current repository. Target components, diagnostic values, and illustrative scenarios are deliberately retained because they expose the next law-complete design. Their standing must remain visible in reviews and generated reports.

## Mermaid source

```mermaid
gantt
    title DCM proof ladder for a wasm4pm increment
    dateFormat YYYY-MM-DD
    axisFormat %m-%d
    section Observe
    Bound O*                    :done, obs, 2026-07-24, 1d
    section Construct
    Expand reversible graph     :active, con, after obs, 2d
    section Admit
    Run proofs and tests        :crit, ver, after con, 2d
    section Actuate
    Broker one release          :act, after ver, 1d
    section Replay
    Verify receipts             :rep, after act, 1d
```

The canonical standalone source is [`diagrams/08-gantt.mmd`](../diagrams/08-gantt.mmd).

## Reading the diagram

Read this diagram from the perspective of **evidence-gated schedule**. Do not infer class ownership from a behavioral diagram, runtime order from a structural diagram, or measured performance from a planning diagram. The pattern becomes stronger when paired with neighbors that answer those adjacent questions explicitly.

## Falsifier

A release task that can begin before verifier completion falsifies the dependency model.

A falsifier is not a warning label. It is the test that gives the diagram standing. Where the evidence cannot be obtained, the diagram remains `BLOCKED` or `UNKNOWN`; it does not become true by repetition.

## Evidence checklist

- Identify the exact source files, traces, datasets, or decisions supporting each nontrivial relationship.
- Record whether the diagram describes current code, a target composition, or a diagnostic hypothesis.
- Verify that refusal, authority, and evidence boundaries are not hidden for visual simplicity.
- Re-run the relevant proof ladder after source drift.
- Bind renderer results to the exact `.mmd` source and Mermaid version.

## Neighboring patterns

Combine with [25-kanban](../patterns/25-kanban.md), [10-quadrant](../patterns/10-quadrant.md), [32-wardley](../patterns/32-wardley.md), [12-gitgraph](../patterns/12-gitgraph.md).

The combination should be monotonic: the neighboring pattern may add a dimension, but it must not silently change the meaning of existing entities or edges. When two views disagree, treat the disagreement as an architecture defect or a standing mismatch, not as stylistic variation.

## Extension questions

- What information is intentionally absent from this view?
- Which edge is most likely to be aspirational rather than observed?
- What typed carrier crosses each boundary?
- Which proof, test, receipt, or trace would promote this view to `ALIVE`?
- Which neighboring pattern would reveal a bypass that this grammar cannot show?
