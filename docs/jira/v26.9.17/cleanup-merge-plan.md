# Cleanup and Merge Plan: wasm4pm

## Current State (as observed 2026-09-17)

| Path | Type | Git status | Last commit | Size |
|---|---|---|---|---|
| `/Users/sac/wasm4pm` | canonical repo | clean at top level (branch `project2/deterministic-command-projection`); contains one dirty registered worktree under `.claude/worktrees/` (see below) | `ec256661c` 2026-09-13 "fix(test): repair NO_TRACK_MATCH_SIGNATURE drift and result-dedup TTL flake" | 3.4G (includes the nested `.claude/worktrees/wf_99470ccd-c7b-1` checkout) |
| `/Users/sac/wasm4pm-worktrees/ex4pm-qual-episode-20260903` | git worktree of canonical repo, branch `ex4pm-qual-episode-20260903` | dirty: `Cargo.lock` modified | `69017c123` 2026-08-31 "refactor(causal): extract JsValue-free causal_footprint_pure (WALI-style)" | 567M |
| `/Users/sac/wasm4pm-worktrees/fix-etconformance-precision-feature-gate` | git worktree of canonical repo, branch `fix-etconformance-precision-feature-gate` | clean | `9b32c57c4` 2026-08-21 "fix(wasm4pm): re-gate etconformance_precision under conformance_basic" | 567M |
| `/Users/sac/wasm4pm-worktrees/predict-execute-episode-wf10-20260903` | git worktree of canonical repo, **detached HEAD**, same commit as `ex4pm-qual-episode-20260903` | dirty: `Cargo.lock` modified | `69017c123` 2026-08-31 (identical commit to the row above) | 567M |
| `/Users/sac/wasm4pm-worktrees/register-planner-mcp-json` | git worktree of canonical repo, branch `register-planner-mcp-json` | clean | `078b1f2c0` 2026-08-21 "Add project-local .mcp.json to register wasm4pm-planner-mcp" | 567M |
| `/Users/sac/wasm4pm/.claude/worktrees/wf_99470ccd-c7b-1` | git worktree of canonical repo, branch `worktree-wf_99470ccd-c7b-1` | **dirty: 2209 modified + 10 untracked files** (`git diff --stat`: 2209 files changed, 8322 insertions, 35956 deletions) | `da48e98cd` 2026-08-26 — this SHA is exactly `origin/main` of the canonical repo | 568M (counted inside the 3.4G above) |
| `/Users/sac/wasm4pm_copy` | duplicate repo (own `.git`, **same origin** `seanchatmangpt/wasm4pm.git`, not a registered worktree) | dirty: large number of unstaged `D` (deleted) entries under `packages/agents/...` | `1d00b67b8` 2026-06-22 "Merge pull request #379 ... refactor/feature-extraction-btreemap" — **confirmed ancestor** of canonical repo's current HEAD (`git merge-base --is-ancestor` = true) | 1.4G |
| `/Users/sac/wasm4pm-compat` | independent repo, own remote `seanchatmangpt/wasm4pm-compat.git` | clean on branch `main` | `f020e70` 2026-09-16 "merge: agent/exp/abstraction-level-marker — AbstractionLevel marker law (paper #52), all gates exit 0"; local `main` is `[origin/main: ahead 3, behind 191]` | 648M |
| `/Users/sac/wasm4pm-compat_copy` | duplicate repo, same remote as `wasm4pm-compat` (`seanchatmangpt/wasm4pm-compat.git`) | 1 untracked file: `wasm4pm-compat-ts/pnpm-lock.yaml`; checked-out branch otherwise clean and up to date with its origin | `4a96a95` 2026-06-19 "docs(wit): WIT runtime path for compat ..." on branch `feat/compat-ts` — **confirmed ancestor** of `wasm4pm-compat`'s current `main` HEAD (`git merge-base --is-ancestor` = true) | 211M |
| `/Users/sac/wasm4pm-backups` | backup-copy (no `.git`; plain directory) | n/a (not a repo) | n/a — contains `wasm4pm-bundle-20260515-161011.bundle` (510MB), `wasm4pm-dot-git-20260515-161011.tar.zst` (523MB), `RECOVERY.md`, all dated 2026-05-15 | 985M |
| `/Users/sac/wasm4pm-worktrees` | container directory (not itself a repo) | n/a — holds the 4 worktree rows above | n/a | 2.2G total |

Additional evidence gathered:

