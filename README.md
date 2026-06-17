# wasm4pm

High-performance process mining in Rust/WebAssembly — 60 discovery and analysis algorithms, native OCEL 2.0 support, and 39 Old-AI cognition breeds — all through one CLI (`wpm`).

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

Thirty-nine implemented/admitted breeds run natively in Rust and are exposed through `wpm cognition`:

```bash
wpm cognition run --contract tableaux --input examples/cognition/tableaux/intent.json
```

| # | Breed ID | Category | Key Technique |
|---|---|---|---|
| 1 | `ltl_monitor` | Temporal Logic | LTL runtime monitoring on traces |
| 2 | `allen_temporal` | Temporal Reasoning | Interval algebra constraint propagation |
| 3 | `fuzzy_logic` | Uncertain Reasoning | Fuzzy sets & approximate reasoning operators |
| 4 | `bayesian_network` | Probabilistic | Directed acyclic graph belief propagation |
| 5 | `csp_ac3` | Constraint Satisfaction | Arc consistency AC-3 constraint network solver |
| 6 | `default_logic` | Non-monotonic Logic | Reiter's default rules & extension generator |
| 7 | `htn_planning` | Planning | Hierarchical Task Network decomposition |
| 8 | `dempster_shafer` | Uncertain Reasoning | Belief functions & Dempster's rule of combination |
| 9 | `frames_inheritance` | Knowledge Representation | Frame-based slot/filler inheritance hierarchy |
| 10 | `ebl` | Machine Learning | Explanation-based generalization of proofs |
| 11 | `asp` | Logic Programming | Answer Set Programming stable model solving |
| 12 | `description_logic` | Knowledge Representation | ALC description logic subsumption checking |
| 13 | `abductive_lp` | Logic Programming | Abductive logic programming with integrity constraints |
| 14 | `abductive_ibe` | Uncertain Reasoning | Inference to the best explanation scoring |
| 15 | `partial_order_plan` | Planning | Least-commitment partial-order planning |
| 16 | `event_calculus` | Temporal Reasoning | Event calculus effect reasoning on fluents |
| 17 | `mdp` | Decision Theory | Markov Decision Process value iteration solver |
| 18 | `version_space` | Machine Learning | Candidate elimination concept learning |
| 19 | `belief_merging` | Knowledge Representation | Distance-based propositional belief merging |
| 20 | `qualitative_reason` | Qualitative Reasoning | Qualitative process theory sign/flow arithmetic |
| 21 | `script_sam` | Knowledge Representation | Schankian narrative script instantiation |
| 22 | `clp` | Constraint Programming | Constraint logic programming solver |
| 23 | `situation_calculus` | Temporal Reasoning | Golog-style situation calculus evaluation |
| 24 | `circumscription` | Non-monotonic Logic | McCarthy's abnormality predicate minimization |
| 25 | `analogy_sme` | Analogical Reasoning | Structure Mapping Engine analogy builder |
| 26 | `act_r` | Cognitive Architecture | Declarative/procedural cognitive step simulation |
| 27 | `problog` | Probabilistic Logic | Probabilistic logic program query solver |
| 28 | `sat_cdcl` | Boolean SAT | Conflict-Driven Clause Learning SAT solver |
| 29 | `episodic_memory` | Cognitive Architecture | Temporal indexing & recall of trace segments |
| 30 | `rl_symbolic` | Reinforcement Learning | Q-learning over symbolic state transitions |
| 31 | `ctl_check` | Model Checking | Computation Tree Logic model checking |
| 32 | `ilp` | Logic Programming | Inductive Logic Programming rule learning |
| 33 | `naive_physics` | Qualitative Reasoning | Qualitative reasoning on physics equations |
| 34 | `tableaux` | Logic Programming | Semantic tableaux first-order theorem prover |
| 35 | `construction_grammar` | Cognitive Systems | Construction grammar sentence parsing & coercion |
| 36 | `markov_logic` | Probabilistic Logic | Markov Logic Network inference |
| 37 | `pomdp` | Decision Theory | Partially Observable MDP point-based value iteration |
| 38 | `contingent_plan` | Planning | Contingent planning with sensing actions |
| 39 | `meta_reasoning` | Cognitive Systems | Meta-level monitoring & scheduler arbitration |

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
