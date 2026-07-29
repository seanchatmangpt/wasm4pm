---
receipt: W4PM-LEAN-GALL-014
date: 2026-07-29
status: ALIVE
gate: DECLARE semantics correspondence, one constraint at a time (proof-dependency program, checkpoint 014/020)
git_revision: dc3f1f96d
predecessor: W4PM-LEAN-GALL-013 (receipts/W4PM-LEAN-GALL-013-conformance-metrics-ledger.md)
mfact_revision: 801abf7933dabf5c95f9fb18ff21a7a8a1f6a564
---

# 014 — DECLARE Semantics Correspondence

Per the governing program, this is mandatory before broader conformance promotion, since a
live, reachable silent-wrong-answer defect had previously been found for Succession/
NotCoExistence in `declare_conformance.rs` (fixed earlier this session, task #8).

## Real overlap between the two sides (re-derived live, not assumed from a prior round)

wasm4pm's `declare_conformance.rs` implements 9 templates: Response, Existence, Absence,
Init, Precedence, CoExistence, NotCoExistence, Succession, ChainResponse, ChainPrecedence.
mfact's `Models/Declare.lean` proves 7: existence, absence, exactlyOne, response,
precedence, succession, notCoexistence.

**Overlap (harnessed this checkpoint) = 6**: Response, Precedence, Succession,
NotCoExistence, Existence, Absence.
**Rust-only (no Lean counterpart, `no_lean_coverage`) = 4**: Init, CoExistence,
ChainResponse, ChainPrecedence.
**Lean-only (`rust_side_not_implemented`) = 1**: `exactlyOne` (`t.count c.activation = 1`).

The governing program's named minimum set (Response, Precedence, Succession, CoExistence,
NotCoExistence, ChainResponse, AlternateResponse) is only **partially achievable**:
`CoExistence` and `ChainResponse` genuinely have no Lean counterpart (confirmed live, not
merely unconfirmed), and `AlternateResponse` doesn't exist as a wasm4pm template at all —
these are honest gaps in the ledger below, not fabricated to complete the named list.

## Lean side (re-confirmed live)
`mfact/procint/ProcInt/Models/Declare.lean` (`content_sha256`
`d83c5410833ce8d013d1fb03d14da7d3ae44a4aab953ace307148179b32724ae`) — **no `sorry`/`axiom`,
confirmed.**
```lean
abbrev Response [DecidableEq α] (a b : α) (t : List α) : Prop :=
  ∀ i : Fin t.length, t.get i = a → ∃ j : Fin t.length, i < j ∧ t.get j = b
abbrev Precedence [DecidableEq α] (a b : α) (t : List α) : Prop :=
  ∀ j : Fin t.length, t.get j = b → ∃ i : Fin t.length, i < j ∧ t.get i = a
-- DeclareConstraint.Satisfies match, per template:
-- .existence => activation ∈ t
-- .absence => activation ∉ t
-- .succession => Response ∧ Precedence
-- .notCoexistence => ¬(activation ∈ t ∧ target ∈ t)
```
Only `response_concrete`/`precedence_concrete` have `by decide` concrete-trace proofs; the
other templates have structural lemmas (`succession_imp_response`, `existence_append`,
`notCoexistence_comm`) rather than numeric instances.

