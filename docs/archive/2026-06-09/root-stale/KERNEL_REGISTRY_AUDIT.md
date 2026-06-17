# wasm4pm Kernel Registry Audit Report

**Date:** 2026-05-18  
**Scope:** Cross-check `packages/kernel/src/registry.ts` algorithm registrations against actual WASM exports, metadata accuracy, and error handling contracts.

---

## Executive Summary

| Metric | Value | Status |
|--------|-------|--------|
| **Total Registered Algorithms** | 36 | — |
| **Verified (name match)** | 14 | ✓ 39% |
| **Found (name mismatch)** | 15 | ⚠ 42% |
| **Missing from WASM** | 7 | ✗ 19% |
| **Total Available** | 29 | 81% |
| **High Priority Gaps** | 1 | CRITICAL |
| **Medium Priority Gaps** | 3 | SHOULD FIX |
| **Low Priority Gaps** | 7 | NICE-TO-HAVE |

---

## 1. VERIFIED ALGORITHMS (Name Matches Registry)

These algorithms have exact name-to-export matches. Users can call them with their registered ID.

### 🔴 HIGH PRIORITY (Core / Frequent Use) — 5 algorithms

| Algorithm ID | WASM Export | Speed | Quality | Status |
|--------------|-------------|-------|---------|--------|
| `dfg` | `discover_dfg` | 0.5ms | 30 | ✓ VERIFIED |
| `alpha_plus_plus` | `discover_alpha_plus_plus` | 5ms | 45 | ✓ VERIFIED |
| `heuristic_miner` | `discover_heuristic_miner` | 10ms | 50 | ✓ VERIFIED |
| `inductive_miner` | `discover_inductive_miner` | 15ms | 55 | ✓ VERIFIED |
| `genetic_algorithm` | `discover_genetic_algorithm` | 40ms | 80 | ✓ VERIFIED |

### 🟡 MEDIUM PRIORITY (Secondary Use) — 3 algorithms

| Algorithm ID | WASM Export | Speed | Quality | Status |
|--------------|-------------|-------|---------|--------|
| `hill_climbing` | `discover_hill_climbing` | 20ms | 55 | ✓ VERIFIED |
| `simulated_annealing` | `discover_simulated_annealing` | 30ms | 65 | ✓ VERIFIED |
| `declare` | `discover_declare` | 12ms | 50 | ✓ VERIFIED |

### 🟢 LOW PRIORITY (Wave 1 / Utilities) — 6 algorithms

| Algorithm ID | WASM Export | Status |
|--------------|-------------|--------|
| `optimized_dfg` | `discover_optimized_dfg` | ✓ VERIFIED |
| `ml_cluster` | `discover_ml_cluster` | ✓ VERIFIED |
| `ml_anomaly` | `discover_ml_anomaly` | ✓ VERIFIED |
| `generalization` | `generalization` | ✓ VERIFIED |
| `powl_to_process_tree` | `powl_to_process_tree` | ✓ VERIFIED |
| `monte_carlo_simulation` | `monte_carlo_simulation` | ✓ VERIFIED |

---

## 2. FOUND WITH ALIAS (Name Mismatch — Registry ID ≠ WASM Export)

These algorithms **ARE exported from WASM but with different names**. The kernel API must maintain a mapping table to translate user requests.

### 🔴 HIGH PRIORITY (Core / Blocking) — 1 algorithm

| Registry ID | WASM Export | Severity | Impact | Fix Priority |
|-------------|-------------|----------|--------|--------------|
| `ilp` | `discover_ilp_petri_net` | **CRITICAL** | Mismatch breaks kernel API if not handled | **IMMEDIATE** |

**Location:** `packages/kernel/src/api.ts` line ~289-310 needs a case for `discover_ilp_petri_net`

**Current Status:** ✓ HANDLED (api.ts has case for 'ilp' → wasm call exists)

---

### 🟡 MEDIUM PRIORITY (Secondary / Should Fix) — 4 algorithms

| Registry ID | WASM Export | Inconsistency | Fix |
|-------------|-------------|---------------|-----|
| `pso` | `discover_pso_algorithm` | Naming inconsistent | Rename export to `discover_pso` OR add mapping |
| `a_star` | `discover_astar` | Missing underscore | Rename export to `discover_a_star` OR add mapping |
| `aco` | `discover_aco_algorithm` | Inconsistent suffix | Primary: `discover_ant_colony` (alias: `discover_aco_algorithm`) |
| (duplicate `aco`) | `discover_ant_colony` | Two exports for same algo | Remove one, consolidate |

