---
receipt: W4PM-LEAN-GALL-010
date: 2026-07-29
status: ALIVE
gate: Correspondence harness (proof-dependency program, checkpoint 010/020)
git_revision: 6be4abd27c247421679f46285d491076dfbb1ec3
predecessor: W4PM-LEAN-GALL-009A (receipts/W4PM-LEAN-GALL-009A-ledger-closure.md)
mfact_revision: 801abf7933dabf5c95f9fb18ff21a7a8a1f6a564
---

# 010 — Correspondence Harness: `token-replay`

## Scope
First real Rust↔Lean correspondence harness in this program, covering
`wasm4pm::conformance::trace_fitness` (the token-replay fitness formula) against
`mfact/procint/ProcInt/Conformance/TokenReplay.lean::fitness`, the strongest-evidenced
candidate identified in `W4PM-LEAN-GALL-009` (`adjacent_theorem_requiring_carrier_mapping`).

**Explicit exclusions** (do not read this receipt as covering these):
- `simd_token_replay.rs` — a structurally distinct implementation (`SimdPetriNet` +
  `ColumnarLog`, not `PetriNet` + `EventLog`), not confirmed to use the identical formula,
  needs its own refinement proof.
- The other 6 `adjacent_theorem_requiring_carrier_mapping` algorithms from 009 (dfg,
  causal-heuristic, powl, powl-from-partial-orders, ocel-powl, simple-process-tree) — only
  the carrier-map JSON *schema* is designed for reuse; none of their harnesses exist yet.
- `TokenReplay.lean`'s own Lean proof state is cited by content hash, not re-verified via
  `lake build` — mfact's `.lake` directory does not exist (confirmed empty), and the file
  transitively imports all of Mathlib, making a from-scratch build impractical to run
  inline in this checkpoint.

## Carrier map
`wasm4pm/wasm4pm/correspondence/maps/token-replay.json` — full schema (reusable shape for
the other 6 candidates): Rust input type → encoder → canonical `ReplayCounts` carrier →
Lean input type (cited by content hash) → decoder → canonical exact-rational result →
Rust `f64` output.

## Comparison mode: `receipted_formula_with_cited_proof`, not live Lean
`wasm4pm::correspondence::token_replay::lean_fitness_exact` is a hand-transcribed,
independently reviewable copy of `ProcInt.fitness`'s literal formula text — not a call
into a running Lean process. This proves formula identity between the transcription and
what a human reading `TokenReplay.lean` sees, and lets Rust-side drift be caught by the
differential tests below. It does **not** re-verify that `lake build` currently succeeds
on the file, nor that no one has since edited it to introduce a `sorry`. The citation is
pinned to `mfact` revision `801abf7933dabf5c95f9fb18ff21a7a8a1f6a564` and file SHA-256
`0e33d099ad863eecade929d2242f0eaf18265b8e6b32fbccf7dd0bc82ee83185` — a
`lean_file_hash_matches_citation` test re-hashes the real file on every run and fails
loudly if it no longer matches, so staleness is detected automatically rather than
silently assumed away.

## Evidence

**Positive witnesses** (all real, run via `cargo test --lib correspondence::`, exit 0):
- `perfect_replay_is_exactly_one` — mirrors Lean's own `fitness_perfect` theorem: `(0,4,0,4)` → exactly `1`.
- `total_loss_is_exactly_zero` — `(4,4,4,4)` → exactly `0`.
- `asymmetric_partial_fitness_is_exact_five_eighths` — `(2,4,1,4)` → exactly `5/8`, deliberately asymmetric to catch a missing/remaining swap.
- `zero_consumed_and_produced_is_exactly_one` — the one boundary case where Rust's `.max(1)` denominator guard and Lean's `x/0=0` convention are different mechanisms that must coincide; verified, not assumed.
- `odd_denominators_stay_exact_not_epsilon_approximate` — `(1,3,0,5)` → exactly `5/6`, proving the comparison is exact-rational, not epsilon-tolerant.
- `lean_file_hash_matches_citation` — re-hashes the live `TokenReplay.lean` file and confirms it still matches the pinned citation.

