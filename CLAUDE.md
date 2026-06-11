# wasm4pm — Claude Code Configuration

**Quality Standards:** See `GEMINI.md`. **SPR context:** `.claude/spr-context.md`.

## What this project is

**wasm4pm**: process mining platform. Two layers:
1. **Rust/WASM core** (`wasm4pm/`) — 60 algorithms, compiled via wasm-pack.
2. **TypeScript monorepo** (`packages/` + `apps/`) — 12 packages, `wpm` CLI ships from `apps/wasm4pm/` (`@wasm4pm/cli`). Rust CLI at `crates/wasm4pm-cli/` is a dev tool only.

**References:** [Architecture](docs/explanation/architecture_overview.md) · `WASM_API.md` · `TESTING.md`

## Versioning: CalVer `vYY.M.D`
PATCH = day of month (1–31, never higher). Same-day: append `a`, `b`, `c`.

## Key paths
`wasm4pm/` WASM core · `crates/wasm4pm-cognition/` cognition layer (52 PARTIAL_ALIVE breeds, v26.6.10) · `crates/prolog8/` · `apps/wasm4pm/` published CLI · `packages/` TS monorepo · `ocel/models/l1/` OCPN models · `ocel/reports/` fitness reports

**`wasm4pm-compat` is crates.io only — never add a path dep.**

## Build
```bash
pnpm build && pnpm test                                    # TypeScript
cargo check && cargo test                                   # Rust
wasm-pack build --target nodejs --out-dir pkg -- --features wasm  # cognition WASM
cargo check --target wasm32-unknown-unknown --features wasm        # wasm32 gate (required)
```

## Cognition breed rules (binding)
- **Anti-cheat ARD:** `docs/breeds/anti-cheat-threat-model.md` — per-breed counter-test must exist and pass.
- **Write ALL code first** (module → OCPN → lifecycle const → tests → fixtures), then build/test gates.
- `registry.json` flips UNSUPPORTED→PARTIAL_ALIVE only after gates green + OCEL report has measured-fitness provenance.
- Paper fixtures require `expected.value` + `provenance`; assert the published number (e.g. Pearl 0.284171835).
- Hidden-oracle fresh names must not appear in `src/breeds/` — grep gate in `anti_fraud_gate.rs` enforces A8.
- Determinism test uses shared `assert_deterministic` harness (full `BreedOutput` bytes). Hand-rolled = A11.
- `wpm compile --spec <f.json> [--run]` — multi-stage pipeline; unknown breed exits 2.

## Multi-agent reality
Multiple AI fleets may edit this repo simultaneously. If `cargo check` errors change between runs without your edits, another fleet is mid-write — isolate with `git worktree add ../wasm4pm-wt-<name>`. Treat other fleets' output as untrusted; audit line by line. Integrator unions branches alphabetically `--no-ff`; never rebase.

## Common gotchas
- `WasmLoader` is a singleton — call `WasmLoader.reset()` between tests.
- `cargo test --lib` may SIGABRT (signal 6) — check pass count via grep.
- Run vitest from the package directory, not monorepo root.
- `to_js(&json!({...}))` returns `{}` on wasm32 — use `to_js_str()`.
- wasm32 failures: `OcelLog` wrong field names; `ActorId::as_bytes()` → use `.public_key`.
- `rand` in cognition: `version="0.8", default-features=false, features=["small_rng"]`. Only RNG: `support::rng::seeded_rng()`.
- `CognitionBreed::postconditions` is 3 args: `(&self, input, output)`.
- All breed collections must be BTreeMap/BTreeSet/sorted Vec — HashMap order breaks determinism + receipts.
- Fitness >0.85 for valid models; MCPP route admission requires exactly 1.0.
- ENV prefix `WASM4PM_*`. Exit codes: 0 ok · 1 config · 2 source · 3 exec · 4 partial · 5 system.
- Audit records decay both ways — verify on disk before citing `docs/audit-history.md` or any memory note.
- **Andon:** stop on `error[E` · `test.*FAILED` · `FM-5 violation` · `panicked at` · `<new-diagnostics>`.
