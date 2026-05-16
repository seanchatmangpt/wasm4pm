# wasm4pm — Claude Code Configuration

**REQUIRED READING:**
- **Root instructions**: See `../CLAUDE.md` (Constitutional Law, Evidence Standards, Git Safety, Dependencies)

## What this project is

**wasm4pm** is a process mining platform with two layers:

1. **Rust/WASM core** (`wasm4pm/` — Cargo workspace member) — 36 algorithms registered in the kernel registry, compiled to WebAssembly via wasm-pack. This is the algorithm backend. Users rarely touch it directly.

2. **TypeScript monorepo** (`packages/` + `apps/`) — 11 packages that wrap, orchestrate, and expose the WASM core via a professional CLI (`wpm` (wasm4pm)), configuration system, observability, contracts, and testing harnesses.

The primary entry point for users is **`wpm` (wasm4pm)** (`apps/wasm4pm/`). The primary entry point for developers extending the system is the **`packages/`** monorepo.

**State machine source of truth:** `packages/engine/src/transitions.ts` — the VALID_TRANSITIONS map is authoritative, not the CLAUDE.md diagram.

**WASM API reference:** `WASM_API.md` — complete catalog of all `wasm_bindgen` exports (70+ functions across 10 modules). Source scattered across `wasm4pm/src/*.rs`.

**Testing docs:** `TESTING.md` (test layers, oracle hierarchy, gotchas), `ADVERSARIAL_TEST_PLAN.md` (categories A–H with specific tests and oracle ranks).

---

## Versioning: CalVer (Calendar Versioning)

**Format:** `vYEAR.MONTH.DAY` — PATCH is literally the day of month (1-31)
- `v26.4.9` = April 9, 2026
- `v26.4.10` = April 10, 2026
- Multiple releases same day: `v26.4.10a`, `v26.4.10b`, `v26.4.10c` (letter suffixes)

**Key points:**
- Day advances when calendar date changes OR if multiple patches exhausted in one day
- This is NOT standard CalVer — PATCH = day of month, not cumulative counter
- Never use a PATCH value > 31 — it's the day of month, not a counter
- When you need a second release on April 10, use `v26.4.10a`, not `v26.4.11`

---

## Repository structure

```
wasm4pm/
├── Cargo.toml              # Rust workspace (member: wasm4pm/)
├── wasm4pm/                # Rust/WASM core — algorithms
│   ├── src/                # Rust sources (discovery.rs, conformance.rs, etc.)
│   ├── Cargo.toml
│   └── package.json        # npm package for the compiled WASM
├── packages/               # TypeScript monorepo (11 packages)
├── apps/
│   └── wasm4pm/              # CLI tool (@wasm4pm/cli)
├── lab/                    # Post-publish artifact validation (tests published npm package)
└── playground/             # Local dev behavior testing (tests local source)
```

---

## TypeScript packages (`packages/`)

| Package | Role |
|---|---|
| `@wasm4pm/contracts` | Shared types + receipts + errors + plans + hashing + algorithm registry + prediction tasks (leaf package, no deps) |
| `@wasm4pm/engine` | Engine lifecycle state machine (uninitialized → bootstrapping → ready → planning → running → watching / degraded / failed) |
| `@wasm4pm/kernel` | WASM facade — 36 registered algorithms (per `packages/kernel/src/registry.ts`), `run(algorithmName, handle, params)`, streaming via `stream()` |
| `@wasm4pm/config` | Zod-validated config, `resolveConfig()`, 5-layer precedence (CLI > TOML > JSON > ENV > defaults), provenance tracking |
| `@wasm4pm/planner` | `plan(config)` → `ExecutionPlan`, `explain(config)` → string. 4 profiles: fast/balanced/quality/stream |
| `@wasm4pm/observability` | 3-layer: CLI human output, JSONL machine output, OTEL spans. `Instrumentation.create*Event()` |
| `@wasm4pm/testing` | Parity harness, determinism harness, CLI harness, OtelCapture, certification gates, fixtures, mocks |
| `@wasm4pm/ml` | Micro-ML analysis: classify, cluster, forecast, anomaly, regress, PCA |
| `@wasm4pm/swarm` | Multi-worker coordinator with convergence detection |

