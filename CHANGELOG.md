# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [26.4.8] - 2026-04-08

### Breaking

- **@pictl/ml**: Removed `micro-ml` dependency. All ML algorithms are now native TypeScript implementations with zero external ML dependencies.
- **License**: Changed from MIT/Apache-2.0 to BSL 1.1, converting to AGPL-3.0-only after 2 years.

### Added

- **Deployment Profiles**: Five deployment profiles for optimized WASM binary sizes
  - `browser` (~500KB, 82% reduction) — Web browsers, mobile web
  - `edge` (~1.5MB, 46% reduction) — Edge servers, CDN workers
  - `fog` (~2.0MB, 28% reduction) — Fog computing, IoT gateways
  - `iot` (~1.0MB, 64% reduction) — IoT devices, embedded systems
  - `cloud` (~2.78MB, full features) — Cloud servers, npm default
- **Conditional Compilation**: 30+ Rust modules now use `#[cfg(feature)]` gates
- **Hand-Rolled Statistics**: New `hand_stats.rs` module replaces statrs for size-constrained profiles (~200KB savings)
- **Profile-Specific Build Scripts**: `npm run build:{browser,edge,fog,iot,cloud}`
- **TypeScript Registry**: Deployment profile filtering with `getForDeploymentProfile()`
- **Documentation**: Comprehensive `DEPLOYMENT_PROFILES.md` guide
- **Tests**: Deployment profile test suite
- **CI/CD**: GitHub Actions `docs.yml` workflow for markdown linting and link checking
- **Doc Tooling**: `.markdownlint.json` and `.mlc.config.json` for automated doc quality

### Changed

- **@pictl/ml — Native ML Engine**: All 6 ML modules rewritten with hyper-optimized native implementations
  - `classifiers.ts`: Columnar `Float64Array` layout, pre-allocated distance buffers, single-pass Naive Bayes, log-sum-exp stable softmax
  - `clustering.ts`: Columnar k-means (k-means++ init, squared-distance), DBSCAN with bitset visited tracking
  - `anomaly.ts`: O(n) sliding window SMA, pre-computed autocorrelation denominator, Float64Array throughout
  - `reduction.ts`: Direct covariance computation (no transpose+matmul), in-place Jacobi eigendecomposition
  - `forecasting.ts`: Single-pass linear regression, pre-computed centered series, O(n) throughput binning
  - `bridge.ts`: JSDoc updated (no external ML references)
- **Default Feature**: `default` changed from `[]` to `["cloud"]` for full-feature npm package
- **statrs Dependency**: Made optional (was required, now ~200KB savings in size-constrained profiles)
- **Algorithm Registry**: Added `deploymentProfiles` field to `AlgorithmMetadata`
- **Build Scripts**: Added profile-specific build commands to `wasm4pm/package.json`
- **Documentation Cleanup**: ~22,000 lines of documentation consolidated
  - 40+ historical files archived to `docs/archive/` (academic, implementation, performance, reports)
  - Consolidated `CHANGELOG.md` from 3 separate files to single source of truth
  - Created `docs/PACKAGE_IMPLEMENTATION_HISTORY.md` from 5 package IMPLEMENTATION.md files
  - Updated `docs/INDEX.md` for v26.4.8 structure
  - Moved THESIS-V2.md to `docs/THESIS-V2.md` (researcher accessibility)
  - Removed duplicate/redundant docs across packages
- **Package Versions**: All 8 packages + wasm4pm bumped to 26.4.8

### Removed

- `micro-ml` dependency from `@pictl/ml` (replaced by native implementations)
- 40+ redundant documentation files (archived, not deleted)
- `LICENSE-MIT` and `LICENSE-APACHE` (replaced by `LICENSE` with BSL 1.1)

## [26.4.7] - 2026-04-07

### Added

**ML Integration — All 10 Gaps Closed**

Phase 1 — CLI Registration:
- `pmctl ml` command: classify, cluster, forecast, anomaly, regress, pca subtasks
- `pmctl powl` command: POWL process model discovery

Phase 2 — Dispatcher Wiring:
- `packages/kernel/src/step-dispatcher.ts` bridges engine StepDispatcher to kernel ML handlers
- All 6 ML step types dispatch correctly

Phase 3 — Planner / Config / Registry:
- 6 ML entries in algorithm registry
- New `[ml]` config section
- Planner generates ML analysis steps when `config.ml.enabled`

Phase 4 — pmctl Integration:
- `pmctl run`: ML post-discovery phase when ML config enabled
- `pmctl drift-watch --enhanced`: ML anomaly detection overlay on EWMA drift

Phase 5 — ML Observability:
- New event types: `MlModelTraining`, `MlPredictionMade`, `MlFeatureExtraction`, `MlAnomalyDetected`

