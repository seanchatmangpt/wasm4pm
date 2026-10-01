# wasm4pm: push or delete local-only branch `feat/ex4pm-wasm4pm-bindings-phase2`

- Standing: OPEN
- Created: 2026-09-19 (v26.9.19 gh survey wave)
- Source: local branch `feat/ex4pm-wasm4pm-bindings-phase2` has 11 commit(s) not on `origin/main`, no upstream
- Evidence: `git rev-list --count origin/main..feat/ex4pm-wasm4pm-bindings-phase2` = 11

## Work to complete
- Push (`git push -u origin feat/ex4pm-wasm4pm-bindings-phase2`) if the work matters; otherwise delete the branch after confirming the commits are obsolete.

## Acceptance
- Branch pushed and visible on GitHub, or deleted locally with commits confirmed recoverable-or-unwanted.

## History
- 2026-09-19 | OPEN | survey found local-only branch | feat/ex4pm-wasm4pm-bindings-phase2 (11 commits) | decision pending

## Observed state (2026-09-30, re-derived; supersedes survey evidence above)
- Branch exists locally: `feat/ex4pm-wasm4pm-bindings-phase2` @ `9243737d86d03f2c10aa3fb460de92c988ac1560`.
- "no upstream" is only a tracking-config fact: a remote branch of the same name EXISTS, `origin/feat/ex4pm-wasm4pm-bindings-phase2` @ `dfc68afe85063573f1dd0e86d4a0901ba30a21e8`, and that SHA is an ancestor of both main and the local branch. Local is 5 commits ahead of it, 0 behind (`git log --oneline origin/feat/ex4pm-wasm4pm-bindings-phase2..feat/ex4pm-wasm4pm-bindings-phase2` = 9243737d8, 4afdf3970, dfe1054f6, 45f4d1caf, 69017c123; the fifth, 69017c123 "refactor(causal): extract JsValue-free causal_footprint_pure", is the merge-base with main, i.e. already in main). main is 333 commits ahead of local phase2, which is 4 ahead of main.
- Not contained in main: local branch is not an ancestor of main; 4 commits are `+` in `git cherry`.

```
$ git merge-base --is-ancestor feat/ex4pm-wasm4pm-bindings-phase2 main; echo $?
1
$ git cherry main feat/ex4pm-wasm4pm-bindings-phase2
+ 45f4d1caff1308bd81dd17f28d5f64eeb015cf9f   feat(doctor): add 7 closure rails to Vision 2030 audit
+ dfe1054f6 docs: apply doc-status governance script for the first time
+ 4afdf3970c3a17acd11d430340aee64acdb866ae   docs: apply doc-status governance across the repo
+ 9243737d86d03f2c10aa3fb460de92c988ac1560   phase2: extend OCEL bindings to ExperimentRun objects
$ git rev-list --left-right --count main...feat/ex4pm-wasm4pm-bindings-phase2
333	4
$ git merge-base --is-ancestor dfc68afe8 main; echo $?      -> 0
$ git rev-list --left-right --count origin/feat/ex4pm-wasm4pm-bindings-phase2...feat/ex4pm-wasm4pm-bindings-phase2  -> 0  5
$ git merge-base main feat/ex4pm-wasm4pm-bindings-phase2    -> 69017c123f79ee3a9bef40473b9b4d63819c1307
```
- Bindings crate delta vs main (`git diff --stat main 9243737d8 -- crates/wasm4pm-ex4pm-bindings`): Cargo.toml -1 (an artifact of the stale base, not of 9243737d8; a wholesale merge would undo main's 5df9e7529 "keep ex4pm-bindings out of v26.9.28 publish"), phase2.rs +51 (two tests), phase4_stats.rs +6/-2 (likewise, main's rustfmt 02f3aa257 would be lost).
- Only genuinely new content: `phase2.rs` adds test `oc_discover_runs_end_to_end_over_an_experiment_run_object_type` (positive) and an `#[ignore]`d falsifier `oc_discover_rejects_an_experiment_run_event_with_a_dangling_object_reference` (documents that a dangling object id makes `discover_oc_petri_net_pure` panic and `extern "C"` oc_discover abort). `ExperimentRun` grep on main bindings: no match. Other 3 commits are broad doc-status/doctor changes (60 / 2443 / 167 files) from the older merge-base; whether they are superseded by main is UNKNOWN (not observed).

## Recommendation
Do not push or delete the branch as-is, and do not merge it wholesale (the stale base would regress main's Cargo.toml publish exclusion and rustfmt). Salvage by cherry-picking only `9243737d8` (phase2.rs +51) onto main via a normal commit/merge (`git show --stat 9243737d8` touches only `phase2.rs`, so it should apply without touching those files); then the branch can be deleted. Evaluate the three doc/doctor commits (45f4d1caf, dfe1054f6, 4afdf3970) separately against main before discarding. Pushing the local ref would update origin's phase2 branch (fast-forward from dfc68afe8), which is safe but publishes the stale reverting hunks. No git state changed by this lane.
