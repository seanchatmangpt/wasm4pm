# PRD v26.9.18 — GALL-023: OCPQ Binding Determinism

**Status:** FINAL_SPEC — closed for v26.9.24  
**Implementation standing:** OPEN in PR #627  
**Release:** v26.9.18  
**Repository:** `seanchatmangpt/wasm4pm`  
**Owner:** wasm4pm  
**Dependencies:** GALL-017 OCPQ reference court, GALL-021 portable determinism  
**Authority ceiling:** QUERY/COMPUTE only

## Product outcome
The same admitted OCPQ query and OCEL subject produce the same canonical bindings/violations under wasm4pm across qualified hosts, matching ex4pm's reference semantics.

## Problem
OCPQ execution in a portable runtime must not return different object/event bindings because of host iteration order, serialization differences or runtime implementation details.

## Functional requirements
1. Consume query AST/digest and exact OCEL subject from GALL-017.
2. Lower supported OCPQ operators into deterministic WASM execution.
3. Canonicalize binding sets by semantic identity, not host iteration order.
4. Compare wasm4pm results against ex4pm reference verdicts on GALL-015/017 corpus.
5. Preserve typed violations and missing-relation semantics.
6. Typed-refuse unsupported OCPQ operators.
7. Bind module/runtime/query/corpus identities in receipt.

## Acceptance criteria
1. Positive OCPQ corpus returns the same canonical bindings as ex4pm reference.
2. Negative corpus returns the same violation class.
3. Event/object input permutation preserves bindings.
4. Cross-runtime result digest matches for qualified hosts.
5. Unsupported query operator returns UNSUPPORTED.
6. Missing relation cannot degrade to empty PASS.

## Evidence product
Emit a content-addressed receipt binding exact source/query/process/module/runtime identities, positive witness, attempted falsifiers, outputs and evidence ceiling. Portability means semantic identity, not merely successful execution.

## Definition of done
The same admitted OCPQ query and OCEL subject produce the same canonical bindings/violations under wasm4pm across qualified hosts, matching ex4pm's reference semantics.
