# Algorithm Review: a_star

## Algorithm ID & Domain
- **Registry ID**: `a_star`
- **Domain**: Process Discovery (Informed search for DFG edges)

## Correctness Audit
- **Input/Output Contracts**: 
  - Accepts `eventlog_handle`, `activity_key`, and `max_iterations`.
  - Returns a DFG JSON model along with the number of iterations used.
- **Boundary Checks**:
  - Division by zero guard: `directly_follows.len().max(1)` is used to normalize `edge_penalty`.
  - To prevent memory exhaustion, the algorithm sorts the open set descending by score and truncates it to `128` items, executing a beam search.
- **Crucial Bug Fix**:
  - Fixed a prior bug where the best score was only compared against the popped parent's score (which is always 0 on the first iteration). The code now correctly compares candidates in the frontier:
    ```rust
    for (cand_dfg, cand_score) in &new_candidates {
        if *cand_score > best_score {
            best_score = *cand_score;
            best_dfg = cand_dfg.clone();
        }
    }
    ```
    This ensures the returned DFG correctly reflects the best model found during search.

## Improvement Areas
- **Performance Optimization**:
  - **MAJOR BOTTLENECK**: Every edge candidate generation clones the entire DFG: `new_dfg = current_dfg.clone()`. It then runs `evaluate_dfg_partial_fitness` which performs a full pass over all events and trace windows in the log. For large logs, this makes A* search extremely slow.
  - Recommendation: Implement incremental fitness calculation. Since only a single edge is added at a time, we can compute the change in fitness locally instead of re-iterating over the entire event log.

## Code References
- **Rust Implementation**: `wasm4pm/src/fast_discovery.rs` -> `discover_astar`, `discover_astar_from_log`, `evaluate_dfg_partial_fitness`
- **TypeScript dispatch**: `packages/kernel/src/api.ts` -> `runRaw`
- **Test file**: `packages/kernel/src/__tests__/discovery-otel-spans.test.ts`
