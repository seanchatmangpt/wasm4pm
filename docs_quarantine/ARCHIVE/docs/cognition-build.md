# Cognition Build Pipeline

Architecture diagrams: #11 (Phase 1 Tear-Down/Rebuild), #12 (Rust-to-TS Build Pipeline).

## Overview

The cognition build pipeline converts the `crates/wasm4pm-cognition` Rust crate into a
WebAssembly binary, generates a thin TypeScript boundary in `packages/cognition`, and wires
the result into the `wpm` CLI at `apps/wasm4pm/src/commands/cognition.ts`.

```
crates/wasm4pm-cognition/src/
  (Rust: 9 breeds + autosystems + wasm.rs)
        |
        | cargo check (native)
        | cargo check --target wasm32-unknown-unknown
        | wasm-pack build --target nodejs   -> pkg/
        | wasm-pack build --target bundler  -> pkg-bundler/
        v
packages/cognition/
  (TS boundary: init.ts + index.ts — zero business logic)
        |
        | pnpm build
        v
apps/wasm4pm/src/commands/cognition.ts
  (CLI command: delegates to TS boundary, emits receipts)
```

## Single-command entry points

From the workspace root:

```bash
make cognition-build    # Full pipeline: Rust + wasm-pack + TS + CLI
make cognition-verify   # V1-V8 gate: type-check + all tests
make cognition-doctor   # 9-check capability probe
make cognition-dod      # 10-item DoD checklist
make cognition-cycle    # Replay cycle: run -> receipt -> replay -> verify
```

From the crate directory (`crates/wasm4pm-cognition`):

```bash
cargo make              # default alias -> verify
cargo make check        # native type-check only
cargo make check-wasm   # WASM type-check only
cargo make test-native  # unit + integration tests
cargo make test-anti-fraud    # anti-fraud gate
cargo make test-adversarial   # 8 adversarial bypass tests
cargo make build-all    # full build (both wasm-pack targets)
cargo make verify       # full verify gate (all of the above)
cargo make doctor       # capability probe
cargo make dod          # DoD checklist
cargo make cycle        # replay cycle
```

## Pipeline stages

### Stage 1 — Native type-check

```bash
cargo check -p wasm4pm-cognition
```

Verifies the crate compiles on the host target. No codegen. Fast.

### Stage 2 — WASM type-check

```bash
cargo check -p wasm4pm-cognition --features wasm --target wasm32-unknown-unknown
```

Verifies the `wasm` feature gate is sound. Catches WASM-incompatible APIs
(e.g., `std::time::Instant`, thread-local storage, `rayon`) before wasm-pack runs.

### Stage 3 — wasm-pack nodejs

```bash
wasm-pack build --target nodejs --features wasm --out-dir pkg
```

Produces `pkg/wasm4pm_cognition.js` + `pkg/wasm4pm_cognition_bg.wasm`.
This is the artifact consumed by the TS boundary at test time and in Node.js environments.

### Stage 4 — wasm-pack bundler

```bash
wasm-pack build --target bundler --features wasm --out-dir pkg-bundler
```

Produces the bundler-compatible artifact for browser/webpack/vite consumers.

### Stage 5 — TS boundary build

```bash
cd packages/cognition && pnpm build
```

The TS boundary (`packages/cognition/src/index.ts`) is a thin delegation layer.
It must contain zero business logic — all computation happens in WASM.
Zero-logic compliance is verified by `src/__tests__/zero-logic.test.ts`.

### Stage 6 — CLI build

```bash
cd apps/wasm4pm && pnpm build
```

Compiles the `wpm cognition` command. The CLI command is the user-facing entry point
and must not contain any `console.log` stubs or placeholder implementations.

## Incremental builds

The pipeline is designed for incremental builds. Each stage is independent:

- If only Rust source changed: run stages 1-4 only (`cargo make build-all`).
- If only TS changed: run stage 5-6 only (`pnpm build` in the relevant package).
- If only CLI changed: run stage 6 only.

## Troubleshooting

**WASM check fails with "use of unstable feature"**: The crate is using an API not available
on `wasm32-unknown-unknown`. Common offenders: `std::time::Instant`, `std::thread`,
`std::sync::Mutex`. Use the patterns in `wasm4pm/src/` as references.

**wasm-pack fails with "error: the wasm32-unknown-unknown target is not installed"**:
```bash
rustup target add wasm32-unknown-unknown
```

**TS build fails with "cannot find module 'wasm4pm-cognition'"**: The pkg/ directory
must be present before building the TS boundary. Run stage 3 first:
```bash
cd crates/wasm4pm-cognition && cargo make wasm-pack-nodejs
```
