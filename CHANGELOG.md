# Changelog

wasm4pm uses [CalVer](https://calver.org/): YEAR.MONTH.DAY
- Pin exact versions in production (e.g. "26.6.9") — never use ^ or ~ ranges.
- Multiple releases same day: 26.6.9a, 26.6.9b etc.

## [26.7.1] — 2026-07-01

First-principles project refocus: repository hygiene, CI root-cause fixes, a
correctness fix closing a native/WASM test-coverage gap, and a new native
temporal/PDDL planning crate.

### Added
- `crates/wasm4pm-planner`: PDDL-subset temporal planner (parse/ground/schedule/
  admission/receipt/capability_router) with prolog8 admission gating and its own
  MCP server binary (`wasm4pm-planner-mcp`). Distinct from `packages/planner`
  (TS execution-plan DAGs for process-mining configs) — see ADR note in
  `crates/wasm4pm-planner/README.md`.
- `crates/wasm4pm-cognition/tests/gated_dispatch_ocel_conformance.rs`: 26 native
  tests routing representative breeds through the gated `run_breed()` conformance
  path, closing a coverage hole where native tests exclusively used the
  gate-skipping `dispatch_breed_test()`.
- `@wasm4pm/agents` re-introduced (previously removed in 26.6.25) with honest
  execute semantics: `_applyCorrection`/`_createSnapshot` report explicit
  `not_implemented` instead of fabricating success telemetry.

### Fixed
- **CI**: `test.yml` passed empty `${{ matrix.rust }}` to the toolchain action
  (matrix key is `rust-version`) — broke every POSIX CI leg. A tracked file
  named `nul` (Windows-reserved) broke every Windows checkout.
- **Cognition conformance** (39 failures → 0): native tests skip the OCEL
  conformance gate entirely, so lifecycle-model gaps and stale TS test
  contracts went undetected. Reconciled `ELIZA_MODEL`'s phase kinds with the
  breed's documented fallback path; fixed `csp_ac3` to report `unsat` (was
  `None`, violating its own postcondition); updated ~34 stale TS assertions/
  fixtures across 13 breeds to match current output shapes (paper-provenance
  value assertions kept, not weakened).
- `models.rs`: streaming conformance checker now falls back to place marking
  for initial tokens.
- `validate.ts`: OCEL validation now accepts camelCase `eventTypes`/
  `objectTypes` and object-shaped `object_types`.

### Removed
- `packages/autopm`, `packages/agent-context` — zero importers in the product
  dependency graph.
- `crates/wasm4pm-lsp` — already workspace-excluded (out-of-repo `lsp-max`
  dependency, unbuildable in a clean checkout); revival path noted in
  `Cargo.toml`.

### Changed
- Doc-truth reconciliation: breed count corrected to 55 everywhere (was
  52/39/21 across CLAUDE.md/README/architecture doc) — `breeds/registry.json`
  is the single source of truth.
- `crates/prolog8`: continued NAF/SLD-resolution kernel work (backtracking
  solver, PARARULE-Plus falsification suite, 10s benchmark wall clock).

### Known issues (pre-existing, out of scope for this release)
- `apps/wasm4pm` CLI test suite: ~206 pre-existing failures, none touching
  files changed in this release. Root causes: local Node 25 made
  `process.stdout` a getter-only property, breaking a mock pattern used by
  many test files (CI pins Node 22/24, unaffected); a backlog of documented
  input-validation gaps (test names prefixed `gap:`, e.g. `batch --workers`
  validation).

## [26.6.25] — 2026-06-25

### Added
- POWL v2.0 semantics: complete ChoiceGraph implementation with full node/edge traversal, start/end sentinel removal, and validated construction via `ChoiceGraph::new`
- POWL v2 test coverage: conformance, soundness, footprint, token replay, and cross-validation tests updated for v2 API
- wasm4pm-compat v26.6 dependency pinned across all Rust crates

### Changed
- `powl_arena.rs`: migrated `ChoiceGraph::new_raw` calls to `ChoiceGraph::new` (API change in wasm4pm-compat v26.6)
- `powl_parser.rs`: updated edge index types and error formatting for v2 ChoiceGraph API
- `powl_api.rs`: removed `start_idx`/`end_idx` from `node_info_json` output (no longer part of public ChoiceGraph contract)
- `more_discovery.rs`: removed `ProcessTreeOperator::Or` mapping (not in wasm4pm-compat v26.6 API)
- Deleted `packages/agents` (superseded by cognition layer + MCP server architecture)

## [Unreleased]

## [26.6.9] — 2026-06-09

### Changed
- Upgraded pnpm 8.15.4 → 11.5.2; fixed workspace:* dependencies
- Aligned all license metadata to BUSL-1.1
- Added COMMERCIAL_LICENSE.md, SECURITY.md, NOTICE, THIRD_PARTY_LICENSES
- Added OTLP exporter for production telemetry
- Fixed to_js silent data-loss bug on wasm32 (8 sites in ilp_discovery.rs + final_analytics.rs)

## [26.6.8] — 2026-04-28

### Added
- 38 algorithms in kernel registry; Prolog8 engine; POWL analysis; social network mining
