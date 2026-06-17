# Algorithm Review: compute_activity_transition_matrix

## Algorithm ID & Domain
- **Registry ID**: `compute_activity_transition_matrix`
- **Domain**: Process Analytics / Markov Chains

## Correctness Audit
- **Input/Output Contracts**:
  - Accepts `eventlog_handle` and `activity_key`.
  - Returns transition probabilities as JSON matrix: `{"matrix": [{"from": "A", "to": "B", "count": 5, "probability": 0.5}], "num_activities": 2}`.
- **Boundary Checks**:
  - Validates that the handle points to a valid `StoredObject::EventLog`.
  - Builds a vocabulary lookup table: `vocab: HashMap<String, u32>`.
  - Iterates over event windows of size 2. Checks for attribute existence and extracts transition pairs.
  - Calculates probability: `*count as f64 / activity_total.get(from).copied().unwrap_or(1) as f64`. The `unwrap_or(1)` guard prevents division-by-zero.
- **Edge Cases & Errors**:
  - Returns empty matrix if there are fewer than 2 events in all traces.
  - Safely handles missing activities or unknown keys in traces by skipping them.

## Improvement Areas
- **Performance Optimization**:
  - Multiple string lookups: calls `vocab.get(a1)` and `vocab.get(a2)` on every event transition. Since the log is often already columnar, this can be done directly on the integer event codes without string keys.
  - Memory consumption: builds a large JSON value representing the matrix and serializes it. For processes with hundreds of activities, the matrix is sparse but contains many zero transitions. Returning only non-zero transitions is good, but the serialization format is verbose.

## Code References
- **Rust Implementation**: `wasm4pm/src/final_analytics.rs` -> `compute_activity_transition_matrix`
- **TypeScript dispatch**: `packages/kernel/src/api.ts` -> `runRaw`
- **Test file**: `packages/kernel/src/__tests__/algorithm-parity.test.ts`
