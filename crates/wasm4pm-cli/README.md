# crates/wasm4pm-cli — Rust-native wpm binary

## Status: Secondary binary — NOT the published CLI

This crate produces a Rust-native binary also named `wpm`. It is a **secondary, developer-facing tool** and is NOT the binary that ships in the published `@wasm4pm/cli` npm package.

**The authoritative user-facing CLI is `apps/wasm4pm/` (TypeScript).**
It ships as `@wasm4pm/cli` on npm and exposes 35+ commands covering all Van der Aalst process mining perspectives.

This crate is part of the Cargo workspace (`Cargo.toml` members list) and builds as part of `cargo build --workspace`, but it is never referenced by `pnpm build` or the npm publish pipeline.

---

## Naming conflict warning

Both binaries are named `wpm` (per `[[bin]] name = "wpm"` in `Cargo.toml`).

- If a developer runs `cargo install --path crates/wasm4pm-cli`, the Rust binary lands in `~/.cargo/bin/wpm` and shadows the TypeScript CLI.
- The TypeScript CLI binary is `dist/bin/wpm.js` invoked via the npm `bin` field. It only shadows the Rust binary when installed via `npm install -g @wasm4pm/cli`.

**Source of truth by binary name:** The TypeScript CLI at `apps/wasm4pm/` is the source of truth for the `wpm` command. If both are installed, PATH order determines which runs.

---

## What this binary does

The Rust binary exposes a narrower, lower-level command set built directly on the `wasm4pm` Rust crate (not via WASM/JS bridge):

| Command | Description |
|---------|-------------|
| `doctor` | 4-check environment health (rustc, wasm-pack, Cargo.toml, src/) — simpler than the TypeScript `wpm doctor` (17 checks) |
| `wizard` | Interactive project setup — writes `.wasm4pm/config.json` with name, author, license, deployment profile |
| `telco status\|map\|dispatch` | Vision 2030 nanosecond architecture status display and simulated event dispatch |
| `mining discover\|conformance` | Process discovery (heuristic miner via `wasm4pm-algos`) and token-replay conformance against native types |
| `config get\|set` | Read/write key-value pairs in `.wasm4pm/config.json` |
| `autoprocess` | Calls `autonomic_execute_cycle()` directly on the Rust WASM crate — same Perception→Decision→Protection→Optimization pipeline as `wpm autoprocess` in the TypeScript CLI, but native |
| `agent list\|status\|switch\|reset` | Manage the 5 RL agents (QLearning, SARSA, DoubleQLearning, ExpectedSARSA, REINFORCE) via `RL_ORCHESTRATOR` thread-local |
| `spc status\|history` | Read the SPC ring buffer from `SPC_HISTORY` thread-local — Western Electric rule violations, cycle metrics |
| `audit` | SIMD-accelerated token replay (`simd_token_replay`) with Vision 2030 verdicts (TRUTHFUL/VARIANCE/DECEPTIVE) |
| `man` | Generate Markdown documentation for all commands |

---

## Key distinction from the TypeScript CLI

| Dimension | This crate (`crates/wasm4pm-cli`) | TypeScript CLI (`apps/wasm4pm/`) |
|-----------|-----------------------------------|----------------------------------|
| Binary name | `wpm` | `wpm` |
| Published | No | Yes (`@wasm4pm/cli` on npm) |
| Command count | 10 commands / subcommands | 35+ commands |
| WASM bridge | None — calls Rust crate directly | Yes — via `@wasm4pm/kernel` |
| Unique commands | `telco`, `spc`, `agent`, `wizard`, `audit` | `predict`, `drift-watch`, `powl`, `conformance`, `quality`, `simulate`, `temporal`, `social`, `swarm`, `repl`, `prolog8`, `membrane`, `trace`, and many more |
| Overlapping commands | `doctor`, `autoprocess`, `mining discover/conformance`, `config` | Same functional coverage, more complete |
| OTEL instrumentation | None | Full 3-layer (CLI/JSONL/OTEL spans) |
| Receipt chain | None | BLAKE3 receipts auto-saved to `.wasm4pm/results/` |
| Test harness | `assert_cmd` + `predicates` (5 tests in `tests/cli_tests.rs`) | `vitest` + `@wasm4pm/testing` harnesses |

---

## Commands unique to this binary (not in the TypeScript CLI)

These three commands have no TypeScript equivalent and represent real developer value:

### `wpm telco status|map|dispatch`
Visualizes the 8-dimensional event flow map (Perception → Enforcement) and simulates nanosecond-latency event dispatch through the Vision 2030 closed-loop architecture. Useful for understanding the RL orchestrator's cycle topology.

### `wpm spc status|history`
Direct read from the `SPC_HISTORY` thread-local ring buffer. Shows the last N cycles of Western Electric rule metrics (event_rate, trace_duration_avg, activity_frequency, health_state). The TypeScript CLI does not expose raw SPC ring buffer history.

### `wpm agent list|status|switch|reset`
Direct management of the 5 RL agents via the `RL_ORCHESTRATOR` thread-local. Allows switching the active learning algorithm at runtime. The TypeScript CLI's `wpm autoprocess` runs the orchestrator but does not expose agent-level controls.

---

## Commands with overlap (TypeScript CLI is source of truth)

| This crate | TypeScript equivalent | Notes |
|------------|----------------------|-------|
| `doctor` | `wpm doctor` | TypeScript has 17 checks; Rust has 4. TypeScript wins. |
| `autoprocess` | `wpm autoprocess` | TypeScript has OTEL + receipt chain. TypeScript wins. |
| `mining discover` | `wpm run <log.xes>` | TypeScript wraps full kernel with 35 algorithms. TypeScript wins. |
| `mining conformance` | `wpm conformance` | TypeScript has alignments + precision. TypeScript wins. |
| `config get\|set` | `wpm init` / ENV vars | TypeScript has Zod-validated 5-layer config. TypeScript wins. |
| `wizard` | `wpm init` | Both scaffold `.wasm4pm/`. TypeScript `init` is richer. |
| `audit` | `wpm conformance` / `wpm quality` | TypeScript exposes more quality dimensions. TypeScript wins. |

---

## Build

This crate builds with the rest of the Cargo workspace:

```bash
# From workspace root
cargo build -p wasm4pm-cli

# Install to ~/.cargo/bin (WARNING: shadows TypeScript wpm if installed)
cargo install --path crates/wasm4pm-cli

# Run tests
cargo test --test cli_tests
```

The binary is NOT included in any `pnpm build` or `npm publish` pipeline.

---

## Recommendation for contributors

- For user-facing process mining work, use the TypeScript CLI (`apps/wasm4pm/`).
- Use this crate for low-level debugging of the Rust RL/SPC/autonomic layer when you need direct access to `RL_ORCHESTRATOR` and `SPC_HISTORY` thread-locals without the JS bridge overhead.
- Do not `cargo install` this binary in shared environments where the TypeScript CLI is also installed — the naming conflict will cause confusion.
- If you add a command here, evaluate whether it belongs in the TypeScript CLI instead (with OTEL, receipts, and 35-command cohesion).
