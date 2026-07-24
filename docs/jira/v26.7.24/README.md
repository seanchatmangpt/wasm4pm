# InterviewAssist v26.7.24 — priority matrix + full plan to finish the release

## Why this doc exists

This plan prevents two failure modes:

1. **Arbitrary stopping points.** Every item has a mechanical Definition of Done.
2. **Stale status.** Claims are tied to repository reads or executable command output, never carried forward only because an older ticket said `PLANNED` or `DONE`.

The 2026-07-24 re-verification found real documentation drift and a real execution boundary. The current agent runtime has no mounted `~/wasm4pm` checkout, cannot resolve `github.com` from the shell, and has no `gh` executable. Repository files were therefore re-read through the connected GitHub app, but the requested local Vitest run and literal `grep`/`ls` replay could not execute. Those items are marked **BLOCKED**, not inferred.

## §0. Evidence ledger — commands actually executed on 2026-07-24

Every factual claim below cites one or more ledger entries.

| ID | Command executed | Result used here |
|---|---|---|
| **V0** | `cd ~/wasm4pm && git fetch origin && git checkout docs/v26.7.24-planning-diagramming && git status --short` | Failed before repository access: `/home/oai/wasm4pm` did not exist. |
| **V0b** | `git clone --branch docs/v26.7.24-planning-diagramming --single-branch --depth 1 https://github.com/seanchatmangpt/wasm4pm.git /home/oai/wasm4pm` | Failed: `Could not resolve host: github.com`. |
| **V0c** | `gh --version` | Failed: `gh: command not found`. |
| **V1** | `GitHub.fetch_file ... path=examples/interview-assist/app/page.tsx ref=docs/v26.7.24-planning-diagramming` | Read the real client composition and receipt threading. |
| **V2** | `GitHub.fetch_file ... path=examples/interview-assist/tests/scenarios/persistence-and-replay.test.ts ...` | File exists; 3 test declarations. |
| **V3** | `GitHub.fetch_file ... path=examples/interview-assist/tests/scenarios/tamper-detection.test.tsx ...` | File exists; 2 test declarations. |
| **V4** | `GitHub.fetch_file ... path=examples/interview-assist/tests/scenarios/accessibility-projection.test.tsx ...` | File exists; 4 test declarations, 3 gated by `it.runIf`. |
| **V5** | `GitHub.fetch_file ... path=examples/interview-assist/tests/scenarios/zero-input-cognition.test.ts ...` | File exists; 3 test declarations. |
| **V6** | `GitHub.fetch_file ... path=examples/interview-assist/tests/scenarios/self-play-manufacturing.test.ts ...` | File exists; 4 test declarations, 2 gated by live Ollama reachability. |
| **V7** | `GitHub.fetch_file ... path=examples/interview-assist/tests/scenarios/full-decisive-acceptance-test.test.tsx ...` | File exists; 12 test declarations, including one `it.runIf`. It contains absolute `/Users/sac/ggen` paths and an assertion that `next build` must fail. |
| **V8** | `GitHub.fetch_file` for `lib/domain/receipt.ts`, `receipt-emitter.ts`, `reducer-with-receipts.ts`, and `replay.ts` | Receipt primitives and reducer replay exist. |
| **V9** | `GitHub.fetch_file` for all five `app/api/**/route.ts` files | Five route files exist; `/api/sandbox/[capability]` only validates/echoes an accepted operation and does not execute a subprocess. |
| **V10** | `GitHub.fetch_file ... path=examples/interview-assist/lib/adapters/sandbox-executor.ts ...` | Real subprocess execution exists. Timeouts/output caps currently resolve as `exitCode: -1` execution receipts, not typed timeout/payload refusals. |
| **V11** | `GitHub.fetch_file ... path=examples/interview-assist/lib/adapters/persistence-adapter.ts ...` | Current persistence is a Node filesystem stand-in, not browser `localStorage`/IndexedDB. |
| **V12** | `GitHub.fetch_file ... path=examples/interview-assist/package.json ...`; fetches for `examples/interview-assist/scripts/materialize-wasm-cognition.mjs` and `examples/interview-assist/lib/wasm/wasm4pm-cognition/package.json` | `package.json` references the materialization script, but both cited materialization paths returned 404 on this branch. |
| **V13** | `GitHub.fetch_file` for `lib/domain/replay.ts` and `tests/scenarios/tamper-detection.test.tsx` | Tamper detection hashes the replayed `AdmissionResult`; `replaySession()` itself does not replay or verify transition receipts. |
| **V14** | `GitHub.fetch_file` for `lib/adapters/cognition-adapter.ts`, `lib/domain/cognition-rules.ts`, and the cognition breed sources | Grounds [ADR-001](DECISIONS.md). |
| **V15** | `GitHub.fetch_commit_workflow_runs repo_full_name=seanchatmangpt/wasm4pm commit_sha=05b33494e0a181302f7ffb2c63944a288c662f7d` | No workflow runs existed; remote CI could not substitute for the blocked local Vitest run. |

