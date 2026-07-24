# InterviewAssist v26.7.24 — priority matrix + full plan to finish the release

## Why this doc exists

Two recurring failures this doc is designed to structurally prevent:

1. **Arbitrary stopping points.** Prior passes (this session and the ggen-side workflow before it)
   left work at "PLANNED" or declared "done" based on prose ("a passing test exists," "the UI is
   redesigned") with no mechanically-checkable condition — so the 20% left unfinished was whatever
   felt like enough at the time, not a disclosed, fixed boundary.
2. **Stale status vs. real state.** Section 2 below was written by first re-verifying every claim
   against the actual filesystem (`grep`/`ls`/test-file line counts run this session, not recalled
   from the ggen tickets) — several items the ggen backlog marked `PLANNED` already have real code
   and real test files on disk. The backlog below reflects what is *actually there*, not what a
   stale ticket says.

Every row below has a **Definition of Done** that is a literal checklist + a literal command, never
"should pass." Ordering comes from the **priority matrix formula** in §1, not from judgment calls —
if the order looks wrong, the fix is to correct a column value, not to reorder by hand.

## §1. Priority matrix — the ordering mechanism

Every backlog item is scored on four columns. The rule for each column is objective, so two people
scoring the same item land on the same number.

| Column | Rule |
|---|---|
| **Blocks decisive test?** | Y (2 pts) if TICKET-053 (`full-decisive-acceptance-test`) or any of 048/049/050/051/052/056/057 cannot produce a real result without this item existing; else N (0 pts) |
| **Unmet dependencies** | 2 pts if every item this depends on is already real (checked below, not assumed); 0 pts if something it needs doesn't exist yet |
| **User-visible now** | 1 pt if a candidate sees this in the live session flow; 0 pts if backend/report-only |
| **Effort (tiebreaker only)** | S / M / L — used only to break ties at equal score, S ranks above L |

**Score = Blocks-decisive + Unmet-dependencies + User-visible.** Max 5.

## §2. Ground truth, re-verified this session (commands run, not recalled)

```
$ grep -n "SessionHeader\|SessionWorkspace\|SessionActivityDrawer\|CognitionPanel\|Add track candidate\|Advance to" app/page.tsx
```
→ `SessionHeader`, `SessionWorkspace`, `SessionActivityDrawer`, `CognitionPanel` are imported and
rendered (lines 36-38, 44, 518, 527, 563, 644). **No match for "Add track candidate" or "Advance
to".** The screenshot showing raw capability buttons and a manual `Advance to PREPARING` control
reflects a build that predates the Phase-4 redesign already merged into `main` — the redesign the
mermaid spec asked for is **already implemented**, not a future backlog item, for its structural
skeleton.

```
$ ls tests/scenarios/ | grep -E 'persistence|tamper|accessibility|zero-input|self-play|decisive'
```
→ `persistence-and-replay.test.ts`, `tamper-detection.test.tsx`, `accessibility-projection.test.tsx`,
`zero-input-cognition.test.ts`, `self-play-manufacturing.test.ts`, `full-decisive-acceptance-test.test.tsx`
**all exist** — TICKET-048/049/050/051/052/053 have real test files already, contradicting the
ggen backlog's `PLANNED` status for all six.

```
$ grep -c "test(\|it(" <each file above>
```
→ persistence-and-replay: 3, tamper-detection: 2, accessibility-projection: 1, zero-input-cognition: 3,
self-play-manufacturing: 4, full-decisive-acceptance-test: **11**.

```
$ ls lib/domain/ | grep -i receipt
```
→ `receipt.ts`, `receipt-emitter.ts`, `reducer-with-receipts.ts` exist (TICKET-056's types/emission
layer is real). **No file implements a final aggregated verifier report** (TICKET-057 — confirmed
absent: `find . -iname '*verifier*report*'` returns nothing outside `node_modules`).

```
$ ls tests/e2e/ | grep jtbd | wc -l
```
→ 15 real Playwright JTBD spec files exist.

**Still genuinely open, confirmed by absence:**
- TICKET-057 (final verifier report) — no file anywhere.
- Whether the 6 scenario test files above actually **pass** — a full run was started this session
  (`npx vitest run` on all six, backgrounded because `self-play-manufacturing.test.ts` calls a real
  local Ollama model and the run exceeded 120s) — result not yet known at time of writing. **Do not
  mark any of 048–053 ALIVE until this run's real output is read and quoted**, per this repo's own
  `no-overclaiming` discipline.

## §3. Definition of Done — four category rubrics (used by every row in §4)

**A. Non-negotiable** (must be true, no partial credit) · **B. Explicitly deferred** (must be named
here, not silently dropped) · **C. Verification command** (literal, with the expected result stated).

### E2E/scenario ticket (048–053)
- A. Real running dev server or real subprocess/browser context; zero `page.route()` mocks on the
  core path; both a positive and a named negative case; the exact `test(...)` title strings quoted
  in the ticket row; a teeth-check (temporarily break the assertion's target, confirm the named
  test fails, restore) recorded as done.
- B. Anything the test file itself skips must be named in that file's own comments — if it isn't,
  that's a gap to fix, not a deferral to accept silently.
- C. `npx vitest run <exact file>` with the exact `N passed` count quoted in the ticket row (never
  "tests pass").

### UI/component item
- A. Every new interactive element has a `data-testid`; reachable via keyboard-only navigation in
  a stated order; driven by a real reducer/adapter dispatch, not local component state standing in
  for the real event; one render test + one interaction test exist; any accessibility claim (live
  region, focus target, landmark) is asserted by reading the actual DOM attribute in a test.
- B. A component that renders but isn't wired to the real event path does not count as done — name
  it as deferred, don't claim it.
- C. `npx vitest run tests/components/<file>.test.tsx` plus the relevant `tests/e2e/jtbd-*.spec.ts`
  Playwright run, both with quoted pass counts.

### API/adapter item
- A. Positive test against the real collaborator (no mock); at least one real failure-mode test
  with the exact expected error shape named; server-only boundary confirmed by a literal grep
  showing zero `"use client"` importers of the adapter file.
- C. `npx vitest run tests/adapters/<file>.test.ts` + `grep -rl "cognition-adapter" app components | xargs grep -L "use client"` (or equivalent) showing the adapter is never imported by a client file.

### Report/receipt item (056, 057)
- A. Every claim in the report cites a specific prior ticket's real command output or receipt file
  path; ALIVE asserted only if TICKET-053's exact verification command was re-run this pass and its
  output quoted, not carried over from memory.
- C. The report file itself, reviewed for citations, not summarized without them.

## §4. Ordered backlog (scored by §1, grounded by §2)

| # | Item | Blocks decisive | Unmet deps | User-visible | Effort | **Score** | Definition of Done | Explicitly deferred |
|---|---|---|---|---|---|---|---|---|
| 1 | **Confirm 048–053 pass for real** (read the backgrounded vitest run's output; fix and re-run anything red) | Y (2) | none — files exist (0 unmet, 2) | Y for 5/6 (1) | S | **5** | Rubric: E2E/scenario. `npx vitest run tests/scenarios/{persistence-and-replay.test.ts,tamper-detection.test.tsx,accessibility-projection.test.tsx,zero-input-cognition.test.ts,self-play-manufacturing.test.ts,full-decisive-acceptance-test.test.tsx}` — quote real pass/fail counts per file | None — this is verification of existing code, not new scope |
| 2 | **TICKET-057: final verifier report** | Y (2) | blocked until #1's real pass/fail is known (0) | N (0) | S | **2** (rises to 5 once #1 is quoted) | Rubric: Report. Aggregates every ticket's real receipt/test citation; states ALIVE only if item #1's full-decisive test passed with a quoted hash match | None |
| 3 | **Playwright coverage for 048–053** (currently vitest-only; TICKET's own rubric calls for real-browser Chicago-TDD where the scenario touches the UI — persistence/replay, tamper, accessibility, zero-input all have a UI-facing component) | N (0) | depends on #1 passing first (0) | Y (1) | M | **1** | Rubric: E2E/scenario, Playwright variant. New/extended specs under `tests/e2e/`, same teeth-check discipline | Self-play and full-decisive stay vitest-only if they don't touch the rendered DOM — name this explicitly per file, don't silently skip |
| 4 | **Accessibility control coverage gap** (per the ggen-side executive summary already on record: 16 accessibility keys persist, only 3 drive an observable CSS/visual effect) | N (0) | none (2) | Y (1) | M | **3** | Rubric: UI/component. For each of the remaining 13 keys: either wire a real observable effect + test, or add a named negative test asserting "persists but has no visual effect yet" (matching the existing disclosed-partial pattern) | Keys with no sensible visual effect (e.g. purely semantic ones) may stay negative-tested rather than built — name which ones and why |
| 5 | **Session state indicator polish** (mermaid spec's `Observing → Hypothesizing → Confirming → Solving → Verifying` chip) — verify it exists and is driven by real reducer state, not decorative | N (0) | none (2) | Y (1) | S | **3** | Rubric: UI/component. Confirm via `grep` in `session-header.tsx`/`phase-indicator.tsx` that the displayed state reads from real reducer output; if missing, build it | None |
| 6 | **Control-replacement table remnants** (session menu combining refuse/finish; one coherent execution-result card) — verify against current `session-menu.tsx`/`execution-result-card.tsx` whether already done | N (0) | none (2) | Y (1) | S | **3** | Rubric: UI/component. `grep` confirms these components exist and are wired (both already appear in the components list — verify wiring, not existence, in Definition of Done) | None |
| 7 | **TICKET-056 hardening** (receipt/replay types exist; confirm the 5-step chain — admission→cognition-run→sandbox-execution→test-result→accessibility-projection — is actually emitted end-to-end, not just typed) | Y (2) | none (2) | N (0) | M | **4** | Rubric: API/adapter + report hybrid. Real test asserting all 5 receipt steps chain correctly for one real session | None |

Rows are listed in the table in a stable ID order; **execution order is by Score, descending**:
row 1 (5) → row 7 (4) → rows 2/4/5/6 (3, tie broken by Effort: 5 and 6 before 2 and 4, S before M/L)
→ row 3 (1, and rises once row 1 lands). Row 2's score is written as it stands *before* row 1 runs,
deliberately, so the table itself shows why report-writing is gated on real evidence rather than
skipped to the front.

## §5. Immediate UI acceptance test (the release's own top-level Definition of Done)

Carried verbatim from the redesign spec — every backlog row above exists to make these 10 steps
true and independently verifiable, and none of them may be marked done by narration alone:

1. Open InterviewAssist in practice mode.
2. Submit or replay an interview utterance.
3. See a track proposed by real `wasm4pm-cognition`.
4. Confirm or reject the track using keyboard only.
5. Receive the projected Python problem.
6. Write and run Python.
7. Read a single coherent execution result.
8. See tests and diagnostics.
9. Complete the session without using any manual phase-transition control.
10. Replay the session and reproduce the same visible state.

Verification: a single Playwright spec driving steps 1–10 in order against a real `next dev`
server, asserting real DOM state at each step — this is exactly what row 1 + row 3's expanded
Playwright coverage produce; there is no separate acceptance-test artifact beyond
`full-decisive-acceptance-test.test.tsx` (vitest) and its Playwright counterpart from row 3.

## §6. What this doc does not do

No code changes were made writing this doc. No ticket was implemented. The backgrounded vitest run
from §2 is the only command in flight; its real output must be read and quoted into row 1 before
anyone marks 048–053 ALIVE. Committing/pushing this doc follows this session's established
branch→PR→merge pattern — ask before doing either, not assumed.
