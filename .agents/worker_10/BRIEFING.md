# BRIEFING — 2026-06-11T18:31:45Z

## Mission
Populate the examples/cognition/ directories for the 6 assigned cognition breeds.

## 🔒 My Identity
- Archetype: Coordinator
- Roles: implementer, qa, specialist
- Working directory: /Users/sac/wasm4pm/.agents/worker_10
- Original parent: d89d07ab-966a-42a8-9712-32afc9952dd3
- Milestone: master_chain_and_validation

## 🔒 Key Constraints
- Run all 52 breed examples and 52 stages chain, verifying BLAKE3 output_hash, run_id, and replay determinism.
- Delete the legacy 13 stages.
- No cheating or dummy implementations.

## Current Parent
- Conversation ID: d89d07ab-966a-42a8-9712-32afc9952dd3
- Updated: not yet

## Task Summary
- **What to build**: Extract BreedInput objects from fixtures for script_sam, situation_calculus, soar, strips, tableaux, version_space, and write them to examples/cognition/<breed_name>/intent.json. Run their run.sh scripts to generate result.json and logs. Verify outputs.
- **Success criteria**: 6 intent.json files correctly written, run.sh executed successfully for each, result.json and run.log created, verified without placeholder/fake strings.
- **Interface contracts**: packages/cognition/src/__tests__/fixtures/breed-inputs.ts
- **Code layout**: examples/cognition/

## Key Decisions Made
- Use specified minimal or real inputs for each breed.

## Artifact Index
- examples/cognition/script_sam/intent.json
- examples/cognition/situation_calculus/intent.json
- examples/cognition/soar/intent.json
- examples/cognition/strips/intent.json
- examples/cognition/tableaux/intent.json
- examples/cognition/version_space/intent.json

## Change Tracker
- **Files modified**: none
- **Build status**: unknown
- **Pending issues**: none

## Quality Status
- **Build/test result**: unknown
- **Lint status**: unknown
- **Tests added/modified**: none

## Loaded Skills
- None loaded.
