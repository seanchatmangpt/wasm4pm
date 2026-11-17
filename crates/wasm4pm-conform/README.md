# `wasm4pm-conform`

High-assurance, trajectory-based IEEE OCEL 2.0 conformance checking engine for the `wasm4pm` ecosystem.

---

## What is `wasm4pm-conform`?

`wasm4pm-conform` is a subcrate of `wasm4pm` that replaces probabilistic, heuristic-driven process conformance checking with exact, evidence-bounded trajectory verification.

Traditional process mining engines evaluate logs against flat traces bound to a single synthetic case identifier. When applied to modern multi-object workflows, flattening causes false serialization, state divergence, and combinatorial explosion during alignment computations.

`wasm4pm-conform` evaluates IEEE OCEL 2.0 logs directly against Partially Ordered Workflow Trees (POWL) and normative Petri nets. It models the entire execution log as a multi-object causal hypergraph, testing trajectory validity via bitpacked transition lattices with zero heap allocations on the hot verification path.

---

## Core Guarantees & Architectural Principles

* **Evidence-Bounded Verification:** A trajectory is either mathematically sound under the normative net or it is an invariant violation. Claims never exceed the verifiable execution trace.
* **Zero Ambient Authority:** The core kernel compiles to `wasm32-unknown-unknown` with strictly empty imports (`imports == ∅`). It performs no filesystem, network, or unmetered memory access.
* **Yielding Reduction Accounting:** Designed from the start for host supervision and future Erlang/OTP integration. Long-running conformance traversals decrement an explicit reduction budget and yield cooperatively, preventing host thread starvation.
* **Fail-Closed Receipts:** Every completed evaluation outputs a cryptographic receipt signed via ML-DSA-65 (FIPS 204), binding the source log digest, model state hashes, and conformance verdict into an unforgeable artifact.

---

## The Problem: Case Flattening vs. Object Centricity

Conventional process mining algorithms force object-centric realities into flat single-case tables:

```
[Order] ──┐
[Item A] ─┼──► Flat Case ID? ──► Heuristic Alignment (A*) ──► Approximation
[Item B] ─┘                       (State Space Explosion)
```

`wasm4pm-conform` preserves object interaction topology and evaluates partial orders directly:

```
[IEEE OCEL 2.0 Stream]
         │
         ▼
[Causal Hypergraph Index] ──► [Bitpacked Dual-64 Replayer] ──► [ML-DSA-65 Receipt]
                                (Branchless / Sub-32 KiB Stack)
```

---

## Capabilities & Feature Set

### 1. Zero-Copy OCEL 2.0 Ingestion

* Streaming parser supporting IEEE OCEL 2.0 JSON and XML without intermediate full-graph DOM allocation.
* In-memory event stream indexed into 64-bit object/event coordinate tables.

### 2. Normative POWL Trajectory Engine

* Compiles POWL trees from `bcinr-powl` into dual-64 bitpacked transition matrices (`pn64`/`pnabi` layout).
* Verifies ordering, synchronizations, and concurrency boundaries without constructing full synchronous products.

### 3. Constant-Time Transition Semantics

* Evaluates transition legality using branchless bitmask arithmetic.
* Eliminates speculative branching and data-dependent latency variations.

### 4. Cooperative Yielding Execution

* Traversal step routines accept an integer reduction quota (e.g., `2000` steps).
* Safely pause and resume mid-log without losing replayer state, designed for direct consumption by BEAM port drivers and NIF envelopes.

---

## Workspace Integration

`wasm4pm-conform` resides inside the `wasm4pm` monorepo alongside companion crates:

| Crate | Role |
| --- | --- |
| `wasm4pm` | Core WASM process mining runtime |
| `wasm4pm-conform` | **This subcrate: IEEE OCEL 2.0 formal conformance checking** |
| `wasm4pm-planner` | PDDL & constraint planning engine |
| `wasm4pm-cognition` | Inductive logic & neurosymbolic reasoning |
| `wasm4pm-cli` | Command-line developer harness |
| `bcinr-powl` | Upstream POWL workflow representations |
| `bcinr-cmca` | Branchless coordinate & algebraic data structures |

---

## Verification & Conformance Targets

Every release of `wasm4pm-conform` is subjected to automated mathematical verification courts before landing:

* **100% Mutation Kill Floor:** In-memory AST mutations injected into transition evaluators, bitmask validators, and reduction counters must be killed by the test suite.
* **Call-Graph Stack Bounds:** Recursive descent is forbidden. Traversal routines must prove a static stack ceiling of $\le 32\text{ KiB}$ via call-graph DFS.
* **Timing Invariance:** Inner transition verifiers are audited using Welch $t$-test timing suites (`dudect`) to ensure zero payload-dependent side-channel leakage.

---

## Future Roadmap: BEAM & Distributed Systems

1. **Rust Subcrate Baseline (`v26.10.11`):** Complete core parser, branchless replayer, and receipt verification.
2. **CLI Surface:** Expose trajectory verification workflows under `wpm conform verify --model <model.powl> --log <log.ocel.json>`.
3. **Erlang / OTP Bindings (`strata_conform_port`):** Clean-room C-ABI wrapper integrating reduction ticks directly into BEAM process schedulers.
4. **Elixir Domain DSL:** Declarative macros for embedding formal trajectory assertions into distributed Elixir supervision trees.