- `git worktree list` in the canonical repo confirms exactly 5 registered worktrees: the 4 under `wasm4pm-worktrees/` plus `.claude/worktrees/wf_99470ccd-c7b-1`. No other path in the family is a registered worktree of the canonical repo.
- `git remote -v` in the canonical repo: `origin = https://github.com/seanchatmangpt/wasm4pm.git`.
- `git remote -v` in `wasm4pm-compat` and `wasm4pm-compat_copy`: `origin = https://github.com/seanchatmangpt/wasm4pm-compat.git` — this is a **different GitHub repository** from `wasm4pm`, confirmed by remote URL, not inferred.
- Divergence counts vs. canonical HEAD (`ec256661c`), via `git rev-list --left-right --count`:
  - `ex4pm-qual-episode-20260903` (`69017c123`): 35 commits behind, **7 unique commits ahead** (real ex4pm-wasm4pm-bindings Phase 1–4 feature work: `435d5e0f8`, `a0eb15207`, `e6275d575`, `36b74c6a3`, `5bb396744`, `dfc68afe8`, `69017c123`).
  - `predict-execute-episode-wf10-20260903`: identical commit to the row above (`69017c123`), so identical divergence — this worktree carries **no additional unique history** beyond `ex4pm-qual-episode-20260903`.
  - `fix-etconformance-precision-feature-gate` (`9b32c57c4`): 35 behind, **1 unique commit** (`9b32c57c4` itself). Not present on `origin/main` either (`git merge-base --is-ancestor` = false against both).
  - `register-planner-mcp-json` (`078b1f2c0`): 35 behind, **1 unique commit** (`078b1f2c0` itself). Not present on `origin/main` either.
  - `worktree-wf_99470ccd-c7b-1` (`da48e98cd`): 19 behind, **0 unique commits** — this SHA equals `origin/main` exactly (`git rev-parse origin/main` = `da48e98cdde83d5b581d3305b7ec3c041a19d77a`), and `git merge-base --is-ancestor` confirms it is already an ancestor of the canonical repo's current HEAD.
  - `wasm4pm_copy` (`1d00b67b8`): confirmed ancestor of canonical HEAD — **0 unique commits**.
  - `wasm4pm-compat_copy`'s checked-out commit (`4a96a95`): confirmed ancestor of `wasm4pm-compat`'s HEAD — **0 unique commits**.
- None of the four local feature-worktree branch names (`ex4pm-qual-episode-20260903`, `fix-etconformance-precision-feature-gate`, `register-planner-mcp-json`, `predict-execute-episode-wf10-20260903`) exist on `origin` (`git branch -r` has no matches) — these are local-only, un-pushed branches.

## What "merged" should look like

**Canonical path going forward: `/Users/sac/wasm4pm`** (branch `project2/deterministic-command-projection`, HEAD `ec256661c`, 2026-09-13). This is the most recently committed history in the family, is 19+ commits ahead of `origin/main`, is the repo every other `wasm4pm`-family path's history traces back into as an ancestor (`wasm4pm_copy`, `worktree-wf_99470ccd-c7b-1`), and is the only path already registered as the parent of git's own worktree bookkeeping (`git worktree list`) — i.e. every worktree already points back at this repo's `.git`, so it is structurally the hub, not just the newest checkout.

