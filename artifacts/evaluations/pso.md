# Algorithm Evaluation: pso

## Metadata
- **Algorithm ID:** `pso`
- **Category:** `discovery`
- **Profiles Supported:** `fast`, `balanced`, `quality`

## Status
- **Registry:** `true`
- **Dispatch:** `true`
- **CLI:** `true`
- **WASM:** `true`

## Behavioral Evidence
- **Positive Cases:** 1 passed
- **Negative Cases:** 2 failed correctly (`MALFORMED_EVENT_LOG`, `EMPTY_EVENT_LOG`)
- **Invariant Cases:** 1 passed (Seeded Repeatability)

## Evidence Hash
`41a874d2d819d98f92f2a192f22d6fa18daf8e8ca836f425e3686b4575c4d773`

## Verification State
**Closed**

## Summary
`pso` (Particle Swarm Optimization) is a stochastic, swarm-based metaheuristic algorithm used for process discovery. In this implementation, it optimizes the configuration of a Directly-Follows Graph (DFG) to maximize fitness against the input event log. To ensure deterministic results in a production environment, the algorithm utilizes a seeded random number generator (seed=42), as verified by its repeatability invariants.

## Implementation Validation & Details
- **Source Code Path:** `wasm4pm/src/genetic_discovery.rs`.
- **Core Logic:** The algorithm uses Particle Swarm Optimization to discover a Directly-Follows Graph. It evolves a population ("swarm") of edge sets over multiple iterations. Each particle retains its current position, its personal best (`pbest`), and blends towards the global best edge set based on trace coverage fitness.
- **Determinism:** To ensure reproducibility, the swarm operations (initialization, mutation, blending) are strictly controlled using a fixed random seed (`StdRng::seed_from_u64(42)`). 
- **Dispatch Mechanism:** Exposed through the `discover_pso_algorithm` WASM boundary, operating directly on the parsed `ColumnarLog`.
