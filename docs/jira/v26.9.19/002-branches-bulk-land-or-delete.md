# wasm4pm: triage 45 PR-less unmerged remote branches

- Standing: OPEN
- Created: 2026-09-19 (v26.9.19 gh survey wave)
- Source: origin branches not merged into `main` with no open PR
- Evidence: `git branch -r --no-merged origin/main`: chatgpt/wasm-engine-boundary-20260825 complete-pnpm-action-wip complete-wasm4pm-wip docs/errc-audit-run4 docs/jira-v26.8.16 feat/dd-ui-dfcm-closure feat/dfcm-federated-capabilities-v26.9.1 feat/ex4pm-wasm4pm-bindings-phase2 feat/u8-construct-part integration/finalize-wip-after-590-20260816 integration/finish-wip-v26.9.1-20260815 rescue/dangling-2de0a4ac-On-thesis-benchmark-numbers-Makefile-and rescue/dangling-4f99af07-On-thesis-benchmark-numbers-WASM-crates- rescue/dangling-cee3ff8e-perf-prediction-remaining-time-FxHashMap rescue/dangling-e6fdf3c4-docs-complete-FAQ-troubleshooting-guide- rescue/dangling-f29fc3e2-On-main-agent-aa8826e-wasm4pm-advanced-l wip/main-tree-2026-05-15 wip/stash-0-agent-aa8826e-defensive-bulk wip/stash-1-agent-aa8826e-bulk-wasm4pm-src wip/stash-10-wasm-unstaged-during-ts-commit wip/stash-11-Cargo-lock-and-Makefile wip/stash-12-Armstrong-refactor-TypeScript-changes wip/stash-13-Armstrong-WASM-refactor-ml-backend-chang wip/stash-14-WIP-on-main-03d08054-perf-advanced-algor wip/stash-15-WIP-on-main-dc303436-docs-jira-PRD-ARD-f wip/stash-2-agent-aa8826e-more-broken wip/stash-3-agent-aa8826e-wasm4pm-src-broken wip/stash-4-agent-aa8826e-prolog8-kernel wip/stash-5-agent-aa8826e-wasm4pm-broken-files wip/stash-6-wasm4pm-broken-state-during-m4 wip/stash-7-agent-aa8826e-mcpp-m1-wip wip/stash-8-WIP-on-thesis-benchmark-numbers-fd09d07c wip/stash-9-WIP-on-thesis-benchmark-numbers-20cca3eb wip/worktree-agent-a067af14ad47ac93f-2026-05-15 wip/worktree-agent-a1c2b146255c7e4c8-2026-05-15 wip/worktree-agent-a592e8cc793cbbd61-2026-05-15 wip/worktree-agent-aa1d0014feb9e28ab-2026-05-15 wip/worktree-agent-aa548a5aa8f3de021-2026-05-15 wip/worktree-agent-ab3ab7384cd95bbd1-2026-05-15 wip/worktree-agent-ad61d6d64fef22a64-2026-05-15 wip/worktree-agent-ad96fce231997ddd5-2026-05-15 wip/worktree-agent-ae7e6f555c08fac95-2026-05-15 wip/worktree-prolog-2026-05-15 wip/worktree-simd-prolog-2026-05-15 ws5/ggen-sync-only-20260828

## Work to complete
- Triage each branch: land (open a PR) or delete (`git push origin --delete <branch>`). Work in batches; record decisions in History.

## Acceptance
- `git branch -r --no-merged origin/main` is empty after `git fetch --prune`.

## History
- 2026-09-19 | OPEN | survey found 45 PR-less branches | full list above | triage pending
