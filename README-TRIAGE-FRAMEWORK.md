# Test Failure Triage Framework - Complete Guide

**Last Updated:** 2026-05-30  
**Status:** RESEARCH COMPLETE - Ready for Track C execution  
**Scope:** Classify ~692 test failures into 12 categories with root causes

---

## Quick Start

### TL;DR
- **Problem:** ~692 tests failing after Track A's parsePayload fix
- **Solution:** Classify failures into 12 categories, fix by priority
- **Time to classify:** 2-3 hours (sampling strategy)
- **Time to fix:** 12-23 hours total (12-23 hours across tracks C-E)
- **Expected result:** 650-700 passing tests (90% pass rate)

### Immediate Action
```bash
# 1. Read the summary (5 min)
cat TRACK-B1-SUMMARY.md

# 2. Run sampling to validate hypotheses (2-3 hours)
bash TRIAGE-SAMPLING-SCRIPT.sh 2>&1 | tee triage-results.log

# 3. Review results and prioritize fixes
cat triage-samples/sample-*-result.txt | sort | uniq -c | sort -rn
```

---

## Document Guide

### Three Core Documents

| Document | Size | Purpose | Read Time |
|----------|------|---------|-----------|
| **TRACK-B1-SUMMARY.md** | 4 KB | Executive summary, quick reference | 5-10 min |
| **TRIAGE-FRAMEWORK-TRACK-B1.md** | 12 KB | Complete framework with detailed analysis | 20-30 min |
| **TRIAGE-GREP-PATTERNS.md** | 8 KB | Quick reference for grep searches | 10-15 min (reference) |
| **TRIAGE-SAMPLING-SCRIPT.sh** | 7 KB | Automated sampling tool | 1 min (to run) |

### Reading Path

**For Project Managers:**
1. TRACK-B1-SUMMARY.md (complete overview)
2. TRIAGE-FRAMEWORK-TRACK-B1.md § Effort Estimates
3. TRIAGE-FRAMEWORK-TRACK-B1.md § Risk Assessment

**For Engineers (Track C Execution):**
1. TRACK-B1-SUMMARY.md
2. TRIAGE-FRAMEWORK-TRACK-B1.md § Root Cause Hypothesis
3. TRIAGE-FRAMEWORK-TRACK-B1.md § Sampling Strategy
4. Run TRIAGE-SAMPLING-SCRIPT.sh
5. Use TRIAGE-GREP-PATTERNS.md for deep-dives

**For Engineers (Track D Implementation):**
1. TRIAGE-FRAMEWORK-TRACK-B1.md § Triage Framework (12 categories)
2. TRIAGE-FRAMEWORK-TRACK-B1.md § Detection Patterns by Category
3. Use TRIAGE-GREP-PATTERNS.md to find affected tests
4. Implement fixes by category priority (E → A → B → D → C → F-L)

---

## The 12 Failure Categories

### High-Impact (300-400 failures, 44-58% of total)

1. **Category A: WASM Export Missing** (50-100 failures)
   - Tests calling WASM functions that don't exist
   - Detection: `grep -r "autonomic_execute_cycle\|discover_dfg"`
   - Fix effort: MEDIUM
   - Affected files: ~30-50

2. **Category B: Payload Envelope Mismatch** (50-100 failures)
   - CLI output not wrapped in `{ payload: ... }`
   - Detection: `grep -r "\.payload\."`
   - Fix effort: LOW (partially done in Track A)
   - Affected files: ~20-30

3. **Category E: Cross-Package Dependencies** (50-150 failures)
   - Unresolved imports, missing packages, circular deps
   - Detection: `pnpm list --depth 3 | grep ERR!`
   - Fix effort: MEDIUM (high cascading impact)
   - Affected files: ~15-30 (affecting 50-150 test files)

