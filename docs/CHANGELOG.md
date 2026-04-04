# Changelog

## v26.4.5 (2026-04-04)

### Headline: Streaming Conformance Checking
- `store_dfg_from_json(json)` — deserialize a DFG JSON string into a stored object; bridges `discover_dfg` output (inline JSON) to handle-based APIs
- `streaming_conformance_begin(dfg_handle)` — open a streaming conformance session against a reference DFG
- `streaming_conformance_add_event(handle, case_id, activity)` — append one event to an open trace
- `streaming_conformance_close_trace(handle, case_id)` — replay trace against DFG, return conformance result (fitness, deviations)
- `streaming_conformance_stats(handle)` — live statistics: event_count, closed/open traces, conforming/deviating counts, avg_fitness
- `streaming_conformance_finalize(handle)` — flush open traces, return full summary, free session
- Memory model: **O(open_traces × avg_trace_length)** — identical to streaming DFG builder

### Browser Test Infrastructure
- Added headless Chromium test suite via `@vitest/browser` + Playwright
- Enabled all previously-skipped browser and type wrapper tests
- Fixed `FileReader`, `ProgressEvent`, `StorageEvent` polyfills for Node.js test environment
- Browser benchmark suite: 13+ algorithms × 4 log sizes, median/min/max/p95 metrics
- `benchmarks/compare.js`: Node.js vs Browser performance comparison CLI
- `benchmarks/dashboard.html`: interactive Chart.js benchmark dashboard

### Bug Fixes
- `WasmEventLog` and `WasmOCEL` constructors now export correctly via `#[wasm_bindgen(constructor)]` — previously methods threw "null pointer passed to rust"
- Fixed `npm test` script: use `build:nodejs` before unit tests, `build:web` before browser tests

### Test Improvements
- 72 unit tests passing (was 66), 44 integration tests passing (was 41)
- New `integration.test.ts` suite (16 tests): full init→load→discover→analyze workflow
- 4 streaming conformance tests covering conforming traces, deviations, stats, finalization

### Documentation
- `docs/BROWSER-BENCHMARKS.md` — new 359-line browser benchmarking guide
- Expanded `docs/DEPLOYMENT.md`, `docs/FAQ.md`, `docs/QUICKSTART.md`, `docs/README.md` with browser benchmark references

## 0.5.5

### Streaming / IoT Event Ingestion API
- `streaming_dfg_begin()` — open a streaming DFG session, returns handle
- `streaming_dfg_add_event(handle, case_id, activity)` — append one event to an open trace
- `streaming_dfg_add_batch(handle, events_json)` — bulk-add a JSON array of events
- `streaming_dfg_close_trace(handle, case_id)` — fold trace into running counts and free its buffer
- `streaming_dfg_flush_open(handle)` — close all currently-open traces at once
- `streaming_dfg_snapshot(handle)` — non-destructive DFG snapshot (same format as `discover_dfg`)
- `streaming_dfg_finalize(handle)` — flush, store DFG, free builder, return DFG handle
- `streaming_dfg_stats(handle)` — memory/progress statistics
- Memory model: **O(open_traces × avg_trace_length)** — closed traces live only in compact count tables; suitable for IoT and embedded pipelines

### Performance
- Single-pass columnar DFG: activities encoded as `u32` IDs; `FxHashMap<(u32,u32), usize>` edge counting (~6× smaller entries than string pairs)
- Marginal-gain Hill Climbing rewrite: 177× speedup on 50K-case logs (8.7 s → 49 ms)
- DECLARE columnar rewrite: ~26% faster via flat `bool` arrays reused across traces
- `FxHashMap` used throughout hot paths for O(1) fixed-width key hashing

## 0.5.4

- Add `stream_xes_bufread` function for streaming XES traces from a `BufRead` (supports gzipped input)
- Remove noisy `println!` in OCEL XML import for extended OCELs

## 0.5.3

- Parse XES version from log element
- Fix some missing unescapes in XML-based imports (XES, PNML)

## 0.5.2

- New `analysis` module with reusable analysis functions (also exposed as bindings ;))
  - `analysis::case_centric::dotted_chart`: Configurable multi-axis dotted chart generation (`DottedChartOptions`)
  - `analysis::case_centric::event_timestamp_histogram`: Aggregate event timestamps into bins grouped by activity (`EventTimestampOptions`)
  - `analysis::object_centric::object_attribute_changes`: Extract time-stamped attribute change history for an OCEL object

## 0.5.1
- Rename bindings function for SlimLinkedOCEL bindings (not breaking, as 0.5.0 bindings were not published yet)

## 0.5.0
- Fix SlimLinkedOCEL addObject function (previously did not correctly expand the reverse E2O/O2O reference array)
- Change error type of OCEL XML import to `OCELIOError` 
(**Breaking**), return error if XML does not contain any event or object types
  - Added related test (`test_xes_as_ocel_xml_import`) to ensure xes files are not correctly imported as OCEL
