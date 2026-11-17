# wasm4pm migration plan v26.11.16

Standing: UNVERIFIED

## Identity
- path: /Users/sac/wasm4pm
- remote: https://github.com/seanchatmangpt/wasm4pm.git
- branch@sha: main@2563c4593 (tracks origin/main, ahead 77)
- last commit: 2026-11-08; commits: 4816; size: 8533 MB (`.git` = 3.5 GB)
- languages/build: Rust workspace (Cargo.toml, crates/), TypeScript/pnpm monorepo
  (packages/, apps/, pnpm-lock.yaml), Justfile, Makefile, cicd.toml
- nested repos: none registered as worktrees (15 local branches include `worktree-*` and
  `preserve/v26.9.25/wt-*` snapshots of former worktrees)

## Observed state
- dirty: 52; untracked: 335. Grouped: `crates/` 51 (mostly
  `crates/wasm4pm-cognition/tests/fixtures/graphlaw/*` fixture edits), `docs/` 2,
  `packages/` 1, `pnpm-lock.yaml`
- ahead 77 / behind 0 — 77 unpushed commits on main
- stash count: 4373 (census) — pathological; automation left thousands of stashes
- unpushed local branches: 15 (`docs/doc-hdit-scaffold-w4p`, `ex4pm-qual-episode-20260903`,
  `feat/*` x6, `gall/v26.9.18-final-specs`, `preserve/v26.9.25/*` x2,
  `security/revoke-branch-exposed-keys-v26.9.24`, `security/rotate-signing-keys-v26.9.24`,
  `v26926/...`, `worktree-wf_99470ccd-c7b-1`)
- bulk scratch dirs: `_t-fix/` 2.8 GB, `_t-gh/` 799 MB, `_t-u5/` 191 MB, `_tmp_42876_*`;
  `vendors/` 191 MB; `data/` 175 MB (XES/CSV event logs: DomesticDeclarations.xes etc.);
  `bench_data/` 25 MB; `target/`, `node_modules/` absent
- local data: `.env.act`, `.env.example` — `.env.act` may hold act/GitHub tokens (not read)
- submodules: none

## What it is
Evidence-bounded process-mining platform: branchless Rust/WASM engines plus a TypeScript
monorepo and published `wpm` CLI over XES/CSV/OCEL-v2 logs and Petri/POWL models. AGENTS.md
is the normative root contract.

## Classification
ACTIVE (census agrees).

## Migration risk
- 77 unpushed commits on main, 15 local-only branches incl. two `security/*` key-rotation
  branches, 4373 stashes, 52 dirty / 335 untracked files
- `.env.act` potential secret; `data/` event logs may be local-only inputs
Rate: HIGH

## Recommended action
COMMIT-PUSH
1. `cd /Users/sac/wasm4pm && git push origin main` — ship the 77 commits first.
2. `git add -A -- crates docs packages pnpm-lock.yaml && git commit -m "wip: graphlaw fixture sync (pre-migration)" && git push`
3. `git push origin --all` — DECISION: `security/*` branches referenced "exposed keys"; confirm
   with Sean they are safe to push (they revoke keys, but inspect first with `git show --stat`).
4. DECISION: 4373 stashes — operator-only triage; `git bundle create` does not carry stashes.
   Likely `git stash clear` after spot-checking the newest 10.
5. `rm -rf _t-fix _t-gh _t-u5 _tmp_* target node_modules` — frees ~3.8 GB.
6. DECISION: `data/` (175 MB logs) and `.env.act` — RSYNC-COPY `data/` to archive volume if
   not re-downloadable; never copy `.env.act`, re-create on new machine.
7. Reclone on new machine (3.5 GB `.git`; consider `--filter=blob:none`).

## First commands on the new machine
`git clone https://github.com/seanchatmangpt/wasm4pm.git && cd wasm4pm && cargo check --workspace && pnpm install --frozen-lockfile && just check`

## See Also
- ../v26.9.19/
- /Users/sac/docs/jira/v26.11.16/README.md
