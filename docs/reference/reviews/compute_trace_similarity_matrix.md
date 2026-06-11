# Algorithm Review: compute_trace_similarity_matrix

## Algorithm ID & Domain
- **Registry ID**: `compute_trace_similarity_matrix`
- **Domain**: Process Analytics / Clustering

## Correctness Audit
- **Input/Output Contracts**:
  - Accepts `eventlog_handle` and `activity_key`.
  - Returns a JSON string of pairs of traces whose Jaccard similarity is > 0.5.
- **Boundary Checks**:
  - Validates that the handle points to a valid `StoredObject::EventLog`.
  - Pre-computes `HashSet<&str>` per trace first, which reduces complexity of pair lookups: `let trace_sets: Vec<HashSet<&str>> = ...`.
  - Correctly guards the division: `similarity = common as f64 / union.max(1) as f64` to prevent division-by-zero.
  - Filters results to only include pairs with similarity > 0.5 to prevent massive quadratic JSON payloads.
- **Edge Cases & Errors**:
  - Returns empty list of pairs if no two traces share similarity > 0.5.
  - Handles missing activity attributes safely.

## Improvement Areas
- **Performance Optimization**:
  - Pairwise similarity is O(N^2 * L) where N is number of traces and L is average trace length. For large logs (e.g. N = 10,000), this is 50,000,000 comparisons, which will easily cause timeout or OOM in WebAssembly. Can use MinHash/LSH (Locality Sensitive Hashing) to approximate similarity in linear time.
  - Hardcoded threshold of `0.5`. Allowing the user to pass a threshold parameter would make the function much more flexible.

## Code References
- **Rust Implementation**: `wasm4pm/src/final_analytics.rs` -> `compute_trace_similarity_matrix`
- **TypeScript dispatch**: `packages/kernel/src/api.ts` -> `runRaw`
- **Test file**: `packages/kernel/src/__tests__/algorithm-parity.test.ts`