## §1. Priority matrix — the ordering mechanism

| Column | Rule |
|---|---|
| **Blocks decisive test?** | Y (2 pts) if TICKET-053 or any of 048/049/050/051/052/056/057 cannot produce a real result without this item; else N (0 pts) |
| **Dependencies present?** | 2 pts if every prerequisite artifact exists and is wired; 0 pts if a prerequisite is absent or disconnected |
| **User-visible now** | 1 pt if a candidate sees this in the live session flow; 0 pts if backend/report-only |
| **Effort** | S / M / L; tiebreaker only, S before L |

**Score = Blocks-decisive + Dependencies-present + User-visible.** Maximum 5.

## §2. Ground truth, re-verified this pass

### 2.1 UI structure exists

Correct repository-root command for the next local pass:

```bash
grep -n "SessionHeader\|SessionWorkspace\|SessionActivityDrawer\|CognitionPanel\|Add track candidate\|Advance to" \
  examples/interview-assist/app/page.tsx
```

The fetched file imports `SessionHeader`, `SessionWorkspace`, `SessionActivityDrawer`, and `CognitionPanel` at source lines 38–40 and 46, then renders them at lines 518, 527, 563, and 644. The exact candidate-facing strings `Add track candidate` and `Advance to` do not appear in `app/page.tsx`. Manual phase advance remains available only through the debug-gated `SessionActivityDrawer` callback. **The structural Phase-4 shell is real.** [V1]

### 2.2 Scenario files exist; execution is still BLOCKED

Correct repository-root inventory command:

```bash
ls examples/interview-assist/tests/scenarios/ | \
  grep -E 'persistence|tamper|accessibility|zero-input|self-play|decisive'
```

All six requested files exist. [V2–V7]

The old static-count command was not a reliable count of Vitest cases because it misses `it.runIf(...)` declarations:

```bash
grep -c "test(\|it(" <file>
```

Source inspection gives the actual declared-case counts below. These are **not pass counts**. [V2–V7]

| Scenario | Declared cases | Pass | Fail | Skipped | State this pass |
|---|---:|---:|---:|---:|---|
| `persistence-and-replay.test.ts` | 3 | — | — | — | **BLOCKED** — no runnable checkout [V0, V0b] |
| `tamper-detection.test.tsx` | 2 | — | — | — | **BLOCKED** — no runnable checkout [V0, V0b] |
| `accessibility-projection.test.tsx` | 4 | — | — | — | **BLOCKED** — no runnable checkout; 3 cases are browser-gated [V0, V4] |
| `zero-input-cognition.test.ts` | 3 | — | — | — | **BLOCKED** — no runnable checkout [V0, V0b] |
| `self-play-manufacturing.test.ts` | 4 | — | — | — | **BLOCKED** — no runnable checkout; 2 cases require reachable Ollama [V0, V6] |
| `full-decisive-acceptance-test.test.tsx` | 12 | — | — | — | **BLOCKED** — no runnable checkout; source also contains machine-specific ggen paths and a stale expected-build-failure assertion [V0, V7] |

