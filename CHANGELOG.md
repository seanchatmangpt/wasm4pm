# Changelog

wasm4pm uses [CalVer](https://calver.org/): YEAR.MONTH.DAY
- Pin exact versions in production (e.g. "26.6.9") — never use ^ or ~ ranges.
- Multiple releases same day: 26.6.9a, 26.6.9b etc.

## [Unreleased]

### Added
- Task D2: Recorded massive geometry expansion (from 8KB to 1.8MB)

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