Phase 6 — ML Testing Infrastructure:
- `ML_CLASSIFY_CONFIG` and `ML_ALL_TASKS_CONFIG` test fixtures
- `createMockMlAdapter()` for deterministic ML mock results

Phase 7 — Swarm ML Support:
- `resultType` field on `WorkerResult` (`discovery` | `ml`)
- `ml_ensemble` aggregation strategy

**Monorepo Consolidation — 16 packages to 9**
- Deleted 7 packages, merged into `@pictl/contracts` and `@pictl/engine`
- Removed circular dependencies

**DX Improvements**
- Pre-commit hooks, editorconfig, VS Code settings
- GitHub Actions CI: `typescript.yml` workflow
- `scripts/health.mjs` and `scripts/check-engines.mjs`

**pmctl doctor — 6 checks to 17 checks**

### Fixed
- ESM runtime error (`ERR_MODULE_NOT_FOUND`) — added `.js` extensions
- Stale `@wasm4pm/types` import in `execution.test.ts`
- `WebAssembly` namespace reference in `wasm-loader.test.ts`
- `powl.ts` type cast

### Breaking
- All imports from `@wasm4pm/types` and `@wasm4pm/templates` → `@pictl/contracts`
- `ErrorInfo` type renamed to `EngineError`

## [26.4.5] - 2026-04-04

### Added

**Streaming Conformance Checking**
- `store_dfg_from_json(json)` — deserialize DFG JSON into stored object
- `streaming_conformance_begin/add_event/close_trace/stats/finalize` — full streaming conformance API
- Memory model: O(open_traces × avg_trace_length)

**Browser Test Infrastructure**
- Headless Chromium test suite via `@vitest/browser` + Playwright
- Browser benchmark suite: 13+ algorithms × 4 log sizes
- `benchmarks/compare.js` and `benchmarks/dashboard.html`

### Fixed
- `WasmEventLog` and `WasmOCEL` constructors now export correctly via `#[wasm_bindgen(constructor)]`
- `npm test` script: use `build:nodejs` before unit tests

### Changed
- 72 unit tests (was 66), 44 integration tests (was 41)
- New `integration.test.ts` suite (16 tests)
- 4 streaming conformance tests

## [0.5.5] - 2026-03-XX

### Added
- Streaming / IoT Event Ingestion API: `streaming_dfg_begin/add_event/add_batch/close_trace/flush_open/snapshot/finalize/stats`
- Single-pass columnar DFG with `u32` activity IDs and `FxHashMap` edge counting
- Marginal-gain Hill Climbing rewrite: 177× speedup on 50K-case logs
- DECLARE columnar rewrite: ~26% faster via flat `bool` arrays

## [0.5.4]

### Added
- `stream_xes_bufread` function for streaming XES traces from `BufRead` (gzipped input)

### Fixed
- Remove noisy `println!` in OCEL XML import

## [0.5.3]

### Fixed
- Parse XES version from log element
- Missing unescapes in XML-based imports (XES, PNML)

## [0.5.2]

### Added
- `analysis` module with dotted chart, event timestamp histogram, object attribute changes

## [0.5.1]

### Changed
- Rename SlimLinkedOCEL bindings (not breaking — 0.5.0 was not published)

## [0.5.0]

### Fixed
- SlimLinkedOCEL `addObject` function
- OCEL XML import error type → `OCELIOError`

### Added
- `Default` impl for SlimLinkedOCEL
- SlimLinkedOCEL binding functions
- `From<(XES) AttributeValue>` for `OCELAttributeValue`

### Breaking
- `OCELIOError` error type for OCEL XML import
- `Hash` derive removed from `OCELType`

## [0.4.4]

### Fixed
- Version mismatch in macros crate

## [0.4.3]

### Fixed
- Typo: `oc_declare_conformace` → `oc_declare_conformance` (breaking)

## [0.4.2]

### Added
- OCEL CSV format (importer/exporter)
- OC-DECLARE conformance binding
- OCEL type statistics binding
- OCEL flatten and init/exit event bindings

### Changed
- Renamed `discover_oc-declare` → `discover_oc_declare` (breaking)
- Renamed `discover_dfg_from_locel` → `discover_dfg_from_ocel` (breaking)

### Fixed
- SQLite/DuckDB export removes existing file before export
- `Null` default for `OCELAttributeValue`

## [0.4.1]

### Changed
- Added `verbose` option to `XESImportOptions` (default: true)

## [0.4.0]

### Added
- Unified `Importable`/`Exportable` traits for EventLog, PetriNet, OCEL
- Format inference from file extensions
- Auto-bindings for Python

### Changed
- Module restructuring: discovery → `process_mining::discovery`, Petri nets → `process_mining::core::process_models`
- API: `import_from_path` / `export_to_path` (extension-based format inference)

### Breaking
- Old: `import_xes_file("log.xes")` → New: `EventLog::import_from_path("log.xes")`
