# Algorithm Review: hill_climbing

## Algorithm ID & Domain
- **Registry ID**: `hill_climbing`
- **Domain**: Process Discovery (Greedy local DFG optimization)

## Correctness Audit
- **Input/Output Contracts**: 
  - Accepts `eventlog_handle` and `activity_key`.
  - Returns the optimized DFG JSON.
- **Boundary Checks**:
  - Employs deterministic sorting: candidate edges are sorted by ascending observed frequency so that less frequent edges are evaluated for removal first.
  - Safe bounds: terminates when `current_edges.len() <= 1` or when no further improvements are found, avoiding infinite loops.
- **Memory Optimization**:
  - The implementation performs in-place edge removal, fitness evaluation, and backtracking on failure:
    ```rust
    current_edges.remove(&edge);
    let trial_fitness = evaluate_edges_fitness(&current_edges, &col, edge_vocab_len);
    if trial_fitness >= current_fitness - f64::EPSILON {
        current_fitness = trial_fitness;
        improved = true;
        break;
    } else {
        current_edges.insert(edge);
    }
    ```
    This turns `O(edges²)` set allocations into `O(1)` set mutations, avoiding memory allocations in the greedy search loop.

## Improvement Areas
- **Performance Optimization**:
  - Although set allocations are eliminated, the algorithm still calls `evaluate_edges_fitness` (which iterates over the entire log) for every edge deletion trial. If the log is large, this is still slow.
  - Recommendation: Cache which traces are violated by which edges, allowing local updates to the fitness score upon edge deletion without iterating over the log.

## Code References
- **Rust Implementation**: `wasm4pm/src/fast_discovery.rs` -> `discover_hill_climbing`, `discover_hill_climbing_from_log`
- **TypeScript dispatch**: `packages/kernel/src/api.ts` -> `runRaw`
- **Test file**: `packages/kernel/src/__tests__/discovery-otel-spans.test.ts`