- Implement `Default` for SlimLinkedOCEL, add `new` function for SlimLinkedOCEL
- Expose SlimLinkedOCEL binding functions (e.g., for adding events/objects, getting relations, etc.)
- Implement From<...> for (bi-directional) conversion between (XES) `AttributeValue`s to `OCELAttributeValue`s
- Remove `Hash` derive from `OCELType` (**Breaking**)

## 0.4.4
- Fix version mismatch in macros crate

## 0.4.3
- Fix: typo in function name: `oc_declare_conformace` -> `oc_declare_conformance` (**Breaking**)

## 0.4.2
- **New OCEL CSV Format**
  - Added CSV format support for OCEL:
  - Added Importer/Exporter for CSV OCEL file format
  - Added CSV file format to OCEL io trait + known formats (as `.ocel.csv`)
- **Bindings Improvements**:
  - Exposed OC-DECLARE conformance function (`oc_declare_conformace`) to bindings
  - Renamed `discover_oc-declare` binding to `discover_oc_declare` (**Breaking for Bindings**)
  - Renamed `discover_dfg_from_locel` to `discover_dfg_from_ocel` (**Breaking**)
  - Added `SlimLinkedOCEL` <-> `OCEL` conversion support in bindings
  - Implemented `LinkedOCELAccess` trait support in bindings macro for more generic functions
  - Added `ocel_type_stats` binding to compute event/object type statistics
  - Exposed `flatten_ocel_on` function to bindings for flattening OCEL on object types
  - Exposed `add_init_exit_events_to_ocel` function to bindings
- **Other Fixes and Improvements**:
  - Fixed SQLite/DuckDB export to remove existing file before export (prevents UNIQUE constraint errors)
  - Combined/Deduped timestamp-related parsing functionality across files
  - Implemented `Null` as default `OCELAttributeValue`
- **Internal Improvements**:
  - Updated `rusqlite` and related dependencies
  - Improved CLI in `r4pm`

### Breaking Changes / Migration Guide
- The `From<OCELAttributeValue>` implementation for `OCELAttributeType` was removed. Instead, use the `get_type` function on `OCELAttributeValue` to retrieve its type.
- Updates related to io module for CSV parsing (e.g., new error variant in `OCELIOError`)
- Renamed binding `discover_oc-declare` to `discover_oc_declare`

## 0.4.1
- Added `verbose` option to `XESImportOptions`, defaulting to true
  - Note: Technically this is a breaking change, however the recommended way to use `XESImportOptions` is non-exhaustive with default fallback:
    - e.g., ```XESImportOptions {verbose: false, ..Default::default()}```

## 0.4.0

### Restructuring (Current)
- **Unified IO Traits**: Introduced `Importable` and `Exportable` traits in `process_mining::core::io` to standardize import and export operations across different data structures.
- **EventLog IO**: Implemented `Importable` and `Exportable` for `EventLog`, supporting JSON (`.json`), XES (`.xes`), and Gzipped XES (`.xes.gz`) formats.
- **PetriNet IO**: Implemented `Importable` and `Exportable` for `PetriNet`, supporting PNML (`.pnml`) format.
- **OCEL IO**: Implemented `Importable` and `Exportable` for Object-Centric Event Logs (OCEL), including support for SQLite and DuckDB (if features enabled).
- **Format Inference**: Added automatic format inference based on file extensions (e.g., `.xes`, `.xes.gz`, `.pnml`).
- **Auto-Bindings**: Added auto-binding functionality to facilitate Python bindings generation.
- **Module Restructuring**:
    - Moved Alpha+++ discovery to `process_mining::discovery`.
    - Moved Petri nets to `process_mining::core::process_models`.
    - Moved DFG discovery to `process_mining::discovery`.
- **API Simplification**: Users can now use generic `import_from_path` and `export_to_path` methods. These methods now strictly rely on file extension for format inference, removing the optional format argument.

### Features (Unreleased on crates.io)
- **KuzuDB Support**: Added initial support for OCEL export to KuzuDB.
- **DuckDB Support**: Added example for OCEL export to DuckDB.
- **Polars Export**: Added OCEL to Polars DataFrame export.
- **Object-Centric Process Trees**: Added implementation of object-centric process trees and abstraction-based conformance checking.
- **Token-Based Replay**: Implemented token-based replay on Petri nets.
- **Incidence Matrices**: Added incidence matrices for Petri nets.
- **Event Log Macros**: Implemented macros for easier event log creation.
- **OC-DECLARE**: Object-centric declarative process models, with discovery and conformance checking.

### Changed
- **Exposed Fields**: Exposed `OCLanguageAbstraction` fields.

### Migration Guide
- **Importing Event Logs**:
  - Old: `import_xes_file("log.xes")`
  - New: `EventLog::import_from_path("log.xes")`
- **Exporting Event Logs**:
  - New: `log.export_to_path("log.xes")`
- **Traits**: Ensure `process_mining::Importable` and `process_mining::Exportable` are in scope if you need to use the traits generically.
- **Format Specification**: If you need to specify a format explicitly (e.g., reading from a stream or non-standard extension), use `import_from_reader` or `export_to_writer` which still accept a format string.
