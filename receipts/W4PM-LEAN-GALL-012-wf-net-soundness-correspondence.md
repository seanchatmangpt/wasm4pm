---
receipt: W4PM-LEAN-GALL-012
date: 2026-07-29
status: ALIVE
gate: WF-net admission and soundness correspondence (proof-dependency program, checkpoint 012/020)
git_revision: ba04893c3
predecessor: W4PM-LEAN-GALL-011 (receipts/W4PM-LEAN-GALL-011-petri-firing-correspondence.md)
mfact_revision: 801abf7933dabf5c95f9fb18ff21a7a8a1f6a564
---

# 012 — Correspondence Harness: WF-Net Admission & Soundness

## Which Rust semantics this targets
`wasm4pm::soundness::StructuralNet` (confirmed by direct source read this checkpoint) is
**unweighted and set-based** — `Marking = Vec<u32>`, `t_pre`/`t_post: Vec<Vec<usize>>` are
plain place-index lists. `StructuralNet::from_petri_net` **deduplicates parallel arcs via
`push_unique`** — a genuine, previously-undocumented finding: a transition literally cannot
be given "produce 2 tokens into the same place" via two parallel arcs; they collapse to one.
This is a third, distinct firing semantics from both `petri_firing.rs::BoundedNet` (weighted,
011) and `token_replay.rs::fire` (unweighted but unchecked). This checkpoint targets
`StructuralNet` directly, via a new `WfNetCarrier` (not a reuse of either prior carrier).

## Lean side (re-confirmed, not just cited from a prior round)
`mfact/procint/ProcInt/Workflow/WfNet.lean` (`content_sha256`
`a02d75b375037a620d327146f87459e1574dc43b8b1a09b242a62386700be736`) and
`Workflow/Soundness.lean` (`content_sha256`
`327a6b80989ab824fc4de2a375c8f93341e915825d350921014e9141660964cf`) — **no `sorry`/`axiom`
in either file, confirmed live.**
```lean
structure WfNet.Sound (W : WfNet P T) : Prop where
  option_to_complete : ∀ M, W.net.Reaches W.initialMarking M → W.net.Reaches M W.finalMarking
  proper_completion : ∀ M, W.net.Reaches W.initialMarking M → W.finalMarking ≤ M → M = W.finalMarking
  no_dead_transitions : ∀ t, ∃ M M', W.net.Reaches W.initialMarking M ∧ W.net.Step M t M'
```
`WfNet`'s underlying `PetriNet` (`Petri/Net.lean`) is genuinely **weighted** (`pre/post : T →
P →₀ ℕ`), unlike `StructuralNet` — a real semantic gap between the two sides, flagged
explicitly in the harness's own module doc, not glossed over.
Crown jewel: `WfNet.sound_iff_shortCircuit_live_bounded` (soundness ⟺ liveness+boundedness of
the short-circuited net) — **out of scope for this checkpoint**, see below.

## Method: curated fixtures, not exhaustive enumeration
Unlike 011's 118,098 exhaustively-enumerated firing triples, soundness-checking requires a
full bounded-BFS reachability graph per candidate net (not an O(1) lookup), and most
arbitrary small arc-index-list combinations fail WF-net structural admission before
soundness is even meaningful — exhaustion would burn budget on degenerate cases adding no
signal. **6 hand-constructed, individually justified fixture nets used instead** — a real,
honest scope reduction from 010/011, stated plainly.

## Positive witnesses & required falsifiers
1. `positive_sound_wfnet` — linear chain `source → mid → sink`, both sides agree: sound.
2. `dead_transition_detected` — an XOR-split (source token goes to branch `a` OR `b`, never
   both) followed by a transition requiring BOTH `a` and `b` simultaneously: structurally
   connected (stays admitted, unlike a genuinely disconnected place — a distinct, separately
   tested failure mode), but semantically dead. Both sides agree: `no_dead_transitions=false`.
3. `improper_completion_detected` — a transition produces into `mid` and `sink`
   simultaneously; both sides agree: `proper_completion=false`. (First attempt using a
   `mid → mid` self-loop drain was rejected at *admission* instead, since admission is
   checked via structural — not marking-based — reachability from sink; corrected to
   `mid → sink` so `mid` is structurally backward-reachable from sink.)
4. `unbounded_net_truncates_within_budget` — a self-sustaining cycle (`loop → {loop, sink}`)
   that regenerates its own enabling condition while growing `sink` each pass; both real
   `analyze_petri_net` and the independent transcription report `explored_truncated=true`
   within the 100,000-marking bound. (First attempt using a duplicate-arc `mid → {mid,mid}`
   silently failed to grow at all on the real Rust side — exposing the `push_unique`
   deduplication finding above; corrected to a genuinely self-reinforcing structure that
   works within the set-based semantics.)
5. `wrong_clause_is_caught` — a tampered "unsound" verdict on a genuinely sound net is
   asserted distinct from the correct one, proving the differential has teeth.
6. `non_wf_net_shape_is_rejected_by_real_admission_check` — two disconnected chains (no
   shared source/sink) are correctly rejected by the real `StructuralNet::is_workflow_net()`,
   exercising the admission predicate on real shipped code, not just the soundness clauses.
7. `lean_files_hash_matches_citation` — re-hashes both live Lean files, confirms no drift.

## Full command output
```
running 7 tests
test correspondence::wf_net_soundness::tests::wrong_clause_is_caught ... ok
test correspondence::wf_net_soundness::tests::non_wf_net_shape_is_rejected_by_real_admission_check ... ok
test correspondence::wf_net_soundness::tests::positive_sound_wfnet ... ok
test correspondence::wf_net_soundness::tests::dead_transition_detected ... ok
test correspondence::wf_net_soundness::tests::improper_completion_detected ... ok
test correspondence::wf_net_soundness::tests::lean_files_hash_matches_citation ... ok
test correspondence::wf_net_soundness::tests::unbounded_net_truncates_within_budget ... ok