---

## Engine state machine

```
                          ┌──────────────────────────────────────────────┐
                          │                                              │
                          ▼                                              │
  uninitialized → bootstrapping → ready ──→ planning ──→ running ──→ watching
                     │    │    ▲         │    ▲         │    ▲         │
                     │    │    │         │    │         │    │         │
                     │    │    │         │    │         │    │         │
                     ▼    ▼    │         ▼    ▼         ▼    ▼         ▼
                   failed  degraded ──→ failed  degraded ──→ failed  degraded

  Recovery paths:
    failed → bootstrapping (re-init)     failed → ready (fast recovery, MTTR <1s)
    degraded → bootstrapping (recovery)  degraded → ready (soft recovery)
    any active → degraded | failed       watching → ready (stop watching)
```

Key API: `engine.bootstrap()`, `engine.plan(config)`, `engine.run(plan)`, `engine.watch(plan)`, `engine.state()`, `engine.degrade(error)`, `engine.recover()`, `engine.getTransitionHistory()`

---

## Config system

`resolveConfig(options?)` returns a `Config` with Zod-validated sections:

```typescript
{
  source: { kind: 'file'|'stream'|'http', path?, url? }
  sink:   { kind: 'stdout'|'file'|'http', path?, url? }
  algorithm: { name: string, parameters: Record<string, unknown> }
  execution: { profile: 'fast'|'balanced'|'quality'|'stream', timeout?, maxMemory? }
  observability: { otel?: { enabled, exporter, endpoint }, logLevel, metricsEnabled? }
  watch: { enabled, poll_interval, checkpoint_dir? }
  output: { format: 'human'|'json', destination, pretty, colorize }
  prediction?: { enabled, activityKey, ngramOrder, driftWindowSize, tasks[] }
  metadata: { loadTime, hash, provenance: Record<key, { source, path?, timestamp }> }
}
```

ENV var mappings: `WASM4PM_PROFILE`, `WASM4PM_ALGORITHM`, `WASM4PM_OUTPUT_FORMAT`, `WASM4PM_LOG_LEVEL`, `WASM4PM_WATCH`, `WASM4PM_OTEL_ENABLED`, `WASM4PM_OTEL_ENDPOINT`

Config file names searched: `wasm4pm.toml`, `wasm4pm.json`

---

## wasm4pm commands (29 total — count from `apps/wasm4pm/src/commands/*.ts`)

### Core
| Command | Exit codes | Description |
|---|---|---|
| `wpm run <log.xes>` | 0 success, 2 bad input, 3 WASM fail | Process discovery |
| `wpm compare <algos> -i <log>` | 0 | Side-by-side algorithm comparison with ASCII sparklines |
| `wpm diff <log1> <log2>` | 0 | Compare two logs via Jaccard similarity on DFG edges |
| `wpm watch` | 0 | Config file watcher — re-runs discovery on change |
| `wpm status` | 0 | WASM engine health + system info |

### Prediction
| Command | Description |
|----------|-------------|
| `wpm predict <task> -i <log>` | Predictive mining (next-activity, remaining-time, outcome, drift, features, resource) |
| `wpm drift-watch -i <log>` | Real-time EWMA drift monitoring (streaming) |

### Analysis & ML
| Command | Description |
|----------|-------------|
| `wpm ml <task> -i <log>` | ML-powered process mining (classify, cluster, forecast, anomaly, regress, pca) |
| `wpm powl <subcommand>` | POWL model analysis (parse, simplify, convert, diff, complexity, footprints, conformance, import, discover) |

### Quality & Conformance
| Command | Description |
|----------|-------------|
| `wpm quality` | Multi-dimensional quality assessment of a process model |
| `wpm conformance` | Measure log-to-model fitness and precision |
| `wpm validate` | Validate event log schema, required attributes, and data quality |

