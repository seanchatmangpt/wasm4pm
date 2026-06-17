# tableaux — Tableaux (Smullyan 1968)

Signed analytic tableaux for propositional validity (Smullyan 1968, *First-Order Logic*, Part I, Chapter II — signed formulas, alpha/beta rules). Source of truth: `crates/wasm4pm-cognition/src/breeds/tableaux.rs`.

## Shape

**BreedInput** — one required fact; `candidates`/`cases`/`rules`/`goals`/`state` unused.

| fact key | value | required |
|---|---|---|
| `tableaux:formula` | propositional formula (atoms, `!`, `&`, `\|`, `->`, `true`, `false`) parsed by the shared Pratt parser | yes |

**Caps (refusal, not truncation):** formula ≤ 256 chars; ≤ 64 AST nodes (`MAX_NODES`); ≤ 256 rule expansions (`MAX_EXPANSIONS`). Temporal/CTL operators are refused in preconditions (propositional fragment only).

**BreedOutput**

- `selected`: `"valid"` | `"invalid"` (the `VerifierBreed::valid_verdicts` vocabulary)
- fact `tableaux:verdict` = `valid` | `invalid` (required by postconditions)
- facts `tableaux:countermodel:<atom>` = `true`/`false` — only when invalid (atoms missing from the open branch default to `false`)
- `explanation`: `Tableaux on '<formula>': VALID|INVALID (<n> expansions)`

**Trace**

| kind | cardinality | detail format | OCPN phase (tableaux-l1-v1) |
|---|---|---|---|
| `parse-formula` | 1 (first) | `<formula>` | t1: formula_pending → formula_parsed |
| `sign-root` | 1 | `F <formula>` | t2: → root_signed |
| `alpha-expand` | 0..n | `<T\|F> <f> => <parts joined ", ">` | t3: branch_open loop |
| `beta-expand` | 0..n | `<T\|F> <f> => <left> \| <right>` | t4: branch_open loop |
| `close-branch` | 0..n | `clash on '<atom>' (<sf>)` or `constant clash (<sf>)` | t5: → branch_resolved |
| `open-branch` | 0..1 | `countermodel: a=true, b=false, ...` | t6: → branch_resolved |
| `verdict` | 1 (last) | `valid (all branches closed)` \| `invalid (open saturated branch)` | t7: → verdict_emitted |

## Data

Paper fixture `tests/fixtures/papers/tableaux.json` (verbatim):

```json
{
  "paper": {
    "authors": "Raymond M. Smullyan",
    "title": "First-Order Logic",
    "venue": "Springer-Verlag, Ergebnisse der Mathematik und ihrer Grenzgebiete 43",
    "year": 1968,
    "section": "Part I, Chapter II — Analytic Tableaux (signed formulas, alpha/beta rules)",
    "claim": "The K axiom A -> (B -> A) is a tautology; its signed tableau starting from F (A -> (B -> A)) closes using only alpha rules (no branching)."
  },
  "input": {
    "intent": "prove the K axiom",
    "facts": [
      { "key": "tableaux:formula", "value": "a -> (b -> a)" }
    ],
    "candidates": [], "cases": [], "rules": [], "goals": [], "state": []
  },
  "expected": {
    "verdict": "valid",
    "beta_expansions": 0,
    "selected": "valid"
  }
}
```

**Provenance:** Smullyan 1968 — the K axiom closes via alpha rules only. Expected values: `selected == "valid"`, fact `tableaux:verdict == "valid"`, and exactly **0** `beta-expand` trace steps.

Additional pinned values from unit tests (`src/breeds/tableaux.rs`):
- `a -> b` → `invalid` with countermodel `tableaux:countermodel:a = "true"`, `tableaux:countermodel:b = "false"`.
- `a | !a` → `valid`; `((a -> b) -> a) -> a` (Peirce) → `valid` and MUST contain ≥1 `beta-expand`.
- `G a` (temporal) → precondition refusal.

## Oracle diagram

Hidden oracle (`src/breeds/support/oracle_impls/logic.rs`, `impl BreedOracle for Tableaux`):

- `novel_input`: `uo_p -> (uo_q -> uo_p)` (K-axiom shape over fresh `uo_` atoms).
- `boundary_pair`: valid `uo_p | !uo_p` vs invalid `uo_p -> uo_q`.
- `refusal_input`: `G uo_p` (outside the propositional fragment).
- `assert_intermediate`:
  - `trace.require_non_empty()`
  - `trace.require_sequence(&["parse-formula", "sign-root", "verdict"])`
  - `trace.require_kind("close-branch")`

Postconditions (real implementation): `assert_verdict_valid` (selected ∈ {valid, invalid}), trace non-empty with a `verdict` kind, fact `tableaux:verdict` present.

Step invariants:
- **Alpha-first expansion** (enforced by the algorithm: an alpha formula is always consumed before any beta): a valid alpha-only formula produces ZERO `beta-expand` steps — asserted by the fixture and `k_axiom_valid_zero_beta`.
- **Branch set only closes**: a branch is removed only via `close-branch` (clash) or terminates the search via `open-branch`; valid ⇔ countermodel is `None` (enforced in `run`).
- **Countermodel honesty**: every atom of the formula appears in `tableaux:countermodel:*` when invalid (collected via `collect_atoms`, missing literals default `false`).
- PROPOSED (unenforced): independently re-evaluating the formula under the emitted countermodel must yield `false` (the threat model calls for this; postconditions do not currently re-evaluate).
- PROPOSED (unenforced): trace `verdict` step count == 1 (only `require_non_empty_with_kinds` is checked).

## Adversary

Primary cheat (`docs/breeds/anti-cheat-threat-model.md`): **SAT-solve the negation and report valid/invalid with no tableau** (or always close branches after a fixed depth).

Killing assertions: the structural fingerprint — `A->(B->A)` must close with ZERO `beta-expand` steps (a SAT rebadge has no alpha/beta structure); the countermodel from the open branch is independently evaluated by the test against the formula; alpha-first expansion order asserted via the step sequence (`require_sequence(["parse-formula","sign-root","verdict"])` + Peirce's law requiring `beta-expand`).

## Class & bounds

- Class trait: `VerifierBreed` (`valid_verdicts = ["valid","invalid"]`).
- Registry: standing `DISPATCHABLE`, status `PARTIAL_ALIVE`, no `complexity_caps` entry (caps live in code: 256 chars / 64 AST nodes / 256 expansions).
- Complexity: DFS over branches; worst case exponential in beta count, hard-stopped at 256 expansions (refusal `expansion cap 256 exceeded`).
- Determinism: no RNG; branch order is deterministic (left branch first, right deferred on a stack); all collections BTree-ordered.