**Negative falsifier** (proves the tests have teeth, per this program's own discipline):
- `coefficient_tamper_is_caught_by_asymmetric_case` — computes what `trace_fitness` would
  produce under a wrong `0.6/0.4` coefficient split instead of the real `0.5/0.5`, and
  asserts it disagrees with the correct Lean-derived value by more than `1e-9`. This
  demonstrates the asymmetric test case above would actually catch a coefficient tamper,
  not just happen to pass on the untampered code.

**Full command output**:
```
running 7 tests
test correspondence::token_replay::tests::perfect_replay_is_exactly_one ... ok
test correspondence::token_replay::tests::total_loss_is_exactly_zero ... ok
test correspondence::token_replay::tests::odd_denominators_stay_exact_not_epsilon_approximate ... ok
test correspondence::token_replay::tests::asymmetric_partial_fitness_is_exact_five_eighths ... ok
test correspondence::token_replay::tests::coefficient_tamper_is_caught_by_asymmetric_case ... ok
test correspondence::token_replay::tests::zero_consumed_and_produced_is_exactly_one ... ok
test correspondence::token_replay::tests::lean_file_hash_matches_citation ... ok

test result: ok. 7 passed; 0 failed; 0 ignored; 0 measured; 931 filtered out; finished in 0.04s
```
Full crate-wide `cargo test` also run to confirm no regressions: **2232 passed, 0 failed**
(up from 2225 pre-harness — the +7 correspondence tests, no other change).

## Evidence class achieved

`carrier_mapped_formula_correspondence` — a new, more precise class than 009's `adjacent_
theorem_requiring_carrier_mapping`: the carrier map now exists and has been exercised by a
real differential harness with positive witnesses and a negative falsifier, but this is
explicitly **not** `direct_theorem` (per the governing program's vocabulary, this maps to
`REFINEMENT_PROVEN` for the formula-identity claim, not `EXACT_CORRESPONDENCE`, since the
Lean proof itself was not live-reverified this checkpoint) — claiming `direct_theorem`
would require either a live Lean re-verification or independent kernel checking
(leanchecker/nanoda), neither performed here.

## Live Re-verification (W4PM-LEAN-GALL-022)

Performed as part of the W4PM-LEAN-GALL-022 program (checkpoint 023 first proved the
Lean toolchain works end to end: `lake exe cache get` fetched prebuilt Mathlib oleans, and
`lake build ProcInt.Models.Dfg` succeeded). This closes the "not re-verified" gap this
receipt's original Standing section flagged.

**Working directory**: `/Users/sac/mfact/procint` (the actual Lake package root — not
`/Users/sac/mfact`).

**Cache check**: `.lake/build/lib` already populated from checkpoint 023's earlier fetch.
Ran `lake exe cache get` anyway to confirm — completed in ~7.4s wall time with `No files to
download / Already decompressed 8542 file(s)`, i.e. no re-download needed.

**Hash re-check** (`shasum -a 256`), current file vs. this receipt's pinned citation:
```
0e33d099ad863eecade929d2242f0eaf18265b8e6b32fbccf7dd0bc82ee83185  ProcInt/Conformance/TokenReplay.lean
```
**MATCH** — identical to the citation above. The file has not been touched since this
receipt was written.

**Build**:
```
$ lake build ProcInt.Conformance.TokenReplay
✔ [8558/8558] Built ProcInt.Conformance.TokenReplay (58s)
Build completed successfully (8558 jobs).
```
Succeeded, real time ~62s.

**Axiom check** — `lake env lean` on a throwaway script (`#print axioms`) importing the
built module, for the two declarations this correspondence harness cites:
```
'ProcInt.fitness' depends on axioms: [propext, Classical.choice, Quot.sound]
'ProcInt.fitness_perfect' depends on axioms: [propext, Classical.choice, Quot.sound]
```
Both depend only on the three standard classical/quotient axioms Mathlib itself is built
on — no `sorryAx`, no custom/ad-hoc axiom. Corroborating `grep -n "sorry\|admit\|axiom "` on
the file itself: the only match is a header comment (`-- Candidate Lean: admitted only by
\`lake build\`...`), not a `sorry`/`axiom` keyword in any declaration body.

**Outcome**: hash match + successful `lake build` + clean axiom list together constitute a
live kernel re-verification of `ProcInt.fitness`/`fitness_perfect` at the exact cited
revision. This closes this receipt's own stated gap (a) directly — no product-decision
fallback (b) was needed. Status upgraded `PARTIAL_ALIVE` → `ALIVE` for this checkpoint's
specific claim (formula-identity correspondence between `trace_fitness` and the now
live-verified `ProcInt.fitness`). This does not retroactively change the standing of any
*other* checkpoint's Lean citations (010's own exclusions — `simd_token_replay.rs` and the
other 6 `adjacent_theorem_requiring_carrier_mapping` candidates — remain unaddressed).

## Standing

`ALIVE` — the harness is real, runs, has genuine falsifier coverage, and — as of
W4PM-LEAN-GALL-022 — the cited `TokenReplay.lean` has been independently re-hashed
(matches), rebuilt from source via `lake build`, and kernel-checked via `#print axioms`
with no `sorry`/custom axioms found. The live-verification gap this receipt originally
flagged is closed for this checkpoint.