**Current Status:** ⚠ WORKS but inconsistent (mapping maintained in memory, not documented)

---

### 🟢 LOW PRIORITY (Wave 1 / Utilities) — 10 algorithms

| Registry ID | WASM Export | Inconsistency |
|-------------|-------------|---------------|
| `process_skeleton` | `extract_process_skeleton` | Verb prefix mismatch |
| `simd_streaming_dfg` | `discover_dfg_simd` | Word order mismatch |
| `hierarchical_dfg` | `discover_dfg_hierarchical` | Word order mismatch |
| `streaming_log` | `streaming_log_add_trace` | Different semantics (stateful handle API) |
| `log_to_trie` | `discover_prefix_tree` | Semantic rename |
| `causal_graph` | `discover_causal_alpha` | Missing base name fallback |
| `performance_spectrum` | `discover_performance_spectrum_wasm` | Underscore/suffix mismatch |
| `batches` | `discover_batches_wasm` | `_wasm` suffix |
| `correlation_miner` | `discover_correlation` | Miner suffix dropped |
| `alignments` | `compute_alignments` | Verb prefix mismatch (compute vs discover) |
| `etconformance_precision` | `align_etconformance_precision` | Verb prefix mismatch |

**Current Status:** ⚠ HIDDEN (not explicitly mapped, found by pattern matching)

---

## 3. MISSING FROM WASM EXPORTS (Critical Gap)

These algorithms are **registered in the kernel but NOT exported from the WASM binary**. Calling them will fail at runtime.

### 🔴 HIGH PRIORITY (Core / Blocking) — 0 algorithms

*(All high-priority algorithms are either verified or aliased)*

---

### 🟡 MEDIUM PRIORITY (Secondary / Should Fix) — 0 algorithms

*(All medium-priority algorithms are either verified or aliased)*

---

### 🟢 LOW PRIORITY (Wave 1 / Nice-to-Have) — 7 algorithms

| Algorithm ID | Expected Export | Status | Workaround |
|--------------|-----------------|--------|------------|
| `smart_engine` | `discover_smart_engine` | ✗ NOT IN WASM | Use `dfg` + manual caching |
| `transition_system` | `discover_transition_system` | ✗ NOT IN WASM | Use `causal_graph` variant |
| `complexity_metrics` | `complexity_metrics` | ✗ NOT IN WASM | Manual calculation from DFG |
| `pnml_import` | `pnml_import` | ✗ NOT IN WASM | Use CLI `wpm import` or manual parsing |
| `bpmn_import` | `bpmn_import` | ✗ NOT IN WASM | Use CLI `wpm import` or manual parsing |
| `yawl_export` | `yawl_export` | ✗ NOT IN WASM | Use `pnml_import` or standard converters |
| `playout` | `playout` | ✗ NOT IN WASM | Use `monte_carlo_simulation` for simulation |

**Current Status:** ✗ UNIMPLEMENTED (calls will throw "algorithm not found")

---

## 4. DEPLOYMENT PROFILE METADATA ACCURACY

### Issue: Registry Claims vs. Cargo Feature Gates

The registry lists which algorithms are available in each deployment profile (`mobile`, `iot`, `edge`, `fog`, `browser`). But the actual compiled binary depends on **Cargo feature flags**, not the registry.

#### Example Mismatch

**Registry (line 151):** `genetic_algorithm` claims `supportedProfiles: ['quality']`  
**Registry inference:** Therefore available in `edge`, `fog`, `browser` deployments  
**Cargo (wasm4pm/Cargo.toml):** `genetic_algorithm` gated behind `feature-discovery-advanced`  
**Cargo defaults:** Mobile and IoT profiles do NOT include `feature-discovery-advanced`

**Result:** User selects mobile profile → runs `wpm run --profile mobile`, chooses genetic  
→ Algorithm not found at runtime (feature not compiled in)

### Verification Checklist

For each algorithm, verify:

1. **Registry.ts** claims it's in profile X
2. **Cargo.toml** includes the required feature flag in profile X's build target
3. **Actual WASM binary** (`wasm4pm/pkg/wasm4pm_bg.wasm`) contains the export

**Status:** ⚠ PARTIALLY CHECKED — deployment profile feature mapping is **NOT documented**

---

## 5. ERROR HANDLING CONTRACT

### Contract: Invalid Algorithm Names Must Throw

**Expected Behavior:**
```typescript
kernel.run({ algorithmId: 'invalid_algo', ... })
→ throws Error: "Algorithm 'invalid_algo' not found. Available: dfg, heuristic_miner, ..."
```

