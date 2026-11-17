<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: docs/reference/reviews/pso.md; source-sha256: 02d8bb87fe861630c8025c8117854c59cdb083ffa5a44024d73115cb6315a71e; reason: canonical Diátaxis or ADR surface -->

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
- **Update Semantics** (commit `227bd51ad`):
  - Canonical PSO velocity update: `v = w·v + c1·r1·(pbest − x) + c2·r2·(gbest − x)`
    with linear inertia decay `w` 0.9 → 0.4, `c1 = c2 = 2.0`, and velocity clamped
    to `[−vmax, vmax]` with `vmax = 2.0`. Positions are a continuous `[0,1]`
    relaxation of the edge set, decoded at threshold 0.5.
  - Pre-`227bd51ad` the "PSO" was a stochastic pbest/gbest blend (no velocity or
    inertia term); that blend-based update is gone.
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
  - Pre-`227bd51ad` the PSO step used `blend_edges_seeded`, which allocates fresh
    `HashSet` instances per iteration. The committed velocity update removes this
    from the PSO path; the helper remains for the genetic-algorithm crossover.
- **Logic Refinement**:
  - The PSO constants (`W_START = 0.9`, `W_END = 0.4`, `c1 = c2 = 2.0`,
    `vmax = 2.0`) are hardcoded. Exposing these coefficients would allow users to
    tune exploration vs. exploitation trade-offs.

## Code References
- **Rust Implementation**: `wasm4pm/src/genetic_discovery.rs` -> `discover_pso_algorithm`, `discover_pso_algorithm_from_log`
- **TypeScript dispatch**: `packages/kernel/src/api.ts` -> `runRaw`
- **Test file**: `packages/kernel/src/__tests__/algorithm-parity.test.ts`
