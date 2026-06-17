# clp — Constraint Logic Programming (FD)

## 1. Identity & Lineage
CLP scheme (Jaffar & Lassez, POPL 1987), instantiated over finite integer domains. BreedId `clp`, module `src/breeds/clp.rs`.

## 2. Algorithm
Incremental constraint store: constraints posted in lex id order, each followed by AC propagation (binary support revision; exact integer arithmetic for x=y+c; unary bounds; singleton-elimination alldiff); then first-fail labeling (smallest domain, lex tiebreak) with chronological backtracking. Mirrors `support::csp`'s AC-3 contract over integer domains so arithmetic offsets are exact (string-domain reuse rejected for correctness; documented).

## 3. Input Contract
Facts `clp:var:<x>`="1..5"|"3", `clp:constraint:<id>`= "x<y" | "x<=y" | "x=y" | "x!=y" | "x=y+c" | "x<=c" | "x<c" | "alldiff(x,y,z)". ≤24 vars, domains ≤16, expansions ≤4096.

## 4. Output Contract
Facts `clp:solution:<x>`, `clp:backtracks`, or `clp:status`="inconsistent"; `selected` = "x=1,y=2,..." or None.

## 5. Trace & OCEL Lifecycle
{`post-constraint`,`propagate`}(1,*) → {`label`,`propagate`,`backtrack`}(0,*) → {`solution`|`inconsistent`}(1,1). Exact domain reductions ("x: {1,2,3} -> {1}") in propagate details. Report fitness 1.0.

## 6. Oracles
Refusal: no vars / no constraints / oversized domain / unknown variable. Hidden: x<y<z≤3 over 1..5 → propagation alone forces x=1,y=2,z=3 with ZERO backtrack steps and exact domain reductions asserted. Paper: x=y+3 ∧ y<4 ∧ x∈6..9 → x=6,y=3 by the solver, zero search.

## 7. Determinism & Bounds
BTreeMap domains, lex constraint posting, first-fail lex labeling.

## 8. Provenance
Fixture `tests/fixtures/papers/clp.json` (J&L87 scheme adapted to CLP(FD); reals out of scope, documented).
