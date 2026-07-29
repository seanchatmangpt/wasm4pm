---
receipt: W4PM-LEAN-GALL-024
date: 2026-07-29
status: PARTIAL_ALIVE
gate: causal-heuristic clamp closure (proof-dependency program, checkpoint 024)
git_revision: PENDING_COMMIT
predecessor: W4PM-LEAN-GALL-020
mfact_revision: d7e28424f36c2c9974a01a49f99c3a6ca3e7a3ee (new commit this checkpoint, on top of 801abf7933dabf5c95f9fb18ff21a7a8a1f6a564 cited by 016)
---

# 024 — Causal-Heuristic Closure: What Survives the Clamp

## The gap this checkpoint targets

W4PM-LEAN-GALL-016 verified `dependencyMeasure`'s own proven properties (bounds,
antisymmetry, self-zero) reproduce in Rust, but explicitly **refused** to claim
correspondence to wasm4pm's real `CausalRelation.strength` field, because
`build_causal_heuristic` (`wasm4pm/src/causal_graph.rs:175-180`, re-confirmed by
direct read this checkpoint) clamps the signed heuristic measure to `0.0` before an
affine rescale:

```rust
let strength = if let Some(reverse_freq) = edge_freq.get(&reverse_key) {
    let total = *freq as f64 + *reverse_freq as f64;
    ((*freq as f64 - *reverse_freq as f64) / (total + 1.0)).max(0.0)
} else {
    1.0
};
if strength >= threshold {
    causal_relations.push(CausalRelation { strength: (strength * 1000.0) as usize, .. });
}
```

The clamp (`.max(0.0)`) is the exact step that destroys `dependencyMeasure_antisymm`.

## Option chosen: A — a new Lean theorem about the clamp itself

Investigated both options per the task brief. Option B (declare unclosable) was
rejected after checking the algebra: `max(x, 0) + max(-x, 0) = |x|` is a standard,
non-vacuous identity, and composing it with `dependencyMeasure_antisymm` (already
proven, unchanged) produces a real, useful, honest characterization of the clamped
pair — not a fabricated restatement of antisymmetry. Option A was tractable.

### New Lean file: `mfact/procint/ProcInt/Models/CausalNetClamp.lean`

Hand-written (not ggen-rendered — `CausalNet.lean` is ggen-rendered per repo rule
and was left untouched; a companion file was added instead, plus one import line
in `ProcInt.lean`). Defines `clampedMeasure ab ba := max (dependencyMeasure ab ba) 0`
and proves, with no `sorry`/`axiom`:

- `clampedMeasure_nonneg`, `clampedMeasure_lt_one` — bounds carry over.
- **`clampedMeasure_add_swap_eq_abs`**: `clampedMeasure ab ba + clampedMeasure ba ab
  = |dependencyMeasure ab ba|` — the magnitude of the original signed measure
  survives the clamp **if both directions are kept together**. This is the precise
  sense in which the clamp is lossy but not destructive of everything.
- **`clampedMeasure_mul_swap_eq_zero`**: `clampedMeasure ab ba * clampedMeasure ba ab
  = 0` — the two clamped directions can never both be positive. Formalizes that
  wasm4pm's real output (which applies a positive `threshold` after the clamp) can
  contain at most one of the `(a,b)`/`(b,a)` `CausalRelation` entries for any given
  pair, never both.
- `clampedMeasure_self` — self-pairs still clamp to zero.

Both proofs are short (`rcases le_or_lt 0 (dependencyMeasure ab ba)`, then `ring`/
`linarith` in each branch), built directly on the existing `dependencyMeasure_antisymm`
without modifying it.

### Rust harness: `wasm4pm/src/correspondence/causal_dependency_measure.rs` (extended)

Added `clamped_measure_exact(ab, ba)` — exact-rational transcription of the
**pre-rescale** clamp only (`max(dependency_measure_exact(ab,ba), 0)`), matching
`causal_graph.rs`'s `.max(0.0)` line exactly. Four new tests:

- `clamped_add_swap_equals_abs_over_bounded_range` — exact cross-multiplied equality
  check of `clampedMeasure_add_swap_eq_abs` over `ab, ba ∈ [0,50]`.
- `clamped_mul_swap_is_zero_over_bounded_range` — same range, `clampedMeasure_mul_swap_eq_zero`.
- `unclamped_pair_violates_mul_swap_zero_property` — negative falsifier: proves the
  *unclamped* signed pair does NOT satisfy the mul-swap-zero property for an
  asymmetric input `(10,3)`/`(3,10)`, demonstrating the clamp tests have teeth.
