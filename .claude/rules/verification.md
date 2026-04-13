# pictl Verification Protocol

**Evidence-based verification standard for all claims.**

## Testing Hierarchy

### 1. Unit Tests
**Location:** `packages/*/src/__tests__/`

- Inline mocks allowed
- Fast (<100ms per test)
- Test public APIs in isolation
- Run: `pnpm --filter @pictl/<package> test`

### 2. Behavioral Tests
**Location:** `playground/`

- Tests unpublished local source
- Fast feedback loop during development
- Validates integration before publish
- Run: `cd playground && pnpm test`

### 3. Artifact Tests
**Location:** `lab/`

- Tests published npm package
- Validates release artifacts
- Catches publish-time breakage
- Run: `cd lab && pnpm test`

### 4. Integration Tests
**Location:** `wasm4pm/tests/*.rs`

- 29 test files, ~490 tests
- Full pipeline validation
- Conformance, parity, determinism
- Run: `cargo test --test <test_name>`

## Determinism Requirements

**All algorithms must be deterministic.**

Same input → same output (bit-exact).

**Verification:**
```typescript
import { checkDeterminism, receiptsMatch } from '@pictl/testing';

// Run twice, compare receipts
const receipt1 = await pictl.run(config);
const receipt2 = await pictl.run(config);
assert(receiptsMatch(receipt1, receipt2));
```

**Seeded RNG for stochastic algorithms:**
```rust
use rand::SeedableRng;
let mut rng = StdRng::seed_from_u64(42); // Deterministic
```

**BLAKE3 hashing:**
- Receipt hashes must be stable across runs
- `combined_hash` field for artifact identity
- Hash inputs: config_hash + input_hash + plan_hash + output_hash

## Parity Verification

**`explain()` must equal `plan()`.**

The algorithm explanation from `explain()` must match the execution plan from `plan()`.

**Verification:**
```typescript
import { checkParity, checkParityBatch } from '@pictl/testing';

const config = resolveConfig({ algorithm: 'dfg' });
const planResult = plan(config);
const explainResult = explain(config);

checkParity(planResult, explainResult); // Throws if mismatch
```

**Kernel-WASM parity:**
- WASM kernel must match TypeScript registry
- Algorithm metadata must be identical
- Use `checkParityBatch()` for bulk verification

## Conformance Testing

**Fitness scores must be >0.85 for valid process models.**

- Token replay fitness: `1 - (missing + consumed) / (produced + remaining)`
- Alignments for exact conformance
- Negative testing: inject impossible logs, verify rejection

**Quality metrics (4 dimensions):**
1. **Fitness** (0-1): >0.85 required
2. **Precision** (0-1): Avoid underfitting
3. **Generalization** (0-1): Avoid overfitting
4. **Simplicity**: Fewer places/transitions better

## OTEL Coverage

**100% of operations must emit OTEL spans.**

### Span Requirements
- **Service name**: `pictl` (or package name)
- **Span name**: `operation_name` (e.g., `healing.diagnosis`, `kernel.run`)
- **Status**: `"ok"` or `"error"` (NOT omitted)
- **Attributes**: Key parameters (`agent_id`, `algorithm`, `log_size`, etc.)

### Verification
- Jaeger UI: http://localhost:16686
- Search by service name and span name
- Verify status field exists and is correct
- Verify attributes capture actual values (not null/empty)

### Non-blocking Logging
- Queue with drop-oldest (never block on OTEL)
- `Instrumentation.emitEvent()` is non-blocking
- OTEL exporter runs in background thread

## Schema Conformance (Weaver)

**Span names must exist in semconv schema.**

- Schema location: `semconv/model/<domain>/spans.yaml`
- Required attributes declared with `requirement_level: required`
- Run: `weaver registry check -r ./semconv/model -p ./semconv/policies/ --quiet`
- Exit code 0 = no violations

**Generated semconv constants:**
```typescript
import { HealingAttributes } from '@pictl/semconv/incubating';
assert(result.failure_mode === HealingAttributes.healing_failure_mode_values().deadlock);
```

## Evidence Requirements

**No claim is complete without THREE proofs (AND logic):**

1. **OTEL Span** — Execution proof (Jaeger UI)
2. **Test Assertion** — Behavior proof (test PASSES)
3. **Schema Conformance** — Structure proof (weaver check exit=0)

**Example insufficient proof:**
- ❌ "Test passed" (only in terminal output, lost after session)
- ❌ "Span was emitted" (only visible during test run)
- ✅ "Span exists in Jaeger UI + test in repo + weaver exit=0" (independently verifiable)

## Coverage Targets

### Rust (CARGO_INCREMENTAL=0)
- **Line coverage**: ≥70% (measured by `cargo-tarpaulin`)
- **Branch coverage**: ≥60%
- **Critical paths**: 90%+ (guards, dispatch, SPC, circuit breaker)

### TypeScript
- **Line coverage**: ≥60% (vitest v8)
- **Function coverage**: ≥60%
- **Branch coverage**: ≥50%
- **Statement coverage**: ≥60%

## CI/CD Integration

**Pre-commit hooks:**
- TPS Pipeline Quality Gate (9 checks)
- Gemba enforcement (no mocks in integration tests)
- Secret redaction

**Pre-merge gates:**
- All tests pass (Rust + TypeScript)
- Coverage thresholds met
- OTEL spans visible in Jaeger
- Schema conformance check passes

**Post-merge:**
- Update baseline benchmarks
- Upload coverage reports
- Tag release with CalVer version

---

**See also:**
- `critical-constraints.md` — MTTR, TPS, fail-fast
- `chicago-tdd.md` — Van der Aalst validation
- `wvda-soundness.md` — Deadlock freedom, liveness, boundedness
