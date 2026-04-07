# CLAUDE.md — wasm4pm Project Guidelines

## What this project is

**wasm4pm** is a process mining platform with two layers:

1. **Rust/WASM core** (`wasm4pm/` — Cargo workspace member) — 14 discovery algorithms compiled to WebAssembly via wasm-pack. This is the algorithm backend. Users rarely touch it directly.

2. **TypeScript monorepo** (`packages/` + `apps/`) — 14 packages that wrap, orchestrate, and expose the WASM core via a professional CLI (`pmctl`), configuration system, observability, contracts, and testing harnesses.

The primary entry point for users is **`pmctl`** (`apps/pmctl/`). The primary entry point for developers extending the system is the **`packages/`** monorepo.

---

## Repository structure

```
wasm4pm/
├── Cargo.toml              # Rust workspace (member: wasm4pm/)
├── wasm4pm/                # Rust/WASM core — algorithms
│   ├── src/                # Rust sources (discovery.rs, conformance.rs, etc.)
│   ├── Cargo.toml
│   └── package.json        # npm package for the compiled WASM
├── packages/               # TypeScript monorepo (14 packages)
├── apps/
│   └── pmctl/              # CLI tool (@wasm4pm/pmctl v26.4.6)
├── lab/                    # Post-publish artifact validation (tests published npm package)
└── playground/             # Local dev behavior testing (tests local source)
```

---

## TypeScript packages (`packages/`)

| Package | Role |
|---|---|
| `@wasm4pm/engine` | Engine lifecycle state machine (uninitialized → bootstrapping → ready → planning → running → watching / degraded / failed) |
| `@wasm4pm/kernel` | WASM facade — 15 registered algorithms, `run(algorithmName, handle, params)`, streaming via `stream()` |
| `@wasm4pm/config` | Zod-validated config, `resolveConfig()`, 5-layer precedence (CLI > TOML > JSON > ENV > defaults), provenance tracking |
| `@wasm4pm/contracts` | Shared types: Receipt (BLAKE3 hashes), Plan (DAG), ErrorInfo (typed codes 200–799), Result<T> discriminated union |
| `@wasm4pm/testing` | Parity harness, determinism harness, CLI harness, OtelCapture, certification gates, fixtures, mocks |
| `@wasm4pm/observability` | 3-layer: CLI human output, JSONL machine output, OTEL spans. `Instrumentation.create*Event()` |
| `@wasm4pm/types` | Shared TypeScript types: `EngineState`, `ExecutionPlan`, `PlanStep`, `EngineStatus`, `ErrorInfo` |
| `@wasm4pm/planner` | `plan(config)` → `ExecutionPlan`, `explain(config)` → string. 4 profiles: fast/balanced/quality/stream |
| `@wasm4pm/connectors` | Source connectors (file, stream, HTTP) |
| `@wasm4pm/sinks` | Output sinks (stdout, file, HTTP) |
| `@wasm4pm/ocel` | Object-Centric Event Log support |
| `@wasm4pm/service` | HTTP service layer (Express + WebSocket) |
| `@wasm4pm/templates` | Process templates and patterns |
| `@wasm4pm/wasm4pm` | Core WASM library wrapper |

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

ENV var mappings: `WASM4PM_PROFILE`, `WASM4PM_ALGORITHM`, `WASM4PM_OUTPUT_FORMAT`, `WASM4PM_LOG_LEVEL`, `WASM4PM_WATCH`, `WASM4PM_OTEL_ENABLED`, `WASM4PM_OTEL_ENDPOINT`

Config file names searched: `wasm4pm.toml`, `wasm4pm.json`

---

## pmctl commands (11 total)

| Command | Exit codes | Description |
|---|---|---|
| `pmctl run <log.xes>` | 0 success, 2 bad input, 3 WASM fail | Process discovery |
| `pmctl compare <algos> -i <log>` | 0 | Side-by-side algorithm comparison with ASCII sparklines |
| `pmctl diff <log1> <log2>` | 0 | Compare two logs via Jaccard similarity on DFG edges |
| `pmctl predict <task> -i <log>` | 0 | Predictive mining (next-activity, remaining-time, outcome, drift, features, resource) |
| `pmctl drift-watch -i <log>` | 0 | Real-time EWMA drift monitoring (streaming) |
| `pmctl watch` | 0 | Config file watcher — re-runs discovery on change |
| `pmctl status` | 0 | WASM engine health + system info |
| `pmctl doctor` | 0 all ok, 1 any fail | 6-check environment diagnostic |
| `pmctl explain` | 0 | Human/academic algorithm explanations |
| `pmctl init` | 0 | Scaffold `wasm4pm.toml`, `.env.example`, `.gitignore` |
| `pmctl results` | 0 | Browse/inspect saved results in `.wasm4pm/results/` |

**Exit code contract:** 0=success, 1=config_error, 2=source_error, 3=execution_error, 4=partial_failure, 5=system_error

**Output formats:** `--format human` (consola colored output) or `--format json` (`{ status, message, ...data }`)

Auto-saves: discovery and prediction results to `.wasm4pm/results/<timestamp>-<task>.json` (pass `--no-save` to skip)

---

## Kernel algorithms (15 registered)

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

Profiles: `fast` → dfg/skeleton; `balanced` → heuristic/alpha; `quality` → genetic/ilp; `stream` → streaming-dfg

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

### pmctl CLI
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
wasm4pm/src/                 # Rust algorithm implementations (still live)
```

---

## Common gotchas

- `WasmLoader` is a **singleton** — call `WasmLoader.reset()` between tests that need a clean state
- All receipts auto-save to `.wasm4pm/results/` unless `--no-save` is passed
- ENV vars do **not** beat file config — precedence is CLI > file > ENV > defaults
- `assertRequiredAttributes()`, `assertValidTraces()`, `assertNonBlocking()` in OtelCapture return `string[]` (violations), not void/throw
- OTEL span `startTime`/`endTime` are in **nanoseconds** (`Date.now() * 1_000_000`)
- "bad algorithm" exit code is `SOURCE_ERROR` (2), not `CONFIG_ERROR` (1) — intentional
- `@wasm4pm/planner`'s `plan()` is **synchronous** (no async), but `PlannerLike` accepts either