### Analysis & Simulation
| Command | Description |
|----------|-------------|
| `wpm simulate` | Monte Carlo simulation and process tree playout |
| `wpm temporal` | Analyze temporal profiles and performance patterns |
| `wpm social` | Mine social networks from event logs |

### Autonomic & Utility
| Command | Description |
|----------|-------------|
| `wpm autoprocess` | AutoProcess: Perception → Decision → Protection → Optimization |
| `wpm doctor` | 17-check environment diagnostic |
| `wpm explain` | Human/academic algorithm explanations |
| `wpm init` | Scaffold `wasm4pm.toml`, `.env.example`, `.gitignore` |
| `wpm results` | Browse/inspect saved results in `.wasm4pm/results/` |

**Exit code contract:** 0=success, 1=config_error, 2=source_error, 3=execution_error, 4=partial_failure, 5=system_error

**Output formats:** `--format human` (consola colored output) or `--format json` (`{ status, message, ...data }`)

Auto-saves: discovery and prediction results to `.wasm4pm/results/<timestamp>-<task>.json` (pass `--no-save` to skip)

---

## Kernel algorithms (36 registered)

From `packages/kernel/src/registry.ts`:

### Discovery (15)

| Algorithm ID | Speed | Quality | Output |
|---|---|---|---|
| `dfg` | 5 (fastest) | 30 | DFG |
| `process_skeleton` | 3 | 25 | DFG |
| `alpha_plus_plus` | 20 | 45 | Petrinet |
| `heuristic_miner` | 25 | 50 | DFG |
| `inductive_miner` | 30 | 55 | Tree |
| `hill_climbing` | 40 | 55 | Petrinet |
| `declare` | 35 | 50 | Declare |
| `simulated_annealing` | 55 | 65 | Petrinet |
| `a_star` | 60 | 70 | Petrinet |
| `aco` | 65 | 75 | Petrinet |
| `pso` | 70 | 75 | Petrinet |
| `genetic_algorithm` | 75 | 80 | Petrinet |
| `optimized_dfg` | 70 | 85 | DFG |
| `ilp` | 80 | 90 | Petrinet |
| `simd_streaming_dfg` | 2 | 28 | DFG |

### ML Analysis (6)

| Algorithm ID | Speed | Quality | Output |
|---|---|---|---|
| `ml_classify` | 40 | 60 | ml_result |
| `ml_cluster` | 35 | 55 | ml_result | ⚠️ internal only — not yet exported to JS API |
| `ml_forecast` | 30 | 50 | ml_result |
| `ml_anomaly` | 30 | 55 | ml_result |
| `ml_regress` | 25 | 50 | ml_result |
| `ml_pca` | 35 | 50 | ml_result |

### Analysis & Utilities (20+)

`transition_system`, `log_to_trie`, `causal_graph`, `performance_spectrum`, `batches`, `correlation_miner`, `generalization`, `petri_net_reduction`, `etconformance_precision`, `alignments`, `complexity_metrics`, `pnml_import`, `bpmn_import`, `powl_to_process_tree`, `yawl_export`, `playout`, `monte_carlo_simulation`, `hierarchical_dfg`, `streaming_log`, `smart_engine`

### ML Analysis Algorithms

| Algorithm ID | Speed | Quality | Output |
|---|---|---|---|
| `ml_classify` | 40 | 60 | ml_result |
| `ml_cluster` | 35 | 55 | ml_result | ⚠️ internal only — not yet exported to JS API |
| `ml_forecast` | 30 | 50 | ml_result |
| `ml_anomaly` | 30 | 55 | ml_result |
| `ml_regress` | 25 | 50 | ml_result |
| `ml_pca` | 35 | 50 | ml_result |

ML algorithms support `balanced` and `quality` profiles.

Profiles: `fast` → dfg/skeleton; `balanced` → heuristic/alpha + all ML; `quality` → genetic/ilp + all ML; `stream` → streaming-dfg

---

## Testing approach

### Layers
- **`packages/*/src/__tests__/`** — unit tests per package (inline mocks, internal correctness)
- **`playground/`** — local dev behavior (uses `@wasm4pm/testing` harnesses against local source)
- **`lab/`** — post-publish validation (runs against installed npm artifact)

