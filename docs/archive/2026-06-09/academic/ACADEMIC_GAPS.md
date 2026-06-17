# Academic Gaps — ACADEMIC-LINEAGE-001

*Generated 2026-05-30*

## Coverage Summary

| coverage_kind | count |
|---|---|
| `consumer-contract` | 3 |
| `derived` | 14 |
| `direct` | 17 |
| `engineering` | 11 |

| confidence | count |
|---|---|
| `engineering_only` | 11 |
| `high` | 14 |
| `low` | 4 |
| `medium` | 16 |

## P1: Known Implementation Bugs (blocking ACADEMIC-COVERAGE-001)

These require code fixes, not just citation research:

- `simd_streaming_dfg`: Known bug: HashMap iteration order is non-deterministic across runs.
- `log_to_trie`: Known bug: HashMap iteration over cases may produce non-deterministic output.
- `playout`: Known bug: uses unseeded fastrand — non-deterministic output across runs.

## P2: Direct Records Missing Canonical Citation

These are classified `direct` but lack a canonical paper reference:



## P2: Direct/Derived Records Without first_peer_reviewed

- `hill_climbing`
- `simulated_annealing`
- `causal_graph`
- `ocel_ocla`

## P3: Engineering-Only Primitives (honest, not gaps)

These have no PM paper — they are valid engineering implementations:

- `process_skeleton`: Process skeleton: compressed DFG retaining only high-frequen
- `optimized_dfg`: Optimized DFG with improved memory layout for large logs
- `hierarchical_dfg`: Hierarchical DFG with activity abstraction levels
- `simd_streaming_dfg`: SIMD-accelerated streaming DFG approximation
- `pso`: Particle Swarm Optimization adapted for Petri net structure 
- `log_to_trie`: Prefix-tree (trie) representation of event log traces for ef
- `streaming_log`: Streaming event log: online DFG update as events arrive
- `smart_engine`: Adaptive algorithm selection heuristic (selects discovery al
- `ml_cluster`: K-means clustering of process traces on feature vectors
- `ml_anomaly`: Information-theoretic anomaly scoring on process traces (log
- `compute_ewma`: Exponentially Weighted Moving Average for process monitoring

## Not Yet Researched (not in KNOWN database)

Algorithms in wasm4pm registry not yet in the lineage database require manual research:
- All agentic_pipeline, automl_*, and streaming variants not listed above
- Social network variants beyond handover/working_together
- POWL sub-algorithms (powl parsing, simplification)

## Gate Status

ACADEMIC-LINEAGE-001: **PARTIAL**

Criteria remaining:
- [ ] All 60 registered algorithms classified (current: 45 in DB)
- [ ] Every direct first claim verified via DBLP/DOI (DBLP rate-limited; manual verification needed)
- [ ] disputed firsts marked (alpha family, ACO vs genetic)
- [ ] BibTeX entries completed for all canonical references
