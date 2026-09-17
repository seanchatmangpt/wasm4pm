<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/docs/archive/2026-06-09/research/gaps/gap-01-dummy-data-limitation.md; source-sha256: 76e053d93444c1e630c7cde31bd213a43ecfb6f0a6b428d1b972b08bbfdb9f7a; reason: tooling or agent control surface -->

# Research: The "Dummy Data" Limitation

## Overview
The `wasm4pm` examples currently demonstrate 100% API coverage, but the underlying data used in these examples consists of minimal, hardcoded XML strings (e.g., simple traces with two or three events).

## Analysis
Advanced process discovery algorithms such as Genetic Algorithms, Particle Swarm Optimization (PSO), and complex heuristic miners rely on statistical variance, loop unrolling, and concurrent branch frequency to converge on a valid model. When fed minimal linear traces, these algorithms mathematically fail to execute, as the state space lacks the necessary complexity to form a Directly-Follows Graph (DFG) with non-zero edge weights for alternative paths.

Currently, these failures are handled gracefully via `try/catch` blocks, which prevents runtime crashes but fails to demonstrate the actual capabilities of the algorithms.

## Proposed Architectural Solution
1. **Centralized Fixtures Repository:** Establish a robust `fixtures/` directory within the workspace.
2. **Real-World Benchmarks:** Import established event logs from the BPI Challenges (e.g., BPIC 2012, Sepsis log) to provide statistically significant datasets.
3. **OCPM Datasets:** Include native Object-Centric Event Logs (OCEL 2.0) that naturally model multi-entity Cartesian complexities (e.g., Procure-to-Pay).
4. **Integration:** Examples must read from these fixtures dynamically, proving algorithmic convergence rather than merely testing API invocation.