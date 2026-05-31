# Architecture Overview

wasm4pm is a process mining platform with a real Rust cognition kernel. **60** high-performance algorithms compile to WebAssembly. **9** old-AI breeds (ELIZA, MYCIN, STRIPS, Prolog, CBR, DENDRAL, GPS, SOAR, Hearsay-II) run natively in Rust, exposed through a thin TypeScript facade, surfaced through a single CLI binary (`wpm`).

The doctrine: **Old AI is the factory. LLMs are the brochure.**

## System Layers

```mermaid
graph TB
  CLI[wpm CLI] --> Kernel[packages/kernel]
  Kernel --> Engine[@wasm4pm/engine]
  Engine --> WASM[wasm4pm/pkg WASM]
  WASM --> Rust[crates/wasm4pm-algos]
  CLI --> Cognition[cognition breeds Rust-native]
  CLI --> Truex[truex verify BLAKE3]
```

| Layer | Responsibility |
|-------|----------------|
| **`apps/wasm4pm`** | CLI commands, OTEL spans, output formatting, config resolution |
| **`packages/kernel`** | Versioned API facade — `Kernel.discover()`, registry, receipt hashing |
| **`packages/engine`** | WASM loader, init lifecycle, backend selection |
| **`wasm4pm/` (Cargo)** | Algorithm implementations, Truex canonicalization, cognition kernel |
| **`packages/contracts`** | Algorithm registry templates, alias resolution, typed failure codes |

**Rule:** CLI logic must not import Rust directly. All algorithm dispatch goes through `packages/kernel/src/api.ts` so validation, OTEL, and error taxonomies apply uniformly.

## Verified Integrity

wasm4pm is built with **Combinatorial Maximalism**. Every release is sealed with a **Release Certificate** that binds to the current commit and recomputes all evidence hashes.

- **Zero Suppression:** The Rust kernel passes `cargo clippy --workspace -- -D warnings` with zero `allow` attributes or suppressions.
- **Naturally Clean:** 100% of public items are documented to satisfy the `missing_docs` gate.
- **Adversarial Gates:** 8 runtime detectors (Stub, Authority, Replay, etc.) prevent false-pass patterns.
- **BLAKE3 Receipts:** CLI runs, cognition contracts, and Truex envelopes produce verifiable cryptographic receipts.

Evidence discipline: [AGENTS.md](../../AGENTS.md).

## Deployment Profiles

Optimized WASM bundles for every environment:

| Profile | Size | Use case |
|---------|------|----------|
| `mobile` | ~500KB | Mobile / low bandwidth |
| `iot` | ~1.0MB | Embedded |
| `edge` | ~1.5MB | CDN / edge workers |
| `fog` | ~2.0MB | IoT gateways |
| `browser` | ~2.7MB | Web + Node.js (default) |

Build: `npm run build:mobile --workspace=wasm4pm`. See [Edge Deployment](../how-to/edge_deployment.md).

## Core Capabilities

**Discovery:** 60 registered algorithms — DFG, heuristic/inductive miners, genetic/ILP, OCEL, ML, prediction, conformance, simulation. List live: `wpm algorithms`.

**Truex:** OCEL 2.0 canonicalization + BLAKE3 receipt verification via `wpm truex verify`. Profile: [Truex OCEL 2.0 Canonical Profile](../truex-ocel2-canonical-profile.md).

**Cognition:** Nine Old-AI breeds via `wpm cognition run --contract <breed>`.

**Prediction:** Next-activity, remaining-time, drift via `wpm predict`.

## CLI Surface

| Category | Commands |
|----------|----------|
| **Core** | `run`, `compare`, `diff`, `watch`, `init`, `algorithms` |
| **Prediction** | `predict`, `drift-watch` |
| **Analysis** | `ml`, `powl`, `quality`, `conformance`, `validate`, `simulate`, `temporal`, `social` |
| **Truex** | `truex verify` |
| **Governance** | `receipts`, `cell`, `autoprocess`, `status`, `doctor`, `explain`, `results` |
| **Cognition** | `cognition run`, `cognition verify`, `cognition replay`, `prolog8` |

## Documentation Map

We follow the [Diátaxis framework](https://diataxis.fr/).

- **Tutorials:** [Getting Started](../tutorials/getting_started.md), [Truex Receipts](../tutorials/truex_receipts.md), [Predictive Monitoring](../tutorials/predictive_monitoring.md), [Cognition Contracts](../tutorials/cognition_contracts.md)
- **How-To:** [OTEL Configuration](../how-to/configure_observability.md), [Edge Deployment](../how-to/edge_deployment.md), [Concept Drift](../how-to/concept_drift.md)
- **Reference:** [CLI Commands](../reference/cli_commands.md), [Algorithms](../reference/algorithms.md), [Configuration Schema](../reference/configuration_schema.md), [Truex Profile](../truex-ocel2-canonical-profile.md)
- **Explanation:** [Old AI vs. LLM Doctrine](docs/explanation/old_ai_vs_llms.md), [Combinatorial Maximalism](../docs_quarantine/ARCHIVE/explanation/combinatorial_maximalism_closure_discipline.md), [Receipt Truth Verification](docs/explanation/prd_ard_receipt_truth_verification.md)

Programmatic usage: [Getting Started §3](../tutorials/getting_started.md).

## License

Apache-2.0 OR MIT. See [LICENSE-APACHE](../../LICENSE-APACHE) and [LICENSE-MIT](../../LICENSE-MIT).
