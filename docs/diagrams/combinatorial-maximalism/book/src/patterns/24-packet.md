# Packet Diagram: Wire-Format Integrity

**Pattern ID:** `24-packet`  
**Mermaid standing:** Stable Mermaid grammar  
**Architecture view:** current, target, diagnostic, or doctrine as stated below

> **Pattern statement:** Use a packet diagram when byte layout, field boundaries, versioning, and canonical encoding determine correctness.

## Context

Receipt and fact hashes are only unambiguous if their serialized carriers have explicit lengths, versions, and field ordering.

## Problem

Concatenating variable-length strings can produce ambiguous encodings even when the hash function is strong.

## Forces

- Field boundaries must be explicit.
- Versioning must precede payload interpretation.
- Lengths and endianness must be defined.
- Security scope must be visible in the carrier.

The forces should not be resolved by deleting one of them. The purpose of the pattern is to hold them in a stable relationship. When one force dominates, select a neighboring diagram that restores the missing dimension.

## Solution

Draw the canonical receipt envelope as fields with fixed or length-prefixed widths.

Apply the solution in four passes:

1. State the primary question in one sentence.
2. Select only entities needed to answer that question.
3. Label every relationship with its semantic type or evidence status.
4. Write the falsifier before treating the diagram as an architectural claim.

## wasm4pm case

The packet closes the ambiguity found in receipt and fact hash concatenation by introducing version, session, policy, and length fields.

The case is not automatically a claim about the current repository. Target components, diagnostic values, and illustrative scenarios are deliberately retained because they expose the next law-complete design. Their standing must remain visible in reviews and generated reports.

## Mermaid source

```mermaid
packet-beta
    0-7: "Version"
    8-15: "Flags"
    16-47: "Sequence u32"
    48-79: "Session length u32"
    80-111: "Policy length u32"
    112-143: "Payload length u32"
    144-399: "Previous receipt hash 256b"
    400-655: "Subject hash 256b"
    656-: "Length-prefixed session, policy, payload"
```

The canonical standalone source is [`diagrams/24-packet.mmd`](../diagrams/24-packet.mmd).

## Reading the diagram

Read this diagram from the perspective of **wire-format integrity**. Do not infer class ownership from a behavioral diagram, runtime order from a structural diagram, or measured performance from a planning diagram. The pattern becomes stronger when paired with neighbors that answer those adjacent questions explicitly.

## Falsifier

Two different logical receipts that can serialize to the same byte stream invalidate the format.

A falsifier is not a warning label. It is the test that gives the diagram standing. Where the evidence cannot be obtained, the diagram remains `BLOCKED` or `UNKNOWN`; it does not become true by repetition.

## Evidence checklist

- Identify the exact source files, traces, datasets, or decisions supporting each nontrivial relationship.
- Record whether the diagram describes current code, a target composition, or a diagnostic hypothesis.
- Verify that refusal, authority, and evidence boundaries are not hidden for visual simplicity.
- Re-run the relevant proof ladder after source drift.
- Bind renderer results to the exact `.mmd` source and Mermaid version.

## Neighboring patterns

Combine with [06-er](../patterns/06-er.md), [11-requirement](../patterns/11-requirement.md), [17-c4-deployment](../patterns/17-c4-deployment.md), [31-ishikawa](../patterns/31-ishikawa.md).

The combination should be monotonic: the neighboring pattern may add a dimension, but it must not silently change the meaning of existing entities or edges. When two views disagree, treat the disagreement as an architecture defect or a standing mismatch, not as stylistic variation.

## Extension questions

- What information is intentionally absent from this view?
- Which edge is most likely to be aspirational rather than observed?
- What typed carrier crosses each boundary?
- Which proof, test, receipt, or trace would promote this view to `ALIVE`?
- Which neighboring pattern would reveal a bypass that this grammar cannot show?
