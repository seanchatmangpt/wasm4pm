<!-- wasm4pm-doc-status: active; reviewed: 2026-10-11; original: benchmarks/adversarial/SUMMARY.md; source-sha256: b932af15fa5b488a850bfb2fd75dd663dd0b51c832f7c5140cc1f1cf6820d7db; reason: corrected against measured ground truth (manifest stats, registry state, 2026-10-11 audit run) -->

# Adversarial WvdA Algorithm Audit — Implementation Summary

**Date:** 2026-04-17 (corrected 2026-10-11 against measured ground truth)
**Status:** Phases 0-4, 6 complete; Phase 5 audit executed 2026-10-11
**van der Aalst Doctrine:** If code claims it worked but event logs cannot prove a lawful process happened, then it did not work.

---

## Executive Summary

The wasm4pm algorithm registry once claimed 41 algorithms. This adversarial audit
cross-references that declaration against actual `#[wasm_bindgen]` exports and
executes every algorithm against a synthetic 500K-event log with known ground truth.

### Measured Manifest Ground Truth (verified 2026-10-11 via `getManifestStats()`)

| Fact | Measured value |
|------|----------------|
| Manifest entries (`ALGORITHM_MANIFEST.length`) | 40 |
| Exported (real `wasmFn`) | 39 |
| `NOT_EXPORTED` | 1 (`yawl_export` — takes internal `PowlArena`, not WASM-compatible) |
| Manifest file length | 421 lines (`algorithm-manifest.ts`) |
| `STUB` markers in manifest | 0 |

An earlier version of this file claimed 41 algorithms / 388 lines / 5 `NOT_EXPORTED`;
those numbers were stale registry declarations, not measured counts.

### 2026-10-11 Audit Run (500K events, real WASM, exit 0)

Results: `results/audit-results-2026-10-11.json` (runner writes `dist/results/`;
both paths gitignored). Per-algorithm 4D quality + tier classification:

| Tier | Count | Members |
|------|-------|---------|
| Tier 0 (production-ready) | 0 | — |
| Tier 1 (experimental) | 35 | dfg (fitness 0.92, 1.06 s), simd_streaming_dfg (0.92, 79 ms), alpha_plus_plus (0.871), ilp (0.842, 2.52 s), … |
| Tier 2 (wrong/low quality) | 4 | alpha_plus_plus, ilp, ml_anomaly, petri_net_reduction |
| Tier 3 (no export) | 0 | — |

Headline: **no algorithm currently meets the Tier 0 bar** (fitness ≥ 0.85 AND latency
< 5 s AND precision threshold) under the audit's strict 4D classification; 35 run
end-to-end at 500K. Most algorithms report precision 0.000, which drives the Tier 2
classifications — the precision scorer is the next thing to investigate.

---

## Phase 0: Delete Broken Files ✅

**Commit:** 71f98064

Deleted three broken benchmark files that assumed non-existent APIs:

