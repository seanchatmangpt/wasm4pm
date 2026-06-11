# BRIEFING — 2026-06-10T23:53:00-07:00

## Mission
Populate and verify individual examples and chain stages for cognition breeds 1-6.

## 🔒 My Identity
- Archetype: Worker
- Roles: implementer, qa, specialist
- Working directory: /Users/sac/wasm4pm/.agents/worker_1
- Original parent: d89d07ab-966a-42a8-9712-32afc9952dd3
- Milestone: Breed Examples and Chains Stage 1

## 🔒 Key Constraints
- CODE_ONLY network mode: no external web access, no external curl/wget.
- Follow Monorepo release and proof discipline laws.
- Run build and test after changes.
- Minimal code change principle.
- No dummy/mock implementations.

## Current Parent
- Conversation ID: d89d07ab-966a-42a8-9712-32afc9952dd3
- Updated: yes

## Task Summary
- **What to build**: Examples and chain stages for 6 cognition breeds.
- **Success criteria**: For breeds 1-6, example dir `examples/cognition/<breed>/` contains `intent.json`, `run.sh`, `result.json`, `last-output.log`. Chain stage dir `examples/cognition/chains/factory-agent/stages/<stage_name>/` contains `intent.json` (for stage 00) or `transform.py` (for stages 01-05).
- **Interface contracts**: Input block must be extracted from `/Users/sac/wasm4pm/packages/cognition/src/__tests__/fixtures/papers/<breed>.json`.
- **Code layout**: Examples under `examples/cognition/` and `examples/cognition/chains/factory-agent/stages/`.

## Key Decisions Made
- Extracted input blocks directly from JSON paper fixtures under `packages/cognition/src/__tests__/fixtures/papers/`.
- Created regular example directory runs and separate stage folders with proper Python transforms to bind with the prior stage.
- Ran the 365 tests of the cognition package to verify no regressions were introduced.

## Artifact Index
- `/Users/sac/wasm4pm/examples/cognition/abductive_ibe/` — Breed 1 example
- `/Users/sac/wasm4pm/examples/cognition/abductive_lp/` — Breed 2 example
- `/Users/sac/wasm4pm/examples/cognition/act_r/` — Breed 3 example
- `/Users/sac/wasm4pm/examples/cognition/allen_temporal/` — Breed 4 example
- `/Users/sac/wasm4pm/examples/cognition/analogy_sme/` — Breed 5 example
- `/Users/sac/wasm4pm/examples/cognition/asp/` — Breed 6 example
- `/Users/sac/wasm4pm/examples/cognition/chains/factory-agent/stages/00-abductive_ibe/` — Stage 00
- `/Users/sac/wasm4pm/examples/cognition/chains/factory-agent/stages/01-abductive_lp/` — Stage 01
- `/Users/sac/wasm4pm/examples/cognition/chains/factory-agent/stages/02-act_r/` — Stage 02
- `/Users/sac/wasm4pm/examples/cognition/chains/factory-agent/stages/03-allen_temporal/` — Stage 03
- `/Users/sac/wasm4pm/examples/cognition/chains/factory-agent/stages/04-analogy_sme/` — Stage 04
- `/Users/sac/wasm4pm/examples/cognition/chains/factory-agent/stages/05-asp/` — Stage 05
