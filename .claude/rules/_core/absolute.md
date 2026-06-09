---
name: wasm4pm Absolute Rules
description: Non-negotiable rules + key gotchas for wasm4pm development
type: rules
---

# Absolute Rules

1. **Batch independent operations** in one message (parallel tool calls / one Bash call).
2. **Never save files to repo root** — only config (package.json, Cargo.toml, Makefile, ggen.toml) lives there. Use `wasm4pm/src/`, `packages/*/src/`, `crates/*/src/`, `apps/wasm4pm/src/`, `.claude/`.
3. **pnpm only** — never npm or yarn (workspace semantics).
4. **Check WASM binary before editing TS consumers** — `wasm4pm/pkg/` must exist; if not, `pnpm build` first.
5. **FM-5 forbidden**: never mock `init.js` in cognition tests (vi.mock/jest.mock/sinon.stub). At least one integration test must use real WASM.
6. **BLAKE3 receipt chain mandatory** — every `wpm run`/`wpm cognition run` emits a receipt to `.wasm4pm/receipts/latest.json` with non-empty signature, input_hashes, output_hashes. No `--no-receipt`.
7. **OTEL 100% coverage** — every public op emits spans with `service_name` + `status` ("ok"|"error"). No success claims without span evidence.
8. **Andon: STOP THE LINE** on `error[E`, `test.*FAILED`, `FM-5 violation`, `panicked at`, or `<new-diagnostics>`. Fix before continuing — never defer.

**Doctrine:** If the code says it worked but the test doesn't prove it with OTEL spans, it didn't work. (Full Chicago TDD / van der Aalst constitution: `~/.claude/rules/process-mining-chicago-tdd.md`.)

## Key gotchas
- `WasmLoader` is a singleton — `WasmLoader.reset()` between tests.
- `to_js(&json!({...}))` returns `{}` on wasm32 — use `to_js_str()`; `to_js` returns NULL on native.
- `cargo test --lib` may SIGABRT on exit — count passes via grep.
- ENV prefix `WASM4PM_*`; precedence CLI > TOML > JSON > ENV > defaults.
- Exit codes: 0 ok, 1 config, 2 source, 3 execution, 4 partial, 5 system.
- CalVer: vYY.M.D (PATCH = day of month, never >31; same-day suffixes a/b/c).
- Determinism is a merge gate: same input → bit-exact output (seed all RNG, sort HashMap iteration).
- Run vitest from the package directory, not monorepo root.
- Fitness threshold >0.85 for valid models; MCPP route admission requires exactly 1.0 conformance.