| File | Problem | Solution |
|------|---------|----------|
| `validators/fitness-validator.ts` | Called `wasm4pm.run({ algorithm: 'conformance' })` (doesn't exist) | Deleted |
| `suites/discovery-benchmarks.ts` | Referenced missing dataset `bpi_2020_100k.xes` | Deleted |
| `validator.ts` | Required nonexistent `results.json` bridge | Deleted |

**Lesson:** Direct WASM calls are correct. CLI wrapper has assumptions.

---

## Phases 1-2: Adversarial Audit Infrastructure ✅

**Commit:** 914fed09

### Files Created

1. **`synthetic-log-gen.ts`** (169 lines)
   - Generates 500K XES with known ground truth
   - Process: A → B → C → D (perfect sequential, fitness = 1.0)
   - Scale series: 50K (quick), 500K (normal), 5M (stress)

2. **`oracle.ts`** (256 lines)
   - Rank-1 mathematical oracles (cannot be wrong)
   - Bellman equation verification
   - Van der Aalst fitness formula: `fitness = 1 - (missing + remaining) / (consumed + produced)`
   - Western Electric Rules (SPC control chart)
   - 4D quality metric consistency checks

3. **`quality-pipeline.ts`** (194 lines)
   - Fitness: token-based replay (fast) or alignments (exact)
   - Precision: ETConformance (if implemented)
   - Generalization: model generalization metric
   - Simplicity: 1 / (1 + element_count)

4. **`tier-classifier.ts`** (227 lines)
   - **Tier 0:** Production-ready (fitness ≥ 0.85, latency < 5s)
   - **Tier 1:** Experimental (correct but slow or low precision)
   - **Tier 2:** Wrong (crashes, wrong output type, low fitness)
   - **Tier 3:** Lie (no WASM export, stub implementation)

5. **`audit-runner.ts`** (150 lines)
   - Master orchestrator: direct WASM calls for all 41 algorithms
   - Pattern: load log → run each algorithm → measure 4D quality → classify tier
   - Batch execution: quick (50K), normal (500K), stress (5M)

6. **`audit-runner-main.ts`** (163 lines)
   - CLI entry point with 6-step workflow
   - Generates synthetic logs → loads WASM → runs audit → prints recommendations

7. **`algorithm-manifest.ts`** (421 lines, 40 entries)
   - Ground truth: maps registered algorithm IDs to WASM implementations
   - Fields: id, wasmFn, outputType, fitnessCapable, expectedLatencyBudgetMs
   - Encoded findings (verified 2026-10-11):
     - 1 algorithm: `wasmFn = 'NOT_EXPORTED'` (`yawl_export`)
     - Helper functions: `getAlgorithm()`, `getExportedAlgorithms()`, `getManifestStats()`

8. **`package.json` + `tsconfig.json` + `vitest.config.ts`**
   - TypeScript 5.3+, vitest (workspace-resolved), @types/node
   - Scripts: `pnpm audit`, `pnpm test` (now a pnpm workspace member)

---

## Phase 3: Reporting ✅

**Commit:** 279331c2

### File Created

**`report.ts`** (234 lines)
- **Markdown:** Human-readable summary with tables
- **HTML:** Web-viewable report with styling
- Sections: Summary, Quality Metrics, Tier 0/1/2/3 breakdowns, Detailed Results

---

## Phase 4: Registry Corrections — and Partial Reversion ✅

**Commits:** 1d5c7c33 (removals), later reverts

### History of `packages/kernel/src/registry.ts`

Phase 4 removed 5 algorithms it judged NOT_EXPORTED:
`ml_classify`, `ml_forecast`, `ml_regress`, `ml_pca`, `petri_net_reduction`.

**That removal was itself partially wrong and has been reverted.** As of 2026-10-11,
`packages/kernel/src/registry.ts` re-adds all of them (ml_classify at line 842, plus
ml_cluster, ml_forecast, ml_anomaly, ml_regress, ml_pca, petri_net_reduction), with an
in-source note that the Phase 4 audit "incorrectly removed these; they are re-added
here" — the ml_* family is backed by the `@wasm4pm/ml` package using
`wasm.extract_case_features` + native TS, not direct WASM exports, and
`petri_net_reduction` maps to the real `wasm_reduce_petri_net` export. The manifest
reflects this: it lists all of them with concrete `wasmFn` values, and its only
NOT_EXPORTED entry is `yawl_export`.

**Registry corrections that did stick (per manifest):**
```
a_star              petrinet → dfg      (discover_astar)
hill_climbing       petrinet → dfg      (discover_hill_climbing)
aco                 petrinet → dfg      (discover_aco_algorithm)
simulated_annealing petrinet → dfg      (discover_simulated_annealing)
genetic_algorithm   petrinet → dfg      (discover_genetic_algorithm)
pso                 petrinet → dfg      (discover_pso_algorithm)
```

---

## Phase 6: Vitest Regression Suite ✅

**Commit:** baf22564; suite executed 2026-10-11: **19/19 pass** (`pnpm --filter
wasm4pm-adversarial-audit test`, ~0.4 s, vitest 1.6.1 workspace-resolved).

Note (honest scope): the suite's WASM-dependent integration paths (Category G) run in a
degraded mode in this environment — `@wasm4pm/cli` is not a declared dependency and the
`require()`-based loader fails under ESM, so Categories A-F/H validate the oracles and
Category G exercises only its prerequisites guards. The 500K WASM integration coverage
lives in the Phase 5 audit runner, which does execute real WASM end to end.

Also fixed 2026-10-11: Category H's expected values contradicted the rank-1 fitness
formula itself (`(10,10,100,100)` → 0.9 not 0.8; `(50,50,100,100)` → 0.5 not 0.0);
assertions corrected to the formula's true outputs.

### File Created

**`adversarial-wvda.bench.ts`** (282 lines)

**Test Categories (A–H) from van der Aalst Oracle Hierarchy:**

| Cat | Rank | Test | Implementation |
|-----|------|------|-----------------|
| **A** | 1 | Bellman correctness (FM-1 detection) | Self-referential Q-update check |
| **B** | 4 | Policy improvement convergence | RL convergence trends over 50+ cycles |
| **C** | 1 | Western Electric Rules (SPC) | 3 control chart rules |
| **D** | 2 | Circuit breaker state machine | CB state transitions |
| **E** | 3 | Metamorphic relations | Log scaling + noise injection |
| **F** | 1 | Feature normalization | All RLC features ∈ [0,1] |
| **G** | 2 | Integration behavioral | Tier 0 algorithms, <5s at 500K |
| **H** | 0 | Mutation adequacy | Fitness formula mutation detection |

**Tier 0 Regression Tests:**
- DFG: <2ms, fitness=1.0
- SIMD DFG: <1ms
- Alpha++: fitness ≥ 0.85, <50ms
- Heuristic Miner: fitness ≥ 0.80, <100ms

---

## Phase 5: Audit Executed ✅ (2026-10-11)

```bash
pnpm install                      # workspace now includes benchmarks/*
pnpm --filter wasm4pm-adversarial-audit audit
```

Prerequisite: WASM built (`wasm4pm/pkg/` present). The 2026-10-11 run generated a
fresh 500K-event synthetic log, executed 39 algorithms against real WASM, and wrote
`dist/results/audit-results-2026-10-11.json` (exit 0). See the measured table above.

---

## Key Insights

### The Van der Aalst Doctrine Applied

**"If the code says it worked but the event log cannot prove a lawful process happened, then it did not work."**

This audit trusts only what WASM exports and what event logs prove, not registry declarations.

### Critical Bugs Prevented

| Bug ID | Description | Detected By |
|--------|-------------|-------------|
| **FM-1** | Q-table self-referential update (`next_state == state`) | Bellman verification (Rank-1) |
| **TS-1** | `String::len()` for time gap proxy | Timestamp oracle |
| **CB-1** | Circuit breaker step counter not advancing | State machine test |

### Fitness Formula (Rank-1 Mathematical Oracle)

```
fitness = 1 - (missing + remaining) / (consumed + produced)
```

This is Van der Aalst's theorem. It cannot be wrong—it is the definition. All 4D quality measurement derives from this single invariant.

---

## Deployment Artifacts

### benchmarks/adversarial/

```
├── algorithm-manifest.ts         # Registry audit (40 entries, 1 NOT_EXPORTED)
├── audit-runner.ts               # Master orchestrator
├── audit-runner-main.ts          # CLI entry point
├── adversarial-wvda.bench.ts     # Vitest regression suite (Categories A–H)
├── vitest.config.ts              # Includes the .bench.ts test file
├── synthetic-log-gen.ts          # 500K XES generator
├── oracle.ts                     # Rank-1 mathematical oracles
├── quality-pipeline.ts           # 4D quality measurement
├── tier-classifier.ts            # Tier 0/1/2/3 classification
├── report.ts                     # Markdown/HTML reporting
├── package.json                  # TypeScript + vitest (pnpm workspace member)
├── tsconfig.json                 # ES2020 strict mode
├── dist/                         # tsc output (gitignored via `dist/`)
└── results/                      # Audit output (gitignored via `results/`)
```

### Build-output ignore coverage (verified 2026-10-11)

Existing `.gitignore` patterns already keep the generated artifacts untracked,
confirmed with `git check-ignore -v`:

- `dist/` (line 20) → `benchmarks/adversarial/dist/*`
- `results/` (line 31) → `benchmarks/adversarial/results/*`
- `benchmarks/**/*.js`, `*.js.map`, `*.d.ts`, `*.d.ts.map` (lines 160-163) → the
  root-level transpiled files

Only `.ts` sources, `package.json`, `tsconfig.json`, `vitest.config.ts`, and
`SUMMARY.md` are tracked.

---

## Next Steps

1. **Tier 0 gap:** no algorithm passed the strict Tier 0 bar on 2026-10-11 —
   investigate the precision scoring path (most algorithms report precision 0.000).
2. **Category G:** declare `@wasm4pm/cli` or port the loader to ESM `import()` so the
   vitest suite exercises real WASM in-process.
3. **CI/CD Integration:** `.github/workflows/adversarial-audit.yml` (from plan, not yet created)

---

## Glossary

| Term | Definition |
|------|-----------|
| **Tier 0** | Production-ready (fitness ≥ 0.85, latency < 5s at 500K) |
| **Tier 1** | Experimental (correct but slow or low precision) |
| **Tier 2** | Wrong (crashes, wrong output, low fitness) |
| **Tier 3** | Lie (no WASM export, stub, wrong mapping) |
| **4D Quality** | Fitness, Precision, Generalization, Simplicity |
| **Rank-1 Oracle** | Mathematical theorem (cannot be wrong) |
| **Van der Aalst** | Process mining pioneer; soundness = deadlock-free + liveness + bounded |
| **Fitness** | `1 - (missing + remaining) / (consumed + produced)` |

---

**Status:** Infrastructure complete; audit executed 2026-10-11 (39/40 exported, 0 Tier 0).
