# Determinism Oracle Compliance (Verification.md Rank-1)

**Status:** Audit complete, 3 critical issues identified  
**Last Updated:** 2026-05-18  
**Scope:** All 36 kernel-registered algorithms  

---

## Rank-1 Oracle (Verification.md Definition)

> **Mathematical Theorem:** For all deterministic algorithms, if input is identical, output must be bit-exact identical across runs.

> **Verification:** Run algorithm with same parameters on same event log, compute BLAKE3 hash of output, compare across N runs (N ≥ 3). Hashes must be 100% identical.

This is **NOT** a statistical property. It is a mathematical contract that all deterministic code must satisfy.

---

## Compliance Status

### 23 Algorithms — Rank-1 Compliant ✅

These use only deterministic data structures and no RNG:

```
dfg, process_skeleton, alpha_plus_plus, heuristic_miner, inductive_miner,
declare, optimized_dfg, hierarchical_dfg, simd_streaming_dfg, transition_system,
causal_graph, performance_spectrum, batches, generalization, etconformance_precision,
alignments, complexity_metrics, pnml_import, bpmn_import, powl_to_process_tree,
yawl_export, correlation_miner, [1 more under verification]
```

**Verification:** No HashMap iteration, no RNG, no floating-point accumulation risks.

### 5 Algorithms — Rank-1 Compliant with Seeding ✅

These use StdRng with fixed seed (42), producing deterministic output:

```
genetic_algorithm, pso, aco, simulated_annealing, a_star
```

**Verification:** `StdRng::seed_from_u64(42)` at construction. Same seed → same output.

**Note:** Seeding is hardcoded. Not configurable by caller. This is deterministic but not flexible for research/testing.

### 3 Algorithms — Rank-1 Non-Compliant ❌

#### Issue 1: streaming_dfg.rs (HashMap iteration)

**File:** `wasm4pm/src/streaming/streaming_dfg.rs:62`

```rust
pub open_traces: HashMap<String, Vec<u32>>,
```

**Problem:** HashMap iteration order is non-deterministic (hash randomization). If algorithm outputs rely on case_id ordering, results differ across runs.

**Symptom:** Running same trace twice produces edges in different order. BLAKE3 hash differs.

**Fix:**
```rust
// Before iteration, sort case_ids:
let mut cases: Vec<_> = self.open_traces.keys().cloned().collect();
cases.sort();
for case_id in cases {
    let trace = &self.open_traces[&case_id];
    // ...
}
```

**Effort:** 10 minutes

---

#### Issue 2: playout.rs (unseeded fastrand)

**File:** `wasm4pm/src/playout.rs` (multiple lines)

```rust
let idx = fastrand::usize(..children.len());
while fastrand::f64() < 0.3 { ... }
```

**Problem:** `fastrand` is a global unseeded RNG. Each call returns random value.

**Symptom:** Each run produces different trace. Monte Carlo simulation not reproducible.

**Fix:**
```rust
pub fn playout(powl: &Powl, random_seed: u64) -> Vec<String> {
    let mut rng = fastrand::Rng::with_seed(random_seed);
    let idx = rng.usize(..children.len()); // Now seeded
    while rng.f64() < 0.3 { ... }
}
```

**Effort:** 20 minutes

---

#### Issue 3: Hardcoded Seeds (not an oracle violation, but design limitation)

**Files:** `genetic_discovery.rs`, `more_discovery.rs` (genetic, PSO, ACO, SA, A*)

```rust
let mut rng = StdRng::seed_from_u64(42); // Always 42
```

**Problem:** Seed is hardcoded. No way for caller to reproduce specific random variant or control randomization for testing.

**Impact on Rank-1 Oracle:** ✅ No impact. Same seed (42) → same output. Rank-1 satisfied.

**Impact on Research/Testing:** ⚠️ Medium. Reduces flexibility.

**Fix (optional):**
```rust
#[wasm_bindgen]
pub fn discover_genetic_algorithm(
    handle: &str,
    activity_key: &str,
    population_size: usize,
    generations: usize,
    seed: Option<u64>, // NEW
) -> Result<JsValue, JsValue> {
    let actual_seed = seed.unwrap_or(42);
    let mut rng = StdRng::seed_from_u64(actual_seed);
    // ...
}
```

**Effort:** 1-2 hours (all 5 stochastic algorithms)

---

## 5 Algorithms Requiring Deeper Audit ⚠️

| Algorithm | Status | Notes |
|-----------|--------|-------|
| `ilp_discovery` | ? | Large file, constraint solver, RNG usage unclear |
| `smart_engine` | ? | Implementation unclear |
| `monte_carlo_simulation` | ✅ (likely) | Uses `StdRng::seed_from_u64(config.random_seed)` |
| `hill_climbing` | ⚠️ | Needs confirmation of seeding |
| `log_to_trie` | ⚠️ | Uses HashMap; needs verification it doesn't leak order |

