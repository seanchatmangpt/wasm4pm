# wasm4pm

A process mining platform with a real Rust cognition kernel. 60 high-performance algorithms compiled to WebAssembly. 9 old-AI breeds (ELIZA, MYCIN, STRIPS, Prolog, CBR, DENDRAL, GPS, SOAR, Hearsay-II) running natively in Rust, exposed through a thin TypeScript facade, surfaced through a single CLI binary (`wpm`).

The doctrine: **Old AI is the factory. LLMs are the brochure.**

## Installation

### Prerequisites

- **Node.js** 18+ and **npm** 9+ (or pnpm 8+)
- **Rust** 1.70+ (only if contributing to the WASM kernel)
- Supported on macOS, Linux, Windows (WSL2)

### Quick Install

```bash
npm install -g @wasm4pm/cli
wpm --version
```

For detailed installation, troubleshooting, and post-install verification, see [docs/tutorials/getting_started.md](docs/tutorials/getting_started.md).

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

### Example: Full workflow (60 seconds)

```bash
# Conformance checking
wpm conformance -i data/small-example.xes

# Predictive process monitoring
wpm predict next-activity -i data/small-example.xes

# Run a cognition contract (MYCIN forward-chain + BLAKE3 receipt)
wpm cognition run --contract mycin --input examples/cognition/mycin/intent.json

# Verify adversarial gates on a receipt
wpm cognition verify --receipt-id <id-from-results>
```

Every output carries a **BLAKE3 receipt chain** proving the run happened, which algorithm ran, what the inputs were, and what the outputs were.

## Configuration

wasm4pm is configured via:
1. CLI arguments (highest priority)
2. `wasm4pm.toml` or `wasm4pm.json` in the current directory
3. Environment variables (`WASM4PM_*` prefix)
4. Default values (lowest priority)

### Example: TOML config

```toml
[source]
kind = "file"
path = "./data/small-example.xes"

[algorithm]
name = "heuristic_miner"

[execution]
profile = "balanced"    # fast | balanced | quality | stream
timeout = 300

[output]
format = "json"         # human | json
colorize = true
```

For the complete configuration schema and options, see [docs/reference/configuration_schema.md](docs/reference/configuration_schema.md).

## Core Capabilities

**wasm4pm** is a process mining platform covering discovery, conformance, and enhancement (bottleneck analysis, drift detection, predictive monitoring).

### 9 Cognition Breeds

| Breed | Origin (paper, year) | Algorithm |
|-------|---------------------|-----------|
| **ELIZA** | Weizenbaum 1966 | Pattern matching with slot binding |
| **MYCIN** | Shortliffe 1976 | Forward chaining + certainty factors |
| **STRIPS** | Fikes & Nilsson 1971 | Goal regression planning |
| **Prolog** | Robinson 1965 | Robinson unification + SLD resolution |
| **CBR** | Kolodner 1992 | Jaccard similarity case retrieval |
| **DENDRAL** | Buchanan & Lederberg 1969 | Constraint-driven enumeration |
| **GPS** | Newell & Simon 1963 | Means-ends gap reduction |
| **SOAR** | Laird 1987 | Preference-based operator selection |
| **Hearsay-II** | Erman & Lesser 1980 | Blackboard consensus fusion |

Every breed produces an **inference trace** and a **BLAKE3 receipt**. Every output passes through **8 adversarial gates** (Stub, Human Authority, Missing Evidence, etc.) that detect false-pass patterns.

### Process Mining Commands (20 total)

| Category | Commands |
|----------|----------|
| **Core** | `run`, `compare`, `diff`, `watch`, `init` |
| **Prediction** | `predict`, `drift-watch` |
| **ML Analysis** | `ml`, `powl`, `quality`, `conformance`, `validate` |
| **Simulation** | `simulate`, `temporal`, `social` |
| **Governance** | `autoprocess`, `status`, `doctor`, `explain`, `results` |

## Documentation

We follow the [Diátaxis framework](https://diataxis.fr/).

- **🎓 Tutorials:** [Getting Started](docs/tutorials/getting_started.md), [Predictive Monitoring](docs/tutorials/predictive_monitoring.md), [Cognition Contracts](docs/tutorials/cognition_contracts.md)
- **🛠️ How-To Guides:** [OTEL Configuration](docs/how-to/configure_observability.md), [Edge Deployment](docs/how-to/edge_deployment.md), [Concept Drift](docs/how-to/concept_drift.md)
- **📚 Reference:** [CLI Commands](docs/reference/cli_commands.md), [Configuration Schema](docs/reference/configuration_schema.md), [WASM API Catalog](docs_quarantine/WASM_API.md)
- **🧠 Explanation:** [Architecture Overview](docs/explanation/architecture_overview.md), [Old AI vs. LLM Doctrine](docs/explanation/old_ai_vs_llms.md), [Combinatorial Maximalism](docs_quarantine/explanation/combinatorial_maximalism_closure_discipline.md)

### Additional Resources
- [Testing Doctrine](docs_quarantine/TESTING.md)
- [Adversarial Test Plan](docs_quarantine/ADVERSARIAL_TEST_PLAN.md)
- [Claude Code Integration](docs_quarantine/CLAUDE.md)
- [Contributing Guidelines](CONTRIBUTING.md)

## Contact

For questions or support, reach out at [info@chatmangpt.com](mailto:info@chatmangpt.com).

## License

Apache-2.0 OR MIT. See [LICENSE-APACHE](LICENSE-APACHE) and [LICENSE-MIT](LICENSE-MIT).
