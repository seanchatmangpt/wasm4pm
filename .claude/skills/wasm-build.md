---
name: WASM Build Workflow
description: wasm-pack build targets, profile selection, binary verification
paths: ["wasm4pm/", "crates/**/*.rs"]
type: skill
---

# Skill: WASM Build Workflow

## Purpose

Understand and execute wasm-pack builds for nodejs targets, profile selection strategies, and binary verification before consuming TS code.

## Build Targets

```bash
# nodejs target (most common for wasm4pm)
wasm-pack build --target nodejs --profile <profile>

# Bundler target (webpack, etc.)
wasm-pack build --target bundler

# Web target (browser)
wasm-pack build --target web
```

## Profile Selection

| Profile | Use Case | Binary Size | Performance |
|---------|----------|-------------|-------------|
| `release` | Production, benchmarking | Smallest | Fastest |
| `dev` | Development, testing | Largest | Slower |
| Custom | Fine-tuned trade-offs | Varies | Varies |

For wasm4pm, default to `release` unless testing.

## Pre-Build Checks

Before running `wasm-pack build`:

1. **Verify Rust toolchain**: `rustup show` — must include `wasm32-unknown-unknown`
2. **Check wasm-pack version**: `wasm-pack --version`
3. **Verify Node.js**: `node --version` and `npm -v`

## Post-Build Verification

After successful build:

1. **Binary exists**: `ls -la wasm4pm/pkg/wasm4pm*.wasm` — must exist and be > 0 bytes
2. **JS bindings exist**: `ls -la wasm4pm/pkg/wasm4pm*.js` — TypeScript bindings
3. **Package.json generated**: `ls wasm4pm/pkg/package.json`

## Binary Integrity Check

Before editing TypeScript consumers of WASM:

```bash
# Quick check: binary exists and has content
file wasm4pm/pkg/wasm4pm_bg.wasm

# Full check: rebuild and verify deterministic output
wasm-pack build --target nodejs --profile release
sha256sum wasm4pm/pkg/wasm4pm_bg.wasm > /tmp/binary.sha256
wasm-pack build --target nodejs --profile release
sha256sum -c /tmp/binary.sha256
# Must match (deterministic build)
```

## Integration with pnpm

```bash
# Build WASM, then build TypeScript
pnpm build:wasm     # runs wasm-pack build
pnpm build          # uses WASM output + TS compilation
pnpm test           # tests depend on WASM binary existing
```

## Critical Rule

❌ NEVER edit TypeScript that imports from WASM without verifying the binary exists and is accessible.

✅ ALWAYS check binary before modifying `wasm4pm/src/` Rust code or importing TS consumers.

## Commands

```bash
# Full build with release profile
wasm-pack build --target nodejs --profile release

# Dev profile (faster compile, slower runtime)
wasm-pack build --target nodejs --profile dev

# Clean rebuild
rm -rf wasm4pm/pkg && wasm-pack build --target nodejs --profile release
```