4. **Category C: CLI Command Not Registered** (30-50 failures)
   - Commands tested but not wired to CLI
   - Detection: `comm -23 tested_commands.txt registered_commands.txt`
   - Fix effort: MEDIUM
   - Affected files: ~15-20

5. **Category D: Test Setup Failure** (40-80 failures)
   - `beforeEach`/`beforeAll` timeout or crash
   - Detection: `grep -l "beforeEach.*async"`
   - Fix effort: MEDIUM
   - Affected files: ~15-25

### Medium-Impact (100-150 failures, 14-22% of total)

6. **Category F: Schema Validation** (30-50 failures)
   - Zod validation failures, receipt schema mismatches
   - Fix effort: LOW
   - Affected files: ~10-15

7. **Category G: Algorithm Registry/Features** (20-40 failures)
   - Tests expecting algorithms disabled by feature flags
   - Fix effort: LOW
   - Affected files: ~10-15

8. **Category H: OTEL Span Missing** (30-50 failures)
   - Tests expecting spans that aren't emitted
   - Fix effort: MEDIUM
   - Affected files: ~10-15

### Low-Impact (50-80 failures, 7-12% of total)

9. **Category I: Fixture File Missing** (15-30 failures)
   - Test data files not found (XES, OCEL, JSON)
   - Fix effort: LOW
   - Affected files: ~8-12

10. **Category J: Mock Configuration** (10-20 failures)
    - `vi.mock` or spy issues
    - Fix effort: LOW
    - Affected files: ~5-8

11. **Category K: Timeout/Async** (10-20 failures)
    - Promise timeouts, slow operations
    - Fix effort: LOW
    - Affected files: ~5-8

12. **Category L: Output Formatting** (10-20 failures)
    - Regex too strict, formatting changed
    - Fix effort: LOW
    - Affected files: ~5-8

---

## Sampling Strategy: 20 Test Samples

Test one file per category to validate hypotheses. Run with:
```bash
bash TRIAGE-SAMPLING-SCRIPT.sh 2>&1 | tee triage-results.log
```

**Samples:**
| # | Category | Test File | Package |
|---|----------|-----------|---------|
| 1 | A | autoprocess-e2e.test.ts | apps/wasm4pm/src |
| 2 | B | algorithms-cli.test.ts | apps/wasm4pm/src |
| 3 | C | prolog8-cli.test.ts | apps/wasm4pm/src |
| 4 | D | execute-learn-contracts.test.ts | packages/agents/src |
| 5 | E | backend-registry.test.ts | packages/kernel |
| 6 | E | feature-quality.test.ts | packages/ml/src |
| 7 | F | config-validation.test.ts | packages/config/src |
| 8 | H | otel-span-verification.test.ts | packages/observability/src |
| 9 | D | engine.test.ts | packages/engine/src |
| 10 | A | cognition-wasm.integration.test.ts | packages/cognition/src |
| 11 | F | receipt.test.ts | packages/contracts/src |
| 12 | E | marketplace-passport.test.ts | packages/swarm/src |
| 13 | G | algorithm-selector.test.ts | apps/wasm4pm/src |
| 14 | C | doctor.test.ts | apps/wasm4pm |
| 15 | I | integration.test.ts | packages/testing |
| 16 | K | batch-cli.test.ts | apps/wasm4pm/src |
| 17 | E | classifiers.test.ts | packages/ml/src |
| 18 | L | output.test.ts | apps/wasm4pm |
| 19 | J | sync.test.ts | packages/supabase/src |
| 20 | H | otel-span-coverage.test.ts | packages/agents/src |

---

## Priority Fix Order

Based on impact × effort:

1. **Category E (Dependencies)** - Fix first, unblocks 50-150 failures
   - Effort: MEDIUM | Impact: CRITICAL | Time: 2-4 hours

2. **Category A (WASM)** - Second, blocks 50-100 tests
   - Effort: MEDIUM | Impact: CRITICAL | Time: 2-4 hours

