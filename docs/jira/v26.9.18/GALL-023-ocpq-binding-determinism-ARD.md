# ARD v26.9.18 — GALL-023: OCPQ Binding Determinism

**Status:** FINAL_SPEC — closed for v26.9.24  
**Implementation standing:** OPEN in PR #627  
**Release:** v26.9.18  
**Repository:** `seanchatmangpt/wasm4pm`  
**Owner:** wasm4pm  
**Dependencies:** GALL-017 OCPQ reference court, GALL-021 portable determinism  
**Authority ceiling:** QUERY/COMPUTE only

## Architecture objective
The same admitted OCPQ query and OCEL subject produce the same canonical bindings/violations under wasm4pm across qualified hosts, matching ex4pm's reference semantics.

## Components
- OCPQ AST adapter
- OCPQ -> WASM evaluator/lowering
- canonical binding encoder
- reference-result comparator
- multi-runtime harness
- OCPQ portable receipt

## Data/control flow
`GALL-017 query + OCEL -> WASM OCPQ evaluator -> canonical bindings/violations -> reference comparison -> receipt`

## Invariants
1. Consume query AST/digest and exact OCEL subject from GALL-017.
2. Lower supported OCPQ operators into deterministic WASM execution.
3. Canonicalize binding sets by semantic identity, not host iteration order.
4. Compare wasm4pm results against ex4pm reference verdicts on GALL-015/017 corpus.
5. Preserve typed violations and missing-relation semantics.
6. Typed-refuse unsupported OCPQ operators.
7. Bind module/runtime/query/corpus identities in receipt.

## Failure/refusal boundaries
- Reference mismatch => FAIL
- Unsupported operator => UNSUPPORTED
- Nondeterministic binding order => qualification failure
- Missing relation => typed violation

## Qualification court
- focused OCPQ WASM tests
- GALL-017 reference corpus comparison
- input-order permutation test
- cross-runtime determinism test

## Boundary law
[
PortableExecution \neq Authority,\quad Observed \neq Normative,\quad QueryResult \neq FactBeyondItsSubject
]

No host/runtime/observer may silently expand the subject or rewrite process law.
