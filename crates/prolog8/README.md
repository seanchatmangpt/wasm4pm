# Prolog8 — Byte-Capped Proof Engine

**A compact, deterministic inference engine for proof generation and receipt-chain validation.**

## Purpose

Prolog8 evaluates queries against fact blocks and Horn rules, emitting typed proof DAGs with BLAKE3 receipt chains. Designed for lightweight embedded use cases where bounded memory is critical.

**Use cases:**
- Proof-of-admissibility gates in autonomic systems
- Receipt chain validation in manufacturing pipelines
- Bounded-recursion logic programming with cryptographic proof

## Capabilities

### Byte Caps (MVPs)

| Cap | Limit | Description |
|-----|-------|-------------|
| **Arity** | 8 | Max predicate arguments per atom |
| **Body atoms** | 8 | Max conjunctive goals per rule |
| **Variables** | 8 | Max distinct variables per rule |
| **Binding patterns** | 256 | Bitmask for ground/free positions |

### Query & Proof Flow

1. **Admission** — Validate atoms and rules against caps via `admit_atom()` / `admit_rule()`
2. **Fact loading** — Load `FactBlock8` into kernel
3. **Query execution** — `kernel.query()` evaluates atoms, returns typed proofs
4. **Proof DAG** — Typed nodes: `ProofKind::Fact`, `ProofKind::Rule`, `ProofKind::MissingFact`
5. **Receipt chain** — BLAKE3 six-root receipt with integrity hash

### Rule Chaining

**Currently supports:** One-step chaining only (depth-1 recursion).

**Planned:** Bounded recursion via `FeatureBit::BoundedRecursion` (out of scope for MVP).

### Decision Types

| Type | Proof | Guarantees |
|------|-------|-----------|
| `Allow` | Positive proof chain | At least one fact/rule proven |
| `Deny` | Negative proof (missing fact) | Queried atom not derivable |

## API

### Rust (Public Interface)

```rust
use prolog8::{
    Kernel, Catalog, PredicateMeta, PredicateProofPolicy,
    Atom8, Rule8, FactBlock8, QueryAtom8, ProofMode,
    admit_atom, admit_rule, replay,
};

// 1. Build catalog
let mut cat = Catalog::new(CatalogId(1));
cat.add_predicate(PredicateMeta { ... });

// 2. Create kernel
let mut kernel = Kernel::new(cat);

// 3. Load facts
kernel.load_facts(FactBlock8::new(pred_id, arity, facts))?;

// 4. Load rules
kernel.load_rule(rule)?;

// 5. Query
let result = kernel.query(&QueryAtom8 { ... });

// 6. Verify receipt
let status = replay(&kernel, &query, &receipt);
assert_eq!(status, ReplayStatus::Verified);
```

### WASM (JavaScript/Node.js)

```javascript
const wasm = require('@wasm4pm/prolog8');

const input = {
  catalog: { /* Catalog */ },
  facts: [ /* FactBlock8 */ ],
  rules: [ /* Rule8 */ ],
  query: { /* QueryAtom8 */ }
};

const result = JSON.parse(wasm.prolog8_query(JSON.stringify(input)));
// result = { ok/answered: [...], denied, invalid }

// Verify receipt
const verifyInput = { ...input, receipt: result.receipt };
const status = JSON.parse(wasm.prolog8_replay(JSON.stringify(verifyInput)));
// status = { Verified | ReceiptInvalid | Mismatch }
```

## Testing

### Unit Tests (31 tests)
- Inline tests in `src/**/*.rs`
- Test internal correctness, bounds checking, serialization

### Integration Tests (11 tests)
Location: `tests/kernel_integration.rs`
- Public API: fact admission, queries, receipts, replay
- Covers known-fact/unknown-fact paths
- Rule chaining
- Receipt determinism

### AAT Live Counterfactual Tests (36 tests)
Location: `tests/aat_live_counterfactual.rs`

**8 families of adversarial probes:**

| Family | Focus | Oracle | Tests |
|--------|-------|--------|-------|
| **P8-CF-1** | Byte-cap boundaries | Rank 1 (theorem) | 4 |
| **P8-CF-2** | Rule body cap enforcement | Rank 1 (theorem) | 2 |
| **P8-CF-3** | Proof node contracts | Rank 2 (domain) | 4 |
| **P8-CF-4** | Denial is evidence | Rank 2 (domain) | 3 |
| **P8-CF-5** | Receipt determinism | Rank 1 (theorem) | 3 |
| **P8-CF-6** | Independent kernel isolation | Rank 2 (domain) | 1 |
| **P8-CF-7** | BLAKE3 domain separation | Rank 1 (theorem) | 5 |
| **P8-CF-8** | Admission mask validation | Rank 1 (theorem) | 14 |

