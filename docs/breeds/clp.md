<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: docs/breeds/clp.md; source-sha256: f2490fda2ea54de8c27c99b732a895534c33fdeb0496bd4da653de48a47f6dee; reason: path-local documentation retained pending domain syntax update -->

contract updated 2026-10-10, own-trace contract (post-constraint → propagate
"var: {old} -> {new}" → solution "x=1,y=2"; no SAT:/label/backtrack trace kinds),
dual hyphen/colon fact grammar, typed CspError refusals.

# clp — Constraint Logic Programming (FD)

## 1. Identity & Lineage
CLP scheme (Jaffar & Lassez, POPL 1987), instantiated over finite integer domains.
BreedId `clp`, module `src/breeds/clp.rs`, store `support::csp::CspStore` (AC-3
propagation, shared with `csp_ac3`; no csp.rs change needed for the trace).

## 2. Algorithm
Incremental constraint store: variables declared first (pass 1), then constraints
posted in fact order (pass 2), each followed by store fixpoint propagation. The
breed emits its own trace from before/after domain snapshots around each posting
— `store.trace` is not remapped. Final `store.solve()`: AC-3 propagation, then
first-fail value selection with chronological backtracking inside the support
store (budget 100 000 iterations, typed `BudgetExhausted`).

## 3. Input Contract
Two accepted fact encodings:
- Hyphen: `clp-var`="name:domain", `clp-constraint`="<expr>"
  (`csp-var`/`csp-constraint` also accepted).
- Colon: `clp:var:<name>`="<domain>", `clp:constraint:<id>`="<expr>".
Domain syntax: comma list (`1,2,3`) or inclusive range (`6..9`); empty or
inverted ranges refused. Constraint grammar: binary comparisons `x<y`, `x<=y`,
`x>y`, `x>=y`, `x==y`, `x!=y`, plain equality `x=y`, arithmetic offsets
`x=y+3` / `x=y-3`, and unary comparisons against an integer constant (`y<4`,
modelled as a singleton constant variable). No `alldiff` in this breed.
Precondition: at least one variable fact, else refused.

## 4. Output Contract
Input facts are mirrored; no `clp:solution:*`/`clp:backtracks`/`clp:status`
facts are emitted. `selected` = `"sat"` iff a solution exists (None otherwise).
`explanation` = `"SAT: x=1, y=2, ..."` (sorted `var=value`, constants filtered)
or `"UNSAT"`.

## 5. Trace & OCEL Lifecycle
`post-constraint` (1,*) → interleaved `propagate` (0,*) → final `solution`
(1,1). Details: `post-constraint` = `"<id>: <expr>"` (colon-key suffix or
`c<index>`); `propagate` = `"x: {1,2,3} -> {1}"` (sorted domain sets, changed
non-constant vars only); `solution` = `"x=1,y=2"` (sorted, no `SAT:` prefix) or
`"UNSAT"`. Postcondition pins first=`post-constraint`, last=`solution`.
There are NO `label`/`backtrack` trace kinds — search happens inside
`support::csp` untraced.

## 6. Oracles
Refusal: no variable fact; malformed var value (missing `name:` part); empty or
inverted range; malformed constraint (no recognized operator); unknown variable
in a constraint (`UndeclaredVariable`); non-integer values under ordering or
offset constraints (`NonNumericOrdering`); iteration budget exhausted
(`BudgetExhausted`, 100 000). Hidden: x<y<z≤3 over 1..5 → propagation alone
forces x=1, y=2, z=3 with zero backtrack trace steps and real narrowing
asserted. Paper: x=y+3 ∧ y<4 ∧ x∈6..9 → x=6, y=3, zero search.

## 7. Determinism & Bounds
BTreeMap domains, constraints posted in fact order, sorted domain/value
formatting, first-fail lex selection in `support::csp`.

## 8. Provenance
Fixture `tests/fixtures/papers/clp.json` (J&L87 scheme adapted to CLP(FD);
reals out of scope, documented).
