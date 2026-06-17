# BRIEFING — 2026-06-11T23:53:00Z

## Mission
Generate breed examples and verify executions for Group 3 breeds (autoinstinct_semantics, autoinstinct_vision, autoinstinct_learning, ltl_monitor, allen_temporal).

## 🔒 My Identity
- Archetype: worker_breed_group_3
- Roles: implementer, qa, specialist
- Working directory: /Users/sac/wasm4pm/.agents/worker_group_3/
- Original parent: 90466f7d-3cab-447c-832a-5fe13ae1a89d
- Milestone: Generate Breed Examples - Group 3

## 🔒 Key Constraints
- CODE_ONLY network restrictions.
- Minimal change principle.
- Verification and Receipt rules.
- Only write to my working directory /Users/sac/wasm4pm/.agents/worker_group_3/ and specified output files.

## Current Parent
- Conversation ID: 90466f7d-3cab-447c-832a-5fe13ae1a89d
- Updated: 2026-06-11T23:53:00Z

## Task Summary
- **What to build**: Examples (`intent.json`, `run.sh`, `result.json`, `last-output.log`) for `autoinstinct_semantics`, `autoinstinct_vision`, `autoinstinct_learning`, `ltl_monitor`, and `allen_temporal`.
- **Success criteria**: Each breed's execution returns `status: "ok"`.
- **Interface contracts**: `packages/cognition` and `examples/cognition/`
- **Code layout**: `examples/cognition/<breed>/`

## Key Decisions Made
- Used standard double-tee structure in `run.sh` scripts to redirect both stdout and stderr of `wpm cognition run` to both `result.json` and `last-output.log`.
- Confirmed execution is green and all vitest integration tests are passing.

## Artifact Index
- /Users/sac/wasm4pm/.agents/worker_group_3/handoff.md — Execution findings and status
