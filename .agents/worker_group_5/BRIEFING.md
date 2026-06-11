# BRIEFING — 2026-06-11T00:01:00-07:00

## Mission
Generate breed examples and verify correct execution of dempster_shafer, frames_inheritance, ebl, asp, and description_logic.

## 🔒 My Identity
- Archetype: worker_breed_group_5
- Roles: implementer, qa, specialist
- Working directory: /Users/sac/wasm4pm/.agents/worker_group_5/
- Original parent: 90466f7d-3cab-447c-832a-5fe13ae1a89d
- Milestone: Breed Examples Group 5

## 🔒 Key Constraints
- Perform all task instructions and write execution findings to handoff.md.
- Notify the parent when done.
- Follow Monorepo package identity rules if applicable.

## Current Parent
- Conversation ID: 90466f7d-3cab-447c-832a-5fe13ae1a89d
- Updated: not yet

## Task Summary
- **What to build**: Examples and run.sh scripts for dempster_shafer, frames_inheritance, ebl, asp, and description_logic.
- **Success criteria**:
  - `intent.json` created under `examples/cognition/<breed>/` extracting from fixture files or creating conforming representations.
  - `run.sh` created to execute breed with `wpm cognition run` teeing to `result.json` and `last-output.log`.
  - Verification that executions return `status: "ok"`.
  - Handoff report in `handoff.md`.
- **Interface contracts**: packages/cognition/src/
- **Code layout**: packages/cognition/

## Key Decisions Made
- Rebuilt core packages for Node.js targeting (`build:nodejs`) to resolve WASM loading/import errors in Node's ES module system.
- Standardized execution runner format for all 5 breed `run.sh` scripts.

## Artifact Index
- examples/cognition/dempster_shafer/{intent.json,run.sh,result.json}
- examples/cognition/frames_inheritance/{intent.json,run.sh,result.json}
- examples/cognition/ebl/{intent.json,run.sh,result.json}
- examples/cognition/asp/{intent.json,run.sh,result.json}
- examples/cognition/description_logic/{intent.json,run.sh,result.json}
