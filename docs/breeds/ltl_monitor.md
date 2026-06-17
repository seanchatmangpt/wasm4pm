# ltl_monitor — Linear Temporal Logic Monitor

## 1. Identity & Lineage
LTL_MONITOR (Havelund & Roşu 2001, "Monitoring Programs Using Rewriting", ASE). Tradition: Runtime verification, temporal logic monitoring. BreedId `ltl_monitor`.

## 2. Algorithm
Havelund–Roşu progression algorithm. Parses the property with the shared `support::formula` Pratt parser, translates to an LTL-only AST, then applies progression: each trace event rewrites the formula to its residual obligation, with eager True/False simplification. If progression never resolves, the residual formula is valued at end-of-trace with finite-trace semantics.

## 3. Input Contract
`ltl:formula` — formula text, ≤256 chars (`! & | -> X F G U R`, atoms).
facts `trace:N` — comma-separated atoms true at step N; 1..=1000 events required.

## 4. Output Contract
`selected` / fact `ltl:verdict` — `"true"` or `"false"`.

## 5. Trace & OCEL Lifecycle
`ltl-init`(1,1) → `ltl-progress`(1,*) → `ltl-verdict`(1,1). Report fitness 1.0.

## 6. Oracles
Paper: Havelund & Roşu 2001 progression — conforming/violating traffic-light traces with exact progression counts.
Adversarial: Refusals on missing formula, formula size overflow, or event limits.

## 7. Determinism & Bounds
O(|trace| × |φ|²) complexity — each progression can at most double conjunction depth before simplification. Eager simplification prevents explosion.

## 8. Provenance
Fixture `tests/fixtures/papers/ltl_monitor.json` (Havelund & Roşu 2001). Support: `breeds::support::formula`.