### `@wasm4pm/testing` harnesses

```typescript
import { checkParity, checkParityBatch }    from '@wasm4pm/testing'; // explain() == plan()
import { checkDeterminism, stableReceiptHash, receiptsMatch } from '@wasm4pm/testing';
import { runCli, assertExitCode, assertJsonOutput, createCliTestEnv, EXIT_CODES } from '@wasm4pm/testing';
import { OtelCapture, createOtelCapture }   from '@wasm4pm/testing';
import { CertificationGate, runCertification } from '@wasm4pm/testing';
```

---

## Build commands

### TypeScript packages (run from monorepo root or individual package)
```bash
pnpm build                    # build all packages
pnpm test                     # test all packages
cd packages/engine && npm test # test one package
```

### wasm4pm CLI
```bash
cd apps/wasm4pm
npm run build                 # tsc → dist/
npm test                      # vitest
```

### WASM core (run from wasm4pm/ subdirectory)
```bash
cd wasm4pm
npm run build                 # wasm-pack bundler target
npm run build:nodejs          # Node.js target
npm run build:all             # all targets
npm test                      # vitest unit + integration
npm run build:profiles        # build all 5 deployment profiles
npm run measure-sizes         # measure WASM binary sizes
```

### Rust
```bash
cargo check                   # fast type check
cargo build --release         # build WASM library
cargo test                    # Rust unit tests
cargo test --test feature_gating_tests --features browser  # test feature gating
```

### MCP Server (wasm4pm/)
```bash
cd wasm4pm
npm run build:mcp            # compile MCP server
npm run start:mcp            # build + run MCP server
```

---

## Feature Flags & Deployment Profiles

wasm4pm uses **12 canonical feature flags** that map to **5 deployment profiles**. Feature gates in `Cargo.toml` control which modules compile for each profile.

### Canonical Feature Flags (WASM Feature API)

| Feature | Purpose | Profiles |
|---------|---------|----------|
| `feature-conformance-basic` | Token-based replay fitness | All |
| `feature-conformance-full` | Alignments + full conformance | fog, browser |
| `feature-discovery-advanced` | Genetic, ILP, ACO, PSO | edge, fog, browser |
| `feature-ml` | ML algorithms (6 total) | fog, browser |
| `feature-ocel` | Object-centric event logs | fog, browser |
| `feature-powl` | Partial-order workflows | browser only |
| `feature-streaming-basic` | DFG streaming | edge, fog, browser |
| `feature-streaming-full` | SIMD-accelerated streaming | fog, browser |
| `feature-gpu` | GPU acceleration (non-WASM) | N/A for WASM |
| `feature-hand-rolled-stats` | Size optimization | mobile, iot, edge |
| `feature-statrs` | Full-precision statistics | fog, browser |
| `feature-rayon` | Parallel processing (non-WASM) | N/A for WASM |

### Deployment Profiles (5 Size Tiers)

| Profile | Target | Size Target | Features | Algorithms |
|---------|--------|-------------|----------|-----------|
| `mobile` | Mobile devices | ~500KB | basic discovery, conformance | ~10-15 |
| `iot` | IoT devices, embedded | ~1MB | basic discovery, conformance | ~12-18 |
| `edge` | CDN workers, edge servers | ~1.5MB | adv. discovery, basic streaming | ~18-25 |
| `fog` | Fog computing, gateways | ~2MB | all except POWL, full streaming, ML | ~35-40 |
| `browser` | Web browsers (DEFAULT) | **2.7MB** (measured: 2,752,160 bytes in `wasm4pm/pkg/wasm4pm_bg.wasm`) | all features (36 kernel-registered algorithms; many additional internal WASM exports) | 36 |

### Build Commands by Profile

