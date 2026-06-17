# Algorithm Review: simd_streaming_dfg

## Algorithm ID & Domain
- **Registry ID**: `simd_streaming_dfg`
- **Domain**: Process Discovery (Streaming DFG construction)

## Correctness Audit
- **Input/Output Contracts**: 
  - Accepts `eventlog_handle` and `activity_key`.
  - Returns the accumulated DFG JSON model.
- **Boundary Checks**:
  - Incremental trace ingestion via `add_trace()` and `add_events()`.
  - Memory scales with the number of unique activities and edges, rather than total events: `O(unique_activities + unique_edges)`.
  - Alignments: `node_counts` is padded to 4-element alignment via `(max_id as usize + 4) & !3` to enable safe vector operations.
- **SIMD Intrinsics**:
  - On `wasm32` targets, the compiler uses `std::arch::wasm32` vector instructions (`i32x4_add` lanes) to bulk-increment node frequencies.
  - Safe fallback: on non-wasm32 targets or if SIMD is disabled, a 4x loop-unrolled scalar fallback is executed.

## Improvement Areas
- **Performance Optimization**:
  - `simd_available` is determined at compile-time (`true` for `wasm32`, `false` for others). On native x86/ARM platforms, we could use runtime dynamic CPU feature detection (e.g., `is_x86_feature_detected!("sse2")`) to enable SIMD execution when compiled for native platforms rather than falling back to scalar.
- **Logic Refinement**:
  - For edge frequency counting, SIMD cannot be used directly due to random hash insertions. An unrolled array/matrix could replace `FxHashMap` for dense graphs to fully utilize vector loads.

## Code References
- **Rust Implementation**: `wasm4pm/src/simd_streaming_dfg.rs` -> `discover_dfg_simd`, `discover_dfg_simd_handle`, `SimdStreamingDfg`
- **TypeScript dispatch**: `packages/kernel/src/api.ts` -> `runRaw`
- **Test file**: `packages/kernel/src/__tests__/algorithm-oracles.test.ts`
