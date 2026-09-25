# ARD v26.9.18 — GALL-021: Portable Process Determinism

**Status:** FINAL_SPEC — closed for v26.9.24  
**Implementation standing:** OPEN in PR #627  
**Release:** v26.9.18  
**Repository:** `seanchatmangpt/wasm4pm`  
**Owner:** wasm4pm  
**Dependencies:** GALL-015 corpus, GALL-020 typed process compute  
**Authority ceiling:** COMPUTE only; no external DO

## Architecture objective
The same admitted process computation and exact WASM artifact produce the same canonical semantic result across qualified hosts/runtimes, with nondeterministic host inputs either fenced or explicitly bound.

## Components
- process input canonicalizer
- WASM module artifact/digest
- restricted host import surface
- multi-runtime qualification harness
- canonical output encoder
- portable execution receipt

## Data/control flow
`Exact process input + WASM module -> restricted host -> runtime A/B execution -> canonical result -> cross-runtime equality -> receipt`

## Invariants
1. Content-address process input, algorithm/module bytes, runtime/host identity and parameters.
2. Define canonical result serialization independent of map/event input iteration order.
3. Fence clock, randomness, filesystem/network and host imports unless explicitly part of the subject.
4. Run at least two supported WASM execution environments where available and compare canonical results.
5. Separate semantic-result identity from performance measurements.
6. Typed-refuse unsupported host capabilities instead of silently changing algorithm behavior.
7. Emit portable process execution receipt.

## Failure/refusal boundaries
- Host import nondeterminism unbound => REFUSED
- Runtime lacks required operator/import => UNSUPPORTED
- Semantic results diverge => FAIL
- External IO/DO required => outside ticket

## Qualification court
- cargo fmt --all -- --check
- focused deterministic process crate tests
- cross-runtime fixture where repository supports multiple hosts
- input-order permutation falsifier
- cargo test --workspace for touched surface

## Boundary law
[
PortableExecution \neq Authority,\quad Observed \neq Normative,\quad QueryResult \neq FactBeyondItsSubject
]

No host/runtime/observer may silently expand the subject or rewrite process law.