```bash
cd wasm4pm

# Mobile profile (~500KB, 82% reduction)
cargo build --release --target wasm32-unknown-unknown --features mobile
npm run build:mobile

# IoT profile (~1MB, 64% reduction)
cargo build --release --target wasm32-unknown-unknown --features iot
npm run build:iot

# Edge profile (~1.5MB, 46% reduction)
cargo build --release --target wasm32-unknown-unknown --features edge
npm run build:edge

# Fog profile (~2MB, 28% reduction)
cargo build --release --target wasm32-unknown-unknown --features fog
npm run build:fog

# Browser profile (~2.7MB, baseline, all features, DEFAULT)
cargo build --release --target wasm32-unknown-unknown --all-features
npm run build  # or npm run build:browser

# Measure all sizes
npm run measure-sizes
```

### Feature Mapping to Internal Flags

Canonical features map to internal Rust `#[cfg]` flags:
- `feature-conformance-basic` → `conformance_basic`
- `feature-conformance-full` → `conformance_full`, `alignment_fitness`, `align_etconformance`
- `feature-discovery-advanced` → `discovery_advanced`, `genetic`, `ilp`, `a_star`, `aco`, `pso`, `simulated_annealing`
- `feature-ml` → `ml`, `ml_classify`, `ml_cluster`, `ml_forecast`, `ml_anomaly`, `ml_regress`, `ml_pca`
- `feature-ocel` → `ocel`
- `feature-powl` → `powl`
- `feature-streaming-basic` → `streaming_basic`, `streaming_dfg`
- `feature-streaming-full` → `streaming_full`, `streaming_basic`, `simd`
- `feature-gpu` → `gpu`, `dep:wgpu`, `dep:pollster`
- `feature-hand-rolled-stats` → `hand_rolled_stats`
- `feature-statrs` → `statrs`, `dep:statrs`
- `feature-rayon` → `rayon`, `dep:rayon`

### TypeScript Registry Integration

The `@wasm4pm/kernel` registry automatically detects available algorithms based on the WASM build profile. Each algorithm metadata includes `deploymentProfiles: DeploymentProfile[]`, which allows the registry to:

1. Report algorithm availability per profile
2. Suggest best algorithms for each profile
3. Enforce profile constraints in execution planning

Query registry for a profile:
```typescript
import { getRegistry } from '@wasm4pm/kernel';

const registry = getRegistry();
const browserAlgos = registry.getForDeploymentProfile('browser');
console.log(`Browser profile: ${browserAlgos.length} algorithms`);
```

---

## Contracts

```typescript
// Receipt — cryptographic proof of execution
interface Receipt {
  run_id: string;             // UUID v4
  config_hash: string;        // BLAKE3 hex-64
  input_hash: string;
  plan_hash: string;
  output_hash: string;
  status: 'success' | 'partial' | 'failed';
  summary: ExecutionSummary;
  algorithm: AlgorithmInfo;
  // ...
}

// Error codes: 200s=config, 300s=source, 400s=algorithm, 500s=wasm, 600s=sink, 700s=otel
// Result<T> discriminated union: ok(value) | err(string) | error(ErrorInfo)
// Plan: DAG of PlanNode (source|algorithm|sink) validated by validatePlanDAG()
```

---

## Key file locations

```
apps/wasm4pm/src/commands/     # run.ts, compare.ts, diff.ts, predict.ts, conformance.ts, simulate.ts, etc.
apps/wasm4pm/src/cli.ts            # CLI entry point with command registration
apps/wasm4pm/src/exit-codes.ts # EXIT_CODES constants
apps/wasm4pm/src/output.ts     # Formatter (human vs json)
packages/engine/src/engine.ts
packages/engine/src/transitions.ts
packages/engine/src/lifecycle.ts # StateMachine class
packages/engine/src/wasm-loader.ts
packages/engine/src/bootstrap.ts # Engine bootstrap logic
packages/kernel/src/registry.ts
packages/kernel/src/api.ts
packages/config/src/schema.ts
packages/config/src/resolver.ts
packages/contracts/src/receipt.ts
packages/contracts/src/errors.ts
packages/contracts/src/plan.ts
packages/contracts/src/result.ts
packages/testing/src/harness/parity.ts
packages/testing/src/harness/determinism.ts
packages/testing/src/harness/cli.ts
packages/testing/src/harness/otel-capture.ts
packages/observability/src/instrumentation.ts
packages/observability/src/fields.ts
packages/planner/src/planner.ts
packages/planner/src/explain.ts
packages/swarm/src/loop.ts        # Swarm orchestration loop
packages/swarm/src/convergence.ts # Convergence detection
apps/wasm4pm/src/ml-runner.ts    # ML task execution logic
apps/wasm4pm/src/commands/ml.ts  # `wpm ml` command
apps/wasm4pm/src/commands/powl.ts # `wpm powl` command
wasm4pm/src/                 # Rust algorithm implementations
wasm4pm/src/mcp_server.ts      # WASM MCP server
wasm4pm/src/rl_orchestrator.rs # RL orchestrator (5 agents, LinUCB)
wasm4pm/src/self_healing.rs     # Circuit breaker, retry policies
wasm4pm/src/spc.rs             # Western Electric rules, process capability
wasm4pm/src/spc_history.rs     # SPC ring buffer (100 snapshots)
wasm4pm/src/agentic/           # Agentic framework (9 traits, 14 modules)
```

