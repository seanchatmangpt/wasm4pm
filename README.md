# wasm4pm

High-performance process mining in Rust/WebAssembly — 60 discovery and analysis algorithms, native OCEL 2.0 support, and 13 Old-AI cognition breeds — all through one CLI (`wpm`).

**Old AI is the factory. LLMs are the brochure.**

## Install

`@wasm4pm/cli` is not yet published to npm. Use the monorepo directly:

```bash
# CLI requires the Node.js WASM target (once per clone)
cd wasm4pm && npm run build:nodejs && cd ..
npm exec --workspace @wasm4pm/cli -- wpm run data/small-example.xes
```

> **npm global install coming soon.** `npm install -g @wasm4pm/cli` will be available once the package is published to npmjs.org.

> **Dual-binary caveat:** Installing the Rust crate (`cargo install wasm4pm-cli`) places a second `wpm` binary on your `PATH` that only exposes ~10 commands. It may shadow the TypeScript CLI (`@wasm4pm/cli`, 50+ commands), which is the published source of truth. Run `wpm doctor` to detect binary shadowing and confirm which binary is active.

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

The CLI exposes **50+ top-level commands** (discovery, conformance, prediction, cognition, receipts, cell, and utilities). Run `wpm --help` for the full tree.

**Default algorithm:** `config.algorithm.name` from `wasm4pm.toml` / `wasm4pm.json`, else the first algorithm for your execution profile (`balanced` → `alpha_plus_plus`), else `simd_streaming_dfg`. Run `wpm --help` for the full command tree.

## Algorithms

wasm4pm registers **60 algorithms** across discovery, conformance, simulation, ML, OCEL, prediction, and analytics.

| Domain | Examples |
|--------|----------|
| Core discovery | `dfg`, `heuristic_miner`, `inductive_miner`, `genetic_algorithm`, `ilp` |
| Conformance & quality | `alignments`, `generalization`, `etconformance_precision` |
| OCEL / object-centric | `ocel_dfg`, `ocel_petri_net`, `ocel_oc_declare` |
| Prediction | `predict_next_activity`, `detect_drift` |
| ML analysis | `ml_classify`, `ml_cluster`, `ml_forecast` |
| Social Network | `handover_network`, `working_together_network` |

Full catalog: [Algorithms Reference](docs/reference/algorithms.md).

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

