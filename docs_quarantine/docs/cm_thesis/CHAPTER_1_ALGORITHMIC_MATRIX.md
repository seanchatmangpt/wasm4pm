# Chapter 1: The Algorithmic Permutation Matrix

## 1.1 Introduction
The `wasm4pm` execution planner acts as the orchestration layer for a high-speed, compiled engine. Unlike traditional process intelligence systems that separate discovery, conformance, and prediction into distinct microservices, the `wasm4pm` architecture collapses these operations into a single execution boundary. This chapter explores the combinatorial stress induced when deterministic algorithms, heuristics, and machine learning models are executed under extreme concurrency and sequential chaining.

## 1.2 Execution Profiles and Deduplication Logic
Recent advancements in the `wasm4pm` execution planner have formalized the mapping between execution profiles and algorithm selection. The combinatorial matrix tests the exact computational cross-products of these profiles:
*   **`fast` Profile:** Constrained strictly to $O(n)$ operations (`process_skeleton`, `dfg`). Designed for sub-millisecond throughput.
*   **`balanced` Profile:** Expands the matrix to heuristic, alpha, inductive, and declarative algorithms combined with the full suite of 6 machine learning algorithms (via `miniml-core`).
*   **`quality` Profile:** Incorporates computationally intensive metaheuristic optimizations, including simulated annealing, A*, Ant Colony Optimization (ACO), Particle Swarm Optimization (PSO), Genetic algorithms, and Integer Linear Programming (ILP).
*   **`stream` Profile:** Stripped of ML overhead to focus entirely on SIMD-accelerated streaming DFG, satisfying extreme latency-sensitive real-time processing constraints.

A combinatorial explosion occurs when an $O(n)$ sub-millisecond discovery algorithm hands off directly to an unbounded metaheuristic like ACO or PSO. To prevent state explosion, the planner utilizes an exact `Map<PlanStepType, params>` deduplication strategy. This structural limit ensures that profile auto-inclusion and explicit configuration overrides (`config.ml.tasks`) resolve to exactly one canonical algorithm invocation, removing the "phantom algorithm" double-handling loophole.

## 1.3 Branchless Instruction Extremes and Arithmetic Safety
The true test of the matrix occurs at the micro-architectural level. WebAssembly (WASM) execution throughput is strictly bound by JIT/AOT constraints. The integration of `bcinr` branchless primitives replaces predictive `if-else` branching with constant-time bitwise masking (e.g., `select_u32`, `max_u32`).

However, combinatorial maximalism exposes edge cases in arithmetic limits. Recent stabilization of the `miniml-core` exposed and resolved critical metric correctness gaps, notably the Matthews Correlation Coefficient (MCC) overflow and Area Under the ROC Curve (AUC) tie-handling during extreme data cardinality. By grounding the machine learning evaluations in Rank-2 domain-contract tests, we empirically establish the mathematical safety of WASM micro-kernels under maximum algorithmic stress.

## 1.4 Empirical Synthesis
The implementation of 20 distinct algorithm-oracle tests verifies the single-implementation pattern across the matrix. The data confirms that when branchless primitives execute at maximum entropy, the deterministic $O(n)$ discovery paths remain bounded in sub-millisecond latencies, while the combinatorial models (ACO, ILP) successfully offload to deduplicated ML overlays without memory-bandwidth exhaustion. The resolution of API-drift gaps in `wasm4pm-algos`, `wasm4pm-utils`, and `wasm4pm-types` solidifies this execution matrix into a unified, provable kernel.
