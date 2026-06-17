# Algorithm Review: performance_spectrum

## Algorithm ID & Domain
- **Algorithm ID**: `performance_spectrum`
- **Domain**: Process Mining / Discovery (Performance Spectrum / Activity Transition Duration Analysis)

## Correctness Audit
- **Early Exit Guards**:
  - The loop checks `let next_idx = i + 1;` and stops if `next_idx >= events.len()` (lines 81-84), preventing out-of-bounds access.
- **Division-by-Zero Protection**:
  - In computing average duration: `let mean_d = if count > 0 { sum / count as f64 } else { 0.0 };` (line 130), protecting against division by zero.
  - In median calculation: `if count % 2 == 0 && count >= 2` (lines 133-137) is used to split even/odd, and defaults to `0.0` if `count` is 0. This is safe.
- **Timestamp Parsing Defect**:
  - The timestamp parsing logic (lines 86-92 and 99-108) only retrieves attributes that match `AttributeValue::Date(s)`:
    ```rust
    if let AttributeValue::Date(s) = v {
        parse_timestamp_ms(s)
    } else {
        None
    }
    ```
  - However, in other algorithms (like forecasting and regression), timestamps stored as strings (`AttributeValue::String`) are also supported. If an event log stores timestamps as strings, `discover_performance_spectrum` will return `None` and silently ignore those events. This makes the performance spectrum analysis return empty results for logs that parse successfully in other algorithms.

## Improvement Areas
- **Support String Timestamps**:
  - The timestamp matcher should be updated to support both `AttributeValue::Date` and `AttributeValue::String` to match the project's standard timestamp parsing behavior.
- **Optimize Key String Allocations**:
  - The grouping map uses string keys: `let key = (event_name.to_string(), next_act.to_string());` (line 113), which causes string allocations for every matching transition. Mapping activity names to `u32` IDs first would eliminate these heap allocations.

## Code References
- **Rust Implementation**: `wasm4pm/src/performance_spectrum.rs` (method: `discover_performance_spectrum` / `discover_performance_spectrum_wasm`)
- **TypeScript Dispatch Wrapper**: `packages/kernel/src/api.ts` (method: `runRaw`, case `performance_spectrum`)
- **Test File**: `packages/kernel/src/__tests__/algorithm-parity.test.ts`
