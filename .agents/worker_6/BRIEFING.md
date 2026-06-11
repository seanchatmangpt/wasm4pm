# BRIEFING — 2026-06-11T11:31:44-07:00

## Mission
Populate and verify individual examples for episodic_memory, event_calculus, frames_inheritance, fuzzy_logic, and gps.

## 🔒 My Identity
- Archetype: worker_6
- Roles: implementer, qa, specialist
- Working directory: /Users/sac/wasm4pm/.agents/worker_6
- Original parent: d89d07ab-966a-42a8-9712-32afc9952dd3
- Milestone: Breed Examples and Chain Stages 31-36
- New Parent: e1e903a8-4108-4423-a882-db22da9c48dc

## 🔒 Key Constraints
- CODE_ONLY network mode: no external web access, no curl/wget/lynx.
- Do not write source/tests/data to `.agents/`.
- No cheats, no hardcoded/fake outputs.
- Verify everything on disk.

## Current Parent
- Conversation ID: e1e903a8-4108-4423-a882-db22da9c48dc
- Updated: 2026-06-11T18:31:44Z

## Task Summary
- **What to build**: Examples (`intent.json`, `run.sh` execution, and `result.json`) for: episodic_memory, event_calculus, frames_inheritance, fuzzy_logic, gps.
- **Success criteria**: Correct BreedInput JSON schema, successful CLI run, real execution outputs (no fake or placeholder strings).
- **Interface contracts**: `packages/cognition/src/__tests__/fixtures/breed-inputs.ts` & `breed-inputs-real.ts`.
- **Code layout**: `examples/cognition/<breed_name>/`.

## Change Tracker
- **Files modified**: None yet.
- **Build status**: TBD
- **Pending issues**: None

## Quality Status
- **Build/test result**: TBD
- **Lint status**: TBD
- **Tests added/modified**: TBD

## Loaded Skills
- None loaded yet.

## Key Decisions Made
- Starting retrieval of breed-inputs.ts and breed-inputs-real.ts fixtures.

## Artifact Index
- `/Users/sac/wasm4pm/.agents/worker_6/BRIEFING.md` — Agent Briefing
- `/Users/sac/wasm4pm/.agents/worker_6/ORIGINAL_REQUEST.md` — Original request
- `/Users/sac/wasm4pm/.agents/worker_6/progress.md` — Progress heartbeat
- `/Users/sac/wasm4pm/.agents/worker_6/handoff.md` — Final Handoff report