---

## AAT V2 — Route catalog + cross-language ingest

**Route catalog** (`routes/*.powl.json`, 14 total). Authoring + hardening is committed; `wpm trace conform -m <model> -i <ocel.json>` evaluates a captured route against the model.

| Route | Type | Purpose |
|---|---|---|
| `adversarial-admissibility` | choice_graph | adversary suite write/audit/doctor route |
| `agent-proof-lifecycle` | choice_graph | reference admissible route (collect → verify → emit) |
| `claude-stop-proof-gate` | choice_graph | Claude Code stop-hook proof gate |
| `proof-pack-promotion` | choice_graph | proof-work → proof-packs sealed promotion |
| `ai-code-review` | choice_graph | lint → type_check → run_tests → summarize |
| `ai-refactor-with-tests` | choice_graph (rework loop) | refactor → tests → fix → commit |
| `ai-bug-fix-with-receipt` | sequence | reproduce → diagnose → patch → verify → commit |
| `ai-doc-update` | choice_graph (link_check loop) | read → edit → link_check → commit |
| `ai-test-writing` | partial_order | RGR (red → green → refactor) |
| `ai-config-change` | sequence | validate → apply → verify (Config max_count=1) |
| `ai-dependency-bump` | partial_order | audit → bump → test → lock |
| `ai-migration` | choice_graph (rollback alt-path) | plan → apply → verify \| rollback |
| `ai-perf-investigation` | sequence | baseline → profile → analyze → report |
| `ai-security-audit` | choice_graph | scan → triage → (fix \| document_exception) → sign_off |

**`Powl2Model.object_types`** enforces (V2): `created_by[]`, `terminated_by[]`, `schema` (JSON Schema path), `min_count`, `max_count`. All four are optional except `created_by`. Receipt schemas live under `schemas/receipts/`.

**Cross-language trace ingest** (`wpm trace ingest --from <lang>`):
- `rust` — backtrace format (`N: function::name` + `at file:line:col`)
- `typescript` — Node V8 (`at func (file:line:col)`)
- `python` — CPython (`File "path", line N, in func`)
- `java` — JVM (`at pkg.Class.method(File.java:N)`, follows `Caused by:`)
- `js` — V8 + SpiderMonkey/JSC variants
- Unknown `--from` value exits 1 (config_error), no silent fallback

**Adversary count: 24/24 blocked.** P22 schema, P23 cardinality, P24 lifecycle-not-terminated added in V2. Priority chain (longest-first wins): `ActivityOnlyFakeRoute → RouteConformanceGap → MissingRequiredStages → RouteSequenceMismatch → PartialOrderViolation → LifecycleNotTerminated → CardinalityViolation → ObjectLifecycleViolation → ReceiptSchemaViolation → InsufficientReceiptCoverage → TestRouteIncomplete`.

**Real fixtures** under `fixtures/real/`. Capture via `WASM4PM_CAPTURE_FIXTURE=1 WASM4PM_CAPTURE_LABEL=<name> wpm trace conform -m <model> -i <ocel>`. Replay test at `apps/wasm4pm/src/__tests__/real-fixtures.test.ts`.

