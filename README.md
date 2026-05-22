# wasm4pm

High-performance process mining in Rust/WebAssembly — 60 discovery and analysis algorithms, native OCEL 2.0 support, and nine Old-AI cognition breeds — all through one CLI (`wpm`).

**Old AI is the factory. LLMs are the brochure.**

## Install

```bash
npm install -g @wasm4pm/cli
```

Library for Node/TypeScript:

```bash
npm install wasm4pm
```

From the monorepo without a global install:

```bash
pnpm --filter @wasm4pm/cli exec wpm run data/small-example.xes
```

## Quick Start

Sample log: [`data/small-example.xes`](data/small-example.xes).

```bash
# Discover a process model (uses wasm4pm.toml in cwd when present)
wpm run data/small-example.xes

# Named algorithm — alias or registry ID
wpm run data/small-example.xes -a dfg
wpm run data/small-example.xes -a inductive

# Browse all 60 algorithms with speed/quality metadata
wpm algorithms

# Compare side-by-side (14 discovery aliases; full registry via wpm run -a)
wpm compare dfg,heuristic,inductive -i data/small-example.xes

# Environment and registry health
wpm doctor check
wpm status --format json
```

The CLI exposes **40+ top-level commands** (discovery, conformance, prediction, cognition, receipts, cell, and utilities). Run `wpm --help` for the full tree.

**Default algorithm:** `config.algorithm.name` from `wasm4pm.toml` / `wasm4pm.json`, else the first algorithm for your execution profile (`balanced` → `alpha_plus_plus`), else `heuristic_miner`. Run `wpm --help` for the full command tree.

## Algorithms

wasm4pm registers **60 algorithms** across discovery, conformance, simulation, ML, OCEL, prediction, and analytics. Domains include:

| Domain | Examples |
|--------|----------|
| Core discovery | `dfg`, `heuristic_miner`, `inductive_miner`, `genetic_algorithm`, `ilp` |
| Conformance & quality | `alignments`, `generalization`, `etconformance_precision` |
| OCEL / object-centric | `ocel_dfg`, `ocel_petri_net`, `ocel_oc_declare` |
| Prediction | `predict_next_activity`, `detect_drift` (via `wpm predict`) |
| ML analysis | `ml_classify`, `ml_cluster`, `ml_forecast` (via `wpm ml` or `wpm run`) |

List live metadata: `wpm algorithms` or `wpm algorithms --format json`.

See [Getting Started](docs/tutorials/getting_started.md) for alias examples and programmatic usage.

## Programmatic API

```typescript
import { readFileSync } from 'fs';
import { Kernel } from 'wasm4pm';
import * as wasm from 'wasm4pm';

const logHandle = wasm.load_eventlog_from_xes(
  readFileSync('data/small-example.xes', 'utf8')
);
const kernel = new Kernel(wasm);
await kernel.init();

const { output } = await kernel.discover('dfg', logHandle, {
  activity_key: 'concept:name',
});
console.log(output);
```

## Truex — OCEL 2.0 Execution Trust

Truex verifies object-centric execution equivalence with BLAKE3 digests and a structured refusal taxonomy.

```bash
wpm truex verify examples/out/truex_ocel2_valid.json
```

Profile: [Truex OCEL 2.0 Canonical Profile](docs/truex-ocel2-canonical-profile.md).

## Cognition (Old AI)

Nine breeds run natively in Rust and are exposed through `wpm cognition`:

```bash
wpm cognition run --contract mycin --input examples/cognition/mycin/intent.json
```

| Breed | Origin | Technique |
|-------|--------|-----------|
| ELIZA | 1966 | Pattern matching with slot binding |
| MYCIN | 1976 | Forward chaining + certainty factors |
| STRIPS | 1971 | Goal regression planning |
| Prolog | 1965 | Robinson unification + SLD resolution |
| CBR | 1992 | Jaccard similarity case retrieval |
| DENDRAL | 1969 | Constraint-driven enumeration |
| GPS | 1963 | Means-ends gap reduction |
| SOAR | 1987 | Preference-based operator selection |
| Hearsay-II | 1980 | Blackboard consensus fusion |

## Deployment Profiles

| Profile | Size | Use case |
|---------|------|----------|
| `mobile` | ~500KB | Mobile / low bandwidth |
| `iot` | ~1.0MB | Embedded |
| `edge` | ~1.5MB | CDN / edge workers |
| `fog` | ~2.0MB | IoT gateways |
| `browser` | ~2.7MB | Web + Node.js (default) |

Build a profile: `npm run build:mobile --workspace=wasm4pm`. See [Edge Deployment](docs/how-to/edge_deployment.md).

## Documentation

We follow the [Diátaxis framework](https://diataxis.fr/).

- **Tutorials:** [Getting Started](docs/tutorials/getting_started.md) · [Predictive Monitoring](docs/tutorials/predictive_monitoring.md) · [Cognition Contracts](docs/tutorials/cognition_contracts.md)
- **How-To:** [OTEL Configuration](docs/how-to/configure_observability.md) · [Edge Deployment](docs/how-to/edge_deployment.md) · [Concept Drift](docs/how-to/concept_drift.md)
- **Reference:** [CLI Commands](docs/reference/cli_commands.md) · [Configuration Schema](docs/reference/configuration_schema.md)
- **Explanation:** [Architecture Overview](docs/explanation/architecture_overview.md) · [Old AI vs. LLMs](docs/explanation/old_ai_vs_llms.md)

Release and evidence discipline: [AGENTS.md](AGENTS.md) · [Contributing](CONTRIBUTING.md)

## License

Apache-2.0 OR MIT. See [LICENSE-APACHE](LICENSE-APACHE) and [LICENSE-MIT](LICENSE-MIT).
