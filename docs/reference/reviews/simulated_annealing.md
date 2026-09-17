<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/docs/reference/reviews/simulated_annealing.md; source-sha256: a29ee6ad568ff5d0d29f43df76b1dae3dea04d772b1648d5c96be58d98bd8497; reason: tooling or agent control surface -->

# Algorithm Review: simulated_annealing

## Algorithm ID & Domain
- **Registry ID**: `simulated_annealing`
- **Domain**: Process Discovery (Metaheuristic DFG optimization)

## Correctness Audit
- **Input/Output Contracts**: 
  - Accepts `eventlog_handle`, `activity_key`, `temperature` (f64), and `cooling_rate` (f64).
  - Returns the best DFG JSON and its fitness.
- **Boundary Checks**:
  - Checks if `temperature <= 0.0` or `cooling_rate <= 0.0 || cooling_rate >= 1.0` and exits early if so.
- **Crucial Correctness Fixes**:
  - Clamps temperature `temperature.clamp(0.02, 1.0e6)` to prevent infinite loops (for very high temperatures) and NaN issues.
  - Treats NaN deltas as false to avoid loop poisoning:
    ```rust
    let accept = if delta.is_nan() {
        false
    } else {
        delta >= 0.0 || rng.gen::<f64>() < (delta / temp).exp()
    };
    ```
- **Memory Optimization**:
  - Mutates `current_edges` in place and rolls back using an enum `Move` (`Removed` or `Added`) to undo the change if rejected. This gives `O(1)` allocations in the annealing loop instead of copying the edge set.

## Improvement Areas
- **Performance Optimization**:
  - Like other metaheuristics, simulated annealing calls `evaluate_edges_fitness` on every iteration. This loop can be optimized by caching active trace matches.

## Code References
- **Rust Implementation**: `wasm4pm/src/more_discovery.rs` -> `discover_simulated_annealing`, `discover_simulated_annealing_from_log`
- **TypeScript dispatch**: `packages/kernel/src/api.ts` -> `runRaw`
- **Test file**: `packages/kernel/src/__tests__/discovery-otel-spans.test.ts`
