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
Properties that hold for any correct implementation (Algebraic Invariants).

| Oracle | Property | Detection |
|--------|----------|-----------|
| Bellman equation | `Q*(s,a) = R(s,a) + γ max_a' Q*(s',a')` | Seeded RNG, verify Q(s,a) changes direction after update with s≠s' |
| Terminal Bellman | When done=true, target = r (no bootstrapping) | Set done=true, verify no future state contribution |
| Western Electric rules | Rule 1 fires at exactly 3σ point, Rule 2 at exactly 9th consecutive | Construct sequences, assert exact firing point |
| Feature normalization | All 8 components in [0,1] | Inject extreme inputs, verify bounded output |
| Algebraic Invariants | Symmetry, Monotonicity, Idempotency | Property-based sampling (fast-check/proptest) |

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

## Prolog8 AAT (P8-CF Families)

**File:** `crates/prolog8/tests/aat_live_counterfactual.rs` | **Total: 36 tests (all passing)**

| Family | Oracle | Covers |
|--------|--------|--------|
| P8-CF-1 | Rank 1 | Arity cap: `ArityCapExceeded`, body cap, body length |
| P8-CF-2 | Rank 1 | Rule body cap: `RuleBodyCapExceeded` |
| P8-CF-3 | Rank 2 | Rule derivation: proof nodes include rule nodes when `proof_mode=Both` |
| P8-CF-4 | Rank 2 | Deny path: negative proof present when `proof_mode=Both` |
| P8-CF-5 | Rank 1 | Receipt determinism: identical inputs produce identical `receipt_hash` |
| P8-CF-6 | Rank 2 | Kernel isolation: independent instances don't share state |
| P8-CF-7 | Rank 1 | BLAKE3 domain separation: catalog/rule/fact/input/proof/output roots are distinct |
| P8-CF-8 | Rank 1 | Admission mask invariants: body_mask, negation_mask, builtin_mask, proof_mask bounds |

**Gotchas specific to Prolog8:**
- `Atom8::new(pred, 9, ...)` clamps arity to 8 — use struct literal to test `ArityCapExceeded`
- Deny proof nodes only appear with `proof_mode = Both` or `NegativeOnly` — `PositiveOnly` gives empty proof in Deny
- `body_mask` check fires before `proof_mask` — set `body_mask` correctly when testing `ProofMaskOutOfRange`

```bash
# Run all Prolog8 tests
cargo test -p prolog8 2>&1 | grep "test result"
# Expected: 31 + 36 + 11 = 78 passing
```

## Critical Bugs Under Test

| Bug ID | Description | Detection Method |
|--------|-------------|-----------------|
| **FM-1** | `next_state == state` in Bellman update (self-referential) | Seeded RNG + s≠s', verify Q(s,a) changes |
| **TS-1** | `String::len()` as timestamp proxy (ISO-8601 near-identical lengths) | Inject known time differences, verify duration in time units |
| **CB-1** | Circuit breaker step counter never advanced | Construct breaker in Open, advance clock, assert allow_request |
| **SP-1** | SPC one-shot → ring buffer (regression) | Verify snapshot count after 101+ observations |
| **P8-CLAMP** | `Atom8::new` clamps arity — admission check independent | Use struct literal with arity=9, verify `ArityCapExceeded` |
| **P8-DENY-MODE** | Deny proof only with `proof_mode=Both/NegativeOnly` | Set proof_mode before querying for denial, assert proof nodes |

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

## Supabase Package Tests (`@wasm4pm/supabase`)

**File:** `packages/supabase/src/__tests__/supabase.integration.test.ts`

These tests run **without** a live Supabase connection — they test the config resolution, credential validation, and envelope parsing logic using mock credentials. They do **not** make network calls.

```bash
# Run supabase package tests (no live Supabase required)
cd packages/supabase && npm test

# Or from monorepo root
pnpm --filter @wasm4pm/supabase test
```

**Env vars required only for live write probes** (`wpm supabase doctor --live`):

| Env Var | Required | Description |
|---------|----------|-------------|
| `WASM4PM_SUPABASE_URL` | Yes | Supabase project URL |
| `WASM4PM_SUPABASE_ANON_KEY` | Yes | Anon/public key |
| `WASM4PM_SUPABASE_SERVICE_ROLE_KEY` | For live writes | Service role key (not anon) |

Set these in `.env.local` or pass directly to the CLI. The integration test uses mock values for unit-level assertions and does not reach out to a real Supabase instance.

## TDD Discipline (Chicago School)

Every feature follows Red-Green-Refactor:

1. **RED**: Write failing test (test name matches claim)
2. **GREEN**: Minimal implementation to pass
3. **REFACTOR**: Clean code (no behavior change)

See `.claude/rules/_core/absolute.md` (doctrine + Andon rules); verified audit status in `docs/audit-history.md`.

## Cognition Breeds (Full Periodic Table, v26.6.10)

52 breeds are PARTIAL_ALIVE in `crates/wasm4pm-cognition/breeds/registry.json` (13 original + 39 periodic-table symbolic breeds). Per-breed gates: refusal test (`tests/oracle_negative.rs`), hidden adversary oracles (`tests/oracle_hidden.rs`, fresh names enforced absent from production by `tests/registry_admission.rs`), paper-grounded fixture with provenance (`tests/paper_grounded.rs`), bit-exact determinism (`tests/breed_determinism.rs`), OCEL lifecycle fitness 1.0 (`tests/ocel_conformance.rs`, incl. shuffled-trace negative injection), and criterion latency (`benches/breed_latency.rs`). The registry ratchet (`tests/registry_admission.rs`) makes PARTIAL_ALIVE earned, not asserted.