### Running Tests

```bash
# All tests
cargo test -p prolog8 --lib
cargo test -p prolog8 --test kernel_integration
cargo test -p prolog8 --test aat_live_counterfactual

# Single test
cargo test -p prolog8 --test aat_live_counterfactual cf1_arity_beyond_cap_rejected

# With output
cargo test -p prolog8 --test aat_live_counterfactual -- --nocapture
```

## Known Limits (Documented)

### Out of Scope for MVP

- **Multi-step recursion** — Only depth-1 rule chaining supported
- **Negation as failure** — Declared in feature bit, not wired
- **Aggregates** — Declared in feature bit, not wired
- **Built-in predicates** — Declared in feature bit, not wired
- **Foreign predicates** — Declared but not accessible

### Acceptable Behavior

- **Sentinel term ID** — `TermId(0)` may be used in queries without explicit error (no boundary check)
- **Feature mask validation** — Always passes (no-op, FeatureBit::ALL = 0xFF masks 8 bits, guard never fires)

## Production Readiness Checklist

- [x] 31 unit tests pass
- [x] 11 integration tests pass (proof + receipt flows)
- [x] 36 AAT counterfactual tests pass (adversarial boundaries)
- [x] No compiler warnings (`cargo build -p prolog8 --features wasm`)
- [x] Admission boundaries enforced (arity, body_len, binding_mask)
- [x] Receipt integrity verified via `replay()`
- [x] Deterministic across independent runs
- [x] Domain keys (BLAKE3) pairwise distinct

## Build & Deploy

### Rust Library
```bash
cd wasm4pm
cargo build -p prolog8 --release
```

### WASM (Node.js target)
```bash
cd crates/prolog8
wasm-pack build --target nodejs --out-dir ../../packages/prolog8/pkg
```

### npm Package
Published as `@wasm4pm/prolog8` (TypeScript bindings in `packages/prolog8/src/`).

## Architecture

### Directory Structure
```
crates/prolog8/
├── src/
│   ├── lib.rs              # Root, module exports
│   ├── types.rs            # Atom8, Rule8, Receipt, domain constants
│   ├── catalog.rs          # Predicate registry and term internment
│   ├── kernel.rs           # Query evaluation, one-step rule chaining
│   ├── admission.rs        # Atom/rule boundary enforcement
│   ├── hash.rs             # BLAKE3 domain-separated hashing
│   ├── replay.rs           # Receipt verification
│   └── wasm.rs             # wasm-bindgen exports (ARD section 13)
├── tests/
│   ├── kernel_integration.rs      # 11 integration tests
│   └── aat_live_counterfactual.rs # 36 AAT tests (8 families)
└── Cargo.toml
```

### Key Modules

- **`types`** — `Atom8`, `Rule8`, `FactBlock8`, `FactRow8`, `QueryAtom8`, `Receipt`, `ProofNode`, `Decision`
- **`catalog`** — `Catalog::new()`, `add_predicate()`, `intern_term()`, `term_id()`
- **`kernel`** — `Kernel::new()`, `load_facts()`, `load_rule()`, `query()`, `scan_rules()`
- **`admission`** — `admit_atom()`, `admit_rule()`, `RejectionCode` enum
- **`hash`** — BLAKE3 domain keys (6 roots: catalog, rule, fact, input, proof, output)
- **`replay`** — `replay()`, `ReplayStatus` enum

## Proof DAG Structure

```
Decision {
  kind: Allow | Deny | Invalid,
  proof: [ProofNode],      // Typed nodes forming DAG
  receipt: Receipt,         // BLAKE3 six-root chain
  timestamp: u64
}

ProofNode {
  kind: Fact | Rule | MissingFact,
  id: u32,
  atom: Atom8,
  children: Vec<u32>,      // Indices into proof vec
  proof_root: [u8; 32]     // BLAKE3 hash of this node
}

Receipt {
  receipt_hash: [u8; 32],  // compute_hash() for integrity
  proof_root: [u8; 32],
  catalog_root: [u8; 32],
  rule_root: [u8; 32],
  fact_root: [u8; 32],
  input_root: [u8; 32],
  output_root: [u8; 32]
}
```

## WASM Constraints

- **Single-threaded execution** — No `Arc<RwLock>`, use `RefCell<HashMap>`
- **No async** — All operations synchronous
- **Input limit** — 10MiB max (validated in `wasm.rs`)
- **Serialization** — JSON in, JSON out (via `serde_json`)

## References

- **ARD Section 13** — WASM ABI byte-buffer surface
- **Chicago TDD Constitution** — Van der Aalst event-log-as-proof doctrine
- **AAT (Adversarial Admissibility Testing)** — Oracle Ranks 1-5 (TESTING.md)