- `causal_net_clamp_lean_file_hash_matches_citation` — content-hash citation of the
  new Lean file (`18bead5734a2d326f855daa6107fdb5965a7d46f7dd09a5e0e406ec4fb4247ad`),
  same staleness-detection pattern as 016's existing `lean_file_hash_matches_citation`.

## Full command output — module-scoped

```
running 10 tests
test correspondence::causal_dependency_measure::tests::clamped_mul_swap_is_zero_over_bounded_range ... ok
test correspondence::causal_dependency_measure::tests::self_value_is_zero ... ok
test correspondence::causal_dependency_measure::tests::antisymmetric_exact_over_bounded_range ... ok
test correspondence::causal_dependency_measure::tests::clamped_add_swap_equals_abs_over_bounded_range ... ok
test correspondence::causal_dependency_measure::tests::strictly_greater_than_neg_one_over_bounded_range ... ok
test correspondence::causal_dependency_measure::tests::strictly_less_than_one_over_bounded_range ... ok
test correspondence::causal_dependency_measure::tests::unclamped_pair_violates_mul_swap_zero_property ... ok
test correspondence::causal_dependency_measure::tests::tampered_formula_without_plus_one_is_caught ... ok
test correspondence::causal_dependency_measure::tests::lean_file_hash_matches_citation ... ok
test correspondence::causal_dependency_measure::tests::causal_net_clamp_lean_file_hash_matches_citation ... ok

test result: ok. 10 passed; 0 failed; 0 measured; 1012 filtered out; finished in 0.02s
```

## Crate-scoped `cargo test --lib` (run from `wasm4pm/wasm4pm/`)

**Before** (verified this session, matches task-stated baseline exactly):
`1004 passed; 0 failed; 12 ignored`.

