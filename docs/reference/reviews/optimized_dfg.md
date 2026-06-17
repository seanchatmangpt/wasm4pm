# Algorithm Review: optimized_dfg

## Algorithm ID & Domain
- **Registry ID**: `optimized_dfg`
- **Domain**: Process Discovery

## Correctness Audit
- **Input/Output Contracts**: 
  - Accepts `eventlog_handle` and `activity_key`.
  - Returns the standard DFG JSON structure.
- **Boundary Checks**:
  - Leverages the same implementation as the standard `dfg` algorithm (`discover_dfg`).
  - Pre-sizes the internal hash map for edge frequencies using `n.saturating_mul(n) / 4 + 1` to prevent rehashing and arithmetic overflow.
  - Correctly derives the activity count directly from DFG nodes instead of executing a second full pass over the log, reducing complexity to a single pass.
- **Edge Cases**:
  - Handles empty logs safely by returning empty collections without throwing errors or panic.

## Improvement Areas
- **Performance Optimization**:
  - Identical to `dfg`. Caching the columnar log representation globally in `get_or_init_state()` would eliminate redundant string tokenization and column reconstruction during sequential runs of different algorithms.

## Code References
- **Rust Implementation**: `wasm4pm/src/discovery.rs` -> `discover_dfg`, `discover_dfg_from_log`
- **TypeScript dispatch**: `packages/kernel/src/api.ts` -> `runRaw`
- **Test file**: `packages/kernel/src/__tests__/discovery-otel-spans.test.ts`
