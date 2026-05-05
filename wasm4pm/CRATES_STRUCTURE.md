# pictl Crates Structure

## Overview

The pictl WASM process mining platform is organized as a Rust workspace with multiple crates, enabling clear separation of concerns, reusability, and modularity.

```
wasm4pm/
├── Cargo.toml                 # Workspace root
├── crates/
│   ├── wasm4pm-types/           # 1️⃣ Foundational: Binary data structures
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs         # Module exports
│   │       ├── event_log.rs   # Event, Trace, EventLog, AttributeValue
│   │       ├── ocel.rs        # OCEL, OCELEvent, OCELObject
│   │       ├── models.rs      # DFG, PetriNet, DeclareModel, etc.
│   │       ├── conformance.rs # ConformanceResult, TokenReplayResult
│   │       ├── provenance.rs  # ProvenanceChain (10-field audit trail)
│   │       ├── error.rs       # Error, Result<T>
│   │       └── hash.rs        # BLAKE3 hashing, canonical JSON
│   │
│   └── pictl-core/            # 2️⃣ Algorithm implementations (placeholder)
│       ├── Cargo.toml
│       └── src/
│           └── lib.rs
│
├── src/                       # Main pictl crate (WASM library)
│   └── lib.rs                 # WASM bindgen exports
│
└── README.md
```

## Crates

### 1. wasm4pm-types (Foundational)

**Purpose:** Defines the canonical binary data structures that all functions pass around.

**Key Types:**

- **Event Log:** `EventLog`, `Trace`, `Event`, `AttributeValue`
- **Alternative Formats:** `OCEL`, `OCELEvent`, `OCELObject`
- **Process Models:** `DFG`, `PetriNet`, `DeclareModel`
- **Conformance:** `ConformanceResult`, `TokenReplayResult`
- **Provenance:** `ProvenanceChain` (10 fields for audit trail)
- **Hashing:** `Blake3Hash`, `canonical_json()`, `blake3_hex()`
- **Error Handling:** `Error`, `Result<T>`

**Dependencies:**

- `serde`, `serde_json` — Serialization
- `blake3` — BLAKE3 hashing
- `chrono`, `uuid` — Timestamps and unique IDs
- `hashbrown` — High-performance HashMap

**No WASM Dependencies:** This crate has zero dependencies on `wasm-bindgen`, `js-sys`, or web APIs. It's a pure Rust library that can be used in any context (WASM, native, servers, etc.).

### 2. pictl-core (Algorithm Implementation)

**Purpose:** Algorithm implementations that depend on wasm4pm-types.

**Future:** Will contain implementations of discovery algorithms, conformance checkers, and other process mining operations.

### 3. pictl (Main WASM Library)

**Purpose:** WebAssembly bindings and public API.

**Depends On:** `wasm4pm-types`

**Exports:**

- WASM functions via `wasm_bindgen`
- State management (handles, storage)
- JavaScript-friendly interfaces

## Design Principles

### 1. Unidirectional Dependencies

```
pictl-core
   ↓
wasm4pm-types

pictl (main library)
   ↓
wasm4pm-types
```

No circular dependencies. No crate depends on `wpm` (wasm4pm) (the WASM library).

### 2. Types as the Foundation

All functions pass around types defined in `wasm4pm-types`. This ensures:

- **Determinism:** Type definitions are immutable across all callers
- **Versionability:** Type schema changes are tracked and auditable
- **Interoperability:** Rust ↔ TypeScript ↔ Python can serialize/deserialize identical types
- **Testing:** Unit tests can verify type contracts without WASM

### 3. Binary Data Structures

Types in `wasm4pm-types` are "binary" in that they:

- Serialize to deterministic JSON (canonical form with sorted keys)
- Hash to BLAKE3 for provenance tracking
- Support round-trip serialization (T → JSON → T)
- Include all metadata needed for audit trails

### 4. No Platform Dependencies in Core

`wasm4pm-types` is platform-agnostic:

- No `wasm-bindgen` features
- No JavaScript APIs
- No web-specific dependencies
- Works in WASM, native Rust, servers, command-line tools

## Migration Path

### Phase 1: ✓ Types Crate (COMPLETE)

All type definitions moved to `wasm4pm-types`.

### Phase 2: Algorithm Core

Implementations of discovery, conformance, and analysis algorithms depend on `wasm4pm-types`.

### Phase 3: WASM Bindings

Main `wpm` (wasm4pm) crate becomes thin wrapper around `wasm4pm-types` and `pictl-core`.

### Phase 4: Multi-Language Support

TypeScript converters (EventLogIR ↔ EventLog) can use `wasm4pm-types` schema as the source of truth.

## Cargo Workspace Commands

```bash
# Build all crates
cargo build -p wasm4pm-cli-types
cargo build -p wasm4pm-cli-core
cargo build

# Test all crates
cargo test -p wasm4pm-cli-types
cargo test -p wasm4pm-cli-core
cargo test

# Run specific test
cargo test -p wasm4pm-cli-types hash::tests::test_blake3_string_hash

# Check for compilation errors
cargo check

# Format code
cargo fmt

# Lint with Clippy
cargo clippy
```

## WASM Build

The main `wpm` (wasm4pm) crate is still built with `wasm-pack`:

```bash
wasm-pack build --target bundler
wasm-pack build --target nodejs
```

`wasm4pm-types` is built as a library and can be compiled natively:

```bash
cd crates/wasm4pm-types
cargo build --release
cargo test
```

## Versioning

All crates use shared `workspace.package.version`:

- **Format:** CalVer `vYEAR.MONTH.DAY`
- **Current:** `26.4.10` (April 10, 2026)
- **Multiple releases same day:** Use letter suffixes (`26.4.10a`, `26.4.10b`)

## Future Enhancements

1. **Feature flags per crate** — Control which algorithms compile into WASM
2. **pictl-ml** — Machine learning algorithms
3. **pictl-conformance** — Advanced conformance checking
4. **pictl-streaming** — Streaming process mining operators
5. **pictl-bindings-py** — Python bindings for cross-language use

## References

- Cargo Workspaces: https://doc.rust-lang.org/cargo/reference/workspaces.html
- Three-Layer Architecture: See `../../CLAUDE.md` (Control Plane section)
- ProvenanceChain: See `wasm4pm-types/src/provenance.rs`
