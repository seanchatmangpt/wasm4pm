# WASM Boundary Functions — Native Test Limitations

**Version:** v26.5.19  
**Last updated:** 2026-05-15

---

## What Is a WASM Boundary?

A function marked `#[wasm_bindgen]` that returns `JsValue` or `Result<JsValue, JsValue>`
**CANNOT** be called from native Rust integration tests because:

1. `JsValue` requires a JavaScript heap, which does not exist in a native binary
2. Calling these functions in native tests panics at `wasm_bindgen` initialization
3. The payload is a JavaScript opaque value — not inspectable as Rust types

### Pure-Rust Twin Pattern

Every WASM boundary function has an underlying pure-Rust function:

- Takes and returns Rust-native types (no `JsValue`)
- Unit-tested in native via `cargo test`
- Called by the WASM wrapper as `to_js_str(&inner_function(...))`

---

## Boundary Function Catalog

### `src/streaming_wasm.rs` — 18 WASM-boundary functions

All functions in `streaming_wasm.rs` are `#[wasm_bindgen]` and return `JsValue`.
Their pure-Rust twins live in `src/streaming/`.

| Function                          | Pure-Rust Twin                                           | Native Test Coverage                        |
| --------------------------------- | -------------------------------------------------------- | ------------------------------------------- |
| `streaming_dfg_begin`             | `StreamingDfgBuilder::new()`                             | `remaining_capabilities_real_data_tests.rs` |
| `streaming_dfg_add_event`         | `StreamingDfgBuilder::add_event()`                       | tested                                      |
| `streaming_dfg_add_batch`         | `StreamingDfgBuilder::add_event()` loop                  | tested                                      |
| `streaming_dfg_close_trace`       | `StreamingDfgBuilder::close_trace()`                     | tested                                      |
| `streaming_dfg_flush_open`        | iterates `open_traces`                                   | tested                                      |
| `streaming_dfg_snapshot`          | `StreamingDfgBuilder::snapshot()`                        | tested                                      |
| `streaming_dfg_finalize`          | snapshot + store_object                                  | tested                                      |
| `streaming_dfg_stats`             | `StreamingDfgBuilder::stats()`                           | tested                                      |
| `streaming_skeleton_begin`        | `StreamingSkeletonBuilder::with_min_frequency()`         | tested                                      |
| `streaming_skeleton_add_event`    | `StreamingSkeletonBuilder::add_event()`                  | tested                                      |
| `streaming_skeleton_close_trace`  | twin `close_trace`                                       | tested                                      |
| `streaming_skeleton_snapshot`     | twin `snapshot`                                          | tested                                      |
| `streaming_skeleton_finalize`     | combines snapshot + store                                | tested                                      |
| `streaming_heuristic_begin`       | `StreamingHeuristicBuilder::with_dependency_threshold()` | tested                                      |
| `streaming_heuristic_add_event`   | twin `add_event`                                         | tested                                      |
| `streaming_heuristic_close_trace` | twin `close_trace`                                       | tested                                      |
| `streaming_heuristic_snapshot`    | twin `snapshot`                                          | tested                                      |
| `streaming_heuristic_finalize`    | twin + store                                             | tested                                      |

> **Note:** `streaming_info()` returns `String` not `JsValue` — callable natively, NOT a boundary function despite `#[wasm_bindgen]`.

---

### `src/advanced_algorithms.rs` — 2 WASM-boundary functions

| Function                   | Feature Gate         | Why Boundary                            | Pure-Rust Twin               | Status                            |
| -------------------------- | -------------------- | --------------------------------------- | ---------------------------- | --------------------------------- |
| `detect_bottlenecks`       | `discovery_advanced` | Returns `JsValue`; requires state store | inner loop over `log.traces` | `coverage_gap_real_data_tests.rs` |
| `analyze_infrequent_paths` | `discovery_advanced` | Returns `JsValue`; requires state store | inner loop over `log.traces` | `coverage_gap_real_data_tests.rs` |

---

### `src/causal_graph.rs` — 2 WASM-boundary functions

> **Note:** `discover_causal_graph` does NOT exist. Actual exports:

| Function                    | Feature Gate         | Pure-Rust Twin             | Status                  |
| --------------------------- | -------------------- | -------------------------- | ----------------------- |
| `discover_causal_alpha`     | `discovery_advanced` | `build_causal_alpha()`     | WASM boundary uncovered |
| `discover_causal_heuristic` | `discovery_advanced` | `build_causal_heuristic()` | WASM boundary uncovered |

---

### `src/ensemble.rs` — 1 WASM-boundary function

| Function              | Status                 | Note                                         |
| --------------------- | ---------------------- | -------------------------------------------- |
| `dfg_threshold_sweep` | `#[ignore]` tests only | Renamed from `ensemble_discover` in v26.5.19 |

---

## Boundary Status Definitions

| Status                      | Meaning                                                  |
| --------------------------- | -------------------------------------------------------- |
| `pure_rust_tested`          | Pure-Rust twin is covered by real-data tests             |
| `wasm_wrapper_smoke_tested` | WASM wrapper is called in integration tests              |
| `wasm_boundary_uncovered`   | Neither twin nor wrapper has real-data test coverage     |
| `blocked`                   | Function is placeholder / POC — excluded from production |

---

## Testing Strategy

For each WASM boundary function:

1. **Extract the inner algorithm** into a `pub fn _from_log(log: &EventLog, ...)` function
2. **Test the inner function** in a `*_real_data_tests.rs` file with real XES/OCEL data
3. **Document the wrapper** in this file with its twin and coverage status

See `tests/remaining_capabilities_real_data_tests.rs` for the streaming example.
