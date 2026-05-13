# Contributing to wasm4pm

## Quick summary

- Process mining contributions: follow the standard PR flow.
- Cognition contributions: read the cognition rules section carefully — they are stricter and enforced by CI.
- All contributions: three-layer evidence, no silent fallbacks, conventional commits.

## General rules

### Commit format

Use conventional commits:

```
type(scope): description

feat(cognition): add SOAR impasse resolution
fix(kernel): handle empty XES traces without panicking
test(mycin): seed-deterministic forward chain verification
refactor(receipt): length-prefixed v2 encoding
```

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`.

### Git workflow

- Never rebase — only merge.
- Pull before push.
- Force-push to feature branches is allowed. Force-push to `main` is blocked.
- Large changesets: use heredoc for multi-line commit messages.

### Fail fast

No silent fallbacks. No `|| null`. No `catch { return undefined }`. Errors propagate visibly or the CI gate rejects the PR.

```typescript
// WRONG
const wasm = await loadWasm().catch(() => null);

// RIGHT
const wasm = await loadWasm(); // throws if unavailable
```

### Three-layer evidence

Every claim that "this works" requires all three of:

1. **OTEL span** — the operation emits a span visible in Jaeger (service name + operation name + status field)
2. **Test assertion** — a test that passes in CI and would fail if the behavior changed
3. **Schema conformance** — where applicable, `weaver registry check` exits 0

OR logic is not accepted. "The test passes" alone is not evidence. "The span was emitted" alone is not evidence.

---

## Cognition contribution rules

The cognition kernel (`crates/wasm4pm-cognition/`, `apps/wasm4pm/src/commands/cognition*`, `packages/cognition/`) has additional mandatory rules. These rules are enforced by CI and cannot be bypassed.

### 1. No stub law

Any PR that adds the following patterns to cognition source paths will be rejected by CI:

| Forbidden pattern | Why |
|------------------|-----|
| `pub struct Stub` | Stub structs are not implementations |
| `todo!()` | Unimplemented hot paths are not cognition |
| `unimplemented!()` | Same |
| `placeholder` | Placeholder code is not real inference |
| `mock` | Mocks are not breeds |
| `fake` | Fake implementations are not implementations |

Cognition source paths subject to this rule:
- `crates/wasm4pm-cognition/src/**`
- `apps/wasm4pm/src/commands/cognition*`
- `packages/cognition/src/**`

### 2. Forbidden lexicon

Cognition source files must not use these words (except in the noted exceptions):

| Forbidden | Reason | Safe synonym |
|-----------|--------|-------------|
| `cache` | Implies transient storage outside the knowledge base | `working memory`, `agenda` |
| `heap` | Memory layout term, not domain term | `goal stack`, `candidate registry` |
| `buffer` | Except `.as_bytes()` calls | `blackboard`, `ledger` |
| `byte` | Except `.as_bytes()` calls | (use specific type) |
| `store` | Except `.store()` method calls | `ledger`, `clause database` |
| `load` | Except `.load()` method calls | `retrieve`, `consult` |

### 3. Real cognition only

The TypeScript facade has zero decision logic. Rust is the authority. Concretely:

- TS may parse CLI arguments, format output, save receipts, marshal requests
- TS must not choose an action, validate evidence, run an inference step, or self-certify output
- Any TS code that does these things is a violation and the PR will be rejected

### 4. Breed definition of done

A breed is done when ALL of the following are true. Partial implementations are not merged:

1. Rust implementation: no `unsafe`, no stubs, no `todo!()`
2. `wasm-bindgen` export in `wasm.rs` with correct signatures
3. TypeScript type binding in `packages/cognition/src/`
4. CLI verb: `wpm cognition run --contract <name>` works
5. Inference trace: actual reasoning steps in the output (not just a result value)
6. BLAKE3 receipt: the breed appends a link to the receipt ledger
7. V1-V8 adversarial gates: all 8 pass, exit code 0
8. Replay: `wpm cognition replay` produces byte-identical hash
9. Unit tests: seeded RNG, deterministic assertions (not statistical)
10. OTEL span: operation name + breed attribute + duration

### 5. Receipt chain integrity

Every breed output must produce a receipt that:

- Uses BLAKE3 v2 encoding (length-prefixed, not string-concat)
- Chains to the previous link via `prev_hash`
- Includes `ihash` (input hash) and `ohash` (output hash)
- Binds to an actor identity (`actor-ed25519` or `actor-mac-fallback`)

The integration test `tests/autosystems_receipt_v2_collision.rs` must continue to pass. It proves that the v2 encoding is not vulnerable to the canonicalization attack present in v1.

### 6. Receipt-Replay-Verify cycle

Every cognition output must pass this cycle before merge:

```bash
wpm cognition run --contract <breed> --input <input>   # emits receipt
wpm cognition replay --receipt-id <id>                 # reproduces byte-identical hash
wpm cognition verify --receipt-id <id>                 # V1-V8 all pass, exit 0
```

All three commands must succeed. If replay produces a different hash, the breed is non-deterministic and is not ready.

### 7. Seeded RNG

All breeds that have any stochastic component (e.g. CBR tie-breaking, SOAR impasse resolution) must accept a seed parameter and produce deterministic output given the same seed:

```rust
pub fn new_with_seed(config: BreedConfig, seed: u64) -> Self { ... }
```

Tests must use seeded construction. Do not assert statistical properties in unit tests; assert exact values.

---

## Process mining contribution rules

### Algorithm correctness

New algorithms must demonstrate correctness on the standard fixtures in `wasm4pm/tests/fixtures/`. The four quality dimensions must all be measured and reported:

- Fitness (token replay): must exceed 0.85 for conforming logs
- Precision: must be reported (no underfitting)
- Generalization: must be reported (no overfitting)
- Simplicity: model size must be reported

### WASM interop

Follow the known-good patterns in `wasm4pm/src/discovery.rs`:

- Use `String` not `&str` for exported function parameters
- Use `JsValue` for error returns, never panic across the WASM boundary
- Use `serde_json::to_string()` + `JsValue::from_str()` for serialization (not `serde_wasm_bindgen::to_value` — see the known serialization bug in CLAUDE.md)

### Deployment profiles

If your algorithm should not be in all profiles, add the appropriate feature flag:

```rust
#[cfg(feature = "feature-discovery-advanced")]
pub fn discover_my_algorithm(...) { ... }
```

And update `packages/kernel/src/registry.ts` with the correct `deploymentProfiles` field.

---

## Testing guidelines

### Unit tests (`packages/*/src/__tests__/`)

- Inline mocks are allowed
- Fast: under 100ms per test
- Test public APIs in isolation
- `WasmLoader.reset()` between tests that need clean state

### Behavioral tests (`playground/`)

- No mocks — real local source
- Run before publishing

### Integration tests (`wasm4pm/tests/*.rs`)

- No mocks — real WASM
- Must pass on CI
- `pub` visibility required (not `pub(crate)`) for items used across test boundaries

### Rust unit tests

`cargo test --lib` exits with SIGABRT on some platforms (wasm-bindgen thread cleanup, pre-existing). Verify pass count with:

```bash
cargo test --lib 2>&1 | grep -c "^test .* ok$"
```

---

## Pull request checklist

### Process mining PR

- [ ] Algorithm produces correct output on standard fixtures
- [ ] Four quality dimensions measured and reported
- [ ] WASM interop follows known-good patterns
- [ ] Feature flag set if algorithm is not in all profiles
- [ ] Unit tests pass
- [ ] `tsc --noEmit` exits 0 (zero type errors)

### Cognition PR

- [ ] No stubs, no `todo!()`, no `unimplemented!()`
- [ ] No forbidden lexicon in source
- [ ] Breed meets all 10 definition-of-done criteria
- [ ] Receipt chain integrity test passes (`autosystems_receipt_v2_collision.rs`)
- [ ] Receipt-Replay-Verify cycle passes (all three commands succeed)
- [ ] V1-V8 adversarial gates: all pass, exit code 0
- [ ] Seeded RNG: deterministic under fixed seed
- [ ] OTEL span emitted with correct attributes
- [ ] Three-layer evidence for every behavioral claim

### All PRs

- [ ] Conventional commit message
- [ ] `tsc --noEmit` exits 0
- [ ] CI passes (all test suites)
- [ ] No new `// TODO` in hot paths
- [ ] No `console.log` left in production code
