# Phase 2: C4 Container

The Container diagram shows the internal architectural blocks mapping the `wasm4pm` stack from the mathematical Rust kernel up to the CLI.

## Confidence Level: High

```mermaid
graph TD
  User((End User / Client App))

  subgraph "Node.js / Browser Runtime"
    CLI[apps/wasm4pm: wpm CLI]
    Kernel[packages/kernel: TS Facade]
    Bridge[wasm4pm: WASM Memory Bridge]
  end

  subgraph "Native WebAssembly (WASM)"
    WasmModule[wasm4pm.wasm]
  end

  subgraph "Rust Host Engine"
    Core[crates/wasm4pm-algos]
    Truex[Truex Canonicalization & BLAKE3]
    Algos[60 Discovery / Conformance Algos]
  end

  User -- "Executes commands" --> CLI
  User -- "Imports Library" --> Kernel
  CLI -- "Calls typed API" --> Kernel
  Kernel -- "Marshals JSON/Pointers" --> Bridge
  Bridge -- "FFI Calls" --> WasmModule
  WasmModule -- "Executes Rust Math" --> Core
  Core -- "Verifies Hashes" --> Truex
  Core -- "Computes Models" --> Algos
```

## Data Boundary (The WASM Bridge)
- **Serialization**: Heavy payloads (like an OCEL 2.0 log) are currently serialized to JSON and passed across the FFI boundary as `String` parameters.
- **Zero-Copy Trajectory**: Future optimizations will utilize `SharedArrayBuffer` or raw pointer manipulation to avoid the serialization tax.
- **Panic Boundary**: The `wasm-bindgen` layer traps Rust panics and translates them into structural `VerificationResult` errors (e.g. `InvalidTransition`) to prevent the host Node process from crashing.