const { handle, metadata } = await kernel.discover('dfg', logHandle, {
  activity_key: 'concept:name',
});
console.log(handle, metadata);
```

## Truex — OCEL 2.0 Execution Trust

Truex verifies object-centric execution equivalence with BLAKE3 digests and a structured refusal taxonomy.

```bash
wpm truex verify examples/out/truex_ocel2_valid.json
wpm truex verify examples/out/truex_ocel2_forged.json   # structured refusal
```

Profile: [Truex OCEL 2.0 Canonical Profile](docs/truex-ocel2-canonical-profile.md). Tutorial: [Truex Receipt Verification](docs/tutorials/truex_receipts.md).

## Supabase

Sync wpm receipts and admitted TrueX envelopes to Postgres with RLS and an Edge Function ingest path:

```bash
wpm supabase sync-receipts
wpm truex verify examples/out/truex_ocel2_valid.json --ingest
wpm supabase doctor
```

Guide: [Supabase Integration](docs/how-to/supabase_integration.md).

## Cognition (Old AI)

Thirteen breeds run natively in Rust and are exposed through `wpm cognition`. Nine are classic Old-AI paradigms; four are Autoinstinct breeds:

```bash
wpm cognition run --contract mycin --input examples/cognition/mycin/intent.json
```

| Breed | Category | Origin | Technique |
|-------|----------|--------|-----------|
| STRIPS | Old AI | 1971 | Goal regression planning |
| Prolog | Old AI | 1965 | Robinson unification + SLD resolution |
| CBR | Old AI | 1992 | Jaccard similarity case retrieval |
| DENDRAL | Old AI | 1969 | Constraint-driven enumeration |
| GPS | Old AI | 1963 | Means-ends gap reduction |
| SOAR | Old AI | 1987 | Preference-based operator selection |
| Hearsay-II | Old AI | 1980 | Blackboard consensus fusion |
| Frame | Old AI | 1975 | Frame-based knowledge representation |
| Production Rules | Old AI | 1943 | Rule-based forward chaining |
| Autoinstinct: Vision | Autoinstinct | — | Autoinstinct visual perception |
| Autoinstinct: Semantics | Autoinstinct | — | Autoinstinct semantic reasoning |
| Autoinstinct: Neurosis | Autoinstinct | — | Autoinstinct neurosis detection |
| Autoinstinct: Learning | Autoinstinct | — | Autoinstinct adaptive learning |

## Deployment Profiles

Optimized WASM bundles for every environment. All profiles currently build to ~5–8 MB; feature-flag-based size reduction is in progress.

| Profile | Actual Size | Use case |
|---------|-------------|----------|
| `mobile` | ~5.4 MB | Mobile / low bandwidth |
| `iot` | ~5.4 MB | Embedded |
| `edge` | ~5.4 MB | CDN / edge workers |
| `fog` | ~5.4 MB | IoT gateways |
| `browser` | ~7.6 MB | Web + Node.js (default) |

> **Note:** Non-browser profiles share feature flags with the Node.js target and produce identical binary sizes (~5.4 MB) until per-profile `--features` forwarding is fully wired in the build scripts. Browser target compiles to ~7.6 MB. See [audit 2026-06-09](docs/audits/readme-validation-2026-06-09.md).

Detailed feature mapping and build instructions: [Deployment Profiles Reference](docs/reference/deployment_profiles.md).

## Documentation

We follow the [Diátaxis framework](https://diataxis.fr/).

- **Tutorials:** [Getting Started](docs/tutorials/getting_started.md) · [Truex Receipts](docs/tutorials/truex_receipts.md) · [Predictive Monitoring](docs/tutorials/predictive_monitoring.md) · [Cognition Contracts](docs/tutorials/cognition_contracts.md)
- **How-To:** [OTEL Configuration](docs/how-to/configure_observability.md) · [Edge Deployment](docs/how-to/edge_deployment.md) · [Concept Drift](docs/how-to/concept_drift.md)
- **Reference:** [CLI Commands](docs/reference/cli_commands.md) · [Algorithms](docs/reference/algorithms.md) · [Configuration Schema](docs/reference/configuration_schema.md) · [Truex Profile](docs/truex-ocel2-canonical-profile.md)
- **Explanation:** [Architecture Overview](docs/explanation/architecture_overview.md) · [Old AI vs. LLMs](docs/explanation/old_ai_vs_llms.md)

Release and evidence discipline: [AGENTS.md](AGENTS.md) · [Contributing](CONTRIBUTING.md)

## Versioning

wasm4pm uses **CalVer**: `vYEAR.MONTH.DAY` (e.g. `v26.6.9` = June 9, 2026). PATCH is the day of month (1–31); multiple releases on the same day use letter suffixes (`v26.6.9a`, `v26.6.9b`).

> **Warning:** Pin exact versions. Semver `^` and `~` ranges are unsafe with CalVer — a routine date rollover is not a compatible patch.

## Telemetry

Telemetry is **off by default**. No data leaves your environment without explicit configuration.

Opt in:

```bash
export WASM4PM_OTEL_ENABLED=1
export WASM4PM_OTEL_ENDPOINT=https://your-collector:4318
```

See [OTEL Configuration](docs/how-to/configure_observability.md) for span schema and filtering options.

## Security & Enterprise

- **Security disclosures:** [SECURITY.md](SECURITY.md)
- **Enterprise deployment guide:** [docs/ENTERPRISE.md](docs/ENTERPRISE.md)
- **Commercial licensing:** [COMMERCIAL_LICENSE.md](COMMERCIAL_LICENSE.md) — contact [xpointsh@gmail.com](mailto:xpointsh@gmail.com)

## License

**BUSL-1.1.** See [LICENSE](LICENSE).

Production use requires a commercial license. Contact [xpointsh@gmail.com](mailto:xpointsh@gmail.com) or see [COMMERCIAL_LICENSE.md](COMMERCIAL_LICENSE.md).

The license converts to **AGPL-3.0** after the Change Date specified in [LICENSE](LICENSE).
