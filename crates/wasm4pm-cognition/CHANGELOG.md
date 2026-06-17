# Changelog — wasm4pm-cognition

All notable changes to the cognitive breed kernel are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/).
Versioning uses **CalVer** (`vYEAR.MONTH.DAY`) per project convention.

---

## [v26.6.26] — 2026-06-17

### Added
- **Production hardening tests** (`tests/production_hardening_tests.rs`) — 38 tests
  covering degradation mode selection, trigger boundary values, breed list
  validation per mode, mode rationale documentation, recovery recommendations,
  and degradation severity ordering.
- CI/CD workflow (`.github/workflows/cognition-breed-testing.yml`) with 5 jobs:
  build-check, unit-tests, integration-tests, breed-quality-gate, documentation-check.
- `BREED_COVERAGE.md` documenting all 56 breeds (9 BreedId-implemented + 47 stubs).

### Changed
- Updated all degradation mode rationale strings to reference the accurate
  registry size: **56 breeds in registry (9 BreedId-implemented + 47 stubs)**.

---

## [v26.6.25] — 2026-06-17

### Added
- **Autonomic healing tests** (`tests/autonomic_healing_tests.rs`) — 36 tests
  covering AutonomicContext construction, BreedRewardSignal computation,
  compute_breed_reward scenarios, prioritize_breeds logic, input enrichment,
  reward aggregation, and breed_id_from_str conversions.

### Fixed
- FM-5 fraud detection verified: empty `inference_trace` triggers -2.0 RL penalty.

---

## [v26.6.24] — 2026-06-17

### Added
- **Breed quality tests** (`tests/breed_quality_tests.rs`) — 40 tests with
  `assert_output_quality` helper validating non-empty explanation, non-empty
  inference trace (FM-5 gate), strictly monotonic step numbers, selected
  candidate existence, score bounds [0.0, 1.0], and elimination reason validation.
- Coverage for all 9 BreedId variants (eliza, cbr, mycin, dendral, strips,
  prolog, gps, soar, hearsay).

---

## [v26.6.23] — 2026-06-17

### Added
- **Autonomic bridge module** (`src/autonomic_bridge.rs`) connecting RL
  health/SPC/circuit state to breed selection.
- `AutonomicContext` struct (health_level, spc_alert_level, circuit_state, cycle_count).
- `BreedRewardSignal` struct with base_reward, confidence_bonus, elimination_bonus,
  fraud_penalty, and total_reward.
- `compute_breed_reward`, `prioritize_breeds`, `breed_id_from_str` (case-insensitive).

---

## [v26.6.22] — 2026-06-17

### Added
- **Degradation modes module** (`src/degradation.rs`) for graceful degradation
  under resource and health constraints.
- `DegradationMode` enum (Full → 9 breeds, Reduced → 5, Minimal → 3, Emergency → 1).
- `DegradationTrigger` struct (memory_pressure, response_time_exceeded, error_rate,
  health_level) with `clamped()` boundary safety.
- `select_degradation_mode`, `breeds_for_mode`, `breed_count`, `breed_active_in_mode`,
  `mode_rationale`, `recovery_recommendation`.

---

## [v26.6.21] — 2026-06-17

### Added
- Initial cognitive breed kernel release.
- `CognitionBreed` trait with 6 methods (id, capabilities, preconditions, run,
  postconditions, receipt).
- `BreedId` enum with 9 implemented variants.
- `BreedOutput`, `Candidate`, `Fact`, `TraceStep` structures.
- 8 capacity constants (MAX_INTENT_CHARS, MAX_CANDIDATES, MAX_FACTS, MAX_CASES,
  MAX_RULES, MAX_GOALS, MAX_STATE_BYTES, MAX_TRACE_STEPS).
- BLAKE3 receipt chain (input_hash, output_hash, combined_hash).

---

## Version History

| Version | Date | Tests Added | Cumulative | Focus |
|---------|------|-------------|------------|-------|
| v26.6.21 | 2026-06-17 | — | — | Initial kernel |
| v26.6.22 | 2026-06-17 | — | — | Degradation modes |
| v26.6.23 | 2026-06-17 | — | — | Autonomic bridge |
| v26.6.24 | 2026-06-17 | 40 | 40 | Breed quality tests |
| v26.6.25 | 2026-06-17 | 36 | 76 | Autonomic healing tests |
| v26.6.26 | 2026-06-17 | 38 | 114 | Production hardening + CI |

**Registry:** 56 breeds total (9 BreedId-implemented + 47 string-dispatch stubs).
