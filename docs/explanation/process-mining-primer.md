# Process Mining Primer

Process mining extracts process knowledge from event data. Where traditional process design asks "how should this process work?", process mining asks "how does this process actually work?" The evidence is the event log; the algorithm is the analyst.

## What is process mining?

Process mining was formalized by Wil van der Aalst. It operates on **event logs** — records of activities that happened, when, and to which case. From these logs, three types of analysis emerge:

| Type | Question | Output |
|------|----------|--------|
| **Discovery** | What process model fits the log? | Petri net, DFG, POWL |
| **Conformance** | Does the log match a declared model? | Fitness score, deviations |
| **Enhancement** | How can the model be improved? | Extended model, bottleneck map |

wasm4pm implements all three. Discovery is the entry point: `wpm run log.xes` discovers a model using one of 60 registered algorithms.

## Case-centric vs. object-centric

Traditional process mining is **case-centric**: one trace per case, one case per trace. This works when every object moves through the process independently. It breaks down for real-world processes where multiple objects interact — an order involves products, shipments, and invoices simultaneously.

**OCEL 2.0** (Object-Centric Event Log) solves this. Instead of a single case ID per event, each event can involve multiple object IDs of multiple object types. A "CreateOrder" event can simultaneously advance `order:42`, `product:7`, and `customer:88`.

wasm4pm supports both:
- XES (`.xes`) — case-centric, widely supported
- OCEL 2.0 JSON (`.json`) — object-centric, required for `ocel_*` algorithms

## The four quality dimensions

Every discovered process model is evaluated against four dimensions (van der Aalst, 2016):

| Dimension | Question | Bad score means |
|-----------|----------|-----------------|
| **Fitness** | Does the model allow the log's traces? | Model is too restrictive |
| **Precision** | Does the model only allow the log's traces? | Model allows too much (underfitting) |
| **Simplicity** | Is the model as simple as possible? | Model is over-complex |
| **Generalization** | Will the model generalize to unseen traces? | Model overfits seen traces |

No algorithm optimizes all four simultaneously — that is provably impossible. wasm4pm makes these tradeoffs explicit: `wpm quality` computes all four for a discovered model.

Fitness threshold for admission in wasm4pm: **> 0.85**. MCPP route admission requires exactly **1.0**.

## Why WASM?

Three properties make WASM the right target for a process mining algorithm library:

**Determinism.** Given the same input, WASM produces bit-exact output across machines, OS versions, and architectures. This is not true for native binaries (stack layout, allocator behavior, CPU instruction selection). Determinism is a merge gate in wasm4pm: same input → same bytes out, always.

**Portability.** One binary runs in browsers, Node.js, Deno, edge workers (Cloudflare Workers, Fastly Compute), and embedded environments. The 60 algorithms compile once; wasm4pm ships deployment profiles for mobile, IoT, edge, fog, and browser targets.

**Performance.** WASM with SIMD instructions matches native performance for vectorized operations. `simd_streaming_dfg` — the default discovery algorithm — uses WASM SIMD for throughput-optimized DFG construction, enabling real-time streaming on logs that would block a Python process.

## How wasm4pm fits

```
Event log (XES / OCEL 2.0)
        ↓
  wasm4pm/pkg    ← 60 algorithms, Rust compiled to WASM
        ↓
  packages/kernel ← API boundary, receipt hashing, algorithm registry
        ↓
  apps/wasm4pm   ← CLI (wpm), OTEL spans, output formatting
        ↓
  .wasm4pm/receipts/ ← BLAKE3 receipt chain, every run
```

Every `wpm run` emits a BLAKE3 receipt binding input hash, output hash, algorithm ID, and git commit to a tamper-evident chain. This is the "process mining on the process miner" — the tool provides the same evidence it computes for your logs.

## Further reading

- [Architecture Overview](architecture_overview.md) — system layers, engine state machine, deployment profiles
- [Getting Started](../tutorials/getting_started.md) — run your first discovery in under 5 minutes
- [Algorithms Reference](../reference/algorithms.md) — all 60 algorithms, quality tradeoffs, input requirements
- [Truex Receipt Verification](../tutorials/truex_receipts.md) — OCEL 2.0 canonicalization and BLAKE3 integrity
