# CLAUDE.md — pictl Project Guidelines

## What this project is

**pictl** is a process mining platform with two layers:

1. **Rust/WASM core** (`wasm4pm/` — Cargo workspace member) — 21 algorithms (15 discovery + 6 ML) compiled to WebAssembly via wasm-pack. This is the algorithm backend. Users rarely touch it directly.

2. **TypeScript monorepo** (`packages/` + `apps/`) — 9 packages that wrap, orchestrate, and expose the WASM core via a professional CLI (`pictl`), configuration system, observability, contracts, and testing harnesses.

The primary entry point for users is **`pictl`** (`apps/pmctl/`). The primary entry point for developers extending the system is the **`packages/`** monorepo.

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
├── packages/               # TypeScript monorepo (9 packages)
├── apps/
│   └── pmctl/              # CLI tool (@pictl/cli v26.4.6)
├── lab/                    # Post-publish artifact validation (tests published npm package)
└── playground/             # Local dev behavior testing (tests local source)
```

---

## TypeScript packages (`packages/`)

| Package | Role |
|---|---|
| `@pictl/contracts` | Shared types + receipts + errors + plans + hashing + algorithm registry + prediction tasks (leaf package, no deps) |
| `@pictl/engine` | Engine lifecycle state machine (uninitialized → bootstrapping → ready → planning → running → watching / degraded / failed) |
| `@pictl/kernel` | WASM facade — 21 registered algorithms, `run(algorithmName, handle, params)`, streaming via `stream()` |
| `@pictl/config` | Zod-validated config, `resolveConfig()`, 5-layer precedence (CLI > TOML > JSON > ENV > defaults), provenance tracking |
| `@pictl/planner` | `plan(config)` → `ExecutionPlan`, `explain(config)` → string. 4 profiles: fast/balanced/quality/stream |
| `@pictl/observability` | 3-layer: CLI human output, JSONL machine output, OTEL spans. `Instrumentation.create*Event()` |
| `@pictl/testing` | Parity harness, determinism harness, CLI harness, OtelCapture, certification gates, fixtures, mocks |
| `@pictl/ml` | Micro-ML analysis: classify, cluster, forecast, anomaly, regress, PCA |
| `@pictl/swarm` | Multi-worker coordinator with convergence detection |

---

## Engine state machine

```
uninitialized → bootstrapping → ready ↔ planning → running → watching
                     ↓                      ↓              ↓
                   failed              degraded ←──────────┘
                     ↑                    ↓
                     └─── bootstrapping ←─┘  (recovery path)
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

ENV var mappings: `PICTL_PROFILE`, `PICTL_ALGORITHM`, `PICTL_OUTPUT_FORMAT`, `PICTL_LOG_LEVEL`, `PICTL_WATCH`, `PICTL_OTEL_ENABLED`, `PICTL_OTEL_ENDPOINT`

Config file names searched: `pictl.toml`, `pictl.json`

---

## pictl commands (13 total)

| Command | Exit codes | Description |
|---|---|---|
| `pictl run <log.xes>` | 0 success, 2 bad input, 3 WASM fail | Process discovery |
| `pictl compare <algos> -i <log>` | 0 | Side-by-side algorithm comparison with ASCII sparklines |
| `pictl diff <log1> <log2>` | 0 | Compare two logs via Jaccard similarity on DFG edges |
| `pictl predict <task> -i <log>` | 0 | Predictive mining (next-activity, remaining-time, outcome, drift, features, resource) |
| `pictl drift-watch -i <log>` | 0 | Real-time EWMA drift monitoring (streaming) |
| `pictl watch` | 0 | Config file watcher — re-runs discovery on change |
| `pictl status` | 0 | WASM engine health + system info |
| `pictl doctor` | 0 all ok, 1 any fail | 17-check environment diagnostic |
| `pictl explain` | 0 | Human/academic algorithm explanations |
| `pictl init` | 0 | Scaffold `pictl.toml`, `.env.example`, `.gitignore` |
| `pictl results` | 0 | Browse/inspect saved results in `.pictl/results/` |
| `pictl ml <task> -i <log>` | 0 | ML-powered process mining (classify, cluster, forecast, anomaly, regress, pca) |
| `pictl powl <subcommand>` | 0 | POWL model analysis (parse, simplify, convert, diff, complexity, footprints, conformance, import, discover) |

