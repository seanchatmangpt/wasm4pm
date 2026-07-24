# Ishikawa Diagram: Multi-Cause Failure Hypothesis

**Pattern ID:** `31-ishikawa`  
**Mermaid standing:** Stable Mermaid grammar  
**Architecture view:** current, target, diagnostic, or doctrine as stated below

> **Pattern statement:** Use an Ishikawa diagram to organize plausible causes of a failure before selecting tests or repairs.

## Context

A BUILD_BROKEN receipt chain can fail because of code wiring, carrier design, policy, tooling, tests, or environment.

## Problem

Debugging often jumps to the first visible symptom and produces local fixes that leave the systemic cause intact.

## Forces

- Causes are hypotheses, not findings.
- Categories should prevent tunnel vision.
- Each cause needs a falsifying check.
- The effect must be specific.

The forces should not be resolved by deleting one of them. The purpose of the pattern is to hold them in a stable relationship. When one force dominates, select a neighboring diagram that restores the missing dimension.

## Solution

Place the observed failure at the head and group candidate causes by architecture, data, authority, tooling, verification, and environment.

Apply the solution in four passes:

1. State the primary question in one sentence.
2. Select only entities needed to answer that question.
3. Label every relationship with its semantic type or evidence status.
4. Write the falsifier before treating the diagram as an architectural claim.

## wasm4pm case

The diagram diagnoses why a five-step receipt chain may be broken without assuming that any one cause is already proven.

The case is not automatically a claim about the current repository. Target components, diagnostic values, and illustrative scenarios are deliberately retained because they expose the next law-complete design. Their standing must remain visible in reviews and generated reports.

## Mermaid source

```mermaid
ishikawa-beta
    effect "Continuous receipt chain BUILD_BROKEN"
    category "Architecture"
      cause "No composition root"
      cause "Route starts new chain head"
    category "Data"
      cause "Ambiguous serialization"
      cause "Missing session or policy binding"
    category "Authority"
      cause "Capability and grant not coupled"
    category "Verification"
      cause "Semantic replay conflated with receipt replay"
      cause "Arbitrary status recording"
    category "Tooling"
      cause "Renderer or test command unavailable"
    category "Environment"
      cause "No exact CI evidence for head SHA"
```

The canonical standalone source is [`diagrams/31-ishikawa.mmd`](../diagrams/31-ishikawa.mmd).

## Reading the diagram

Read this diagram from the perspective of **multi-cause failure hypothesis**. Do not infer class ownership from a behavioral diagram, runtime order from a structural diagram, or measured performance from a planning diagram. The pattern becomes stronger when paired with neighbors that answer those adjacent questions explicitly.

## Falsifier

Treating a branch as a confirmed root cause before evidence turns the diagram into misinformation.

A falsifier is not a warning label. It is the test that gives the diagram standing. Where the evidence cannot be obtained, the diagram remains `BLOCKED` or `UNKNOWN`; it does not become true by repetition.

## Evidence checklist

- Identify the exact source files, traces, datasets, or decisions supporting each nontrivial relationship.
- Record whether the diagram describes current code, a target composition, or a diagnostic hypothesis.
- Verify that refusal, authority, and evidence boundaries are not hidden for visual simplicity.
- Re-run the relevant proof ladder after source drift.
- Bind renderer results to the exact `.mmd` source and Mermaid version.

## Neighboring patterns

Combine with [22-xychart](../patterns/22-xychart.md), [24-packet](../patterns/24-packet.md), [05-state](../patterns/05-state.md), [33-cynefin](../patterns/33-cynefin.md).

The combination should be monotonic: the neighboring pattern may add a dimension, but it must not silently change the meaning of existing entities or edges. When two views disagree, treat the disagreement as an architecture defect or a standing mismatch, not as stylistic variation.

## Extension questions

- What information is intentionally absent from this view?
- Which edge is most likely to be aspirational rather than observed?
- What typed carrier crosses each boundary?
- Which proof, test, receipt, or trace would promote this view to `ALIVE`?
- Which neighboring pattern would reveal a bypass that this grammar cannot show?
