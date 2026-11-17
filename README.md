<!-- wasm4pm-doc-status: active; reviewed: 2026-10-11; original: README.md; reason: path-local authority or entrypoint -->

# wasm4pm

High-performance, evidence-bounded process mining platform in Rust, WebAssembly, and TypeScript.

`wasm4pm` combines high-throughput branchless Rust and WebAssembly core engines with a composable TypeScript monorepo and published CLI tools (`wpm` / `wasm4pm-cli`). It operates across traditional event logs (XES, CSV), object-centric event logs (OCEL-v2), and declarative / procedural process models (Petri nets, Process Trees, POWL 2.0).

The foundational law of the platform:

> **Claims may not exceed the exact subject, runtime, authority, receipt, and replay evidence that supports them.**

---

## Architecture & Foundational Principles

```text
Event Data / Observations (XES / CSV / OCEL-v2)
  │
  ▼
Parser & Router (branchless validation, typed admission or refusal)
  │
  ▼
Core Mining & Conformance Engines (Rust / WASM / SIMD)
  │
  ├── Process Discovery: Alpha++, Inductive Miner, Heuristics Miner, DFG, Streaming DFG
  ├── Conformance Checking: Token Replay, Alignments (Rozinat & van der Aalst), ETConformance
  ├── Object-Centric Process Mining: OCEL-v2 normalization, OCPN, OC-Declare, OCLA
  ├── Executable Workflows: POWL 2.0 compilation, scheduling, cryptographically verifiable replay
  └── Cognition & ML: MiniML, Prolog8 proof engine, Markov Logic, Concept Drift Detection
  │
  ▼
Deterministic Actuation & Receipts (BRCE / BLAKE3 hashing)
  │
  ▼
Replayable Evidence & Certified Standing
```

1. **Evidence-Bounded Execution**: Every analytical finding, conformance score, or repair operation produces a verifiable cryptographic receipt (`receipt.json`) binding input data, algorithmic invariants, and outcome hashes.
2. **Deterministic Computation**: All runtime state and collection traversal use deterministic collections (`BTreeMap`, sorted structures) and seeded PRNGs to guarantee identical byte-level replay across host platforms and WebAssembly targets.
3. **Lawful Refusal**: Invalid event data, unsupported schema versions, or unsatisfiable alignments produce typed domain refusals rather than panics or silent fallbacks.

---

## Workspace Layout & Published Packages

### Rust Crates (crates.io)

| Crate | Directory | Purpose |
|---|---|---|
| [`wasm4pm`](https://crates.io/crates/wasm4pm) | `wasm4pm/` | Core process mining algorithms, WASM bridge, and data structures |
| [`wasm4pm-conform`](https://crates.io/crates/wasm4pm-conform) | `crates/wasm4pm-conform/` | High-assurance trajectory-based IEEE OCEL 2.0 conformance checking |
| [`prolog8`](https://crates.io/crates/prolog8) | `crates/prolog8/` | High-efficiency byte-capped Prolog proof engine for policy & action admission |
| [`miniml`](https://crates.io/crates/miniml) | `crates/miniml-core/` | WASM-optimized SIMD-accelerated machine learning primitives |
| [`ocpq`](https://crates.io/crates/ocpq) | `crates/ocpq/` | Object-centric process querying & relational constraint engine |
| [`wasm4pm-cognition`](https://crates.io/crates/wasm4pm-cognition) | `crates/wasm4pm-cognition/` | Classical AI cognition kernels (STRIPS, Markov logic, concept drift) |
| [`wasm4pm-planner`](https://crates.io/crates/wasm4pm-planner) | `crates/wasm4pm-planner/` | Temporal PDDL planner with Prolog8 admission and MCP server |
| [`wasm4pm-cli`](https://crates.io/crates/wasm4pm-cli) | `crates/wasm4pm-cli/` | Official Rust developer CLI for the wasm4pm suite |

### TypeScript Packages (npm)

| Package | Directory | Description |
|---|---|---|
| `@wasm4pm/cli` / `wpm` | `apps/wasm4pm/` | Public TypeScript command-line interface |
| `@wasm4pm/core` | `wasm4pm/pkg/` | Generated WebAssembly bindings and type definitions |
| `@wasm4pm/engine` | `packages/engine/` | High-level execution engine & pipeline orchestration |
| `@wasm4pm/kernel` | `packages/kernel/` | Core domain interfaces and lifecycle contracts |
| `@wasm4pm/cognition` | `packages/cognition/` | Cognition breeds and reasoning integration |
| `@wasm4pm/planner` | `packages/planner/` | Declarative planning bindings |
| `@wasm4pm/contracts` | `packages/contracts/` | Typed schemas and validation contracts |

---

## Getting Started

### Prerequisites

- Node.js $\ge$ 20.x & `pnpm` $\ge$ 9.x
- Rust toolchain $\ge$ 1.80 with `wasm32-unknown-unknown` target
- `wasm-pack` $\ge$ 0.13

### Building the Workspace

```bash
# Clone the repository
git clone https://github.com/seanchatmangpt/wasm4pm.git
cd wasm4pm

# Enable corepack and install npm dependencies
corepack enable
pnpm install --frozen-lockfile

# Build the WebAssembly core module
pnpm run build:wasm

# Build the TypeScript CLI and packages
pnpm run build:cli

# Verify Rust workspace compilation
cargo check --workspace
```

---

## Core Workflows with `wpm`

### 1. System Capability Inspection & Diagnosis

Inspect verified runtime capabilities or apply deterministic, receipt-backed repairs:

```bash
# Query executable capability report
wpm system doctor capabilities --format json

# Dry-run diagnostic repairs
wpm system doctor fix --dry-run
```

### 2. Process Discovery

Discover process models from XES, CSV, or parquet event logs:

```bash
# Discover a directly-follows graph (DFG) or Petri net from an event log
wpm model discover data/small-example.xes

# List all registered algorithms and paper references
wpm help algorithms
```

### 3. Object-Centric Event Execution & Replay

Process multi-entity event logs (OCEL-v2) and execute proof-carrying POWL workflows:

```bash
# Discover and validate an object-centric model
wpm evidence session log.ocel.json --object-type Order

# Replay an execution session against previously captured receipts
wpm evidence session log.ocel.json \
  --object-type Order \
  --mode replay \
  --session .wasm4pm/sessions/<run-id>.json
```

---

## Testing & Verification

Run the owning test boundaries:

```bash
# TypeScript integration suite
pnpm test

# Rust workspace test suite
cargo test --workspace

# Documentation lint & link validation
pnpm run docs:check
```

---

## Governance & Engineering Standards

- **Agent Contract & Rules of Engagement**: [`AGENTS.md`](AGENTS.md)
- **Architecture Overview**: [`docs/explanation/architecture_overview.md`](docs/explanation/architecture_overview.md)
- **Testing Standards**: [`TESTING.md`](TESTING.md)
- **WASM API Specification**: [`WASM_API.md`](WASM_API.md)
- **Security Policy**: [`SECURITY.md`](SECURITY.md)
- **License**: BUSL-1.1 (Business Source License 1.1)