## Method: real production pure core called directly
Unlike 011/012 (independent Rust reference implementations, since production code wasn't
factored as a pure callable), this checkpoint's Rust side calls `declare_conformance::
check_declare_conformance_pure` **directly** — that pure core already existed from this
session's earlier DECLARE bug fix, so reusing it tests the actual shipped code path, a
stronger guarantee than an independent transcription.

## Evidence: full 6-type domain for 2 templates, reduced-depth for 4
Per the program's required evidence types (satisfying, violating, vacuous, repeated-event,
empty, shortest counterexample):
- **Response** and **NotCoExistence**: full 6-type coverage, 7 tests each (repeated-event
  split into satisfying + violating sub-cases).
- **Precedence, Succession, Existence, Absence**: reduced-depth (satisfying/violating/
  vacuous/empty only) — a deliberate scope bound, stated honestly rather than silently
  applied to all 6 without disclosure.

Plus `wrong_predicate_is_caught` (negative falsifier) and `lean_file_hash_matches_citation`
(staleness detection). **30 tests total.**

## Full command output
```
running 30 tests
[... all 30 tests ok ...]
test result: ok. 30 passed; 0 failed; 0 ignored; 0 measured; 959 filtered out; finished in 0.02s
```
Full crate-wide `cargo test`: **2283 passed, 0 failed** (up from 2253 pre-harness — the +30
new correspondence tests, no other change).

## Uncovered ledger (honest gaps, not fabricated)
| Template | Rust status | Gap type |
|---|---|---|
| Init | implemented, no dedicated correspondence test | `no_lean_coverage` |
| CoExistence | implemented and tested | `no_lean_coverage` (confirmed absent, not unconfirmed) |
| ChainResponse | implemented and tested | `no_lean_coverage` |
| ChainPrecedence | implemented and tested | `no_lean_coverage` |
| AlternateResponse | not implemented at all | `rust_side_not_implemented` (absent both sides) |
| exactlyOne | not implemented at all | `rust_side_not_implemented` (Lean-only) |

## Evidence classes achieved
`carrier_mapped_formula_correspondence (per_constraint_six_evidence_domain)` for Response
and NotCoExistence; `carrier_mapped_formula_correspondence (reduced_depth_domain)` for
Precedence, Succession, Existence, Absence — two new qualifiers distinct from 010's
`example_witnessed`, 011's `exhaustive_domain`, 012's `curated_fixture_domain`, and 013's
`finite-case-enumeration`.

## Explicit scope boundary
Does **not** cover: Init/CoExistence/ChainResponse/ChainPrecedence (no Lean counterpart);
AlternateResponse/exactlyOne (missing on one side each); live Lean re-verification (same
`.lake`-empty constraint as every prior checkpoint); the wasm-bound
`check_declare_conformance` wrapper directly (tests call the pure core it delegates to,
already confirmed to be the same logic).

## Live Re-verification (W4PM-LEAN-GALL-022)

Performed against the now-working mfact toolchain (checkpoint 023 confirmed `lake exe cache
get` fetches prebuilt Mathlib oleans).

**Hash check** — `shasum -a 256 procint/ProcInt/Models/Declare.lean` in `/Users/sac/mfact`:
```
d83c5410833ce8d013d1fb03d14da7d3ae44a4aab953ace307148179b32724ae  procint/ProcInt/Models/Declare.lean
```
Matches `LEAN_DECLARE_FILE_SHA256` in `wasm4pm/wasm4pm/src/correspondence/declare_semantics.rs`
exactly — **MATCH**, file untouched since original citation.

**Cache**: `cd /Users/sac/mfact && lake exe cache get` → `Completed successfully in 32296 ms!`
(8538 already-cached files decompressed, no downloads needed).

**Build**: `cd /Users/sac/mfact/procint && lake build ProcInt.Models.Declare`:
```
✔ [8558/8558] Built ProcInt.Models.Declare (12s)
Build completed successfully (8558 jobs).
```

**Axiom check** on the two concrete kernel-decided theorems cited in this file's own
transcription section (`response_concrete`, `precedence_concrete`; actual namespace is
`ProcInt`, not `ProcInt.Models.Declare` — confirmed via `namespace ProcInt` at line 10 of the
Lean file):
```
'ProcInt.response_concrete' depends on axioms: [propext, Quot.sound]
'ProcInt.precedence_concrete' depends on axioms: [propext, Quot.sound]
```
No `sorryAx` — both are genuine kernel proofs, only standard Lean/Mathlib axioms.
`grep -n "sorry\|axiom" Declare.lean` also returns no matches.

## Standing
`ALIVE` — hash matched, `lake build ProcInt.Models.Declare` succeeded from a real working
toolchain, and `#print axioms` on the cited concrete theorems shows no `sorryAx` dependency.
Scope remains as documented above (6 of 10 templates bridged; the rest out of scope by
design, not by this gate).
