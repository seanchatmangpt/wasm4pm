<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/docs/orientation/03-c4-components.md; source-sha256: e9cb287f796311da44a0869129377e86f0865a74733296cdfc713eeb837ce5d5; reason: tooling or agent control surface -->

# Phase 3: C4 Components

This phase details the internal components of the primary feature areas inside the mathematical kernel.

## Confidence Level: High

### Component Area: Truex Execution Trust Layer
**Source Files**: `crates/wasm4pm-algos/src/truex/verify.rs`, `crates/wasm4pm-algos/src/truex/canonicalize.rs`

```mermaid
graph TD
  subgraph "Truex Trust Engine"
    Input[JSON Envelope parser]
    Canon[JCS-OCEL Canonicalizer]
    Hasher[BLAKE3 Cryptographic Engine]
    Taxonomy[Refusal Taxonomy Router]
  end

  subgraph "Output Surface"
    Result[VerificationResult Enum]
  end

  Input -- "Extracts payload" --> Canon
  Canon -- "Sorts & Prunes" --> Hasher
  Hasher -- "Computes Hash" --> Taxonomy
  Taxonomy -- "Admitted" --> Result
  Taxonomy -- "Forged / BoundaryMissing / CanonicalizationMismatch" --> Result
```

### Component Area: Algorithm Discovery Engine
**Source Files**: `crates/wasm4pm-algos/src/discovery/`, `packages/kernel/src/registry.ts`

```mermaid
graph TD
  subgraph "Kernel Registry (TypeScript)"
    Catalog[Algorithm Registry]
    Dispatch[FFI Dispatcher]
  end

  subgraph "Core Algorithms (Rust)"
    Alpha[Alpha Miner]
    Heuristic[Heuristic Miner]
    DFG[Directly-Follows Graph]
    POWL[POWL Models]
  end

  Catalog -- "Looks up signature" --> Dispatch
  Dispatch -- "Routes to" --> Alpha
  Dispatch -- "Routes to" --> Heuristic
  Dispatch -- "Routes to" --> DFG
  Dispatch -- "Routes to" --> POWL
```

### Component Area: Machine Learning (AutoML)
**Source Files**: `crates/wasm4pm-algos/src/automl/`

```mermaid
graph TD
  subgraph "AutoML Pipeline"
    Features[Feature Engineering]
    Train[Model Training]
    Eval[Evaluation Metrics]
  end

  Features --> Train
  Train --> Eval
  Eval --> Features
```
