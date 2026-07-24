# C4 Component: In-Container Collaboration

**Pattern ID:** `15-c4-component`  
**Mermaid standing:** Experimental or beta grammar  
**Architecture view:** current, target, diagnostic, or doctrine as stated below

> **Pattern statement:** Use C4 Component to show how invariant-owning modules collaborate inside one runtime container.

## Context

The Rust interview namespace contains event, admission, blackboard, construct, workflow, verification, authority, and receipt modules.

## Problem

A component inventory can look complete even when no composition root enforces the intended order or when public bypasses remain.

## Forces

- Components must have singular responsibilities.
- The composition root must be explicit.
- Bypass edges must be absent or marked defects.
- Every edge must correspond to a typed carrier.

The forces should not be resolved by deleting one of them. The purpose of the pattern is to hold them in a stable relationship. When one force dominates, select a neighboring diagram that restores the missing dimension.

## Solution

Place Event Gateway, Admission Gate, InterviewRuntime, CONSTRUCT, Authority Broker, and Receipt Ledger inside the cognition boundary. Show only lawful dependencies.

Apply the solution in four passes:

1. State the primary question in one sentence.
2. Select only entities needed to answer that question.
3. Label every relationship with its semantic type or evidence status.
4. Write the falsifier before treating the diagram as an architectural claim.

## wasm4pm case

The diagram is intentionally target-state until interview/runtime.rs or an equivalent bounded handler composes the current modules.

The case is not automatically a claim about the current repository. Target components, diagnostic values, and illustrative scenarios are deliberately retained because they expose the next law-complete design. Their standing must remain visible in reviews and generated reports.

## Mermaid source

```mermaid
C4Component
    title wasm4pm cognition component view - target
    Container_Boundary(cognition, "wasm4pm-cognition") {
        Component(gateway, "Event Gateway", "Rust", "Canonicalizes observations")
        Component(admission, "Admission Gate", "Rust", "Produces admitted facts or refusals")
        Component(runtime, "InterviewRuntime", "Rust", "Composes the law path")
        Component(construct, "CONSTRUCT Engine", "Rust", "Derives reversible candidates")
        Component(broker, "Authority Broker", "Rust", "Default-deny actuation")
        Component(receipts, "Receipt Ledger", "Rust", "Chains and verifies evidence")
    }
    Rel(gateway, admission, "Normalizes into")
    Rel(admission, runtime, "Supplies admitted observation")
    Rel(runtime, construct, "Derives through")
    Rel(runtime, broker, "Requests scoped authority")
    Rel(broker, receipts, "Records decision and result")
```

The canonical standalone source is [`diagrams/15-c4-component.mmd`](../diagrams/15-c4-component.mmd).

## Reading the diagram

Read this diagram from the perspective of **in-container collaboration**. Do not infer class ownership from a behavioral diagram, runtime order from a structural diagram, or measured performance from a planning diagram. The pattern becomes stronger when paired with neighbors that answer those adjacent questions explicitly.

## Falsifier

If the current code still admits RawObservation directly to the blackboard or records arbitrary verification status, the component view cannot be labeled current.

A falsifier is not a warning label. It is the test that gives the diagram standing. Where the evidence cannot be obtained, the diagram remains `BLOCKED` or `UNKNOWN`; it does not become true by repetition.

## Evidence checklist

- Identify the exact source files, traces, datasets, or decisions supporting each nontrivial relationship.
- Record whether the diagram describes current code, a target composition, or a diagnostic hypothesis.
- Verify that refusal, authority, and evidence boundaries are not hidden for visual simplicity.
- Re-run the relevant proof ladder after source drift.
- Bind renderer results to the exact `.mmd` source and Mermaid version.

## Neighboring patterns

Combine with [04-class](../patterns/04-class.md), [14-c4-container](../patterns/14-c4-container.md), [16-c4-dynamic](../patterns/16-c4-dynamic.md), [23-block](../patterns/23-block.md).

The combination should be monotonic: the neighboring pattern may add a dimension, but it must not silently change the meaning of existing entities or edges. When two views disagree, treat the disagreement as an architecture defect or a standing mismatch, not as stylistic variation.

## Extension questions

- What information is intentionally absent from this view?
- Which edge is most likely to be aspirational rather than observed?
- What typed carrier crosses each boundary?
- Which proof, test, receipt, or trace would promote this view to `ALIVE`?
- Which neighboring pattern would reveal a bypass that this grammar cannot show?