**Exit code contract:** 0=success, 1=config_error, 2=source_error, 3=execution_error, 4=partial_failure, 5=system_error

**Output formats:** `--format human` (consola colored output) or `--format json` (`{ status, message, ...data }`)

Auto-saves: discovery and prediction results to `.pictl/results/<timestamp>-<task>.json` (pass `--no-save` to skip)

---

## Kernel algorithms (21 registered)

From `packages/kernel/src/registry.ts`:

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

### ML Analysis Algorithms

| Algorithm ID | Speed | Quality | Output |
|---|---|---|---|
| `ml_classify` | 40 | 60 | ml_result |
| `ml_cluster` | 35 | 55 | ml_result |
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
- **`playground/`** — local dev behavior (uses `@pictl/testing` harnesses against local source)
- **`lab/`** — post-publish validation (runs against installed npm artifact)

### `@pictl/testing` harnesses

```typescript
import { checkParity, checkParityBatch }    from '@pictl/testing'; // explain() == plan()
import { checkDeterminism, stableReceiptHash, receiptsMatch } from '@pictl/testing';
import { runCli, assertExitCode, assertJsonOutput, createCliTestEnv, EXIT_CODES } from '@pictl/testing';
import { OtelCapture, createOtelCapture }   from '@pictl/testing';
import { CertificationGate, runCertification } from '@pictl/testing';
```

---

## Build commands

### TypeScript packages (run from monorepo root or individual package)
```bash
pnpm build                    # build all packages
pnpm test                     # test all packages
cd packages/engine && npm test # test one package
```

### pictl CLI
```bash
cd apps/pmctl
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
```

### Rust
```bash
cargo check                   # fast type check
cargo build --release         # build WASM library
cargo test                    # Rust unit tests
```

### MCP Server (wasm4pm/)
```bash
cd wasm4pm
npm run build:mcp            # compile MCP server
npm run start:mcp            # build + run MCP server
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
apps/pmctl/src/commands/     # run.ts, compare.ts, diff.ts, predict.ts, etc.
apps/pmctl/src/exit-codes.ts # EXIT_CODES constants
apps/pmctl/src/output.ts     # Formatter (human vs json)
packages/engine/src/engine.ts
packages/engine/src/transitions.ts
packages/engine/src/wasm-loader.ts
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
apps/pmctl/src/ml-runner.ts    # ML task execution logic
apps/pmctl/src/commands/ml.ts  # `pictl ml` command
apps/pmctl/src/commands/powl.ts # `pictl powl` command
wasm4pm/src/                 # Rust algorithm implementations (still live)
wasm4pm/src/mcp_server.ts      # WASM MCP server
```

---

## Common gotchas

- `WasmLoader` is a **singleton** — call `WasmLoader.reset()` between tests that need a clean state
- All receipts auto-save to `.pictl/results/` unless `--no-save` is passed
- ENV vars do **not** beat file config — precedence is CLI > file > ENV > defaults
- `assertRequiredAttributes()`, `assertValidTraces()`, `assertNonBlocking()` in OtelCapture return `string[]` (violations), not void/throw
- OTEL span `startTime`/`endTime` are in **nanoseconds** (`Date.now() * 1_000_000`)
- "bad algorithm" exit code is `SOURCE_ERROR` (2), not `CONFIG_ERROR` (1) — intentional
- `@pictl/planner`'s `plan()` is **synchronous** (no async), but `PlannerLike` accepts either
- `cargo test --lib` exits with SIGABRT (signal 6) due to wasm-bindgen thread cleanup — all tests pass but process crashes on exit. This is pre-existing. Use `cargo test --lib 2>&1 | grep -c "^test .* ok$"` to verify pass count.
- Cargo workspace root is `pictl/` (parent of `wasm4pm/`), so `cargo clippy` from `wasm4pm/` shows a harmless "profiles for the non root package" warning
- Crate name is `pictl`, npm package is `@seanchatmangpt/pictl`, but the source directory remains `wasm4pm/` — only published names changed, not filesystem layout
