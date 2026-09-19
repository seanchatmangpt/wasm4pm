# ARD v26.9.18 — GALL-022: POWL Language Preservation

**Status:** DRAFT ARCHITECTURE SPEC  
**Release:** v26.9.18  
**Repository:** `seanchatmangpt/wasm4pm`  
**Owner:** wasm4pm  
**Dependencies:** GALL-016 canonical POWL  
**Authority ceiling:** COMPILE/COMPUTE only

## Architecture objective
wasm4pm compiles admitted POWL/POWL-v2 into portable executable process machinery while preserving the semantic relations that define sequence, partial order, choice, loop and hierarchy.

## Components
- POWL input adapter
- POWL -> WASM lowering IR
- construct-specific compiler passes
- semantic probe/witness harness
- module canonicalization/digest
- language-preservation receipt

## Data/control flow
`GALL-016 POWL -> validate supported constructs -> lower to WASM IR -> module -> semantic probes -> preservation receipt`

## Invariants
1. Consume canonical GALL-016 POWL subject and preserve its exact digest/provenance.
2. Define explicit lowering for each supported POWL construct.
3. Represent partial order without collapsing to a single total order.
4. Preserve hierarchical parent/child boundaries and choice/loop conditions.
5. Provide a semantic probe/trace-set or equivalent bounded witness for language preservation.
6. Typed-refuse unsupported POWL constructs; never approximate silently.
7. Bind compiler/lowering version and WASM module digest to receipt.

## Failure/refusal boundaries
- Unsupported construct => UNSUPPORTED
- Semantic probe divergence => FAIL
- Source POWL digest mismatch => REFUSED
- Compiler nondeterminism => no deterministic standing

## Qualification court
- focused POWL lowering unit tests
- GALL-015 semantic fixture probes
- partial-order flattening mutation falsifier
- hierarchy-preservation test
- rebuild determinism test

## Boundary law
[
PortableExecution \neq Authority,\quad Observed \neq Normative,\quad QueryResult \neq FactBeyondItsSubject
]

No host/runtime/observer may silently expand the subject or rewrite process law.
