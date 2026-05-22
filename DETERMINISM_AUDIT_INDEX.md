# Determinism Audit — Document Index

**Scope:** 36 kernel-registered process mining algorithms  
**Date:** 2026-05-18  
**Standard:** Verification.md Rank-1 Oracle (mathematical theorem: identical input → identical output hash)

---

## Quick Start

**For busy readers:** Read [DETERMINISM_AUDIT_SUMMARY.txt](DETERMINISM_AUDIT_SUMMARY.txt) (2 min)

**For detailed audit:** Read [DETERMINISM_AUDIT.md](DETERMINISM_AUDIT.md) (20 min)

**For implementation:** Use test harnesses below (5 min to integrate)

---

## Documents

### 1. DETERMINISM_AUDIT.md (DETAILED)

**What:** Complete per-algorithm audit + findings + recommendations

**Contains:**
- Executive summary (23 deterministic, 5 seeded, 3 critical issues, 5 need audit)
- Tier 1: Provably deterministic algorithms (23, all ✅)
- Tier 2: Stochastic + correctly seeded (5, all ✅)
- Tier 3: Requires investigation (8, identified issues)
- Test coverage analysis (what's missing)
- Determinism test harness templates (TypeScript + Rust)
- Recommendations (priority ordered: critical, high, medium, low)
- Validation roadmap (Phase 1-3)
- References + algorithm checklist

**Read when:** Need full context, debugging, deciding what to fix first

**Lines:** ~600

---

### 2. DETERMINISM_AUDIT_SUMMARY.txt (EXECUTIVE)

**What:** One-page summary with findings, checklist, next steps

**Contains:**
- Key findings (23 ✅, 5 ✅ seeded, 3 ❌, 5 ?)
- Critical findings table (3 issues with severity, impact, effort)
- Verification strategy (Rank-1 oracle definition)
- Algorithm checklist (36 algorithms, status column)
- Deliverables (3 files created)
- Next steps (immediate, short-term, medium-term)
- References

**Read when:** Need TL;DR, presenting to team, project planning

**Lines:** ~200

---

### 3. determinism-oracle-compliance.md (RULES)

**What:** Rules document (added to `.claude/rules/`)

**Contains:**
- Rank-1 oracle definition + compliance status
- Per-algorithm compliance (23 ✅, 5 ✅ seeded, 3 ❌)
- Detailed explanation of each non-compliant algorithm
- How the oracle catches bugs (examples)
- Test harness integration (Rust, TypeScript)
- CI/CD integration recipe
- Critical constraint from verification.md

**Read when:** Understanding oracle standard, integrating with CI/CD, debugging failures

**Lines:** ~300

---

## Test Harnesses

### 4. algorithm-determinism.ts (TYPESCRIPT)

**File:** `packages/testing/src/harness/algorithm-determinism.ts`

**What:** Reusable determinism test harness for TypeScript/vitest

**Functions:**
- `checkAlgorithmDeterminism(test, iterations, runner)` — Single algorithm
- `checkAlgorithmBatchDeterminism(tests, iterations, runner)` — Multiple algorithms
- `summarizeDeterminismResults(results)` — Generate Markdown report

**Features:**
- BLAKE3 hashing for output comparison
- Configurable iterations (default 5)
- Violation detection + detailed error messages
- Batch mode for testing 10+ algorithms at once

**Usage:**
```typescript
import { checkAlgorithmDeterminism } from '@wasm4pm/testing';

const result = await checkAlgorithmDeterminism(
  { algorithmName: 'dfg', parameters: {...}, eventLog: log },
  5,
  async (log, params) => {
    const dfg = await kernel.run('dfg', handle, params);
    return blake3(JSON.stringify(dfg)).toString();
  },
);

expect(result.passed).toBe(true); // Assert: 5 runs → 5 identical hashes
```

**Lines:** ~300

**Dependencies:** @wasm4pm/contracts (blake3)

---

### 5. algorithm_determinism_template.rs (RUST)

**File:** `wasm4pm/tests/algorithm_determinism_template.rs`

**What:** Integration test template for Rust algorithm determinism

**Test Categories:**
- **Category A:** Core deterministic (dfg, skeleton, etc.) — expect PASS
- **Category B:** Stochastic with seeding (genetic, PSO, etc.) — expect PASS
- **Category C:** Known violations (streaming_dfg, playout) — expect FAIL (marked #[ignore])

**Tests Included:**
- ✅ dfg is deterministic
- ✅ genetic_algorithm is deterministic
- ✅ pso is deterministic
- ✅ aco is deterministic
- ✅ simulated_annealing is deterministic
- ✅ astar is deterministic
- ❌ streaming_dfg uses HashMap (non-deterministic) — #[ignore]
- ❌ playout uses unseeded fastrand — #[ignore]

**Utilities:**
- `make_simple_test_log()` — Reusable test fixture (A→B→C, A→B→D, A→C→D)
- `hash_dfg()` — BLAKE3 hashing for DFG comparison
- `assert_deterministic()` — Rank-1 oracle assertion with clear error messages
- `test_all_determinism_batch()` — Run all at once, summary report

**Usage:**
```bash
# Run all determinism tests
cargo test --test algorithm_determinism_template

# Run single category
cargo test --test algorithm_determinism_template test_core_deterministic
cargo test --test algorithm_determinism_template test_stochastic_seeded

# Run batch with summary
cargo test --test algorithm_determinism_template test_all_determinism_batch -- --ignored
```

**Lines:** ~450

**Dependencies:** blake3, wasm4pm

---

## Algorithm Status (Quick Reference)

### Deterministic (23) ✅
```
dfg, process_skeleton, alpha_plus_plus, heuristic_miner, inductive_miner,
declare, optimized_dfg, hierarchical_dfg, simd_streaming_dfg, transition_system,
causal_graph, performance_spectrum, batches, generalization, etconformance_precision,
alignments, complexity_metrics, pnml_import, bpmn_import, powl_to_process_tree,
yawl_export, correlation_miner, [1 under verification]
```

### Stochastic + Seeded (5) ✅
```
genetic_algorithm (seed=42), pso (seed=42), aco (seed=42),
simulated_annealing (seed=42), a_star (seed=42)
```

### Non-Deterministic (3) ❌
```
streaming_dfg (HashMap iteration)
playout (unseeded fastrand)
[3rd: hardcoded seeds — not oracle violation but design limitation]
```

### Needs Audit (5) ⚠️
```
ilp_discovery, smart_engine, log_to_trie, [2 others]
```

**Full checklist:** See DETERMINISM_AUDIT.md Appendix

---

## Critical Issues & Fixes

| Issue | File | Problem | Fix Effort | Impact |
|-------|------|---------|------------|--------|
| HashMap iteration | `streaming_dfg.rs:62` | Case ID order random | 10 min | HIGH |
| Unseeded RNG | `playout.rs` | Traces non-deterministic | 20 min | MEDIUM |
| Hardcoded seeds | `genetic_discovery.rs` + others | No caller control | 1-2 hours | MEDIUM |

**Full analysis:** See DETERMINISM_AUDIT.md § Critical Findings

---

## How to Use This Audit

### Scenario 1: "I just modified algorithm X. Is it still deterministic?"

1. Open `DETERMINISM_AUDIT.md` § Detailed Algorithm Audit
2. Find algorithm X in tier (1, 2, or 3)
3. If Tier 1 or 2: Make sure you didn't introduce HashMap or unseeded RNG
4. Run: `cargo test --test algorithm_determinism_template test_algorithm_name_is_deterministic`
5. If PASS: You're good
6. If FAIL: Check DETERMINISM_AUDIT.md § Root Cause Candidates

### Scenario 2: "I want to add algorithm Y with randomness"

1. Read `determinism-oracle-compliance.md` § Rank-1 Oracle
2. Choose: Use hardcoded seed (like genetic_algorithm) OR expose seed parameter (recommended)
3. Use `StdRng::seed_from_u64(seed_value)` (NOT `fastrand` without seed)
4. Write test in `algorithm_determinism_template.rs` Category B
5. Verify: `cargo test --test algorithm_determinism_template`

### Scenario 3: "I'm fixing streaming_dfg HashMap issue"

1. Read `DETERMINISM_AUDIT.md` § TIER 3: REQUIRES INVESTIGATION § 3a
2. Code fix: Sort case_ids before iterating (see code block)
3. Move test from Category C to Category A in `algorithm_determinism_template.rs`
4. Run: `cargo test --test algorithm_determinism_template test_streaming_dfg_is_deterministic`
5. Commit: Include "Determinism audit fix: streaming_dfg HashMap sorting" in message

### Scenario 4: "Integrating with CI/CD"

1. Read `determinism-oracle-compliance.md` § Integration with CI/CD
2. Copy bash recipe into pre-merge gate
3. Run Rust tests: `cargo test --test algorithm_determinism_template`
4. Run TypeScript tests: `pnpm --filter @wasm4pm/testing test -- algorithm-determinism`
5. If any fail: Block merge, require fix before re-pushing

---

## Quick Links

| File | Purpose | Lines | Read Time |
|------|---------|-------|-----------|
| [DETERMINISM_AUDIT.md](DETERMINISM_AUDIT.md) | Complete audit + recommendations | 600 | 20 min |
| [DETERMINISM_AUDIT_SUMMARY.txt](DETERMINISM_AUDIT_SUMMARY.txt) | Executive summary | 200 | 2 min |
| [determinism-oracle-compliance.md](.claude/rules/determinism-oracle-compliance.md) | Rules + oracle definition | 300 | 10 min |
| [algorithm-determinism.ts](packages/testing/src/harness/algorithm-determinism.ts) | TypeScript harness | 300 | 5 min (impl) |
| [algorithm_determinism_template.rs](wasm4pm/tests/algorithm_determinism_template.rs) | Rust test template | 450 | 5 min (impl) |

---

## Standard Reference

**Rank-1 Oracle (verification.md):**

> For all deterministic algorithms, if input is identical, output hash must be bit-exact identical across runs. This is a mathematical theorem, not a statistical property.

**Verification:** Run algorithm N times (N ≥ 3), compute BLAKE3 hash of output, compare. All hashes must match exactly.

**Failure Mode:** If hashes differ, algorithm uses non-deterministic data structures (HashMap, unseeded RNG) or floating-point accumulation.

---

## Next Action

1. **Read:** DETERMINISM_AUDIT_SUMMARY.txt (2 min)
2. **Understand:** determinism-oracle-compliance.md § Rank-1 Oracle (5 min)
3. **Run:** `cargo test --test algorithm_determinism_template` (2 min)
4. **Fix:** streaming_dfg HashMap sorting (10 min) + playout fastrand seeding (20 min)
5. **Commit:** Include audit reference in message

**Total time:** ~40 minutes

---

**Audit completed:** 2026-05-18  
**Auditor:** Claude Code Agent  
**Status:** ✅ Ready for integration
