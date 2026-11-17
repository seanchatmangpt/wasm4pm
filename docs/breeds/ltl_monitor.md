<!-- wasm4pm-doc-status: active; reviewed: 2026-10-10; original: docs/breeds/ltl_monitor.md; source-sha256: 46af7c5cc84b70e7973ee614ec73f1415950d198477a77f75b5993cea4d370d0; reason: path-local documentation retained pending domain-specific supersession -->

contract updated 2026-10-10, zero-trace refusal; end-of-trace valuation gives
`G φ` true when it survived the full trace (LTLf finite-trace vacuous truth);
violations still caught mid-trace by progression to False.

# ltl_monitor — Linear Temporal Logic Monitor

## 1. Identity & Lineage
LTL_MONITOR (Havelund & Roşu 2001, "Monitoring Programs Using Rewriting",
ASE). Tradition: runtime verification, temporal logic monitoring. BreedId
`ltl_monitor`.

## 2. Algorithm
Havelund–Roşu progression. The property is parsed with the shared
`support::formula` Pratt parser, translated to an LTL-only AST, then
progressed: each trace event rewrites the formula to its residual obligation
with eager True/False simplification; a mid-trace True/False resolves the
verdict immediately. If the trace exhausts first, the residual is valued at
end-of-trace with finite-trace semantics: `Always(_) => true` (a G that
survived the observed prefix is satisfied), atoms/Next/Eventual/Until =>
false.

## 3. Input Contract
`ltl:formula` (or `formula`, or non-empty `intent`) — formula text, ≤256
chars (`! & | -> X F G U R`, atoms); AST node limit 100. Trace: `trace:N`
facts (comma-separated atoms true at step N) or `cases` (each case's fact
keys are the events). Preconditions refuse zero trace events and >1000
events.

## 4. Output Contract
`selected` = `"true"`/`"false"`; a `conforms` fact with the same value is
appended to the output facts.

## 5. Trace & OCEL Lifecycle
`ltl-init`(1,1) → `ltl-progress`(1,*) → `ltl-verdict`(1,1). Report fitness
1.0. Postconditions require `ltl-init` and `ltl-verdict` kinds.

## 6. Oracles
Paper: Havelund & Roşu 2001 progression — conforming/violating
traffic-light traces with exact progression counts. Hidden: `G zorp` over a
satisfying trace → verdict true with a `true` ltl-verdict step; one
violating event → false (progression caught it mid-trace). Adversarial:
refusals on missing formula, formula >256 chars, >100 AST nodes, zero
trace, trace >1000 events.

## 7. Determinism & Bounds
O(|trace| × |φ|²) — each progression can at most double conjunction depth
before simplification; eager simplification prevents explosion.

## 8. Provenance
Fixture `tests/fixtures/papers/ltl_monitor.json` (Havelund & Roşu 2001).
Support: `breeds::support::formula`.