---

## Common gotchas

- `WasmLoader` is a **singleton** — call `WasmLoader.reset()` between tests that need a clean state
- All receipts auto-save to `.wasm4pm/results/` unless `--no-save` is passed
- ENV var prefix is `WASM4PM_*` (verified in `packages/config/src/resolver.ts`) — precedence is CLI > file > ENV > defaults. Note: an older note in this file claimed "WASM4PM_* (NOT WASM4PM_*)" which was a copy-paste tautology; only one prefix exists.
- `assertRequiredAttributes()`, `assertValidTraces()`, `assertNonBlocking()` in OtelCapture return `string[]` (violations), not void/throw
- OTEL span `startTime`/`endTime` are in **nanoseconds** (`Date.now() * 1_000_000`)
- "bad algorithm" exit code is `SOURCE_ERROR` (2), not `CONFIG_ERROR` (1) — intentional
- `@wasm4pm/planner`'s `plan()` is **synchronous** (no async), but `PlannerLike` accepts either
- `cargo test --lib` exits with SIGABRT (signal 6) due to wasm-bindgen thread cleanup — all tests pass but process crashes on exit. This is pre-existing. Use `cargo test --lib 2>&1 | grep -c "^test .* ok$"` to verify pass count.
- Cargo workspace root is `wasm4pm/` (parent of `wasm4pm/`), so `cargo clippy` from `wasm4pm/` shows a harmless "profiles for the non root package" warning
- Crate name is `wpm` (wasm4pm), npm package is `@wasm4pm/cli`, but the source directory remains `wasm4pm/` — only published names changed, not filesystem layout
- `tests/*.rs` are integration tests (separate crates) — `pub(crate)` is NOT enough for external test access, items must be `pub`
- Cargo auto-discovers `tests/*.rs` but NOT `tests/subdir/*.rs` — use top-level `tests/*_tests.rs` files or add `tests/subdir/mod.rs`
- `to_js(&json!({...}))` silently returns `{}` on wasm32 — `serde_wasm_bindgen` cannot serialize `serde_json::Value`. Use `to_js_str(&json!({...}))` (defined in `utilities.rs`) instead; it serializes via `serde_json::to_string` + `JsValue::from_str`.
- `to_js` returns `JsValue::NULL` on native (non-wasm32) targets — the serialization path is **never exercised by `cargo test`**. Always validate WASM output via Node.js directly.
- Some WASM functions return a JS string (needs `JSON.parse`), others return a JS object. Pattern: `const parse = r => typeof r === 'string' ? JSON.parse(r) : r`
- `src/streaming/` has zero `#[wasm_bindgen]` exports — algorithms there are unreachable from JS. Check before assuming a streaming variant is usable.
- **Direct WASM testing** (bypasses CLI wrapper, which drops model data for handle-based algorithms):
  ```js
  const wasm = require('./wasm4pm/pkg/wasm4pm.js');
  const handle = wasm.load_eventlog_from_xes(fs.readFileSync('log.xes', 'utf8'));
  const parse = r => typeof r === 'string' ? JSON.parse(r) : r;
  const result = parse(wasm.discover_dfg(handle, 'concept:name'));
  ```
- Discovery function extra params (beyond `handle, activity_key`): `discover_heuristic_miner` needs `dependency_threshold: f64` (use `0.2`–`0.4` for real logs — `0.8` filters everything); `discover_causal_heuristic` needs `threshold: f64`; `discover_prefix_tree` needs `max_path_length: usize` (`0` = unlimited); `discover_simulated_annealing` needs `temperature: f64, cooling_rate: f64`; `discover_astar` needs `max_iterations: usize`; genetic/ant_colony/aco/pso need `population_size/num_ants, iterations`.
- Two separate ACO implementations: `discover_ant_colony` (`more_discovery.rs`, param `num_ants`) and `discover_aco_algorithm` (`genetic_discovery.rs`, param `ant_count`) — different fitness key names (`"fitness"` vs `"final_fitness"`).
