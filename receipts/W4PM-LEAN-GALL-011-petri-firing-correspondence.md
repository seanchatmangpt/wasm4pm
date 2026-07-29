---
receipt: W4PM-LEAN-GALL-011
date: 2026-07-29
status: ALIVE
gate: Petri enabling and firing correspondence (proof-dependency program, checkpoint 011/020)
git_revision: 022ae7c54
predecessor: W4PM-LEAN-GALL-010 (receipts/W4PM-LEAN-GALL-010-token-replay-correspondence.md)
mfact_revision: 801abf7933dabf5c95f9fb18ff21a7a8a1f6a564
---

# 011 — Correspondence Harness: Petri Enabling/Firing

## Which Rust semantics this targets, and which it explicitly does not
Direct source exploration for this checkpoint found **two different** enabled/fire
implementations coexisting in wasm4pm:
1. `powl/conformance/token_replay.rs::fire` — unweighted (arc-weight-1), `Marking =
   BTreeMap<String,u32>`, unchecked `-= 1` (can underflow — callers guard by pre-topping-up,
   not the function itself).
2. The weighted, saturating, never-panics incidence-matrix semantics used by
   `conformance.rs`/`models.rs`'s streaming conformance path (`StreamingConformanceChecker`,
   `PetriNetLookup`) — non-negative-guarded via explicit `if marking[p] >= needed` checks.

`models::PetriNet` itself (the canonical discovery-facing type, weighted via
`PetriNetArc.weight: Option<usize>`) has **no `enabled`/`fire` methods at all** — firing
logic lives inline in the modules that consume it.

**This harness targets semantics (2)** — the weighted, saturating shape, since it is the
one that structurally matches Lean's `Finsupp`-based weighted `pre`/`post`. **Semantics
(1) (`token_replay.rs::fire`) is explicitly excluded** and not claimed correspondent.

## Lean side
`mfact/procint/ProcInt/Petri/Net.lean` (`content_sha256`
`6159dc44c0e700b335d86ca7960dfba79351040400e428cc694fd104f1ca83e1`):
```lean
structure PetriNet (P : Type) (T : Type) where
  pre  : T → (P →₀ ℕ)
  post : T → (P →₀ ℕ)
abbrev Marking (P : Type) := P →₀ ℕ
```
`mfact/procint/ProcInt/Petri/Firing.lean` (`content_sha256`
`d2402ca5605ab17a15d66d1207915a1e0cdeddf7c594274319e61c2a9973cebd`):
```lean
def PetriNet.Enabled ... : Prop := N.pre t ≤ M
noncomputable def PetriNet.fire ... : Marking P := M - N.pre t + N.post t
def PetriNet.Step ... : Prop := N.Enabled M t ∧ M' = N.fire M t
```
`pre`/`post` are genuinely **ℕ-valued** (`Finsupp`, weighted), not boolean/Prop-only —
confirms weighted-arc support. Confirmed no `sorry`/`axiom` in either file;
`step_deterministic`, `fire_add_pre`, `enabled_mono`, `step_add`, `fire_pre_self`,
`step_pre_self` are all closed proofs.

## Method: exhaustive enumeration over a bounded domain
Per this checkpoint's own required evidence standard (stronger than 010's hand-picked
example cases): every `(net, transition, marking)` triple in a small, fully-enumerated
domain is checked, not sampled.

**Bounds**: `MAX_PLACES=2`, `MAX_TRANSITIONS=2`, arc weights and marking token counts each
in `0..=2`. Combinatorics: 81 `(pre,post)` weight-vector pairs per transition × 81 for the
second transition = 6561 net configurations × 2 transitions to fire × 9 markings = **118,098
total triples**.

**Result**: `exhaustive_domain_all_agree` checked all 118,098 triples, 0 disagreements,
0.04s in release mode.

## Positive witnesses
- `exhaustive_domain_all_agree` — the exhaustive check itself.
- `consume_missing_token_is_refused`, `fire_disabled_transition_is_refused_not_tamperable`
  — disabled firings correctly refused by both sides, not silently allowed or panicking.

## Negative falsifiers (5 required by this checkpoint's program, all present)
1. `consume_missing_token_is_refused` — a transition demanding a token from an empty place is refused by both `lean_fire_exact` and `rust_fire`.
2. `wrong_token_count_is_caught` — a tampered "successor" (post-weight applied twice) is asserted distinct from the correct one, proving the differential has teeth.
3. `illegal_place_reference_is_rejected` — `rust_fire` with an out-of-range transition index returns `Refused`, never index-panics.
4. `fire_disabled_transition_is_refused_not_tamperable` — both sides refuse a genuinely disabled transition; a tampered "fires anyway" outcome is asserted distinct from the correct refusal.
5. `encoding_is_injective_on_tested_domain` — distinct markings are confirmed to never collide under this checkpoint's (currently lossless, direct) encoding.

## Full command output
```
running 7 tests
test correspondence::petri_firing::tests::encoding_is_injective_on_tested_domain ... ok
test correspondence::petri_firing::tests::consume_missing_token_is_refused ... ok
test correspondence::petri_firing::tests::wrong_token_count_is_caught ... ok
test correspondence::petri_firing::tests::illegal_place_reference_is_rejected ... ok
test correspondence::petri_firing::tests::fire_disabled_transition_is_refused_not_tamperable ... ok
test correspondence::petri_firing::tests::lean_files_hash_matches_citation ... ok
test correspondence::petri_firing::tests::exhaustive_domain_all_agree ... ok

test result: ok. 7 passed; 0 failed; 0 ignored; 0 measured; 938 filtered out; finished in 0.04s
```
Full crate-wide `cargo test` also run to confirm no regressions: **2239 passed, 0 failed**
(up from 2232 pre-harness — the +7 new correspondence tests, no other change).

