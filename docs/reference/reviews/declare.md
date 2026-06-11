# Algorithm Review: declare

## Algorithm ID & Domain
- **Registry ID**: `declare`
- **Domain**: Process Discovery (Declarative constraints discovery)

## Correctness Audit
- **Input/Output Contracts**: 
  - Accepts `eventlog_handle` and `activity_key`.
  - Returns a JSON string containing the discovered `activities` and `constraints` list (Existence, Absence, CoExistence, NotCoExistence, Response, Precedence, Succession, ChainResponse, ChainPrecedence).
- **Boundary Checks & Bugs**:
  - **CRITICAL CORRECTNESS BUG**: The `TraceProfile` structure restricts the maximum recorded event index to 255:
    ```rust
    if position < 256 {
        if self.first_positions[activity_idx] == u8::MAX {
            self.first_positions[activity_idx] = position as u8;
        }
        self.last_positions[activity_idx] = position as u8;
    }
    ```
    For long traces containing 256 or more events, activities occurring at index 256 or later are ignored. They will be treated as absent, corrupting constraint support and confidence calculations.
  - **U128 activity mask**: The `activity_mask` is restricted to `activity_idx < 128`. However, `activity_mask` is not used in the Phase 2 analysis, so this does not cause functional errors.
  - Early exit for empty logs (`n == 0 || total_cases == 0`) prevents division by zero in support calculations.

## Improvement Areas
- **Correctness Optimization**:
  - Refactor `first_positions` and `last_positions` vectors to store `u32` or `usize` and remove the `position < 256` clamp, supporting arbitrarily long trace sequences.
- **Performance Optimization**:
  - Avoid creating a new `TraceProfile` per trace inside the loop. Reusing a single profile structure (by clearing / resetting its fields) will save memory allocations.
  - Phase 2 contains nested loops to evaluate all activity pairs: `O(N^2 * T)` where `N` is vocabulary size and `T` is trace count. This is slow for large vocabularies. Using bitsets on `activity_mask` to filter out non-co-occurring pairs before evaluating templates would speed up execution.

## Code References
- **Rust Implementation**: `wasm4pm/src/discovery.rs` -> `discover_declare`, `TraceProfile`
- **TypeScript dispatch**: `packages/kernel/src/api.ts` -> `runRaw`
- **Test file**: `packages/kernel/src/__tests__/algorithm-parity.test.ts`
