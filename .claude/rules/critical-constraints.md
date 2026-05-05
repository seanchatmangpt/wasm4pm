# wasm4pm Critical Constraints

**Non-negotiable rules for the wasm4pm process mining platform.**

## MTTR Requirements

**MTIR must be <1 second.**

- Measurement: `StateMachine.getMTTR()` (actual, not hardcoded)
- Fast recovery paths:
  - `degraded → ready`: ~10-100ms
  - `failed → ready`: <1s (via `softReset()`, `fastRecoverFromFailed()`)
- Recovery mechanisms:
  - `WasmLoader.softReset()` — preserves compiled WASM
  - `Engine.fastRecoverFromFailed()` — direct state transition
  - Timeout protection (30s default)
- OTEL recovery spans: `RecoveryStarted`, `RecoveryCompleted`

**Do NOT hardcode MTIR values.** Always measure via `StateMachine.getTransitionHistory()`.

## Toyota Production System Compliance

**FAIL FAST — No silent fallbacks.**

- **Defensive guards are prohibited:** Never use `isWasmAvailable` checks that mask unavailability.
- **Errors must propagate visibly:** Throw, don't return `null` or empty results.
- **Graceful degradation is banned:** If WASM fails to load, crash visibly (don't continue with stubs).
- **All 12 dashboard metrics must be GREEN:** Zero TPS violations.

**Examples of prohibited patterns:**
```typescript
// ❌ WRONG: Silent fallback
const wasm = await loadWasm() || { stub: true };

// ❌ WRONG: Defensive guard
if (!isWasmAvailable()) return { error: 'WASM not loaded' };

// ✅ RIGHT: Fail fast
const wasm = await loadWasm(); // throws if unavailable
```

## Process Mining Quality (Van der Aalst)

**Event logs are the only source of truth.**

Code paths, state machines, and API responses are **not proof**. Trust only event evidence that can be mined into a conforming object-centric process.

**Required quality metrics:**
- **Fitness**: >0.85 (token replay fitness)
- **Precision**: Avoid underfitting
- **Generalization**: Avoid overfitting
- **Simplicity**: Fewer places/transitions is better

**Conformance checking:**
- Token replay (fast, approximate)
- Alignments (exact, computationally expensive)
- Fitness = 1 - (missing + consumed) / (produced + remaining)

**Model-vs-log mismatch is a DEFECT, not a "discrepancy".**

## WASM Constraints

**Binary size (measured for browser, targets for others):**
- `mobile`: ~1.8MB target (33% reduction target)
- `iot`: ~1.9MB target (30% reduction target)
- `edge`: ~2.1MB target (22% reduction target)
- `fog`: ~2.4MB target (13% reduction target)
- `browser`: **2.7MB measured** (default, all features)

**Conditional compilation:**
- 30+ modules use `#[cfg(feature)]` gates
- 13 feature flags control algorithm inclusion
- 5 deployment profiles (mobile/edge/fog/iot/browser)
- Build: `wasm-pack build --target bundler|nodejs|web`

**SIMD optimization:**
- `simd_streaming_dfg` for high-throughput scenarios
- Hand-rolled statistics for size-constrained profiles
- `feature-statrs` for full-precision math

## Error Handling

**Never swallow errors.**

- ❌ `try { ... } catch { return null }`
- ❌ `|| true` to silence failures
- ❌ `.catch(() => undefined)` to hide crashes
- ✅ Let errors propagate — fail visibly

**Circuit breaker pattern:**
- 3 strikes = manual intervention
- Closed → Open (failure threshold exceeded)
- Open → HalfOpen (timeout elapsed)
- HalfOpen → Closed (probe success) or Open (probe failure)

## OTEL Coverage

**100% of operations must emit OTEL spans.**

- Span name: `operation_name` (e.g., `healing.diagnosis`, `a2a.create_deal`)
- Status field: `"ok"` or `"error"` (NOT omitted)
- Attributes: `agent_id`, `resource_id`, `status`, etc.
- Non-blocking logging: queue with drop-oldest (never block on OTEL)

**Secret redaction:**
- Redact passwords, API keys, tokens from all OTEL and JSON logging
- Use `SECRET_REDACTION` hook via pre-commit

## Verification

Every merge must pass:
1. **Three-layer evidence**: OTEL span + test assertion + schema conformance (AND logic)
2. **Mutation score**: ≥80% (planned via cargo-mutants, stryker-js)
3. **TPS Pipeline Gates**: 9 automated checks (zero violations)
4. **WvdA soundness**: Deadlock-free, liveness-guaranteed, bounded
5. **Chicago TDD**: Red-Green-Refactor, FIRST principles

---

**See also:**
- `verification.md` — Testing hierarchy and determinism
- `chicago-tdd.md` — Van der Aalst process mining validation
- `wvda-soundness.md` — Deadlock freedom, liveness, boundedness
