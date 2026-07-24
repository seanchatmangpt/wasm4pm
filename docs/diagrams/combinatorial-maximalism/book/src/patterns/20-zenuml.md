# ZenUML: Executable-Looking Interaction Narrative

**Pattern ID:** `20-zenuml`  
**Mermaid standing:** Experimental or beta grammar  
**Architecture view:** current, target, diagnostic, or doctrine as stated below

> **Pattern statement:** Use ZenUML when a compact, code-like interaction narrative communicates branching logic better than arrow syntax.

## Context

Developers may reason more naturally from nested calls and return values than from classic sequence notation.

## Problem

Sequence diagrams can become wide and visually noisy when nested authority and refusal conditions dominate.

## Forces

- The narrative should look close to code.
- Alternatives must remain explicit.
- The notation must not imply executable verification.
- Participants should still be architectural boundaries.

The forces should not be resolved by deleting one of them. The purpose of the pattern is to hold them in a stable relationship. When one force dominates, select a neighboring diagram that restores the missing dimension.

## Solution

Express the bounded runtime as nested calls with if/else branches and explicit returns.

Apply the solution in four passes:

1. State the primary question in one sentence.
2. Select only entities needed to answer that question.
3. Label every relationship with its semantic type or evidence status.
4. Write the falsifier before treating the diagram as an architectural claim.

## wasm4pm case

The same target InterviewRuntime scenario is restated in ZenUML to test whether the architecture remains coherent under a different interaction grammar.

The case is not automatically a claim about the current repository. Target components, diagnostic values, and illustrative scenarios are deliberately retained because they expose the next law-complete design. Their standing must remain visible in reviews and generated reports.

## Mermaid source

```mermaid
zenuml
    title Bounded wasm4pm actuation
    @Actor Researcher
    Researcher -> Gateway.submit(observation) {
      Gateway -> Admission.normalizeAndAdmit(observation) {
        if(refused) {
          return TypedRefusal
        } else {
          Admission -> Runtime.handle(admittedObservation) {
            Runtime -> Broker.authorize(capability) {
              if(denied) { return TypedRefusal }
              else {
                Broker -> Executor.actuate(grant)
                Executor -> Ledger.append(result)
                return ArtifactWithStanding
              }
            }
          }
        }
      }
    }
```

The canonical standalone source is [`diagrams/20-zenuml.mmd`](../diagrams/20-zenuml.mmd).

## Reading the diagram

Read this diagram from the perspective of **executable-looking interaction narrative**. Do not infer class ownership from a behavioral diagram, runtime order from a structural diagram, or measured performance from a planning diagram. The pattern becomes stronger when paired with neighbors that answer those adjacent questions explicitly.

## Falsifier

If the ZenUML nesting differs materially from the sequence diagram, the pattern language contains a contradiction that must be resolved.

A falsifier is not a warning label. It is the test that gives the diagram standing. Where the evidence cannot be obtained, the diagram remains `BLOCKED` or `UNKNOWN`; it does not become true by repetition.

## Evidence checklist

- Identify the exact source files, traces, datasets, or decisions supporting each nontrivial relationship.
- Record whether the diagram describes current code, a target composition, or a diagnostic hypothesis.
- Verify that refusal, authority, and evidence boundaries are not hidden for visual simplicity.
- Re-run the relevant proof ladder after source drift.
- Bind renderer results to the exact `.mmd` source and Mermaid version.

## Neighboring patterns

Combine with [03-sequence](../patterns/03-sequence.md), [16-c4-dynamic](../patterns/16-c4-dynamic.md), [01-flowchart](../patterns/01-flowchart.md), [28-event-modeling](../patterns/28-event-modeling.md).

The combination should be monotonic: the neighboring pattern may add a dimension, but it must not silently change the meaning of existing entities or edges. When two views disagree, treat the disagreement as an architecture defect or a standing mismatch, not as stylistic variation.

## Extension questions

- What information is intentionally absent from this view?
- Which edge is most likely to be aspirational rather than observed?
- What typed carrier crosses each boundary?
- Which proof, test, receipt, or trace would promote this view to `ALIVE`?
- Which neighboring pattern would reveal a bypass that this grammar cannot show?
