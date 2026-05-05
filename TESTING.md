# wasm4pm Testing Philosophy

**Adversarial testing against an RL-based autonomic process control system.**

## Doctrine

> If the code says it worked but the event log cannot prove a lawful process happened, then it did not work.

We trust only event evidence that can be mined into a conforming object-centric process. Code paths, state machines, and API responses are **not** proof.

## Test Layers (4 levels)

| Layer | Location | Runs Against | Speed |
|-------|----------|-------------|-------|
| **Unit** | `packages/*/src/__tests__/` | Local source | <100ms/test |
| **Integration** | `wasm4pm/tests/*.rs` | WASM runtime | <5s/test |
| **Playground** | `playground/scenarios/` | Built CLI (local) | <10s/test |
| **Lab** | `lab/` | Published npm artifact | <30s/test |

## Running Tests

```bash
# TypeScript packages (run from package directory)
cd packages/engine && npm test
cd packages/kernel && npm test
cd apps/wasm4pm && npm test

# Rust/WASM (always use cargo make)
cd wasm4pm
cargo make test           # All tests (vitest + cargo)
cargo test --test <name>  # Single integration test
cargo test --lib          # Inline tests (exits SIGABRT — use grep to verify)

# Full monorepo
pnpm test                 # All TypeScript packages
```

## Non-Determinism Strategy

### Unit Tests (Categories A, C, D, F)
Inject seeded RNG at construction. Deterministic outcomes guaranteed.

```rust
let mut agent = QLearning::new_with_seed(0.1, 0.99, 42);
let a1 = agent.select_action(&state);
let a2 = agent.select_action(&state);
assert_eq!(a1, a2); // Deterministic with seed
```

### Integration Tests (Categories E, G)
Statistical assertions with confidence bounds across multiple seeds.

```rust
for seed in [1, 2, 3, 4, 5] {
    let mut orch = RlOrchestrator::new_with_seed(seed);
    for _ in 0..50 { orch.run_cycle(...); }
    assert!(mean(orch.rewards[40..50]) >= mean(orch.rewards[0..10]));
}
```

## Oracle Hierarchy (5 ranks)

### Rank 1 — Mathematical Theorem
Properties that hold for any correct implementation.

| Oracle | Property | Detection |
|--------|----------|-----------|
| Bellman equation | `Q*(s,a) = R(s,a) + γ max_a' Q*(s',a')` | Seeded RNG, verify Q(s,a) changes direction after update with s≠s' |
| Terminal Bellman | When done=true, target = r (no bootstrapping) | Set done=true, verify no future state contribution |
| Western Electric rules | Rule 1 fires at exactly 3σ point, Rule 2 at exactly 9th consecutive | Construct sequences, assert exact firing point |
| Feature normalization | All 8 components in [0,1] | Inject extreme inputs, verify bounded output |

### Rank 2 — Domain Contract
Design-decided properties.

| Oracle | Property |
|--------|----------|
| Monotonic health degradation | Monotonically decreasing reward |
| Doubling SPC alerts | Strictly lower reward than single alert |
| Circuit breaker Open | Strictly lower reward than Closed (identical health) |

### Rank 3 — Metamorphic Relation
Input perturbation → output relation. No absolute values required.

### Rank 4 — Statistical Property
Convergence trends over N trials (e.g., mean reward improves after 50 cycles).

### Rank 5 — Cross-Validation
Consistency across algorithms, configurations, or data sources.

## Adversarial Test Categories (A–H)

| Category | Target | Oracle Rank | Strategy |
|----------|--------|-------------|----------|
| **A** — Bellman correctness | RL agents | 1 | Seeded RNG, state≠state', verify update direction |
| **B** — Policy improvement | RL orchestrator | 2-4 | Multi-seed convergence, reward trend |
| **C** — SPC time-series | SPC system | 1 | Construct known-violation sequences, assert exact firing |
| **D** — Circuit breaker state machine | Circuit breaker | 1 | State transitions with monotonic clock |
| **E** — Metamorphic relations | Full pipeline | 3 | Input perturbation → directional output change |
| **F** — Feature normalization | RL state encoding | 1 | Extreme inputs → bounded [0,1] output |
| **G** — Integration behavioral | Full autonomic loop | 2-4 | Multi-seed statistical assertions |
| **H** — Mutation adequacy | All tests | 5 | Mutation testing to verify test sensitivity |

## Critical Bugs Under Test

| Bug ID | Description | Detection Method |
|--------|-------------|-----------------|
| **FM-1** | `next_state == state` in Bellman update (self-referential) | Seeded RNG + s≠s', verify Q(s,a) changes |
| **TS-1** | `String::len()` as timestamp proxy (ISO-8601 near-identical lengths) | Inject known time differences, verify duration in time units |
| **CB-1** | Circuit breaker step counter never advanced | Construct breaker in Open, advance clock, assert allow_request |
| **SP-1** | SPC one-shot → ring buffer (regression) | Verify snapshot count after 101+ observations |

## Coverage Targets

| Component | Target | Current |
|-----------|--------|---------|
| Rust inline tests | >95% line | ~647 tests |
| Rust integration tests | >90% function | ~490 tests |
| TypeScript unit tests | >85% line | Per package |
| Adversarial categories | All 8 (A–H) | In progress |
| Mutation score | >80% kill rate | Not measured |

## Testing Gotchas

- **WasmLoader is a singleton** — call `WasmLoader.reset()` between tests
- **`cargo test --lib` exits SIGABRT** — verify with `grep -c "^test .* ok$"`
- **`@wasm4pm/ml` handles empty arrays** — don't assume rejection
- **Run vitest from package directory**, not monorepo root
- **`as const` is type-level only**, not runtime frozen
- **`pub(crate)` NOT enough** for integration tests — must be `pub`
- **Read test files before declaring untested** — tests may be consolidated
- **Cargo auto-discovers `tests/*.rs`** but NOT `tests/subdir/*.rs`

## TDD Discipline (Chicago School)

Every feature follows Red-Green-Refactor:

1. **RED**: Write failing test (test name matches claim)
2. **GREEN**: Minimal implementation to pass
3. **REFACTOR**: Clean code (no behavior change)

See `.claude/rules/chicago-tdd.md` for full discipline including FIRST principles and merge checklist.
