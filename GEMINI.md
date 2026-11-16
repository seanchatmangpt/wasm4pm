# pictl — Process Mining for WebAssembly (Gemini Instructional Context)

## Project Overview

**pictl** is an enterprise-grade, high-performance process mining platform that brings advanced process discovery, conformance checking, and predictive analysis to WebAssembly-compatible environments (Browsers, Node.js, and containers).

### Architecture
- **Rust/WASM Core (`wasm4pm/`)**: The algorithmic heart of the system, providing 41 process mining algorithms (Alpha++, ILP, Genetic, etc.) compiled to WASM. It prioritizes nanosecond-scale performance using the **K-Tier architecture** (fixed-capacity bitsets) and **branchless execution kernels**.
- **TypeScript Monorepo (`packages/` + `apps/`)**: Orchestrates and exposes the WASM core. It includes 10 specialized packages for configuration, observability, state management, and testing.
- **DPIE (Deterministic Process Intelligence Engine)**: A specialized, mathematically closed RL engine for autonomic process discovery, achieving 100% accuracy on the PDC-2025 suite.
- **Adversarial Agents**: Autonomous agents for manufacturing integrity validation.

## Building and Running

### Prerequisites
- Node.js 20+
- pnpm 9+
- Rust (with `wasm-pack` and `wasm32-unknown-unknown` target)

### Key Commands

| Task | Command |
|---|---|
| **Build All** | `pnpm build` (from root) |
| **Test All** | `pnpm test` (from root) |
| **Rust Type Check** | `cargo check` (from `wasm4pm/`) |
| **WASM Build** | `npm run build` (from `wasm4pm/`) |
| **WASM Build (All Profiles)** | `npm run build:profiles` (from `wasm4pm/`) |
| **CLI Build** | `pnpm --filter @pictl/cli build` |
| **Run Benchmarks** | `cargo bench` (from `recovery/` or `wasm4pm/`) |

## Development Conventions

- **Versioning**: Uses a unique **Calendar Versioning (CalVer)** variant: `vYEAR.MONTH.DAY` (e.g., `v26.4.18`). Suffixes like `a`, `b` are used for multiple releases on the same day. PATCH MUST NOT exceed 31.
- **Feature Gating**: Heavily used in Rust to control WASM binary size across 5 deployment profiles (`mobile`, `iot`, `edge`, `fog`, `browser`).
- **Zero-Heap Optimization**: RL states (`RlState`) are stack-allocated `Copy` structs to eliminate heap churn in hot paths.
- **Branchless Logic**: Hot paths (replay, updates) use bitwise mask calculus to eliminate data-dependent branching and execution jitter.
- **Testing Layers**:
  - Unit tests in `packages/*/src/__tests__/`.
  - Local dev behavior in `playground/`.
  - Post-publish validation in `lab/`.
  - **Skeptic Harness**: Adversarial verification for formal axioms (Reset, Determinism, Isomorphism).

## Key Files & Directories

- `wasm4pm/src/`: Core Rust algorithm implementations.
- `recovery/`: Self-contained research engine (DPIE) with formal proofs and benchmarks.
- `apps/pictl/`: Source for the primary CLI tool.
- `packages/engine/`: State machine and WASM loading logic.
- `CLAUDE.md`: Authoritative guide for AI agents (CalVer, state machine, gotchas).
- `WASM_API.md`: Reference for all `wasm-bindgen` exports.
- `DPIE_Technical_Whitepaper_v1.1.0.pdf`: Formal documentation of the optimized engine architecture.

## Common Gotchas for AI Agents

1. **WasmLoader Singleton**: Reset state between tests using `WasmLoader.reset()`.
2. **ENV Prefix**: Use `WASM4PM_*` for environment variables, NOT `PICTL_*`.
3. **Serialization**: Use `to_js_str()` in Rust for `serde_json::Value` to avoid serialization bugs on WASM.
4. **SIGABRT on Exit**: `cargo test --lib` may crash on exit due to thread cleanup; verify success via "ok" counts in output.
5. **Direct WASM testing**: Always validate WASM output via Node.js as the serialization path is not fully exercised by `cargo test`.