**Current Implementation:**
- Location: `packages/kernel/src/api.ts` line 289-310
- Behavior: Large `switch` statement dispatches to WASM functions
- Default case: Throws error with message

**Verification:**
```typescript
// api.ts (simplified)
switch (algorithmId) {
  case 'dfg':
  case 'heuristic_miner':
    // ... WASM call
  case 'ml_cluster':
    throw new Error(`ML algorithm '${algorithmId}' requires @wasm4pm/ml package...`);
  default:
    throw new Error(`Unknown algorithm: ${algorithmId}`);
}
```

**Status:** ✓ CONTRACT ENFORCED

### Secondary Contract: ML Algorithms Redirect

**Expected Behavior:**
```typescript
kernel.run({ algorithmId: 'ml_classify', ... })
→ throws Error: "ML algorithm 'ml_classify' requires @wasm4pm/ml package. Run 'wpm ml classify ...' instead."
```

**Current Status:** ✓ ENFORCED

---

## 6. SUMMARY CHECKLIST

### By Priority

| Category | Count | Status | Action |
|----------|-------|--------|--------|
| **Verified** | 14 | ✓ GOOD | No action needed |
| **Alias (hidden)** | 15 | ⚠ WORKS but UNDOCUMENTED | Document mapping table |
| **Missing** | 7 | ✗ NICE-TO-HAVE | Low priority; use workarounds |
| **Error Handling** | 2 contracts | ✓ ENFORCED | No action needed |
| **Deployment Profiles** | 36 algos | ⚠ CLAIMED not VERIFIED | Cross-check Cargo vs registry |

### Blockers (Must Fix)

- [ ] **None** — All high-priority algorithms are available (verified or aliased)

### Shoulds (Should Fix)

- [ ] Document alias mapping: `ilp` → `discover_ilp_petri_net` (1 entry)
- [ ] Standardize naming: `pso`, `a_star`, `aco` (3 entries)
- [ ] Verify deployment profile claims against Cargo feature flags (36 entries)

### Nice-to-Have (Can Defer)

- [ ] Implement `smart_engine`, `transition_system`, `complexity_metrics` (3 entries)
- [ ] Export `pnml_import`, `bpmn_import`, `yawl_export`, `playout` (4 entries)

---

## 7. RECOMMENDATIONS

### Priority 1: Documentation (1-2 hours)

Create a **WASM Export Mapping Table** in `packages/kernel/README.md`:

```markdown
## Algorithm Export Mapping

| Registry ID | WASM Export | Notes |
|-------------|-------------|-------|
| ilp | discover_ilp_petri_net | Petri net discovery via ILP optimization |
| pso | discover_pso_algorithm | Particle swarm optimization |
| ... | ... | ... |
```

This unblocks:
- Developers who extend the kernel
- CLI maintainers (error messages can reference both names)
- Users debugging "algorithm not found" errors

### Priority 2: Consistency (4-6 hours)

Standardize WASM export naming to follow pattern: `discover_<algorithm_id>`

**Options:**
1. **Rename WASM exports** (harder, but cleaner for users)
   - `discover_aco_algorithm` → `discover_aco`
   - `discover_astar` → `discover_a_star`
   - etc.

2. **Update registry IDs** (easier, backwards compatible)
   - `aco` → `aco_algorithm`
   - `a_star` → `astar`
   - etc.

3. **Keep alias table** (current approach, defer this)

### Priority 3: Deployment Profile Verification (2-3 hours)

Cross-check registry vs Cargo for each deployment profile:

```bash
# For each profile (mobile, iot, edge, fog, browser):
cargo build --release --features mobile
# Extract available exports from pkg/wasm4pm_bg.wasm
# Compare against registry.ts for that profile
```

---

## 8. Files Modified

None — this is a **read-only audit**. 

**Files Examined:**
- `/Users/sac/wasm4pm/packages/kernel/src/registry.ts` (36 algorithm registrations)
- `/Users/sac/wasm4pm/wasm4pm/pkg/wasm4pm_bg.js` (312 WASM exports)
- `/Users/sac/wasm4pm/packages/kernel/src/api.ts` (error handling enforcement)
- `/Users/sac/wasm4pm/wasm4pm/Cargo.toml` (feature gate definitions)

---

## 9. References

- **CLAUDE.md:** Kernel algorithms (36 registered)
- **WASM_API.md:** Complete catalog of 70+ functions across 10 modules
- **Cargo.toml:** 13 feature flags controlling algorithm inclusion
- **Deployment Profiles:** 5 tiers (mobile/iot/edge/fog/browser)

