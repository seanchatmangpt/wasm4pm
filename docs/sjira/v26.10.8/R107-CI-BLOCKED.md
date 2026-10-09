# R107 CI BLOCKED Receipt — PR #673 (docs/workgraph-standings-r58)

**Standing**: BLOCKED · **Date**: 2026-10-09 · **Lane**: R107

## Subject

- PR branch `docs/workgraph-standings-r58`, head `9cec5f24a`
  (chore(ci): regenerate pnpm-lock.yaml for markdownlint-cli dependency)
- Original failing run: `37969405958`
- Post-fix run: `37976304430` (conclusion: **failure**, different assertions)

## Classification history

1. **Run 37969405958** — classification (c) fix-forward, applied on the PR branch:
   `pnpm install --frozen-lockfile` failed with `ERR_PNPM_OUTDATED_LOCKFILE`
   ("1 dependencies were added: markdownlint-cli@^0.49.1"). Root cause is on
   **main**: commit `eb0f65deb` (docs: fix markdownlint residuals + dead links)
   added the dep to root `package.json` without regenerating `pnpm-lock.yaml`.
   Fix: lockfile-only regen commit `9cec5f24a` on the PR branch. Verified
   locally: `pnpm install --frozen-lockfile` now passes. **Main is exposed to
   the same failure** and should cherry-pick `9cec5f24a`.
2. **Run 37976304430** — new failure class, **not branch-owned** (both trace to
   main commit `76b1b542e`, "rename interview-assistant to interview-assist"):

   - **(a) Environment-dependent absolute paths in court tests**
     `examples/interview-assist/tests/domain/event-routing.test.ts:12`,
     `tests/scenarios/full-decisive-acceptance-test.test.tsx:55-56` hardcode
     `PACK_ROOT = "/Users/sac/ggen/packs/wasm4pm-interview-assist-pack"`. On any
     other machine/runner, the rdflib subprocess raises
     `FileNotFoundError: /Users/sac/ggen/packs/.../ontology.ttl`. Exact failing
     assertions: `event-routing.test.ts:28` ("exactly as many routing entries as
     the live SPARQL query returns event families"),
     `full-decisive-acceptance-test.test.tsx:117` (TICKET-053 decisive
     acceptance), plus the rdflib-count court at `event-routing.test.ts:23`.
     Post-run tally: 4 test files failed, 3 tests failed / 161 passed.
   - **(b) WASM-failure-message contract mismatch**
     `tests/adapters/cognition-adapter.test.ts:67` and
     `tests/api/cognition-route.test.ts:60` assert the adapter surfaces a reason
     matching `/intentionally broken/i`, but a genuinely missing module produces
     Node's raw `Cannot find module 'wasm4pm-cognition-deliberately-missing-for-tests'`
     — the adapter's typed-503 path returns the raw require() error text, so the
     message contract and the adapter disagree.

## Why BLOCKED, not fixed

Both failure classes implicate **main** (`76b1b542e`) and the courts, not the
R58 standings diff (solely `docs/sjira/v26.10.8/*` + this lockfile regen). Per
lane contract: failure implicating main or the court itself → typed BLOCKED,
no threshold change, no drive-by test rewrite outside the lane's file
ownership.

## Unblocking path

1. Portability fix on main: tests must resolve `PACK_ROOT` from a repo-relative
   path or env var (`WASM4PM_PACK_ROOT`), never `/Users/sac/...`.
2. Adapter/court reconciliation: either the adapter maps unknown require()
   failures into the documented "intentionally broken"-class reason, or the
   courts at `cognition-adapter.test.ts:67` / `cognition-route.test.ts:60`
   assert the actual typed `unavailable` outcome (which they already receive).
3. Cherry-pick `9cec5f24a` to main to clear the `ERR_PNPM_OUTDATED_LOCKFILE`
   hop for every branch.

## Replay

```
gh run view 37969405958 --repo seanchatmangpt/wasm4pm --log-failed   # lockfile hop (fixed by 9cec5f24a)
gh run view 37976304430 --repo seanchatmangpt/wasm4pm --log-failed   # env-path + adapter courts (BLOCKED)
git show 9cec5f24a --stat                                            # the fix on this branch
git log -1 --format=%H -S 'Users/sac/ggen' -- examples/interview-assist/tests/domain/event-routing.test.ts   # 76b1b542e, on main
```
