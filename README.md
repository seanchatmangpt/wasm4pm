# wasm4pm

A process mining platform with a real Rust cognition kernel. 60 high-performance algorithms compiled to WebAssembly. 9 old-AI breeds (ELIZA, MYCIN, STRIPS, Prolog, CBR, DENDRAL, GPS, SOAR, Hearsay-II) running natively in Rust, exposed through a thin TypeScript facade, surfaced through a single CLI binary (`wpm`).

The doctrine: **Old AI is the factory. LLMs are the brochure.**

## Verified Integrity

wasm4pm is built with **Combinatorial Maximalism**. Every release is sealed with a **Release Certificate** that binds to the current commit and recomputes all evidence hashes.

- **Zero Suppression:** The Rust kernel passes `cargo clippy --workspace -- -D warnings` with zero `allow` attributes or suppressions.
- **Naturally Clean:** 100% of public items are documented to satisfy the `missing_docs` gate.
- **Adversarial Gates:** 8 runtime detectors (Stub, Authority, Replay, etc.) prevent false-pass patterns.
- **BLAKE3 Receipts:** Every CLI and cognition run produces a verifiable cryptographic receipt.

[Get Started](docs/tutorials/getting_started.md) | [CLI Reference](docs/reference/cli_commands.md) | [WASM API](docs_quarantine/ARCHIVE/WASM_API.md) | [Architecture](docs/explanation/architecture_overview.md)

---

## Quick Start (3 minutes)

### 1. Run process discovery

```bash
# Discover a model from a sample event log (included in data/)
wpm run data/small-example.xes
```

Results save to `.wasm4pm/results/` automatically.

### 2. View the results

```bash
# Show all saved results
wpm results

# Inspect the most recent result (with receipt hash validation)
wpm results --last --verify
```

### 3. Algorithm Comparison

```bash
# Compare multiple algorithms side-by-side
wpm compare dfg,heuristic,inductive -i data/small-example.xes
```

See [docs/tutorials/getting_started.md](docs/tutorials/getting_started.md) for more examples and next steps.

---

## Deployment Profiles

Optimized binaries for every environment:

| Profile | Size | Use Case |
|---------|------|----------|
| `mobile` | ~500KB | Mobile devices / low bandwidth |
| `iot` | ~1.0MB | Embedded / resource-constrained |
| `edge` | ~1.5MB | CDN workers / Edge compute |
| `fog` | ~2.0MB | IoT gateways / Fog nodes |
| `browser` | ~2.7MB | Web + Node.js (default) |

---

## Core Capabilities

**wasm4pm** is a process mining platform covering discovery, conformance, and enhancement (bottleneck analysis, drift detection, predictive monitoring).

### 9 Cognition Breeds (Old AI)

| Breed | Origin | Algorithm |
|-------|--------|-----------|
| **ELIZA** | 1966 | Pattern matching with slot binding |
| **MYCIN** | 1976 | Forward chaining + certainty factors |
| **STRIPS** | 1971 | Goal regression planning |
| **Prolog** | 1965 | Robinson unification + SLD resolution |
| **CBR** | 1992 | Jaccard similarity case retrieval |
| **DENDRAL** | 1969 | Constraint-driven enumeration |
| **GPS** | 1963 | Means-ends gap reduction |
| **SOAR** | 1987 | Preference-based operator selection |
| **Hearsay-II** | 1980 | Blackboard consensus fusion |

### Process Mining Commands (20 total)

| Category | Commands |
|----------|----------|
| **Core** | `run`, `compare`, `diff`, `watch`, `init` |
| **Prediction** | `predict`, `drift-watch` |
| **ML Analysis** | `ml`, `powl`, `quality`, `conformance`, `validate` |
| **Simulation** | `simulate`, `temporal`, `social` |
| **Governance** | `autoprocess`, `status`, `doctor`, `explain`, `results` |

---

## Documentation

We follow the [Diátaxis framework](https://diataxis.fr/).

- **🎓 Tutorials:** [Getting Started](docs/tutorials/getting_started.md), [Predictive Monitoring](docs/tutorials/predictive_monitoring.md), [Cognition Contracts](docs/tutorials/cognition_contracts.md)
- **🛠️ How-To Guides:** [OTEL Configuration](docs/how-to/configure_observability.md), [Edge Deployment](docs/how-to/edge_deployment.md), [Concept Drift](docs/how-to/concept_drift.md)
- **📚 Reference:** [CLI Commands](docs/reference/cli_commands.md), [Configuration Schema](docs/reference/configuration_schema.md), [WASM API Catalog](docs_quarantine/ARCHIVE/WASM_API.md)
- **🧠 Explanation:** [Architecture Overview](docs/explanation/architecture_overview.md), [Old AI vs. LLM Doctrine](docs/explanation/old_ai_vs_llms.md), [Combinatorial Maximalism](docs_quarantine/ARCHIVE/explanation/combinatorial_maximalism_closure_discipline.md)

### Additional Resources
- [Testing Doctrine](docs_quarantine/ARCHIVE/TESTING.md)
- [Adversarial Test Plan](docs_quarantine/ARCHIVE/ADVERSARIAL_TEST_PLAN.md)
- [Claude Code Integration](docs_quarantine/ARCHIVE/CLAUDE.md)
- [Contributing Guidelines](CONTRIBUTING.md)

## Contact

For questions or support, reach out at [info@chatmangpt.com](mailto:info@chatmangpt.com).

## License

Apache-2.0 OR MIT. See [LICENSE-APACHE](LICENSE-APACHE) and [LICENSE-MIT](LICENSE-MIT).