test result: ok. 7 passed; 0 failed; 0 ignored; 0 measured; 945 filtered out; finished in 0.40s
```
Full crate-wide `cargo test` also run: **2246 passed, 0 failed** (up from 2239 pre-harness
— the +7 new correspondence tests, no other change).

## Evidence class achieved
`carrier_mapped_formula_correspondence (curated-fixture domain, decision-procedure scope
only)` — two qualifiers distinct from both 010's `(example_witnessed)` and 011's
`(exhaustive_domain)`: the domain is curated (not exhaustive), and the scope is explicitly
limited to the *decision procedure's* boolean clauses, not the crown-jewel theorem.

## Explicit scope boundary — decision procedure only, NOT the crown-jewel theorem
This checkpoint verifies "Rust's `is_wf_net`/`check_soundness` boolean clauses agree with
Lean's `Sound` predicate's clauses" over 6 curated fixtures, honestly bounded by
`MAX_REACHABLE_MARKINGS=100,000` for any net where reachability could exceed it. It does
**not** verify:
- `WfNet.sound_iff_shortCircuit_live_bounded` (soundness ⟺ liveness+boundedness of the
  short-circuited net) — requires implementing an independent liveness checker and the
  short-circuit construction in Rust, a separate, larger harness deferred to a future
  **012B**, not slotted into this one.
- An infinite-transition countermodel — not constructible as a finite Rust test by
  definition (Rust structures are finite); only meaningful as a Lean-side existence proof
  about the theorem, not the decision procedure. Explicitly excluded, matching how 011
  excluded unbounded-domain coverage.
- Weighted-arc WF-nets — `StructuralNet` is set-based/unweighted; Lean's `WfNet` is
  genuinely weighted. This checkpoint's fixtures stay within the unweighted domain both
  sides can represent; the weighted case is untested here.
- Live re-verification of `Soundness.lean`'s own proof state (cited by content hash only,
  same constraint as 010/011 — mfact's `.lake` build directory does not exist).

## Live Re-verification (W4PM-LEAN-GALL-022)

Performed in `/Users/sac/mfact` (mfact `HEAD` = `cf5e047264ccd117b49c97b0effb392a5e478e6b`,
ahead of the `mfact_revision` cited above; `git log --oneline -- Workflow/WfNet.lean
Workflow/Soundness.lean` confirms the most recent commit touching either file is still
`801abf7933d`, i.e. no drift since the cited revision despite `HEAD` moving on).

**Hash re-check** — `shasum -a 256` on both files, current working tree:
```
a02d75b375037a620d327146f87459e1574dc43b8b1a09b242a62386700be736  Workflow/WfNet.lean
327a6b80989ab824fc4de2a375c8f93341e915825d350921014e9141660964cf  Workflow/Soundness.lean
```
**MATCH** against `LEAN_WFNET_FILE_SHA256`/`LEAN_SOUNDNESS_FILE_SHA256` in
`wasm4pm/src/correspondence/wf_net_soundness.rs`.

**Build** — `cache get` already warm (8542 files already decompressed, 0 downloaded), then:
```
$ cd /Users/sac/mfact/procint && lake build ProcInt.Workflow.WfNet ProcInt.Workflow.Soundness
✔ [8561/8566] Built ProcInt.Workflow.WfNet (14s)
✔ [8566/8566] Built ProcInt.Workflow.Soundness (14s)
Build completed successfully (8566 jobs).
```

**Axiom check** — `#print axioms` on the crown-jewel theorem and its three lemmas, via a
scratch file imported and removed after the run (not committed to mfact):
```
'ProcInt.WfNet.sound_iff_shortCircuit_live_bounded' depends on axioms: [propext, Classical.choice, Quot.sound]
'ProcInt.WfNet.sound_of_live_bounded' depends on axioms: [propext, Classical.choice, Quot.sound]
'ProcInt.WfNet.live_of_sound' depends on axioms: [propext, Classical.choice, Quot.sound]
'ProcInt.WfNet.bounded_of_sound' depends on axioms: [propext, Classical.choice, Quot.sound]
```
Only the three standard Lean/Mathlib axioms (`propext`, `Classical.choice`, `Quot.sound`) —
no `sorryAx`, no custom axiom. `grep -n sorry WfNet.lean Soundness.lean` also returns no match
(exit 1).

