# wasm4pm Tool Capabilities

Complete capability reference for all 18 wasm4pm MCP tools.
Derived from the O* surface ontology — numbers here are always current.

---

## Fast Tier

Tools that complete in under 2 ms on a 500-event benchmark log. Safe for synchronous,
interactive, and real-time pipeline use.

| Tool | Input | OCEL | Handle | ms |
|------|-------|------|--------|----|
| Get Capability Registry | `none` | — | — | 0.1 |
| Encode DFG as Text | `handle` | — | yes | 0.3 |
| Discover DFG | `xes` | — | — | 0.5 |
| Encode OCEL as Text | `handle` | yes | yes | 0.8 |
| Discover Variants | `handle` | — | yes | 1 |
| Load OCEL | `ocel2` | yes | — | 1.5 |
| Analyze Statistics | `handle` | — | yes | 2 |

---

## Medium Tier

Tools that complete in 3–8 ms on a 500-event benchmark log. Suitable for on-demand analysis
triggered per user action.

| Tool | Input | OCEL | Handle | ms |
|------|-------|------|--------|----|
| Flatten OCEL | `handle` | yes | yes | 3 |
| Discover OCEL DFG Per Type | `handle` | yes | yes | 4.5 |
| Detect Bottlenecks | `handle` | — | yes | 5 |
| Discover Alpha++ | `xes` | — | — | 5 |
| Detect Concept Drift | `handle` | — | yes | 6 |
| Extract Case Features | `handle` | — | yes | 7 |
| Check Conformance | `xes` | — | — | 8 |

---

## Slow Tier

Tools that complete in 20–75 ms on a 500-event benchmark log. Run in dedicated worker pods
or batch queues for production workloads.

| Tool | Input | OCEL | Handle | ms |
|------|-------|------|--------|----|
| Discover ILP Optimization | `xes` | — | — | 20 |
| Discover Genetic Algorithm | `xes` | — | — | 40 |
| Discover OC Petri Net | `handle` | yes | yes | 50 |
| Compare Algorithms | `xes` | — | — | 75 |

---

## Summary

| Tier | Count |
|------|-------|
| FastTier | 7 |
| MediumTier | 7 |
| SlowTier | 4 |
| **Total** | **18** |

**Column key:**
- **OCEL** — tool natively handles OCEL 2.0 object-centric logs
- **Handle** — tool requires a pre-loaded in-process handle (call `load_ocel` first)
- **ms** — baseline median duration on 500-event benchmark log

---

## See Also

- [Algorithm Reference](./reference/algorithms.md) — tier definitions and output formats
- [HTTP API Reference](./reference/http-api.md) — endpoint paths and request schema
- [Performance Benchmarks](./reference/benchmarks.md) — SLA budgets and regression gate