3. **Category B (Envelope)** - Third, mostly done in Track A
   - Effort: LOW | Impact: HIGH | Time: 1-2 hours

4. **Category D (Setup)** - Fourth, blocks 40-80 tests
   - Effort: MEDIUM | Impact: HIGH | Time: 2-3 hours

5. **Category C (CLI)** - Fifth, blocks 30-50 tests
   - Effort: MEDIUM | Impact: HIGH | Time: 1-2 hours

6. **Categories F-L** - Parallel, low impact
   - Effort: LOW-MEDIUM | Impact: MEDIUM-LOW | Time: 2-5 hours total

---

## Execution Timeline

| Phase | Duration | Scope | Output |
|-------|----------|-------|--------|
| **Track C: Triage** | 2-3h | Run 20 samples, categorize errors | Failure breakdown by category |
| **Track D: Top 3 Categories** | 5-8h | Implement fixes for A, E, B, D | Reduce failures to <300 |
| **Track E: Cleanup** | 2-5h | Fix categories F-L, residual | <200 failures (<10% failure rate) |
| **TOTAL** | 12-23h | Complete test failure remediation | 650-700 passing tests (90%) |

---

## How to Use This Framework

### For Track C (Triage)
1. Read TRACK-B1-SUMMARY.md
2. Run TRIAGE-SAMPLING-SCRIPT.sh
3. Analyze results in `triage-samples/` directory
4. Build breakdown by category (count failures in each)
5. Confirm top 3-4 high-impact categories

### For Track D (Fixes)
1. Use TRIAGE-GREP-PATTERNS.md to find all affected tests in category
2. Implement fix for that category
3. Run affected tests to verify fix
4. Move to next category

### For Track E (Cleanup)
1. Use grep patterns to find remaining failures
2. Group by category and fix systematically
3. Run full test suite to measure progress
4. Document learnings for future reference

---

## Key Files

```
/Users/sac/wasm4pm/
├── TRACK-B1-SUMMARY.md                    # Executive summary (START HERE)
├── TRIAGE-FRAMEWORK-TRACK-B1.md           # Complete analysis
├── TRIAGE-GREP-PATTERNS.md                # Quick reference patterns
├── TRIAGE-SAMPLING-SCRIPT.sh              # Automated sampling tool
└── README-TRIAGE-FRAMEWORK.md             # This file
```

---

## FAQ

**Q: How many failures are there?**  
A: ~692 after Track A's parsePayload fix. Estimated breakdown:
- 300-400 (44-58%): High-impact categories A, B, C, D, E
- 100-150 (14-22%): Medium-impact categories F, G, H
- 50-80 (7-12%): Low-impact categories I, J, K, L

**Q: Can we parallelize?**  
A: Partially. Category E (Dependencies) should be first. Then A, B, D, C can be done in parallel. Categories F-L are independent.

**Q: How confident are we in the estimates?**  
A: 70-80% confident based on analysis of 515 test files and patterns observed. Sampling strategy will validate in Track C.

**Q: What if sampling shows different results?**  
A: Framework is flexible. Update category estimates based on sampling results and reprioritize fixes accordingly.

**Q: How do we know when we're done?**  
A: Target 650-700 passing tests (90% pass rate). Run full test suite with `pnpm test` and count passing vs failing.

---

## Contact

For questions about:
- **Sampling:** See TRIAGE-FRAMEWORK-TRACK-B1.md § Sampling Strategy
- **Categories:** See TRIAGE-FRAMEWORK-TRACK-B1.md § Triage Framework
- **Detection:** See TRIAGE-GREP-PATTERNS.md
- **Effort:** See TRIAGE-FRAMEWORK-TRACK-B1.md § Effort Estimates

---

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-05-30 | Claude Code | Initial framework design, 20-sample strategy |

---

**Status:** ✅ Track B-1 COMPLETE - Ready for Track C execution

**Next:** Run sampling script, validate hypotheses, begin fixing top-priority categories.
