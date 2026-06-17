# Algorithm Review: aco (Ant Colony Optimization)

## Algorithm ID & Domain
- **Registry ID**: `aco`
- **Domain**: Process Discovery (Metaheuristic DFG optimization)

## Correctness Audit
- **Input/Output Contracts**: 
  - Accepts `eventlog_handle`, `activity_key`, `num_ants` / `ant_count` (usize), and `iterations` (usize).
  - Returns the best DFG JSON and its final fitness.
- **Boundary Checks**:
  - Validates inputs: returns `None` if `ant_count < 1` or `iterations == 0`.
  - Safely handles cases with no directly-follows relationships by returning `None` early.
- **Crucial Correctness Fixes**:
  - **Pheromone MMAS Bounds**: Implements MMAS-style pheromone clamping `[tau_min, tau_max]`:
    ```rust
    for val in pheromone.values_mut() {
        *val = val.clamp(tau_min, tau_max);
    }
    ```
    Without clamping, pheromone values grow indefinitely with each iteration, drowning out the heuristic factor and causing ants to select all edges.
  - **NaN/Inf Sanity**: Sanitizes the probability calculation to prevent propagation of NaN:
    ```rust
    let prob = if prob.is_finite() { prob } else { 0.0 };
    ```
    Also sanitizes fitness results, mapping non-finite values (NaN/Inf) to `0.0` to prevent corruption of the pheromone map.

## Improvement Areas
- **Performance Optimization**:
  - The probability equation: `prob = tau.powf(alpha) * eta.powf(beta)` relies on slow float `powf`. Since `alpha` is fixed at `1.0` and `beta` is fixed at `2.0` in the codebase, we should simplify this to `prob = tau * eta * eta` to eliminate costly transcendental functions.
- **Code Delegating**:
  - `discover_ant_colony` in `more_discovery.rs` delegates straight to `discover_aco_algorithm` in `genetic_discovery.rs`.

## Code References
- **Rust Implementation**: `wasm4pm/src/genetic_discovery.rs` -> `discover_aco_algorithm`, `discover_aco_algorithm_from_log`
- **TypeScript dispatch**: `packages/kernel/src/api.ts` -> `runRaw`
- **Test file**: `packages/kernel/src/__tests__/algorithm-parity.test.ts`