## Evidence class achieved
`carrier_mapped_formula_correspondence (exhaustive_domain)` — a qualifier distinct from
010's `(example_witnessed)` variant, since exhaustion over a *stated, finite, fully-covered*
domain is strictly stronger evidence than a handful of hand-picked cases: it is a
decidable-checked universal statement over that domain. **Still not `direct_theorem` /
`EXACT_CORRESPONDENCE`** (no live Lean re-verification), and explicitly **not
`INVARIANTS_PROVEN`** either — that label would imply the invariant holds for all
nets/markings unboundedly, which a 2-place/2-transition/capacity-2 domain does not
establish, only makes more credible.

## Explicit scope boundary
This checkpoint proves ONLY that the weighted, saturating enabled/fire semantics match
Lean's `Firing.lean`, exhaustively over the stated bounded domain. It does **not** prove:
WF-net soundness (source/sink reachability, boundedness at scale — separate,
`soundness.rs`/a later checkpoint), mining/discovery correctness (that any real algorithm's
output net satisfies these semantics), token-replay fitness (already covered, differently,
by 010), correspondence for the *other*, unweighted `token_replay.rs::fire` implementation,
or firing semantics for nets outside the stated bounds (larger place/transition counts or
higher weights are unverified by exhaustion — only by the general structural argument that
the same code path handles them, which this checkpoint does not separately verify).
There is also no `models::PetriNet → BoundedNet` encoder yet — this checkpoint exercises the
bounded domain directly, not real net instances from the codebase; building that encoder is
future work for extending this checkpoint's coverage to actual discovery-algorithm output.

## Live Re-verification (W4PM-LEAN-GALL-022)

Performed as part of the W4PM-LEAN-GALL-022 program, alongside 010's re-verification
(checkpoint 023 first proved the toolchain works: `lake exe cache get` + `lake build
ProcInt.Models.Dfg` succeeded). This closes the "not re-verified" gap this receipt's
original Standing section flagged.

**Working directory**: `/Users/sac/mfact/procint`. Cache already populated from checkpoint
023 — `lake exe cache get` re-run for confirmation, ~7.4s, `No files to download`.

**Hash re-check** (`shasum -a 256`), current files vs. this receipt's pinned citations:
```
6159dc44c0e700b335d86ca7960dfba79351040400e428cc694fd104f1ca83e1  ProcInt/Petri/Net.lean
d2402ca5605ab17a15d66d1207915a1e0cdeddf7c594274319e61c2a9973cebd  ProcInt/Petri/Firing.lean
```
**MATCH** for both files — identical to this receipt's citations. Neither file has been
touched since this receipt was written.

**Build**:
```
$ lake build ProcInt.Petri.Net ProcInt.Petri.Firing
✔ [8559/8559] Built ProcInt.Petri.Firing (19s)
Build completed successfully (8559 jobs).
```
Succeeded, real time ~24s.

**Axiom check** — `lake env lean` on a throwaway script (`#print axioms`) importing both
built modules, for the key declarations this correspondence harness's Lean side relies on:
```
'ProcInt.PetriNet.Step' depends on axioms: [propext, Classical.choice, Quot.sound]
'ProcInt.PetriNet.step_deterministic' depends on axioms: [propext, Classical.choice, Quot.sound]
'ProcInt.PetriNet.fire_add_pre' depends on axioms: [propext, Classical.choice, Quot.sound]
'ProcInt.PetriNet.enabled_mono' depends on axioms: [propext, Quot.sound]
```
All four depend only on the standard classical/quotient axioms Mathlib itself is built on
— no `sorryAx`, no custom axiom. This corroborates the receipt's earlier `grep`-based claim
("Confirmed no `sorry`/`axiom` in either file"): a direct grep for `sorry\|admit\|axiom ` on
both files today matches only the shared header comment (`-- Candidate Lean: admitted only
by \`lake build\`...`), not a keyword inside any declaration body.

**Outcome**: hash match on both files + successful `lake build` of both modules + clean
axiom lists on the declarations this harness's correspondence claim depends on together
constitute a live kernel re-verification. This closes this receipt's own stated gap
directly. Status upgraded `PARTIAL_ALIVE` → `ALIVE` for this checkpoint's specific claim
(weighted/saturating enabled-fire semantics correspondence, exhaustive-domain-checked
against the now live-verified `Net.lean`/`Firing.lean`). This does not change the standing
of this receipt's own explicitly-stated exclusions (unweighted `token_replay.rs::fire`,
unbounded-domain claims, WF-net soundness, mining/discovery correctness) — those remain
exactly as scoped in the "Explicit scope boundary" section above.

## Standing
`ALIVE` — real, exhaustive-domain-verified harness with genuine falsifier coverage, and —
as of W4PM-LEAN-GALL-022 — both cited Lean files have been independently re-hashed (match),
rebuilt from source via `lake build`, and kernel-checked via `#print axioms` with no
`sorry`/custom axioms found on the relied-upon declarations. The live-verification gap this
receipt originally flagged is closed for this checkpoint; the explicit scope exclusions
above are unaffected and remain open work.