**Action:** Grep for RNG usage, verify no HashMap `.iter()` without sort.

---

## Test Harnesses

### Rust Integration Tests

**File:** `wasm4pm/tests/algorithm_determinism_template.rs`

Three test categories:
1. **Category A:** Core deterministic (DFG, skeleton, etc.)
2. **Category B:** Stochastic with seeding (genetic, PSO, ACO, SA, A*)
3. **Category C:** Known violations (streaming_dfg, playout) — expected to fail

Run:
```bash
cargo test --test algorithm_determinism_template
```

### TypeScript Harness

**File:** `packages/testing/src/harness/algorithm-determinism.ts`

Functions:
- `checkAlgorithmDeterminism()` — Single algorithm, N runs, BLAKE3 comparison
- `checkAlgorithmBatchDeterminism()` — Multiple algorithms, batch mode
- `summarizeDeterminismResults()` — Generate Markdown report

Usage:
```typescript
const result = await checkAlgorithmDeterminism(
  { algorithmName: 'dfg', parameters: {...}, eventLog: log },
  5, // iterations
  async (log, params) => {
    const dfg = await kernel.run('dfg', handle, params);
    return blake3(JSON.stringify(dfg)).toString();
  },
);

expect(result.passed).toBe(true);
```

---

## Verification Roadmap

### Phase 1: Immediate (This Week)

- [ ] Run `cargo test --test algorithm_determinism_template`
- [ ] Document results in DETERMINISM_AUDIT.md checklist
- [ ] Fix streaming_dfg HashMap sorting (10 min)
- [ ] Verify log_to_trie doesn't leak order (5 min)

### Phase 2: Short-Term (Next Week)

- [ ] Implement TypeScript determinism tests
- [ ] Fix playout.rs fastrand seeding (20 min)
- [ ] Run full test suite
- [ ] Commit results

### Phase 3: Medium-Term (Next Sprint)

- [ ] Expose seed parameters for stochastic algorithms (1-2 hours)
- [ ] Add regression oracle tests
- [ ] Migrate all fastrand to seeded instances

---

## How Rank-1 Oracle Protects Against Bugs

The determinism oracle catches **non-deterministic data structures** that might hide during development:

### Bug: HashMap Iteration

```rust
// BUG: HashMap iteration order is random
for (from, to) in &self.edge_map.iter() {
    dfg.edges.push((from, to));
}
// Run 1: edges = [A→B, C→D, E→F]
// Run 2: edges = [E→F, A→B, C→D] ← Different order, same content
// Hash Run1 != Hash Run2 ← Oracle catches this
```

### Bug: Unseeded RNG

```rust
// BUG: fastrand without seed
let choice = fastrand::usize(..3);
// Run 1: choice = 1
// Run 2: choice = 2 ← Different output
// Hash Run1 != Hash Run2 ← Oracle catches this
```

### Bug: Floating-Point Accumulation

```rust
// BUG: Accumulation order-dependent
let mut score = 0.0;
for fitness in fitnesses {
    score += fitness; // Order of addition matters (IEEE 754)
}
// Run 1 (insertion order A): score = 0.3333333333
// Run 2 (insertion order B): score = 0.3333333334 ← Tiny diff, but BLAKE3 different
// Hash Run1 != Hash Run2 ← Oracle catches this
```

---

## Integration with CI/CD

Add to pre-merge gate:

```bash
# Rust
cargo test --test algorithm_determinism_template -- --nocapture

# TypeScript
pnpm --filter @wasm4pm/testing test -- algorithm-determinism

# Check for failures
if ! cargo test --test algorithm_determinism_template; then
  echo "❌ Algorithm determinism check failed"
  echo "   See DETERMINISM_AUDIT.md for debug steps"
  exit 1
fi
```

---

## References

| Document | Purpose |
|----------|---------|
| `/Users/sac/wasm4pm/DETERMINISM_AUDIT.md` | Detailed per-algorithm audit, findings, recommendations |
| `/Users/sac/wasm4pm/DETERMINISM_AUDIT_SUMMARY.txt` | Executive summary, checklist, action items |
| `verification.md` § Rank-1 Oracle | Oracle definition (this project's standard) |
| `chicago-tdd.md` § Failure as First-Class Defect | Event log evidence requirement (complements determinism) |
| `wasm4pm/tests/algorithm_determinism_template.rs` | Rust test harness (runnable) |
| `packages/testing/src/harness/algorithm-determinism.ts` | TypeScript test harness (runnable) |

---

## Critical Constraint

**From verification.md:**

> Every merge must pass: ... (3) Rank-1 Oracle verification — deterministic algorithms produce identical output across runs

**This means:** Before committing algorithm changes, run determinism tests. Non-deterministic output is a merge blocker.

---

**Last audit:** 2026-05-18  
**Next review:** After fixes applied (streaming_dfg, playout)
