# Chapter 3: Object-Centric Cross-Products

## 3.1 Introduction
The paradigm shift from 2D trace analysis (Trace × Activity) to Object-Centric Process Mining (OCPM) introduces a profound combinatorial explosion. In OCPM, events are not bound to single isolated cases but intersect across an N-dimensional space of interacting objects (e.g., Order, Item, Delivery, Payment). This chapter examines the computational limits of the `wasm4pm` engine when processing highly dense, multi-partite object graphs using the Object-Centric Event Log (OCEL) 2.0 standard and Partially Ordered Workflow Language (POWL).

## 3.2 Multi-Object Lifecycle Intersections
Traditional process engines flatten multi-object interactions, destroying evidence of convergence and divergence. The `wasm4pm` system integrates native OCEL input support and kernel dispatch to directly process the true N-dimensional graph. 

The combinatorial limit is tested by synthesizing event logs where object-to-object relationships form maximally connected bipartite graphs. The recent closure of OCEL/POWL lifecycle validation and serialization gaps ensures that the WASM layer correctly infers boundary limits. Specifically, the introduction of `POWL v2 full-dimension conformance` allows the engine to evaluate partial orders, explicit choices, and loops across intersecting lifecycles without collapsing the dimensional space.

## 3.3 Declarative Constraint Permutations
To evaluate conformance within an N-dimensional space, the engine relies on Declarative (DECLARE) constraints. A combinatorial maximalist analysis requires stressing the system against a constraint set containing every possible DECLARE template (e.g., Response, Precedence, Not Co-Existence, Responded Existence) applied simultaneously. 

With the recent refinement of the `compare` and `powl` layers, the system explicitly links declarative failures to the object lifecycle. The engine now surfaces which specific traces deviated and why, using branchless evaluations to check compliance across millions of intersecting object histories simultaneously. Furthermore, the `wasm4pm-types` API standardizes the intersection structures, guaranteeing that constraint evaluation latency remains bounded even as the object interactions become maximally dense.

## 3.4 Empirical Synthesis
Empirical testing on real-data OCEL benchmarks validates the efficiency of the multi-dimensional mapping. By mapping the algorithm identifiers correctly in `config.ml.tasks` and `POWL` configurations, the WASM kernel executes full-dimension conformance checks at high throughput. The data proves that while the state space of object interactions expands combinatorially, the runtime evaluation of POWL v2 graphs and OCEL 2.0 object lifecycles scales deterministically without memory leakage.
