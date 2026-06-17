# Research: Execution vs. Assertion

## Overview
The current examples successfully demonstrate that the `wasm4pm` API can be invoked without crashing, but they lack mathematical assertions to verify that the returned algorithms actually produce correct results.

## Analysis
The examples execute the WASM functions, measure the `durationMs`, and print `Success`. However, an algorithm like `alpha_plus_plus` returning an empty Petri net would still be logged as a "Success." The examples operate merely as syntactic execution demonstrations rather than rigorous integration tests.

For a framework positioning itself as a mathematical authority over process execution, the lack of programmatic assertions over the output topologies leaves a critical verification gap in the repository.

## Proposed Architectural Solution
1. **Assertion Injection:** Integrate native assertion libraries (e.g., `node:assert`) into the case studies.
2. **Topological Validation:** When discovering a DFG, assert that the returned graph contains expected nodes and edges. When computing alignments, assert that the fitness score falls within established bounds for the given dataset.
3. **Dual-Purpose Scripts:** By enforcing assertions, the examples directory is transformed into an impenetrable, end-to-end Integration Test Suite that simultaneously teaches developers and safeguards the kernel's mathematical integrity.