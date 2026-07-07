# Scope: Validation Reports Generation and verification

## Architecture
- Target directory: `/Users/sac/wasm4pm/reports/capability-validation/`
- Report locations:
  - Algorithms: `/Users/sac/wasm4pm/reports/capability-validation/algorithms/`
  - Breeds: `/Users/sac/wasm4pm/reports/capability-validation/breeds/`
  - Verifiers: `/Users/sac/wasm4pm/reports/capability-validation/verifier/`
- Index / Summary files:
  - `/Users/sac/wasm4pm/reports/capability-validation/README.md`
  - `/Users/sac/wasm4pm/reports/capability-validation/REPORT_INDEX.md`
  - `/Users/sac/wasm4pm/reports/capability-validation/verifier/duplicate-evidence-check.md`
  - `/Users/sac/wasm4pm/reports/capability-validation/verifier/report-count-check.md`
  - `/Users/sac/wasm4pm/reports/capability-validation/verifier/unresolved-items.md`

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Plan & Verify | Analyze codebase, confirm existing tests/checks pass | none | DONE |
| 2 | Alg Reports Gen | Generate 60 algorithm reports under `reports/capability-validation/algorithms/` | M1 | IN_PROGRESS |
| 3 | Breed Reports Gen | Generate 55 cognitive breed reports under `reports/capability-validation/breeds/` | M1 | IN_PROGRESS |
| 4 | Index & Verifiers | Create README, REPORT_INDEX, verifier checks | M2, M3 | PLANNED |
| 5 | Verify & Close | Validate report integrity and update main ledger | M4 | PLANNED |

## Interface Contracts
- Subagents MUST use the information from `ALGORITHM_AND_BREED_STATUS.md` and codebase files to populate individual reports.
- Each report MUST follow the format `NNN-<item_id>.md`, starting with `001-a_star.md` through `115-ocpm_route_discoverer.md`.
- No placeholders, no stubs.
