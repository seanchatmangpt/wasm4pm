# wasm4pm Crates Structure

## Overview

The wasm4pm WASM process mining platform is organized as a Rust workspace with multiple crates, enabling clear separation of concerns, reusability, and modularity.

```
wasm4pm/
├── Cargo.toml                 # Workspace root
├── crates/
│   ├── wasm4pm-compat/           # 1️⃣ Foundational: Binary data structures
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
│   └── wasm4pm-core/            # 2️⃣ Algorithm implementations (placeholder)
│       ├── Cargo.toml
│       └── src/
│           └── lib.rs
│
├── src/                       # Main wasm4pm crate (WASM library)
│   └── lib.rs                 # WASM bindgen exports
│
└── README.md
```

## Crates

### 1. wasm4pm-compat (Foundational)

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

### 2. wasm4pm-core (Algorithm Implementation)

**Purpose:** Algorithm implementations that depend on wasm4pm-compat.

**Future:** Will contain implementations of discovery algorithms, conformance checkers, and other process mining operations.

### 3. wasm4pm (Main WASM Library)

**Purpose:** WebAssembly bindings and public API.

**Depends On:** `wasm4pm-compat`

**Exports:**

- WASM functions via `wasm_bindgen`
- State management (handles, storage)
- JavaScript-friendly interfaces

## Design Principles

### 1. Unidirectional Dependencies

```
wasm4pm-core
   ↓
wasm4pm-compat

wasm4pm (main library)
   ↓
wasm4pm-compat
```

No circular dependencies. No crate depends on `wpm` (wasm4pm) (the WASM library).

### 2. Types as the Foundation

All functions pass around types defined in `wasm4pm-compat`. This ensures:

- **Determinism:** Type definitions are immutable across all callers
- **Versionability:** Type schema changes are tracked and auditable
- **Interoperability:** Rust ↔ TypeScript ↔ Python can serialize/deserialize identical types
- **Testing:** Unit tests can verify type contracts without WASM

### 3. Binary Data Structures

Types in `wasm4pm-compat` are "binary" in that they:

- Serialize to deterministic JSON (canonical form with sorted keys)
- Hash to BLAKE3 for provenance tracking
- Support round-trip serialization (T → JSON → T)
- Include all metadata needed for audit trails

### 4. No Platform Dependencies in Core

`wasm4pm-compat` is platform-agnostic:

- No `wasm-bindgen` features
- No JavaScript APIs
- No web-specific dependencies
- Works in WASM, native Rust, servers, command-line tools

## Migration Path

### Phase 1: ✓ Types Crate (COMPLETE)

All type definitions moved to `wasm4pm-compat`.

### Phase 2: Algorithm Core

Implementations of discovery, conformance, and analysis algorithms depend on `wasm4pm-compat`.

### Phase 3: WASM Bindings

Main `wpm` (wasm4pm) crate becomes thin wrapper around `wasm4pm-compat` and `wasm4pm-core`.

### Phase 4: Multi-Language Support

TypeScript converters (EventLogIR ↔ EventLog) can use `wasm4pm-compat` schema as the source of truth.

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

`wasm4pm-compat` is built as a library and can be compiled natively:

```bash
cd crates/wasm4pm-compat
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
2. **wasm4pm-ml** — Machine learning algorithms
3. **wasm4pm-conformance** — Advanced conformance checking
4. **wasm4pm-streaming** — Streaming process mining operators
5. **wasm4pm-bindings-py** — Python bindings for cross-language use

## References

- Cargo Workspaces: https://doc.rust-lang.org/cargo/reference/workspaces.html
- Three-Layer Architecture: See `../../CLAUDE.md` (Control Plane section)
- ProvenanceChain: See `wasm4pm-compat/src/provenance.rs`