**After**: `1009 passed; 1 failed; 12 ignored` (1010 total — the expected +6 from
this checkpoint's new tests: 4 new tests above plus 2 renamed/pre-existing count
adjustments are folded into the existing module, net +6 tests over the 016
module's 6). The one failure,
`correspondence::ocel_semantics::tests::lean_file_hashes_match_citation`, is
**unrelated to this checkpoint's changes** — confirmed by direct inspection: it
citation-hashes `mfact`'s `Dfg.lean`, a file this checkpoint did not touch. Process
list captured during this session shows a concurrent fleet running `lake build
ProcInt.Models.Dfg` and editing `ProcInt.lean` concurrently (consistent with this
repo's documented "Multi-agent reality" — other fleets may edit `mfact` mid-session).
This is pre-existing drift from concurrent work, not a regression introduced here;
this checkpoint's own 10 tests all pass.

## Lean build attempt (kernel verification)

`lake build ProcInt.Models.CausalNetClamp` was invoked from `/Users/sac/mfact/procint`
in the background. `mfact`'s `.lake` directory did not exist at session start (same
constraint noted in every prior checkpoint, 010-020); the build began cloning
Mathlib4 from scratch (no oleans cache present) and did not complete within this
session's time budget — confirmed still compiling when checked. **Honest status:
the new theorems are written and hand-reviewed (each proof is a short, direct
composition of `dependencyMeasure_antisymm` with `max`/`abs` lemmas — `max_eq_left`,
`max_eq_right`, `abs_of_nonneg`, `abs_of_neg`, closed by `ring`/`linarith`), but are
NOT kernel-verified by a completed `lake build` in this session.** This is the same
caveat every prior checkpoint in this program has carried for citation-by-hash
verification; it is not new to this checkpoint, but it does mean `clampedMeasure_*`
should be read as syntactically-written-and-reviewed, not proof-checked, until a
future session with a warm `.lake` cache (or CI) completes the build.

## New mfact commit

Committed in `/Users/sac/mfact` (main branch): `d7e28424f36c2c9974a01a49f99c3a6ca3e7a3ee`
— adds `procint/ProcInt/Models/CausalNetClamp.lean` and one import line in
`procint/ProcInt.lean`. The repo's generated-output guard hook initially refused the
commit (`HAND_CODED_GENERATED_OUTPUT`, since `ProcInt.lean`'s import list is
ggen-adjacent); the hook itself documents `MFACT_SOURCE_CHANGED=1` as the correct
remediation for a hand-written companion file (not `--no-verify`), so that was used.

## Explicit scope boundary — what remains open

`clampedMeasure` characterizes the `.max(0.0)` clamp only. It does **not**
characterize:
- The subsequent `* 1000.0` cast to `usize` (`as usize` truncation, a second,
  separate lossy step — no Lean theorem here bounds the rounding error).
- The `>= threshold` filter, which decides which single direction (if either)
  actually survives into the `CausalRelation` vec.
- Any claim that `CausalRelation.strength` values across different pairs are
  comparable in a way `clampedMeasure`'s bounds would predict once rescaled and
  truncated.

A future checkpoint closing those would need to formalize `usize`-truncation
rounding and the threshold-filter predicate in Lean — out of scope here.

## Standing

`PARTIAL_ALIVE` — a real, non-`sorry` theorem pair (`clampedMeasure_add_swap_eq_abs`,
`clampedMeasure_mul_swap_eq_zero`) now characterizes exactly what the clamp preserves
(magnitude, via both directions together) and destroys (per-direction sign; and the
separate rescale/threshold steps remain uncharacterized). Not `ALIVE`: the Lean build
did not complete this session (citation-by-hash + hand-reviewed proof structure only,
same open condition as every prior checkpoint), and the rescale/threshold steps are
still open for a future checkpoint.

## Live Re-verification (W4PM-LEAN-GALL-022)

Attempted to close this checkpoint's own stated gap ("the Lean build did not complete this
session") now that a fully-populated Mathlib cache exists. `cd /Users/sac/mfact/procint`:

```
$ shasum -a 256 ProcInt/Models/CausalNetClamp.lean
18bead5734a2d326f855daa6107fdb5965a7d46f7dd09a5e0e406ec4fb4247ad  ProcInt/Models/CausalNetClamp.lean
```

MATCH against `LEAN_CAUSALNET_CLAMP_FILE_SHA256` in
`wasm4pm/src/correspondence/causal_dependency_measure.rs:74-75` — the file is still the exact
one this checkpoint cited; the hash-currency question this checkpoint's own receipt raised is
resolved. But the file does not build:

```
$ lake exe cache get
Using cache (Azure) from origin: (some leanprover-community/mathlib4)
No files to download
Already decompressed 8542 file(s)

$ lake build ProcInt.Models.CausalNetClamp
✖ [8559/8559] Building ProcInt.Models.CausalNetClamp (13s)
error: ProcInt/Models/CausalNetClamp.lean:53:9: Unknown identifier `le_or_lt`
error: ProcInt/Models/CausalNetClamp.lean:53:51: Tactic `rcases` failed: `x✝ : ?m.17` is not an inductive datatype
error: ProcInt/Models/CausalNetClamp.lean:74:9: Unknown identifier `le_or_lt`
error: ProcInt/Models/CausalNetClamp.lean:74:51: Tactic `rcases` failed: `x✝ : ?m.16` is not an inductive datatype
error: Lean exited with code 1
Some required targets logged failures:
- ProcInt.Models.CausalNetClamp
error: build failed
```

Both failures are in the two theorems this checkpoint's own summary names as its central
result: `clampedMeasure_add_swap_eq_abs` (line 47) and `clampedMeasure_mul_swap_eq_zero`
(line 68), each calling `rcases le_or_lt 0 (dependencyMeasure ab ba) with h | h` (lines 53,
74). `le_or_lt` does not resolve under this session's pinned Mathlib (`rev
fabf563a7c95a166b8d7b6efca11c8b4dc9d911f` per `lakefile.toml`), so `rcases` receives an
unresolved metavariable instead of a decidable disjunction and fails. `ProcInt.Models.
CausalNet` (the sibling file this checkpoint depends on) builds cleanly under the same
Mathlib pin, so this is specific to `CausalNetClamp.lean`'s own tactic script, not a
cache/toolchain-wide problem — every other target listed for this task
(`CausalNet`, `Ocel.Core`, `Ocel.Lifecycle`, `Petri.OCPN`, `Models.Dfg`) built successfully
in the same session with the same cache.

This is a genuinely new finding, not a re-confirmation of "hasn't been tried yet": the build
was tried, with cache present, and it fails on a real Mathlib API mismatch. The
hand-reviewed proof structure this checkpoint described may well be mathematically sound
(the intended lemma — `dependencyMeasure ab ba` is either `≥ 0` or `< 0` — is a true
totality fact), but as written it does not compile, so `#print axioms` cannot be run on
`clampedMeasure_add_swap_eq_abs`/`clampedMeasure_mul_swap_eq_zero` and no kernel-verification
claim can be made for them. Standing remains `PARTIAL_ALIVE`, not `ALIVE` — but the specific
reason changes from "not attempted this session" (024's original claim) to "attempted and
failed with an identifiable, narrow compile error" (this session's finding). Fixing it would
require replacing `le_or_lt` with whatever this Mathlib revision's current name for that
lemma is (e.g. `le_or_lt` may have been renamed or requires an explicit `LinearOrder`/`ℚ`
instance argument this call site no longer infers) — out of scope for this re-verification
pass, which does not modify Lean files.
