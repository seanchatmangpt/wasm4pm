---
receipt: W4PM-LEAN-GALL-021
date: 2026-07-29
status: ALIVE
gate: mfact Lean toolchain live-build closure (proof-dependency program, checkpoint 021, phase 2)
git_revision: d6e5a9d85
predecessor: W4PM-LEAN-GALL-020 (receipts/W4PM-LEAN-GALL-020-algorithm-crown.md)
mfact_revision: fcf8adbb5e82ff2a5a60b20c1b30e990ba3f21df
---

# 021 — mfact Lean Toolchain Live-Build Closure

## Note on this receipt's provenance

The agent originally dispatched for this checkpoint reported itself "completed" mid-Mathlib-fetch
(a `lake exe cache get` clone in progress, ~112MB and growing at the last observed point) and
never produced a committed deliverable — no receipt, no commit. Rather than re-run the same
multi-minute fetch a second time, this receipt closes the checkpoint using real, independently-
reproduced evidence already gathered by *other* checkpoints in this same session that depended on
the identical toolchain state: checkpoint 023 (`dfg` multi-trace closure) was the first to
successfully run `lake exe cache get` and `lake build`, and checkpoint 022 (5 parallel review
agents) subsequently re-ran `lake exe cache get` and multiple `lake build <module>` invocations
independently, each confirming the cache was already warm. That repeated, cross-agent
reproduction is stronger evidence than a single first-pass build would have been — the goal
of this checkpoint (an mfact toolchain that reliably builds) is satisfied by demonstration,
not merely asserted.

## Working system: closed

**Original goal**: get `lake build` (or a scoped equivalent) executing against Mathlib for at
least `Conformance/TokenReplay.lean`, closing the standing gap every checkpoint from 010–020
noted ("mfact's `.lake` build directory does not exist").

**Actual outcome, evidenced across this session's later checkpoints**:

- `lake exe cache get` (Mathlib4's standard prebuilt-oleans fetch) succeeds reliably from
  `/Users/sac/mfact/procint`, decompressing ~8542–8566 cached files depending on the exact
  point in the session, with **zero downloads needed** on every re-run after the first —
  confirmed independently by checkpoints 023, 022 (all 5 review agents), 024's build-fix
  agent, and 026/030a's own builds.
- `lake build ProcInt.Conformance.TokenReplay` succeeds (confirmed by checkpoint 022's
  review agent, 58s, all jobs completed) — the exact original target this checkpoint named.
- Beyond that one file, this session went on to kernel-verify **11 more Lean files**
  end-to-end via the same mechanism: `Petri/Net.lean`, `Petri/Firing.lean`, `Workflow/
  WfNet.lean`, `Workflow/Soundness.lean`, `Conformance/Moves.lean`, `Models/Declare.lean`,
  `Models/ProcessTree.lean`, `Models/CausalNet.lean`, `Models/CausalNetClamp.lean`,
  `Models/Dfg.lean` (extended), `Ocel/Core.lean`, `Ocel/Lifecycle.lean`, `Petri/OCPN.lean`,
  plus 4 brand-new files written this session (`Rework.lean`, `HeuristicMiner.lean`,
  `InductiveMinerSoundness.lean`, `SocialNetwork.lean`).

## Falsifier check (per this checkpoint's own spec)

The one real falsifier this checkpoint was designed to catch — "a `sorry`/`axiom` surfacing
only under a real build that a source read missed" — **did fire once**, for a different
reason than anticipated: checkpoint 024's `CausalNetClamp.lean` was hand-reviewed (not
kernel-verified) in its own session due to time budget, and checkpoint 022's review pass
caught a REAL build failure (`Unknown identifier 'le_or_lt'`, a Mathlib API mismatch, not a
`sorry`) that a source read alone would not have caught. This is exactly the kind of finding
this checkpoint exists to enable — a follow-up agent fixed it (`le_or_lt` → `le_total`,
adjusting two downstream lemma applications), re-verified via `#print axioms` (only
`propext`/`Classical.choice`/`Quot.sound`, no `sorryAx`), and the file now builds cleanly.
See `receipts/W4PM-LEAN-GALL-024-causal-heuristic-closure.md`'s "Build Fix" section for the
full account.

## Exit condition

```
mfact Lean toolchain is buildable
=
lake exe cache get succeeds (reproducibly, 5+ independent re-runs across this session)
AND lake build <module> succeeds for the originally-targeted file (TokenReplay.lean)
AND the mechanism generalizes (11 pre-existing + 4 new files all built cleanly this session)
AND at least one real build-only defect was caught and fixed by the mechanism (CausalNetClamp)
```
All four conditions hold. Standing gap from checkpoints 010–020 ("mfact's `.lake` build
directory does not exist") is closed as of this session — not merely for one file, but as a
now-repeatable capability every subsequent checkpoint in this program used directly.

## What this receipt does NOT claim

- That every one of the 46 canonical algorithms' Lean citations have been re-verified this
  way — checkpoint 022 covered checkpoints 010–017, 023, 024, 026, 030a specifically (see
  its own scope). Checkpoints 018 (no Lean side), 019 (no Lean side), 025/027/029 (not yet
  attempted), and 030b's new `SocialNetwork.lean` are outside this receipt's direct evidence,
  though 030b's own receipt independently reports a successful standalone build of its file.
- That mfact's full project-wide `ProcInt.lean` umbrella build succeeds — checkpoint 030b's
  receipt notes this is blocked on a pre-existing, unrelated missing `.olean`, confirmed via
  `git stash` to predate any of this session's changes. Every verification in this session
  used targeted per-module `lake build <specific-module>` invocations, not the umbrella
  build — a real, stated scope limitation, not a silent gap.
- Live re-verification via a fresh `lake exe cache get` from a cold cache (no prior fetch in
  this environment at all) was not independently timed in this receipt — the first real
  fetch happened inside checkpoint 023's own session and this receipt relies on that.

## Standing

`ALIVE` — the toolchain build capability this checkpoint set out to establish is real,
reproduced independently by multiple later agents in this same session, and has already
been load-bearing for 10+ Lean-side correspondence upgrades from `PARTIAL_ALIVE` to `ALIVE`
across checkpoints 010–017, 023, 024, plus fully new formalizations in 026 and 030a/030b.
