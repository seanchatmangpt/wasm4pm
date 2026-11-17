<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: docs/reference/reviews/a_star.md; source-sha256: 1edaf79208400b61a95ea61ee01981eb999547f31e12f1f19c7920f3a3464031; reason: canonical Diátaxis or ADR surface -->

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
  - As of commit `c0d9283f4` the search is genuine A*: states are canonical
    ascending-index DFG edge subsets, `g` = covered pair occurrences minus a fixed
    per-edge complexity penalty (lambda = 0.2·P/D), `h` = sum of
    `max(freq_e − lambda, 0)` over unselected edges (admissible; exact for the
    additive objective), `f = g + h` with a `BinaryHeap` open set, deterministic
    (f, lexicographic) tie-break, and branch-and-bound cuts at `f <= best_g`.
    `max_iterations` bounds node expansions.
  - The legacy beam-search open set (sorted vec, 128-wide truncate) is gone; the
    old behavior is preserved as `discover_beam_from_log`. The bounded surface
    `discover_astar_bounded` degenerates to beam search under a width bound and
    reports `"algorithm": "beam"`; unbounded runs report `"algorithm": "astar"`.
  - Verified: A\* matches exhaustive optimum on 5 tiny logs; A* finds an optimum
    the legacy beam provably misses at equal budget.
- **Crucial Bug Fix**:
  - The pre-`c0d9283f4` implementation was beam search under A* terminology. The
    "best score compared against the popped parent" fix note is historical;
    the current implementation returns the best-complete-goal state by `g`, with
    `h(root) >= opt` proven in tests.

## Improvement Areas
- **Performance Optimization**:
  - Pre-`c0d9283f4` each candidate cloned the entire DFG and re-ran a full-log
    fitness pass. The committed A* scores states from per-edge frequencies
    (`g`/`h` are computed from edge-frequency sums, not per-candidate log
    replays). The old note is historical; per-node cost is now proportional to
    the expansion, not the log.

## Code References
- **Rust Implementation**: `wasm4pm/src/fast_discovery.rs` -> `discover_astar`, `discover_astar_from_log`, `evaluate_dfg_partial_fitness`
- **TypeScript dispatch**: `packages/kernel/src/api.ts` -> `runRaw`
- **Test file**: `packages/kernel/src/__tests__/discovery-otel-spans.test.ts`