For `wasm4pm-compat`, this is a **separate GitHub repository**, not a fork or branch of `wasm4pm` — the two are not candidates for a single merge target. **Canonical path for the compat family: `/Users/sac/wasm4pm-compat`** (branch `main`, HEAD `f020e70`, 2026-09-16, 3 months more recent than `wasm4pm-compat_copy`'s `4a96a95`), clean working tree, and it is the repo `wasm4pm-compat_copy`'s checked-out commit is an ancestor of.

Per-path disposition:

- **`/Users/sac/wasm4pm-worktrees/ex4pm-qual-episode-20260903`** — real, unique work (7 commits, ex4pm-wasm4pm-bindings Phase 1–4). Before removal: rebase/cherry-pick this branch onto canonical HEAD (or open a PR from it) so the 7 commits are not lost, then commit or discard the dirty `Cargo.lock`, then `git worktree remove`. Not automatable as a one-line delete — this is real unmerged feature work.
- **`/Users/sac/wasm4pm-worktrees/predict-execute-episode-wf10-20260903`** — detached HEAD at the exact same commit as the row above, with no branch of its own and no additional unique commits. Safe to `git worktree remove` once its own `Cargo.lock` modification is reviewed/discarded — no merge needed since it carries nothing not already covered by `ex4pm-qual-episode-20260903`.
- **`/Users/sac/wasm4pm-worktrees/fix-etconformance-precision-feature-gate`** — clean, 1 unique commit (`9b32c57c4`) not on canonical HEAD or `origin/main`. Cherry-pick that single commit into the canonical repo, then `git worktree remove` directly (no uncommitted changes to lose).
- **`/Users/sac/wasm4pm-worktrees/register-planner-mcp-json`** — clean, 1 unique commit (`078b1f2c0`) not on canonical HEAD or `origin/main`. Cherry-pick that single commit into the canonical repo, then `git worktree remove` directly.
- **`/Users/sac/wasm4pm/.claude/worktrees/wf_99470ccd-c7b-1`** — its committed HEAD (`da48e98cd`) is already an ancestor of canonical HEAD, so no commit-level merge is needed. But it carries a large uncommitted diff (2209 modified + 10 untracked files, +8322/-35956 lines) that has never been committed anywhere. This is unmerged, uncommitted, real content and **cannot be discarded automatically** — MANUAL REVIEW REQUIRED to decide whether this diff is deliberate in-progress work (e.g. a doc-header rewrite pass) or a stray/incomplete checkout, before either committing it or running `git worktree remove --force`.
- **`/Users/sac/wasm4pm_copy`** — its HEAD (`1d00b67b8`) is a confirmed ancestor of canonical HEAD (3 months and many commits behind), so it holds **no unique history** to merge. It does, however, have a large uncommitted working-tree diff (many unstaged deletions under `packages/agents/`) that was never committed. Because it is not a registered git worktree (a separate clone, not `git worktree add`-managed), it cannot be removed with `git worktree remove` — MANUAL REVIEW REQUIRED to confirm the uncommitted deletions are disposable before `rm -rf`.
- **`/Users/sac/wasm4pm-compat_copy`** — its checked-out commit (`4a96a95`) is a confirmed ancestor of `wasm4pm-compat`'s current HEAD, so no unique history. One untracked file (`wasm4pm-compat-ts/pnpm-lock.yaml`) is present but not committed anywhere — a lockfile, trivially regenerable via the package manager. Safe to delete after a quick look confirms nothing else is untracked (verified above: `git status` shows only that one untracked file, nothing else pending).
- **`/Users/sac/wasm4pm-backups`** — a manual bundle/tar backup dated 2026-05-15 (4+ months stale relative to both canonical repos' current HEADs). Not a working repo; contains only an old git bundle, a tarred `.git`, and a recovery note. Safe to delete once the user confirms the 2026-09 canonical repos already supersede whatever this backup was protecting — flagged as an open question below rather than assumed.
- **`/Users/sac/wasm4pm-worktrees`** (the container directory) — becomes empty once all four worktrees inside it are removed via `git worktree remove`; delete the empty directory last.

## Commands to run (in order), once approved

```bash
# 1. Cherry-pick the two single-commit worktrees into canonical HEAD (clean, no uncommitted work to lose)
cd /Users/sac/wasm4pm
git checkout project2/deterministic-command-projection
git cherry-pick 9b32c57c442ac6e93d127b3ae26a181906fc8e52   # fix-etconformance-precision-feature-gate
git cherry-pick 078b1f2c0145b55d0fd07dbb6a2b971306ec6795   # register-planner-mcp-json

# 2. Remove those two worktrees now that their commits are cherry-picked
git worktree remove /Users/sac/wasm4pm-worktrees/fix-etconformance-precision-feature-gate
git worktree remove /Users/sac/wasm4pm-worktrees/register-planner-mcp-json

# 3. ex4pm-qual-episode-20260903 has 7 real unique commits — review/rebase them onto canonical HEAD
#    (do this as a real rebase/PR, not a blind cherry-pick range, so conflicts are seen):
#    MANUAL REVIEW REQUIRED — resolve/rebase, then:
#    git rebase --onto project2/deterministic-command-projection ec256661c ex4pm-qual-episode-20260903
#    (only after that succeeds and Cargo.lock is resolved:)
# git worktree remove /Users/sac/wasm4pm-worktrees/ex4pm-qual-episode-20260903

# 4. predict-execute-episode-wf10-20260903 duplicates the same commit as step 3 with no unique branch —
#    review/discard its local Cargo.lock diff, then remove directly (no merge needed):
# git -C /Users/sac/wasm4pm-worktrees/predict-execute-episode-wf10-20260903 diff Cargo.lock   # MANUAL REVIEW REQUIRED
# git worktree remove /Users/sac/wasm4pm-worktrees/predict-execute-episode-wf10-20260903

# 5. .claude/worktrees/wf_99470ccd-c7b-1 — MANUAL REVIEW REQUIRED before any action:
#    2209 modified + 10 untracked files, never committed. Inspect first:
# git -C /Users/sac/wasm4pm/.claude/worktrees/wf_99470ccd-c7b-1 diff --stat
# git -C /Users/sac/wasm4pm/.claude/worktrees/wf_99470ccd-c7b-1 status --short
#    Only after a human decides to keep or discard that diff:
# git worktree remove --force /Users/sac/wasm4pm/.claude/worktrees/wf_99470ccd-c7b-1

# 6. Once all worktrees above are removed, the container directory is empty; confirm then remove it:
# ls -la /Users/sac/wasm4pm-worktrees   # confirm empty
rmdir /Users/sac/wasm4pm-worktrees 2>/dev/null || true

# 7. wasm4pm_copy — MANUAL REVIEW REQUIRED (large uncommitted deletions under packages/agents/, not a worktree):
# git -C /Users/sac/wasm4pm_copy status --short   # re-confirm nothing is intentional WIP
#    Only after human sign-off that nothing here is needed:
# rm -rf /Users/sac/wasm4pm_copy

# 8. wasm4pm-compat_copy — no unique commits, one disposable untracked lockfile:
# git -C /Users/sac/wasm4pm-compat_copy status --short   # re-confirm only pnpm-lock.yaml is untracked
rm -rf /Users/sac/wasm4pm-compat_copy

# 9. wasm4pm-backups — MANUAL REVIEW REQUIRED (confirm superseded before deleting a backup):
# cat /Users/sac/wasm4pm-backups/RECOVERY.md   # read what it was protecting, confirm superseded
# rm -rf /Users/sac/wasm4pm-backups
```

Steps 3, 5, 7, and 9 are marked MANUAL REVIEW REQUIRED and left commented out above because they touch real uncommitted or unmerged unique work, per the no-automated-destructive-action-without-review constraint. Steps 1, 2, 6, and 8 involve either zero uncommitted state or a single disposable untracked lockfile and are safe to run as written once the user approves the plan overall.

## Open questions

- **`wasm4pm_copy`'s uncommitted deletions under `packages/agents/`**: git alone cannot tell whether this working-tree diff (many files deleted, unstaged) was an intentional in-progress removal of that package or an accidental partial-delete/interrupted operation. Needs the user's judgment before `rm -rf`.
- **`.claude/worktrees/wf_99470ccd-c7b-1`'s 2209-file uncommitted diff**: the diff stat (+8322/-35956 across doc/config files, e.g. `.claude/HOOKS.md`, `.github/*.md`, `AGENTS.md`, `CLAUDE.md`) looks like a large automated doc-rewrite pass rather than hand-edits, but this is an observation, not a verified claim — git cannot tell whether this was deliberate WIP that should be committed upstream or a stray artifact of how that worktree was created. Needs the user's judgment before discarding.
- **`wasm4pm-backups`'s actual purpose**: `RECOVERY.md` was not read in this investigation (read-only scope was git/du/ls only); the user should confirm what recovery scenario this 2026-05-15 bundle was meant to cover, and that the current `wasm4pm` and `wasm4pm-compat` canonical repos (both far ahead of that date) already supersede it, before deleting a 1GB backup.
- **"gemma" mentioned in the triggering request**: the user stated they already deleted it manually; it was not found under any of the investigated paths and is out of scope for this plan — flagged only so it isn't silently assumed to be part of this cleanup.
- **Whether the 7 unique commits on `ex4pm-qual-episode-20260903` (ex4pm-wasm4pm-bindings Phase 1–4) are still wanted**: they are real, substantial feature work, not superseded elsewhere in the family per the evidence gathered, but only the user can confirm this work is still desired before it's rebased into the canonical branch.

## Merge Execution Log (2026-09-17)

Content-level evaluation and merging performed per this plan. **No deletion, `git worktree remove`, `git branch -d/-D`, `rm`, or any history-discarding command was run** — every action below is additive (new commits, a merge commit, or pushes to the repo's existing configured remote/branch). Deletion remains a separate, later pass for the user.

Re-verification before acting confirmed the doc's "Current State" table still matched reality (same HEADs, same dirty/clean status on every path, same divergence counts) except that the canonical repo's local branch had grown from "ahead 8" to being freshly re-checked at that count — noted for completeness, not a material drift.

### Actions taken on `/Users/sac/wasm4pm` (canonical)

1. **Cherry-picked `fix-etconformance-precision-feature-gate`'s single commit** onto `project2/deterministic-command-projection`: original `9b32c57c4` → new commit **`c38e8c062`** ("fix(wasm4pm): re-gate etconformance_precision under conformance_basic"). Clean auto-merge (one file auto-merged: `wasm4pm/src/lib.rs`), 4 files changed.
2. **Cherry-picked `register-planner-mcp-json`'s single commit** onto the same branch: original `078b1f2c0` → new commit **`90c8b1706`** ("Add project-local .mcp.json to register wasm4pm-planner-mcp"). Clean, no conflicts, 1 file created (`.mcp.json`).
3. **Merged `ex4pm-qual-episode-20260903`'s 7 unique commits** (the ex4pm-wasm4pm-bindings Phase 1–4 process-intelligence WASM export work) into `project2/deterministic-command-projection` via a real `git merge --no-ff` (not a rebase, so the source branch's own commit history — `435d5e0f8`..`69017c123` — is untouched and still reachable at `/Users/sac/wasm4pm-worktrees/ex4pm-qual-episode-20260903`). Merge commit: **`87f4ac591`**.
   - One real conflict, in `Cargo.toml`'s workspace `members` list: canonical HEAD had independently added `crates/wasm4pm-cmca`, the feature branch had added `crates/wasm4pm-ex4pm-bindings`. Resolved by hand, keeping **both** additions (read-both-sides, no `-X theirs`/`-X ours`, no global heuristic) — final list includes both crates.
   - `Cargo.lock` and `wasm4pm/src/{alignments.rs,causal.rs,lib.rs}` auto-merged cleanly.
   - New crate `crates/wasm4pm-ex4pm-bindings/` (6 files) now lives on the canonical branch.
4. **Verified the merge**: `cargo check -p wasm4pm-ex4pm-bindings` on the merged workspace — real build, exit 0, clean compile of the new crate and its full dependency graph (`wasm4pm`, `wasm4pm-cognition`, `prolog8`, `ocpq`, `miniml`, etc.), 51.25s. Full command output captured in-session.
5. **Committed the resulting `Cargo.lock` refresh** (2-byte binary diff from the verification build) as **`ffe9d00c5`**.
6. **Pushed** `project2/deterministic-command-projection` to `origin` (same remote/branch already configured — no force, no new remote): `c8dcd3816..ffe9d00c5`. Confirmed via `git status --short --branch` showing the local branch is now even with `origin/project2/deterministic-command-projection` (no ahead/behind).

Post-merge canonical HEAD: **`ffe9d00c5`** on `project2/deterministic-command-projection`, pushed to `origin`.

Worktrees `fix-etconformance-precision-feature-gate` and `register-planner-mcp-json` were left exactly as they were (still registered, still on their original branches/commits) — their content is now also captured in canonical via the cherry-picks above, but no worktree removal was performed, per the hard constraint. The `ex4pm-qual-episode-20260903` worktree and its branch were likewise left untouched; its content is now also reachable from canonical via the merge commit, but the original branch still exists independently.

### Actions taken on `/Users/sac/wasm4pm/.claude/worktrees/wf_99470ccd-c7b-1`

Re-confirmed: 2209 modified + 10 untracked entries, diff stat `2209 files changed, 8322 insertions(+), 35956 deletions(-)`, all doc/config content (small header-line additions across `.claude/`, `.github/`, `docs/` READMEs, plus new `docs/archive/2026-08-02/**` directories) — consistent with the "automated doc-rewrite pass" observation in the plan above, still unverified as to intent.

Per the "preservation over guessing" constraint, this was **not** discarded and **not** merged into canonical (merge-worthiness was never established — that's a human call). Instead the entire working-tree diff was committed as-is on the worktree's own local branch (`worktree-wf_99470ccd-c7b-1`, no remote configured) to guarantee it survives regardless of what happens to the worktree later: commit **`2b9ba0773`** ("chore(worktree): preserve uncommitted doc-header/archive pass (wf_99470ccd-c7b-1)"), 2446 files changed (the untracked archive directories were included via `git add -A`). This branch has no remote, so no push was attempted or possible.

### Actions taken on `/Users/sac/wasm4pm-compat`

Attempted `git push origin main` (clean working tree, local `main` was `ahead 3, behind 191` of `origin/main`). **Push was rejected** by git itself (non-fast-forward) — this is not a force-pushable or purely-additive situation without first integrating 191 upstream commits, which risks real conflicts and is exactly the kind of "not fully confident it's safe and purely additive" case the hard constraints say to leave alone. **No action taken**; local `main` is unchanged and still holds its 3 ahead commits, nothing lost. Left as `still_open`.

### Actions NOT taken (left exactly as found, with reasoning)

- **`/Users/sac/wasm4pm_copy`** — re-confirmed: 31 unstaged `D` (delete) entries under `packages/agents/`, 0 unique history vs. canonical (still a confirmed ancestor). Whether these deletions are intentional in-progress work or a stray partial-delete could not be determined from git state alone, and this repo holds no history uniquely absent from canonical — so there is nothing here that needs "capturing," only a discard/keep decision that belongs to the user. Left completely untouched (not committed, not discarded).
- **`/Users/sac/wasm4pm-compat_copy`** — re-confirmed: 0 unique commits (its HEAD is a confirmed ancestor of `wasm4pm-compat`'s current HEAD), one untracked `pnpm-lock.yaml` (regenerable, not unique content worth capturing). Left completely untouched.
- **`/Users/sac/wasm4pm-backups`** — not a git repo; no git-level merge action is applicable. `RECOVERY.md` still not read (out of the git-investigation scope this pass used). Left completely untouched.
- **`fix-etconformance-precision-feature-gate`, `register-planner-mcp-json`, `ex4pm-qual-episode-20260903`, `predict-execute-episode-wf10-20260903` worktrees** — none were removed, reset, or force-modified. `predict-execute-episode-wf10-20260903` still carries only its own local `Cargo.lock` diff (`0 insertions(+), 0 deletions(-)`, binary metadata churn) and no unique commits; nothing to merge there, and it was left as-is since deciding to discard that diff is exactly the kind of call this pass must not make unilaterally.

### Still open (for the user / the separate deletion pass)

- **Now safe to remove once a human confirms**, since their content is captured in canonical:
  - `/Users/sac/wasm4pm-worktrees/fix-etconformance-precision-feature-gate` (commit `9b32c57c4` now also in canonical as `c38e8c062`)
  - `/Users/sac/wasm4pm-worktrees/register-planner-mcp-json` (commit `078b1f2c0` now also in canonical as `90c8b1706`)
  - `/Users/sac/wasm4pm-worktrees/ex4pm-qual-episode-20260903` (all 7 commits now also in canonical via merge commit `87f4ac591`) — the worktree's own `Cargo.lock` modification (uncommitted) was never inspected for content beyond a binary diff; still needs a human look before any removal.
  - `/Users/sac/wasm4pm-worktrees/predict-execute-episode-wf10-20260903` (0 unique commits, detached HEAD, only a local `Cargo.lock` metadata diff) — safe to remove once that `Cargo.lock` diff is confirmed disposable.
- **Still requires a human decision, not yet safe to remove**:
  - `/Users/sac/wasm4pm/.claude/worktrees/wf_99470ccd-c7b-1` — content is now preserved in commit `2b9ba0773` on its own branch, so nothing will be lost if the worktree itself is later removed, but whether this doc-rewrite pass should ALSO be merged into canonical is still an open question only a human can answer.
  - `/Users/sac/wasm4pm_copy` — the `packages/agents/` deletions are still uncommitted and undecided; needs a human call on intentional-vs-stray before any git or filesystem action.
  - `/Users/sac/wasm4pm-compat` — local `main` is still 191 commits behind `origin/main` and could not be pushed; needs a real `git pull`/merge (or a decision that local's 3 commits should be reapplied a different way) before it can be reconciled with its remote. This is unrelated to the `wasm4pm` (non-compat) canonical work above.
  - `/Users/sac/wasm4pm-compat_copy` — untracked `pnpm-lock.yaml`, no unique history; trivially disposable but left for the deletion pass.
  - `/Users/sac/wasm4pm-backups` — still unread (`RECOVERY.md`); purpose/supersession still needs human confirmation.
  - "gemma" — still out of scope, not found anywhere in this family, per the original plan's note.
