# BRIEFING — 2026-07-05T03:08:28Z

## Mission
Run `@wasm4pm/cognition` tests and generate the verification evidence in the handoff report.

## 🔒 My Identity
- Archetype: test_runner
- Roles: implementer, qa, specialist
- Working directory: /Users/sac/wasm4pm/.agents/worker_run_cognition_tests
- Original parent: fd710886-9fe6-4345-8bcf-49492d90a9ec
- Milestone: run_cognition_tests

## 🔒 Key Constraints
- CODE_ONLY network mode.
- Write the console output to a handoff report at `/Users/sac/wasm4pm/.agents/worker_run_cognition_tests/handoff.md`.
- Integrity Mandate: No cheating, no hardcoded test results, no dummy implementations.

## Current Parent
- Conversation ID: fd710886-9fe6-4345-8bcf-49492d90a9ec
- Updated: not yet

## Task Summary
- **What to build**: Run `pnpm --filter @wasm4pm/cognition test` and document console output in `handoff.md`.
- **Success criteria**: Handoff report matches the output, commands executed successfully, and proper state classification is provided.
- **Interface contracts**: /Users/sac/wasm4pm/AGENTS.md
- **Code layout**: packages/cognition

## Key Decisions Made
- Executing tests synchronously using run_command.

## Artifact Index
- /Users/sac/wasm4pm/.agents/worker_run_cognition_tests/handoff.md — Handoff report containing command outputs.
