# wasm4pm Chicago TDD — Van der Aalst Constitution

**Doctrine:** If the code says it worked but the event log cannot prove a lawful process happened, then it did not work.

## Hostile Assumptions

- The declared manufacturing pipeline is not the real runtime process
- Stages may be skipped or repeated without detection
- Receipts may be emitted outside lawful object lifecycles
- Proof gates may pass despite non-conforming execution
- Release may occur from invalid or incomplete histories
- The system may appear deterministic while logs reveal variant explosion, hidden loops, retries, or rework

## Required Validation

1. **Event log derivation** — Convert OTel traces to OCEL event logs
2. **Model-vs-log comparison** — Discover actual process from logs, compare against declared model
3. **Temporal conformance** — Stages occur in lawful order, no impossible overlaps
4. **Object lifecycle soundness** — Artifacts, receipts, proofs, releases have lawful histories
5. **Negative testing** — Inject impossible logs, verify rejection
6. **Quality metrics** — Fitness, precision, generalization, simplicity
7. **Causal consistency** — Cross-object causality is mutually consistent

## Failure as First-Class Defect

Model-vs-log mismatch is not a discrepancy. It is a defect.

## Stack Mapping

- **OTel traces** → Raw event evidence
- **OCEL** → Object-centric log model
- **wasm4pm algorithms** → Process-truth engine (discovery, conformance, replay)
- **Conformance checking** → Proof of lawful execution

## For Every Test

Don't trust code paths, state machines, or API responses.
Trust only event evidence that can be mined into a conforming object-centric process.

## RL/ML Specific Testing

### Statistical Oracles (Rank 1-5)

**Rank 1 — Mathematical theorem**: Bellman equation, Western Electric rules, soundness criteria.
**Rank 2 — Domain contract**: Reward function semantics (health improvement → positive reward).
**Rank 3 — Metamorphic relation**: Input perturbation → output relation (health degrades → reward decreases).
**Rank 4 — Statistical property**: Convergence trends over N trials (minimum 50 cycles, 5 seeds).
**Rank 5 — Regression oracle**: Behavior matches previously verified version (weakest).

**Avoid Rank 5 wherever a higher-ranked oracle exists.**

### Adversarial Test Categories (A-H)

| Category | Purpose | Oracle Type |
|----------|---------|-------------|
| **A** | Bellman correctness | Mathematical (Rank 1) |
| **B** | Policy improvement | Statistical (Rank 4) |
| **C** | SPC time-series | Mathematical (Rank 1) |
| **D** | Circuit breaker state machine | Domain contract (Rank 2) |
| **E** | Metamorphic relations | Metamorphic (Rank 3) |
| **F** | Feature normalization invariants | Property-based (Rank 1) |
| **G** | Integration behavioral | Integration (Rank 2) |
| **H** | Mutation adequacy | Self-referential (Rank 0) |

### Non-Determinism Strategy

**Unit tests (A, B, C, D, F):** Inject seeded `SmallRng` at construction. Pass known seed, assert deterministic outcomes.

**Integration tests (E, G):** Statistical assertions with confidence bounds. "After 50 cycles with health=3, mean reward over last 10 cycles > mean reward over first 10 cycles."

## Self-Referential Testing (FM-5) — BANNED

Tests that derive expected values from the implementation being tested are invalid.

```rust
// ❌ BANNED: Self-referential
fn test_event_rate() {
    let rate = compute_event_rate(events, traces);
    assert_eq!(rate, events as f64 / traces as f64); // Proves nothing
}

// ✅ CORRECT: Domain-theory derived
fn test_event_rate_units() {
    let rate = compute_event_rate(events, traces);
    assert!(rate >= 0.0); // Property from domain theory
    assert!(rate.is_finite()); // No division by zero
}
```

## Implementation Priority

**Phase 1 — Formal oracle tests (Categories A, C, D):**
These derive from Rank-1 mathematical oracles. They would have caught every critical bug identified in the explore phase.

**Phase 2 — Policy improvement and metamorphic tests (Categories B, E):**
Verify the system's claimed capability — autonomous improvement — rather than just internal correctness.

**Phase 3 — Integration and adequacy tests (Categories F, G, H):**
Written last because they presuppose unit-level properties are verified.

## Critical Bugs to Test Against

| Bug ID | Description | Category |
|--------|-------------|----------|
| FM-1 | `next_state == state` in Bellman update (self-referential Q-table) | A, B |
| TS-1 | `String::len()` used instead of timestamp parsing for trace durations | C |
| SP-1 | SPC was one-shot; now fixed with ring buffer | C |
| CB-1 | Circuit breaker step counter requires explicit `advance_clock()` calls | D |

---

**See also:**
- `critical-constraints.md` — MTTR, TPS, fail-fast
- `verification.md` — Testing hierarchy, OTEL, schema conformance
- `ml-rl-testing.md` — Statistical oracles, Bellman correctness
