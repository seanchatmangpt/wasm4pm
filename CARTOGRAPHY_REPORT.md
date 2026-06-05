# Cartography Report: wasm4pm-compat Boundary Integration

## Mission
Map all wasm4pm process-evidence structures and classify which should be replaced by wasm4pm-compat v26.6.5, wrapped, or kept as execution state.

## Boundary Law
wasm4pm-compat is the court of admissibility (structure, admission, refusal, loss policy, receipt shape, graduation candidates).
wasm4pm is the execution authority (mining, conformance, replay, verification, receipt production).

## Inventory

| Path | Symbol | Current Role | Compat Equivalent | Classification | Refactor Recommendation | Risk |
|---|---|---|---|---|---|---|
| `crates/wasm4pm-types/src/event_log.rs`, `wasm4pm/src/models.rs` | `EventLog`, `Trace`, `Event` | Schema carrier / Raw evidence | `compat::EventLog`, `compat::Trace` | A (Replace) | Replace with compat's admitted evidence or graduation candidate. Raw external evidence must go through compat admission. | High |
| `crates/pm-core/src/log.rs` | `XesLog`, `XesTrace`, `XesEvent` | XES-specific structural types | `compat::EventLog` | A (Replace) | Replace with compat types; use compat's XES parser for admission. | Medium |
| `crates/wasm4pm-types/src/ocel.rs`, `crates/ocel-core/src/lib.rs`, `wasm4pm/src/models.rs` | `OCEL`, `OcelEvent`, `OcelObject` | Schema carrier for OCEL evidence | `compat::OCEL` | A (Replace) | Replace with compat's structural OCEL types. Admission handled by compat. | High |
| `crates/wasm4pm-types/src/models.rs`, `crates/pm-core/src/petri_net.rs`, `wasm4pm/src/models.rs` | `PetriNet`, `DFG`, `DeclareModel` | Structural graphs for discovery/conformance | `compat::PetriNet`, `compat::DFG`, `compat::Declare` | A (Replace) | Replace structures, but keep algorithms (mining, playout) in wasm4pm. | High |
| `wasm4pm/src/powl_models.rs`, `crates/pm-core/src/process_tree.rs` | `PowlModel`, `ProcessTree` | Structural process representations | `compat::PowlModel`, `compat::ProcessTree` | A (Replace) | Replace structural definitions with compat structures. | Medium |
| `crates/wasm4pm-types/src/import/xes/*` | `XESOuterLogData`, `XESImportOptions` | Format parsing / raw evidence admission | `compat::formats::xes::*` | A (Replace) | Move all raw admission/parsing to compat. wasm4pm consumes the admitted evidence. | High |
| `crates/wasm4pm-types/src/conformance.rs` | `ConformanceResult` | Conformance verdict structure | `compat::ConformanceVerdict` | B (Wrap) / C (Keep) | If it's a structural schema carrier for verdicts, use compat. Wrap it with execution context. | Medium |
| `wasm4pm/src/powl/conformance/token_replay.rs` | `TraceReplayResult` | Replay execution state / result | N/A | C (Keep) | Keep in wasm4pm. Execution/replay outputs belong to the execution authority. | Low |
| `wasm4pm/src/conformance_authority/mod.rs` | `ConformanceVerdicts`, `ConformanceCertificate` | Execution result / produced receipts / validation | N/A | C (Keep) | Keep in wasm4pm. They are execution/verification results, though they should ground back to compat evidence. | Low |
| `wasm4pm/src/automembrane.rs` | `VerdictReceipt` | Verification receipt | N/A | C (Keep) | Keep in wasm4pm. | Low |
| `wasm4pm/src/conformance_cache.rs` | `ConformanceCache` | Runtime/execution state | N/A | C (Keep) | Keep in wasm4pm. | Low |
| `crates/pm-core/src/performance.rs` | `PerformanceSpectrum` | Computed metric state | N/A | C (Keep) | Keep in wasm4pm. Computed metrics are execution outputs. | Low |
| `wasm4pm/src/receipt.rs` | `ReceiptFinding`, `ReceiptDoctorReport` | Receipt validation structures | N/A | C (Keep) | Keep in wasm4pm. Execution-layer verification. | Low |
| `wasm4pm/src/drift_manager.rs` | `TraceSnapshot` | Streaming execution state | N/A | C (Keep) | Keep in wasm4pm. | Low |
| `wasm4pm/src/pattern_analysis.rs` | `TraceStructureAnalysis` | Algorithm output / metrics | N/A | C (Keep) | Keep in wasm4pm. | Low |
| `wasm4pm/src/mining/mod.rs`, `wasm4pm/src/powl/discovery/*` | Mining algorithm states | Algorithm execution state | N/A | C (Keep) | Keep in wasm4pm. Execution layer. | Low |

## Classification Key
- **A = Replace with compat**: The type is purely structural process evidence, an admission boundary, or a graduation candidate.
- **B = Wrap compat type**: The type bridges structural admissibility and execution-layer state.
- **C = Keep in wasm4pm**: The type represents runtime execution, computed metrics, algorithm state, kernel state, replay state, or produced receipts.
- **D = Unclear / Needs architect review**: Ambiguous boundary requiring further analysis.

## Proposed Minimal Patch Order

1. **Add Dependency**: Add `wasm4pm-compat` v26.6.5 to the workspace root `Cargo.toml`.
2. **Admission Boundary (EventLog/OCEL)**: Update `wasm4pm` file ingestion entrypoints (CLI/API) to parse and admit using `wasm4pm-compat`.
3. **Execution Bridge (EventLog/OCEL)**: Create execution adapters in `wasm4pm` that accept `compat::EventLog` or `compat::OCEL` graduation candidates instead of raw data.
4. **Structural Replacement (Models)**: Systematically replace duplicate models (`PetriNet`, `DFG`, `DeclareModel`, `ProcessTree`, `PowlModel`) in `crates/pm-core`, `crates/wasm4pm-types`, and `wasm4pm/src/models.rs` with `compat` equivalents.
5. **Clean up Internal Types**: Remove `crates/wasm4pm-types/src/event_log.rs`, `crates/pm-core/src/log.rs`, and XES import logic. Replace with `wasm4pm-compat` structures.
6. **Receipt Grounding**: Update `ConformanceCertificate` and `VerdictReceipt` to reference the newly admitted compat evidence (preserving witness markers and loss policies).
7. **Verification**: Run `cargo check`, `cargo test`, and `release:verify-algorithm-behavior` to ensure the admission boundary is air-tight and no raw evidence bypasses the execution gates.
