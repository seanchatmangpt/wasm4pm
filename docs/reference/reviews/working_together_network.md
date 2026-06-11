# Algorithm Review: working_together_network

## Algorithm ID & Domain
- **Registry ID**: `working_together_network`
- **Domain**: Social Network / Organizational Mining

## Correctness Audit
- **Input/Output Contracts**:
  - Accepts `log_handle` (EventLog handle) and `resource_key` (event attribute name).
  - Returns a JSON string representing a network with `nodes` (id, label) and `edges` (from, to, co_occurrences).
- **Boundary Checks**:
  - Retrieves the log from state using `get_or_init_state().with_object(log_handle, |obj| ...)` and validates the object type.
  - Dedupes resources within a single trace by collecting them into a local `HashSet<String>` before processing pairs, ensuring that multiple events by the same resource in one trace do not inflate the co-occurrence metric.
- **Edge Cases & Errors**:
  - Eliminates trace order dependency for co-occurrence relations by sorting the unique resource list in each trace: `let mut sorted: Vec<&String> = resources.iter().collect(); sorted.sort();`. This ensures the co-occurrence edge key `(sorted[i], sorted[j])` is always ordered lexicographically, preventing duplicate bidirectional edges like `(A, B)` and `(B, A)`.
  - Safely handles missing resource attributes via `filter_map` and `as_string()`.

## Improvement Areas
- **Performance Optimization**:
  - The combination of sorting and nested loops has `O(N^2)` time complexity where `N` is the number of distinct resources in a single trace. For logs with very large traces containing hundreds of distinct resources, this can become a CPU bottleneck. Imposing a maximum team size limit or using a more sparse graph representation would prevent potential timeouts.
  - High degree of memory allocations: converts `resources` set to a vector of references, sorts them, and then allocates a tuple of strings for every pair `(sorted[i].clone(), sorted[j].clone())` to insert into the hash map. String interning or using `FxHashMap` with sorted integer ID pairs would optimize this drastically.

## Code References
- **Rust Implementation**: `wasm4pm/src/social_network.rs` -> `discover_working_together_network`, `discover_working_together_network_from_log`
- **TypeScript dispatch**: `packages/kernel/src/api.ts` -> `runRaw`
- **Test file**: `packages/kernel/src/__tests__/algorithm-parity.test.ts`
