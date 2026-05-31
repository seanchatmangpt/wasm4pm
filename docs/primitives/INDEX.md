# Primitive Kernel — Index

The **primitive kernel** is the foundational layer of wasm4pm's process-mining
correctness story. Each primitive is a formally grounded building block — tied
directly to a definition or theorem in a published paper — so that test oracles
are derived from mathematics rather than from the implementation itself (no FM-5
self-reference).

The kernel is organised in dependency order: object-centric event logs (OCEL v2)
sit at the base, POWL 2.0 and WF-net / Petri-net primitives build on top, and
conformance, world generation, negative-corpus testing, and benchmark gates
compose the higher layers.

---

## Primitives

| # | File | Name | Status |
|---|------|------|--------|
| 00 | [00-WASM4PM-PRIMITIVE-INVENTORY.md](00-WASM4PM-PRIMITIVE-INVENTORY.md) | Primitive Inventory | Scaffolded |
| 00 | [00-BUILD-PLAN.md](00-BUILD-PLAN.md) | Build-Plan Synthesizer | Scaffolded |
| 01 | [01-OCEL-V2-PRIMITIVES.md](01-OCEL-V2-PRIMITIVES.md) | OCEL v2 Primitives | Scaffolded |
| 02 | [02-POWL-2-PRIMITIVES.md](02-POWL-2-PRIMITIVES.md) | POWL 2.0 Primitives | Scaffolded |
| 03 | [03-WFNET-PETRI-PRIMITIVES.md](03-WFNET-PETRI-PRIMITIVES.md) | WF-net / Petri-net Primitives + Formal Soundness | **Implemented** |
| 04 | [04-CONFORMANCE-PRIMITIVES.md](04-CONFORMANCE-PRIMITIVES.md) | Conformance Primitives | Scaffolded |
| 05 | [05-PROCESS-WORLD-FOUNDRY.md](05-PROCESS-WORLD-FOUNDRY.md) | Process-World Foundry | Scaffolded |
| 06 | [06-NEGATIVE-CORPUS.md](06-NEGATIVE-CORPUS.md) | Negative Fixture / Sabotage Corpus | Scaffolded |
| 07 | [07-ROUTE-DRIVEN-TDD.md](07-ROUTE-DRIVEN-TDD.md) | Route-Driven TDD | Scaffolded |
| 08 | [08-BENCHMARK-GATES.md](08-BENCHMARK-GATES.md) | Benchmark Gates | Scaffolded |

---

## Reference implementation

**`03-WFNET-PETRI-PRIMITIVES.md`** is the reference implementation to learn from.
It demonstrates the full pattern:

- Paper grounding with explicit definition numbers (Kourani, Park & van der
  Aalst, arXiv:2602.15739v3)
- Mapping table from paper objects to Rust types
- Token semantics stated precisely (unweighted ordinary Petri net)
- Positive and negative fixtures that exercise the math directly
- A reachable `#[wasm_bindgen]` export so the primitive is usable from
  TypeScript/JavaScript
- Status section that describes exactly what is in place and tested

All other primitives should follow this pattern when they move from Scaffolded
to Implemented.