**Standing upgrade rationale**: hash matched, build succeeded, no sorry/axiom found — the
Lean-side re-verification gap named in the prior `PARTIAL_ALIVE` standing (both the "not
`ALIVE` until a live `lake build` closes the gap" clause and the file-level sorry/axiom
claim) is now closed with a real, this-session command run, not citation-by-hash alone.

**What remains out of scope, unchanged from the prior round** — this upgrade covers file-level
kernel verification only. It does **not** newly verify: the Rust/Lean *correspondence* itself
(the decision-procedure-vs-`Sound`-predicate agreement over the 6 curated fixtures was already
checked by `cargo test` in the original 012 pass, not re-run here); the crown-jewel theorem's
*semantic* applicability to `StructuralNet` (still deferred to 012B, per the "Explicit scope
boundary" section above — proving the theorem type-checks with clean axioms is not the same
claim as proving it applies to wasm4pm's unweighted carrier); or weighted-arc WF-nets.

## Standing
`ALIVE` — hash-matched, kernel-rebuilt (`lake build`, this session), and axiom-clean
(`#print axioms`, only `propext`/`Classical.choice`/`Quot.sound`) for both cited Lean files,
per the Live Re-verification section above. Scope is unchanged from the original pass: this
is file-level Lean re-verification, not a re-run of the Rust/Lean correspondence harness or
proof of the crown-jewel theorem's applicability to `StructuralNet` (still 012B).
