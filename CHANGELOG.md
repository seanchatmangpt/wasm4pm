# Changelog

wasm4pm uses [CalVer](https://calver.org/): YEAR.MONTH.DAY
- Pin exact versions in production (e.g. "26.6.9") — never use ^ or ~ ranges.
- Multiple releases same day: 26.6.9a, 26.6.9b etc.

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