Required command, still not executed:

```bash
cd examples/interview-assist
npx vitest run \
  tests/scenarios/persistence-and-replay.test.ts \
  tests/scenarios/tamper-detection.test.tsx \
  tests/scenarios/accessibility-projection.test.tsx \
  tests/scenarios/zero-input-cognition.test.ts \
  tests/scenarios/self-play-manufacturing.test.ts \
  tests/scenarios/full-decisive-acceptance-test.test.tsx
```

No scenario may be promoted to ALIVE from this pass. No exact per-file pass/fail count exists because the test process did not run. [V0, V0b, V15]

### 2.3 Receipt primitives exist, but the five-step live chain is not wired

Correct repository-root inventory command:

```bash
ls examples/interview-assist/lib/domain/ | grep -i receipt
```

`receipt.ts`, `receipt-emitter.ts`, and `reducer-with-receipts.ts` exist. [V8]

The end-to-end chain is currently **BUILD_BROKEN as an integration**, not merely unknown:

- `app/page.tsx` imports and calls `sessionReducer`; it does not import or call `admitWithReceipt`, so live admission does not append an admission receipt. [V1, V8]
- `/api/cognition` receives the current last receipt and can append a cognition receipt. [V1]
- `runCode()` calls `/api/run` without `prevReceipt`, so the sandbox-execution receipt starts a new chain head instead of deriving from the cognition receipt. [V1]
- `/api/test` does receive the current last receipt and can append a test-result receipt, but it may therefore chain from an already-broken sandbox head. [V1]
- Accessibility preference changes mutate React state directly; `app/page.tsx` does not call the accessibility adapter's receipt-producing function. [V1]
- `/api/receipt` creates a separate final hash over event labels and does not close the five-step manufacturing chain. [V1, V9]

TICKET-056 therefore needs real integration repair plus a full-chain assertion; it is not only a type-hardening task. [V1, V8]

### 2.4 Route and adapter drift found

Five route files exist, but their semantics are not uniform. `/api/run` and `/api/test` call the real subprocess executor. `/api/sandbox/[capability]` only validates a static operation table and returns `{status: "accepted"}`. Any diagram that routes all three through `sandbox-executor.ts` is stale. [V9]

The current persistence adapter is explicitly a Node filesystem substitute. It is not browser storage and should not be diagrammed as `localStorage`/IndexedDB. [V11]

The tracked materialization story is incomplete: `package.json` names `scripts/materialize-wasm-cognition.mjs`, but that script and the cited `lib/wasm/wasm4pm-cognition/package.json` path were absent from the branch reads. The adapter may work in a previously materialized local environment, but a fresh Git checkout is not proven reproducible from the tracked files inspected here. [V12]

### 2.5 Replay/tamper terminology corrected

`replaySession()` folds the persisted event log through the real reducer. The tamper scenario then computes a fresh BLAKE3 hash over the resulting `AdmissionResult` and compares that final-state hash with the original. It does **not** replay a `TransitionReceipt` chain. [V13]

### 2.6 TICKET-057 unblock status

**TICKET-057 is not unblocked.**

It remains blocked by both:

1. missing exact scenario pass/fail output from §2.2; and
2. the confirmed broken five-step receipt integration in §2.3.

The previous global `find . -iname '*verifier*report*'` absence check could not be literally re-run without a checkout, so this pass does not make a new repository-wide absence claim. The report must not be written until the two blockers above have executable receipts. [V0, V0b, V15]

## §3. Definition of Done rubrics

### E2E/scenario ticket (048–053)

- Real collaborator or real subprocess/browser context; no mock on the core path.
- Positive case plus named negative/falsifier case.
- Exact per-file Vitest pass/fail/skip counts quoted from a fresh run.
- Any `runIf` skip must be named as `SKIPPED`, never silently counted as passing.
- Command: the exact six-file command in §2.2.

