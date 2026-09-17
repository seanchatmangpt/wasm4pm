<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/docs/orientation/02-c4-container.md; source-sha256: 9322d8b40fbb49d33cfbd4a0cd55e16d49fbe1e2213a5fe75a15e5fbd1f4a2c4; reason: tooling or agent control surface -->

# Phase 2: C4 Container

The Container diagram shows the internal architectural blocks mapping the `wasm4pm` stack from the mathematical Rust kernel up to the CLI.

## Confidence Level: High

```mermaid
graph TD
  User((End User / Client App))

  subgraph "Node.js / Browser Runtime"
    CLI[apps/wasm4pm: wpm CLI]
    Kernel[packages/kernel: TS boundary]
    Bridge[wasm4pm: WASM Memory Bridge]
  end

  subgraph "Native WebAssembly (WASM)"
    WasmModule[wasm4pm.wasm]
  end

  subgraph "Rust Host Engine"
    Core[crates/wasm4pm-algos]
    Truex[Truex Canonicalization & BLAKE3]
    Algos[Discovery / Conformance Algos]
    Cognition[crates/wasm4pm-cognition: 52 PARTIAL_ALIVE Breeds]
  end

  User -- "Executes commands" --> CLI
  User -- "Imports Library" --> Kernel
  CLI -- "Calls typed API" --> Kernel
  Kernel -- "Marshals JSON/Pointers" --> Bridge
  Bridge -- "FFI Calls" --> WasmModule
  WasmModule -- "Executes Rust Math" --> Core
  Core -- "Verifies Hashes" --> Truex
  Core -- "Computes Models" --> Algos
  Core -- "Runs Cognition Breeds" --> Cognition
```

## Data Boundary (The WASM Bridge)
- **Serialization**: Heavy payloads (like an OCEL 2.0 log) are currently serialized to JSON and passed across the FFI boundary as `String` parameters.
- **Zero-Copy Trajectory**: Future optimizations will utilize `SharedArrayBuffer` or raw pointer manipulation to avoid the serialization tax.
- **Panic Boundary**: The `wasm-bindgen` layer traps Rust panics and translates them into structural `VerificationResult` errors (e.g. `InvalidTransition`) to prevent the host Node process from crashing.
