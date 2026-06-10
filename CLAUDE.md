# wasm4pm — Claude Code Configuration

**REQUIRED READING:**
- **Quality Standards**: See `GEMINI.md` (Release and Proof Discipline, Evidence Gates)

## What this project is

**wasm4pm** is a process mining platform with two layers:

1. **Rust/WASM core** (`wasm4pm/`) — **60 algorithms** registered in the kernel registry, compiled to WebAssembly via wasm-pack. This is the deterministic algorithm backend.

2. **TypeScript monorepo** (`packages/` + `apps/`) — 12 packages that wrap, orchestrate, and expose the WASM core via a professional CLI (`wpm` (wasm4pm)), configuration, and observability.

**State Machine Source of Truth:** [Architecture Overview](docs/explanation/architecture_overview.md) (Engine State Machine section).

**WASM API Reference:** `WASM_API.md` — complete catalog of all `wasm_bindgen` exports.

**Testing Docs:** `TESTING.md` — test layers, oracle hierarchy, and Prolog8 AAT.

---

## Versioning: CalVer (Calendar Versioning)

**Format:** `vYEAR.MONTH.DAY` — PATCH is literally the day of month (1-31)
- `v26.4.9` = April 9, 2026
- `v26.4.10` = April 10, 2026
- Multiple releases same day: `v26.4.10a`, `v26.4.10b`, `v26.4.10c` (letter suffixes)

**Key points:**
- Day advances when calendar date changes OR if multiple patches exhausted in one day.
- Never use a PATCH value > 31 — it's the day of month, not a counter.

---

## Repository structure

```
wasm4pm/
├── Cargo.toml              # Rust workspace (member: wasm4pm/)
├── wasm4pm/                # Rust/WASM core — algorithms
├── crates/
│   ├── wasm4pm-cli/        # SECONDARY Rust binary (also named "wpm") — NOT published
│   ├── miniml-core/        # Micro-ML Rust crate
│   ├── wasm4pm-cognition/  # Cognition layer WASM crate
│   ├── prolog8/            # Prolog8 inference engine
│   └── ocpq/               # Object-centric process querying crate
│   # NOTE: wasm4pm-compat is crates.io only — never add a path dep.
├── packages/               # TypeScript monorepo (11 packages)
├── apps/
│   └── wasm4pm/            # PRIMARY CLI tool (@wasm4pm/cli) — this is what ships
├── lab/                    # Post-publish artifact validation
└── playground/             # Local dev behavior testing
```

### Source of Truth for `wpm` Binary

| Binary | Source | Published | Commands | Auth |
|--------|--------|-----------|----------|------|
| TypeScript CLI | `apps/wasm4pm/` | YES (`@wasm4pm/cli`) | 50+ | **Source of truth** |
| Rust CLI | `crates/wasm4pm-cli/` | NO | 10 | Developer tool |

---

## Configuration & Deployment

- **Config Schema:** See [Configuration Schema Reference](docs/reference/configuration_schema.md).
- **Deployment Profiles:** See [Deployment Profiles Reference](docs/reference/deployment_profiles.md).
- **Algorithms Registry:** See [Algorithms Reference](docs/reference/algorithms.md) (60 registered).

---

## TypeScript packages (`packages/`)

| Package | Role |
|---|---|
| `@wasm4pm/contracts` | Shared types + receipts + algorithm registry |
| `@wasm4pm/engine` | Engine lifecycle state machine |
| `@wasm4pm/kernel` | WASM boundary — 60 registered algorithms |
| `@wasm4pm/config` | Zod-validated config resolution (CLI > TOML > JSON > ENV > defaults) |
| `@wasm4pm/planner` | `plan(config)` → `ExecutionPlan`. 4 profiles: fast/balanced/quality/stream |
| `@wasm4pm/observability` | CLI human output, JSONL machine output, OTEL spans |
| `@wasm4pm/testing` | Parity, determinism, CLI, and certification harnesses |
| `@wasm4pm/ml` | Micro-ML: classify, cluster, forecast, anomaly, regress, PCA |
| `@wasm4pm/cognition` | Cognition layer — 13 breeds incl. 4 autoinstinct (vision/semantics/neurosis/learning) |
| `@wasm4pm/agents` | Agent orchestration layer |
| `@wasm4pm/supabase` | Supabase integration adapter |

---

## Build commands

### TypeScript
```bash
pnpm build && pnpm test
```

### WASM core (wasm4pm/)
```bash
npm run build          # Browser target (DEFAULT)
npm run build:nodejs   # Node.js target
npm test               # vitest unit + integration
```

### Rust
```bash
cargo check            # fast type check
cargo build --release  # build WASM library
cargo test             # Rust unit tests
```

---

## Common gotchas

- `WasmLoader` is a **singleton** — call `WasmLoader.reset()` between tests.
- All receipts auto-save to `.wasm4pm/results/` unless `--no-save` is passed.
- ENV var prefix is `WASM4PM_*`. Precedence: CLI > TOML > JSON > ENV > defaults.
- OTEL span `startTime`/`endTime` are in **nanoseconds**.
- Exit codes: 0 ok, 1 config, 2 source ("bad algorithm" = `SOURCE_ERROR`), 3 execution, 4 partial, 5 system.
- `to_js(&json!({...}))` silently returns `{}` on wasm32 — use `to_js_str()` in `utilities.rs`.
- `to_js` returns `JsValue::NULL` on native — validation MUST happen in Node.js.
- `cargo test --lib` may exit with SIGABRT (signal 6) — check pass count via grep.
- Run vitest from the package directory, not monorepo root.
- Determinism is a merge gate: same input → bit-exact output (seed all RNG, sort HashMap iteration).
- Fitness threshold >0.85 for valid models; MCPP route admission requires exactly 1.0 conformance.
- Discovery extra params: `discover_heuristic_miner(handle, activity_key, dependency_threshold)` (use 0.2-0.4).
- Audit records decay in both directions (understate AND overstate). Point-in-time audits were consolidated into `docs/audit-history.md` (verified on disk 2026-06-09) — check there first, and verify artifacts on disk before citing any audit doc or memory note.