### UI/component item

- Every new control has a stable test id.
- Keyboard order and DOM accessibility attributes are asserted.
- The control dispatches through the real reducer/adapter path.
- Render and interaction tests both pass; relevant Playwright specs pass.

### API/adapter item

- Positive test uses the real collaborator.
- At least one real failure shape is asserted.
- Server-only boundary is mechanically checked.
- Static capability acceptance is not described as execution.

### Report/receipt item (056–057)

- Every report claim cites a fresh command output or receipt path.
- The five manufacturing steps form one continuous chain with each `derivedFrom`/`relation` equal to the immediately previous checksum.
- ALIVE is forbidden unless the decisive scenario and full-chain verifier both pass in the same verification pass.

## §4. Ordered backlog

| # | Item | Blocks decisive | Dependencies present | User-visible | Effort | Score | Current law-state | Definition of Done |
|---|---|---:|---:|---:|---|---:|---|---|
| 1 | **Run and classify 048–053** | 2 | 2 | 1 | S | **5** | **BLOCKED** by unavailable checkout/network [V0, V0b, V15] | Run the exact command in §2.2 and quote per-file passed/failed/skipped counts. Reclassify each file independently. |
| 2 | **TICKET-057 final verifier report** | 2 | 0 | 0 | S | **2** | **BLOCKED; not unblocked** | Requires row 1 executable output and row 7 continuous-chain proof. Do not write before both exist. |
| 3 | **Playwright coverage for UI-facing 048–053 paths** | 0 | 0 | 1 | M | **1** | PLANNED | Real `next dev`; no core-path route mocks; explicit skips/refusals. |
| 4 | **Accessibility control coverage gap** | 0 | 2 | 1 | M | **3** | PARTIAL | For each remaining key, wire and test an observable effect or add a named negative test. |
| 5 | **Session-state indicator verification/polish** | 0 | 2 | 1 | S | **3** | UNVERIFIED | Prove the displayed state reads real reducer output and verify keyboard/DOM behavior. |
| 6 | **Control-replacement remnants** | 0 | 2 | 1 | S | **3** | PARTIAL | Verify session-menu/result-card wiring; keep static `/api/sandbox` acceptance out of the execution path. |
| 7 | **TICKET-056 continuous receipt-chain integration** | 2 | 0 | 0 | M | **2** | **BUILD_BROKEN** — primitives exist, live chain has documented breaks [V1, V8] | Repair admission, cognition, sandbox, test, and accessibility threading; assert all five checksums form one ordered chain in a real session. |

Execution order remains evidence-driven: row 1 first when a runnable checkout exists; row 7 can be repaired independently but cannot be declared ALIVE without its real integration test; row 2 stays last among the receipt/report items.

## §5. ADR for the ranked cognition panel

[ADR-001](DECISIONS.md) chooses deterministic TypeScript scoring → real Dendral elimination/selection → real Eliza question generation. The decision is documented only; no application or cognition-crate implementation is part of this branch. [V14]

## §6. Immediate UI acceptance test

The release-level acceptance path remains:

1. Open InterviewAssist in practice mode.
2. Submit or replay an interview utterance.
3. See a track proposed through real cognition.
4. Confirm or reject it using keyboard only.
5. Receive the projected Python problem.
6. Write and run Python.
7. Read one coherent execution result.
8. See tests and diagnostics.
9. Complete without a candidate-facing manual phase-transition control.
10. Replay and reproduce the visible state and verification evidence.

A full Playwright path plus continuous receipt-chain verification is required before the release can be called ALIVE.

## §7. What this documentation pass did not do

- Did not modify `examples/interview-assist/{app,components,lib}` or `crates/wasm4pm-cognition/`.
- Did not execute Vitest because the runtime could not obtain the repository checkout.
- Did not invent per-file pass/fail counts.
- Did not write TICKET-057.
- Did record the cognition ranking ADR and correct source-proven diagram/backlog drift.
