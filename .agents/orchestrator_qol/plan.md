# Plan: Implementation of QoL and DX Gaps

This plan outlines the milestones and steps required to implement all 13 Quality-of-Life (QoL) and Developer Experience (DX) gaps identified in the audit report `wasm4pm-qol-audit-2026-05-18.json`.

## Architecture
The changes are isolated to `@wasm4pm/cli` (under `apps/wasm4pm/src/`). The target files include:
- `apps/wasm4pm/src/commands/algorithms.ts` (QoL-001, QoL-006, QoL-011)
- `apps/wasm4pm/src/commands/run.ts` (QoL-003, QoL-006, QoL-007, QoL-010, QoL-011, QoL-013)
- `apps/wasm4pm/src/commands/conformance.ts` (QoL-002, QoL-005, QoL-009, QoL-013)
- `apps/wasm4pm/src/commands/quality.ts` (QoL-008, QoL-013)
- `apps/wasm4pm/src/commands/compare.ts` (QoL-012, QoL-013)
- `apps/wasm4pm/src/commands/workflow.ts` (New command for QoL-003)
- `apps/wasm4pm/src/commands/select-algorithm.ts` (New command for QoL-011)
- `apps/wasm4pm/src/first-run-ux.ts` (QoL-003)
- `apps/wasm4pm/src/error-recovery.ts` (QoL-004)
- `apps/wasm4pm/src/output.ts` (QoL-007, QoL-013)
- `apps/wasm4pm/src/exit-codes.ts` (QoL-012)

## Milestones

| # | Milestone Name | Scope (Gaps Handled) | Dependencies | Status | Conversation ID |
|---|---|---|---|---|---|
| M1 | Algorithmic Helper & Diagnostics | QoL-001, QoL-004, QoL-006, QoL-010, QoL-011 | None | PLANNED | |
| M2 | Conformance & Quality Reporting | QoL-002, QoL-005, QoL-008, QoL-009 | M1 | PLANNED | |
| M3 | CLI Workflows & Controls | QoL-003, QoL-007, QoL-012, QoL-013 | M2 | PLANNED | |
| M4 | Final Integration & Test Verification | Verification of all 13 gaps, running test suites, linting | M3 | PLANNED | |

## Acceptance Criteria Verification Plan

### M1. Algorithmic Helper & Diagnostics
- `wpm algorithms` outputs per-tier rationale.
- `wpm algorithms --recommend-for <size|time>` works and provides the correct suggestion.
- Unknown algorithms display correct spelling suggestions and alias information (e.g. `genetic` -> `genetic_algorithm` / dashes vs underscores).
- `wpm run --help` mentions `--show-algo-params` or parameter documentation, and CLI validates inputs against parameter ranges.
- Check timeout configurations against expected time based on log size and warn or abort gracefully.
- `wpm select-algorithm` interactive command and `wpm run --auto-select` recommend correct algorithms.

### M2. Conformance & Quality Reporting
- `wpm conformance` outputs explanation of fitness standards (0.80 vs 0.85).
- `wpm conformance --explain-fitness` outputs details.
- CI range diagnostics and `--explain-ci` are functional.
- Tradeoffs between fitness, precision, generalization, and simplicity are clear, and `--explain-quality-dims` displays correct descriptions.
- `wpm conformance --diagnose-deviations` parses missing and extra/late activities and gives operational hints.

### M3. CLI Workflows & Controls
- Contextual next-step suggestions are output after successful execution of discovery or quality commands, configurable via `--guide-next-steps`.
- `wpm workflow` command prints the workflow pipeline documentation.
- JSON, human, and CSV format differences are explained in CLI help, and `--format csv` outputs clean CSV content.
- Compare exits and errors are formatted gracefully for exit code 4 (partial failure).
- `--no-color` and `--no-emoji` work, and automatically suppress colors and emoji when `process.env.CI` is set.

### M4. Verification
- `npm run build:cli` succeeds.
- `npm test` runs and passes all tests.
- `npm run lint` and `npm run check` pass with zero issues.
