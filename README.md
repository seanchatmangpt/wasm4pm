# wasm4pm

A process mining platform with a real Rust cognition kernel. 41 discovery algorithms compiled to WebAssembly. 9 old-AI breeds (ELIZA, MYCIN, STRIPS, Prolog, CBR, DENDRAL, GPS, SOAR, Hearsay-II) running natively in Rust, exposed through a thin TypeScript facade, surfaced through a single CLI binary (`wpm`).

The doctrine: **Old AI is the factory. LLMs are the brochure.**

## In 60 seconds

```bash
npm install -g @wasm4pm/cli

# Discover a process model from an event log
wpm run examples/loan-application.xes

# Predict next activity for a partial trace
wpm predict next-activity -i examples/loan-application.xes

# Run a cognition contract (MYCIN forward-chain + receipt)
wpm cognition run --contract mycin --input examples/cognition/mycin/symptoms.json

# Verify the receipt is cryptographically sound
wpm cognition verify --receipt-id <id-from-above>

# Replay to prove byte-identical determinism
wpm cognition replay --receipt-id <id-from-above>
```

Every output carries a **BLAKE3 receipt chain**. The receipt proves the run happened, which algorithm ran, what the inputs were, and what the outputs were. It can be replayed to verify determinism.

## What this is

**Process mining** is the science of extracting process models from event logs — finding the real process, not the documented one. Van der Aalst's framework defines three core activities: discovery (induce a model from a log), conformance checking (compare log to a normative model), and enhancement (bottleneck analysis, drift detection, predictive monitoring).

**wasm4pm** is a process mining platform. It ships 41 algorithms covering all three activities plus predictive process monitoring (6 perspectives: next activity, remaining time, outcome, concept drift, feature extraction, resource/intervention).

**The cognition kernel** is a separate layer. It implements 9 classical AI algorithms (the "old AI" of the 1960s-1980s) as production Rust code, compiled to WASM, with adversarial gates that detect false-pass patterns, and a BLAKE3 receipt chain that proves every run.

## Cognition (`@wasm4pm/cognition`, `wpm cognition`)

wasm4pm includes a real Rust **old-AI cognition kernel** — not LLM scaffolding. The doctrine: *"Old AI is the factory. LLMs are the brochure."*

### 9 breeds (Rust to wasm-bindgen to thin TS facade to CLI)

| Breed | Origin (paper, year) | Algorithm |
|-------|---------------------|-----------|
| **ELIZA** | Weizenbaum 1966 | Pattern matching with slot binding |
| **MYCIN** | Shortliffe 1976 | Forward chaining + Shortliffe CF combining |
| **STRIPS** | Fikes & Nilsson 1971 | Goal regression planning |
| **Prolog** | Robinson 1965 | Robinson unification + SLD resolution + occur check |
| **CBR** | Kolodner 1992 | Jaccard similarity case retrieval |
| **DENDRAL** | Buchanan & Lederberg 1969 | Constraint-driven enumeration |
| **GPS** | Newell & Simon 1963 | Means-ends gap reduction |
| **SOAR** | Laird, Rosenbloom & Newell 1987 | Preference-based operator selection + impasse |
| **Hearsay-II** | Erman & Lesser 1980 | Blackboard knowledge-source consensus |

Every breed produces an **inference trace** (the actual reasoning steps) and a **BLAKE3 receipt** (cryptographic proof the run happened). Every output passes through **8 adversarial gates** that detect false-pass patterns before the receipt is signed.

### The 8 adversarial gates

| Gate | What it detects |
|------|----------------|
| V1: Stub gate | `pub struct Stub`, `todo!()`, `unimplemented!()` in hot paths |
| V2: Human authority | Human-written text used as authoritative evidence |
| V3: Missing runtime evidence | Output not backed by an OTEL span |
| V4: Central event firehose | Single event stream routing to all consumers |
| V5: Agent self-certification | Agent certifying its own output without external anchor |
| V6: Missing benchmark | Performance claim without measured data |
| V7: Threshold-weakening repair | Repair that weakens a passing gate to make it pass |
| V8: Broken replay | Replay produces a different hash than the original run |

All 8 gates must pass (exit 0) before a receipt is signed. A receipt with exit code > 0 is not a proof of success — it is a proof of failure.

### Quickstart

```bash
make cognition-build         # build Rust + WASM + TS in one command
cd examples/cognition && make all   # run all 9 breeds; verify receipts

# Run a contract
wpm cognition run --contract eliza --input examples/cognition/eliza/intent.json

# Verify adversarial gates
wpm cognition verify --receipt-id <id>

# Replay for determinism proof
wpm cognition replay --receipt-id <id>

# Inspect a receipt
wpm cognition receipt --id <id>
```

### CLI verbs

