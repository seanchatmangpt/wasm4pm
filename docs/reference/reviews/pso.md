# Algorithm Review: pso (Particle Swarm Optimization)

## Algorithm ID & Domain
- **Registry ID**: `pso`
- **Domain**: Process Discovery (Metaheuristic DFG optimization)

## Correctness Audit
- **Input/Output Contracts**: 
  - Accepts `eventlog_handle`, `activity_key`, `swarm_size` (usize), and `iterations` (usize).
  - Returns the best-discovered DFG and its fitness.
- **Boundary Checks**:
  - Validates `swarm_size >= 1` and `iterations >= 1`, returning `None` if unsatisfied.
  - Returns `None` (`"no_edges"`) early if there are no directly-follows relationships in the log.
- **Crucial Bug Fix**:
  - A prior bug only updated `pbest_fitness` while leaving the `pbest` position at its initial value. This has been corrected:
    ```rust
    if new_fitness > *pbest_fitness {
        *pbest_fitness = new_fitness;
        *pbest = edge_set.clone();
    }
    ```
    This ensures particles correctly pull toward their personal best positions rather than an empty set.

## Improvement Areas
- **Performance Optimization**:
  - `blend_edges_seeded` creates fresh `HashSet` instances on every iteration. This causes a massive number of heap allocations when running many iterations. Implementing in-place blending (e.g. mutating the source set) would reduce allocation latency.
- **Logic Refinement**:
  - The inertia and acceleration weights in PSO (pull toward pbest=0.2, pull toward gbest=0.3) are hardcoded. Exposing these coefficients would allow users to tune exploration vs. exploitation trade-offs.

## Code References
- **Rust Implementation**: `wasm4pm/src/genetic_discovery.rs` -> `discover_pso_algorithm`, `discover_pso_algorithm_from_log`
- **TypeScript dispatch**: `packages/kernel/src/api.ts` -> `runRaw`
- **Test file**: `packages/kernel/src/__tests__/algorithm-parity.test.ts`
