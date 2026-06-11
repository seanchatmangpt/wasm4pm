# Algorithm Review: hierarchical_dfg

## Algorithm ID & Domain
- **Registry ID**: `hierarchical_dfg`
- **Domain**: Process Discovery

## Correctness Audit
- **Input/Output Contracts**: 
  - Accepts `eventlog_handle`, `activity_key`, and `num_chunks` (or `max_chunk_events`).
  - Returns the merged DFG JSON.
- **Boundary Checks**:
  - Validation: rejects `num_chunks == 0` or `max_chunk_events == 0` with a JS error early.
  - Safe partition bounds: distributes traces round-robin into `num_chunks` buckets. If the log is smaller than the requested chunks, the actual chunk count is clamped to `traces.len()`.
  - Merging: uses `models.into_iter().reduce(...)` which is safe against empty lists because the early check `if total_traces == 0` returns a default structure.
- **Algebraic Invariance**:
  - The merged DFG is algebraically identical to a monolithic DFG discovered on the same log (verified via test suite parity).

## Improvement Areas
- **Performance Optimization**:
  - The partition scheme distributes traces round-robin. For cache efficiency, partitioning into contiguous blocks of traces (`traces[offset..offset + len]`) would improve locality and speed up `discover_local`.
  - Creating separate `DfgChunkResult` structures per chunk results in multiple allocations. Reusing thread-local builders or a thread pool (on native targets) would accelerate the process.

## Code References
- **Rust Implementation**: `wasm4pm/src/hierarchical.rs` -> `discover_dfg_hierarchical`, `discover_dfg_hierarchical_by_events`, `discover_hierarchical`
- **TypeScript dispatch**: `packages/kernel/src/api.ts` -> `runRaw`
- **Test file**: `packages/kernel/src/__tests__/algorithm-parity.test.ts`