```
wpm cognition run         Execute a cognition contract (breed + cost law)
wpm cognition explain     Dry-run plan (no side effects, no receipt)
wpm cognition verify      Verify all adversarial gates passed
wpm cognition receipt     Inspect a receipt by ID
wpm cognition adversarial List adversarial detectors and their status
wpm cognition replay      Replay a receipt to prove byte-identical determinism
wpm cognition plan        Show the planner execution plan
wpm cognition inspect     Inspect a cognition artifact
```

See [docs/cognition-overview.md](docs/cognition-overview.md) for a full primer and [docs/cognition-doctrine.md](docs/cognition-doctrine.md) for the architecture manifesto with inline diagrams.

## Process mining commands (20 total)

| Category | Commands |
|----------|----------|
| Core | `run`, `compare`, `diff`, `watch` |
| Prediction | `predict`, `drift-watch` |
| Analysis | `ml`, `powl` |
| Quality | `quality`, `conformance`, `validate` |
| Simulation | `simulate`, `temporal`, `social` |
| Autonomic | `autoprocess`, `status`, `doctor`, `explain` |
| Utility | `init`, `results` |

```bash
wpm run loan.xes                                   # discover process model
wpm compare dfg,heuristic_miner,ilp -i loan.xes   # side-by-side quality comparison
wpm conformance -i loan.xes                        # fitness + precision
wpm predict next-activity -i loan.xes             # next activity prediction
wpm predict remaining-time -i loan.xes            # remaining time prediction
wpm predict drift -i loan.xes                     # concept drift detection
wpm temporal -i loan.xes                          # bottleneck analysis
wpm social -i loan.xes                            # social network from handovers
wpm ml cluster -i loan.xes                        # ML-powered case clustering
```

## Architecture

```
CLI (wpm)
  └── TS facade (apps/wasm4pm/ + packages/)
        └── WASM kernel (41 process mining algorithms + 9 cognition breeds)
              └── Rust crate (wasm4pm-cognition, wasm4pm-algos)
```

Authority lives in Rust. The TypeScript layer forwards calls and formats output — it makes no cognitive decisions. See [ARCHITECTURE.md](ARCHITECTURE.md) for the full picture with mermaid diagrams.

## 41 process mining algorithms

| Tier | Algorithms | Output type |
|------|-----------|-------------|
| Fast | `dfg`, `process_skeleton`, `simd_streaming_dfg` | DFG |
| Balanced | `alpha_plus_plus`, `heuristic_miner`, `inductive_miner`, `hill_climbing`, `declare` | Petri net / Tree |
| Quality | `simulated_annealing`, `a_star`, `aco`, `pso`, `genetic_algorithm`, `ilp`, `optimized_dfg` | Petri net / DFG |
| ML | `ml_classify`, `ml_cluster`, `ml_forecast`, `ml_anomaly`, `ml_regress`, `ml_pca` | ML result |
| Utilities | conformance, simulation, import/export, streaming, analytics (20+) | varied |

## Deployment profiles (5 sizes)

| Profile | Size | Target |
|---------|------|--------|
| `mobile` | ~500KB | Mobile devices |
| `iot` | ~1MB | IoT / embedded |
| `edge` | ~1.5MB | CDN workers |
| `fog` | ~2MB | IoT gateways |
| `browser` | ~2.7MB | Web + Node.js (default) |

## Receipt chain

Every `wpm run` and `wpm cognition run` produces a BLAKE3-signed receipt:

```json
{
  "run_id": "uuid-v4",
  "config_hash": "blake3-hex-64",
  "input_hash": "blake3-hex-64",
  "plan_hash": "blake3-hex-64",
  "output_hash": "blake3-hex-64",
  "status": "success",
  "algorithm": { "name": "ilp", "version": "26.5.6" }
}
```

Receipts auto-save to `.wasm4pm/results/<timestamp>-<task>.json`. Pass `--no-save` to skip.

## Build

```bash
# TypeScript monorepo
pnpm build && pnpm test

# WASM core (from wasm4pm/ subdirectory)
cd wasm4pm && npm run build        # browser profile
cd wasm4pm && npm run build:all    # all profiles

# Cognition crate
make cognition-build

# Rust workspace
cargo check
```

## Testing

- `packages/*/src/__tests__/` — unit tests per package
- `playground/` — behavioral tests against local source
- `lab/` — artifact tests against published npm package
- `wasm4pm/tests/*.rs` — 29 integration test files (~490 tests)

```bash
pnpm test                                    # all TS packages
cd apps/wasm4pm && npm test                  # CLI tests
cargo test --test <name>                     # specific Rust integration test
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Key rules for cognition contributions: no stubs, no `todo!()`, no placeholder CI gates, three-layer evidence (OTEL span + test assertion + schema conformance).

## License

Apache-2.0 OR MIT. See [LICENSE-APACHE](LICENSE-APACHE) and [LICENSE-MIT](LICENSE-MIT).
