# Cloud agent prompt: finish the v26.7.24 planning + diagramming work

Copy everything below the line into the cloud agent's task/prompt field.

---

You are continuing planning and documentation work on `wasm4pm` (repo root
`~/wasm4pm`, example app at `examples/interview-assist/`, a Next.js app wired to the real
`wasm4pm-cognition` WASM breed system). This is a **planning and diagramming task, not an
implementation task** — you may run read-only commands and tests to verify facts, but you must not
change application code under `examples/interview-assist/{app,components,lib}` or
`crates/wasm4pm-cognition/`. Your file-ownership boundary is `docs/jira/v26.7.24/` and
`docs/diagrams/` only.

## What already exists (read these first, don't re-derive)

1. `docs/jira/v26.7.24/README.md` — a priority matrix + 7-row scored backlog for finishing the
   InterviewAssist release. §2 ("Ground truth, re-verified this session") documents real, grep/
   ls-verified facts about what's actually implemented vs. what the older ggen-side ticket backlog
   claimed. Row 1 of the backlog table is the highest-priority item: **confirm whether
   `tests/scenarios/{persistence-and-replay.test.ts, tamper-detection.test.tsx,
   accessibility-projection.test.tsx, zero-input-cognition.test.ts,
   self-play-manufacturing.test.ts, full-decisive-acceptance-test.test.tsx}` actually pass** — a
   `vitest run` across all six was started in a prior session and never confirmed complete (it
   involves a real local Ollama call in `self-play-manufacturing.test.ts`, which is slow).
2. `docs/diagrams/` — 8 files: `README.md` (index), `ui-ux-redesign.md` (verbatim UX spec + one
   grounded correction), `unfinished-work.md` (status map, mirrors README.md §2), `c4-context.md`,
   `c4-container.md`, `c4-component.md`, `sequence-cognition.md`, `sequence-sandbox-execution.md`,
   `sequence-receipt-replay.md`. Every architecture/sequence diagram cites the real source file(s)
   it was grounded in — do not add a diagram that isn't grounded the same way.
3. **Open design question already analyzed, not yet decided or documented anywhere**: Eliza (the
   currently-wired cognition breed) returns one keyword-matched response, not the ranked
   percentage-scored candidate list (`78% / 14% / 8%`) shown in the UI/UX mockup
   (`docs/diagrams/ui-ux-redesign.md` §5). Investigation this session found: the real ABI already
   has a `candidates: Vec<Candidate>{id, score, eliminated, elimination_reason}` field, but no
   existing breed computes scores from free text — `Dendral` (`crates/wasm4pm-cognition/src/
   breeds/dendral.rs`) eliminates from *pre-scored* candidates via constraint facts; `Bayesian
   Network` (`bayesian_network.rs`) does exact inference over a hand-defined CPT (max 16 nodes);
   `Version Space` (`version_space.rs`) does candidate-elimination from labeled examples, not
   ranking. The two live options identified: (a) compute keyword-hit scores in the TypeScript
   `cognition-adapter.ts` itself from `COGNITION_RULES`' existing `targetTrackId` tags, still
   calling Eliza per top-track for the actual question text; or (b) do (a) then additionally feed
   the TS-computed scores into a real `Dendral` call for elimination/selection, giving the ranking
   real breed provenance in the receipt chain. Neither has been decided or written up.

## Your tasks, in order

1. **Confirm row 1 for real.** Run (from `examples/interview-assist/`):
   ```
   npx vitest run tests/scenarios/persistence-and-replay.test.ts tests/scenarios/tamper-detection.test.tsx tests/scenarios/accessibility-projection.test.tsx tests/scenarios/zero-input-cognition.test.ts tests/scenarios/self-play-manufacturing.test.ts tests/scenarios/full-decisive-acceptance-test.test.tsx
   ```
   Quote the real pass/fail counts per file into `docs/jira/v26.7.24/README.md` row 1 and into
   `docs/diagrams/unfinished-work.md`'s "Unverified" subgraph (move each confirmed-passing scenario
   from `Unverified` into `Done`, or into a new `Failing` box if something is actually red — do not
   silently reclassify a failure as passing or vice versa).

2. **Write up the Eliza ranking decision.** Add a new file `docs/jira/v26.7.24/DECISIONS.md`
   documenting the investigation above (breed survey, why neither is a drop-in swap) and a
   recommendation between option (a) and (b) — with your reasoning, not just a restatement. If you
   implement neither (this is a planning task), still write the recommendation as if it were an
   ADR (Architecture Decision Record): context, options considered, recommendation, consequences.
   Cross-link it from `docs/diagrams/ui-ux-redesign.md`'s §5 note and from
   `docs/jira/v26.7.24/README.md`.

3. **Re-run the whole §2 ground-truth check** in README.md — every `grep`/`ls` command listed
   there — and update any line that has drifted since it was last verified (cite the date you
   re-ran it). Do the same sanity pass across all `docs/diagrams/*.md` files: confirm every "Source"
   citation still points at a real file/line, fix anything stale.

4. **Fill any real gap you find** in the 7-row backlog or the 8-diagram set — e.g. if TICKET-057
   (final verifier report) is still absent and row 1 above is now fully confirmed, note explicitly
   in README.md whether writing TICKET-057 for real is now unblocked (per its own Definition of
   Done: it may only be written once row 1's evidence is quotable, which after step 1 it will be) —
   but do not write TICKET-057 itself unless asked; flag it as newly-unblocked instead.

## Non-negotiable Definition of Done for this task

- Every claim you write into README.md or any diagram file cites a command you actually ran and
  its real output (a count, a pass/fail, a file existing) — never "should pass" or "likely."
- No file outside `docs/jira/v26.7.24/` and `docs/diagrams/` is modified.
- `docs/jira/v26.7.24/DECISIONS.md` exists and contains a real recommendation, not just a
  restatement of the investigation.
- Report explicitly which of the 4 tasks above you completed vs. could not (with the real,
  disclosed reason) — do not silently skip one.

## What this task does not do

No application code changes. No new ticket implementation (TICKET-048 through 057 stay
docs-only). No git commit/push — that's a separate follow-up prompt you'll receive after this
work is reviewed.
