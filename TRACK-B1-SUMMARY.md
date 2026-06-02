# Track B-1: Planning Summary

**Goal:** Design a triage framework to classify the remaining ~692 test failures (beyond Track A's parsePayload fix).

**Status:** ✅ COMPLETE - Three comprehensive documents created

---

## Deliverables

### 1. TRIAGE-FRAMEWORK-TRACK-B1.md (Primary Artifact)

**Purpose:** Complete classification system for all remaining failures

**Contents:**
- **12 failure categories** with severity, detection patterns, affected tests
- **Root cause hypotheses** for each category (CRITICAL, HIGH, MEDIUM, LOW)
- **Detection patterns** (grep commands to find affected tests)
- **Sampling strategy:** 20 representative test samples
- **Effort estimates:** 12-23 hours to reach 90% pass rate
- **Impact matrix:** Estimated 395-710 failures across categories

**Key Categories:**
| # | Category | Severity | Est. Count | Effort |
|---|----------|----------|-----------|--------|
| A | WASM Export Missing | CRITICAL | 50-100 | MEDIUM |
| B | Payload Envelope | HIGH | 50-100 | LOW |
| C | CLI Command Wiring | HIGH | 30-50 | MEDIUM |
| D | Test Setup Failure | HIGH | 40-80 | MEDIUM |
| E | Cross-Package Dependencies | CRITICAL | 50-150 | MEDIUM |
| F | Schema Validation | MEDIUM | 30-50 | LOW |
| G | Algorithm Registry/Flags | MEDIUM | 20-40 | LOW |
| H | OTEL Span Missing | MEDIUM | 30-50 | MEDIUM |
| I | Fixture File Missing | LOW | 15-30 | LOW |
| J | Mock Configuration | LOW | 10-20 | LOW |
| K | Timeout/Async | LOW | 10-20 | LOW |
| L | Output Formatting | LOW | 10-20 | LOW |

---

### 2. TRIAGE-SAMPLING-SCRIPT.sh (Execution Tool)

**Purpose:** Automated script to run 20 representative test samples and categorize failures

**Features:**
- Runs one test per category across different packages
- Analyzes error messages to auto-categorize failures
- Saves detailed logs for each sample
- Generates summary report with failure breakdown
- Shows estimated impact extrapolated to ~1200 tests

**Usage:**
```bash
bash TRIAGE-SAMPLING-SCRIPT.sh 2>&1 | tee triage-results.log
```

**Output:**
- 20 detailed test logs in `triage-samples/`
- Category counts from samples
- Extrapolated impact estimate for full test suite
- Next steps recommendations

---

### 3. TRIAGE-GREP-PATTERNS.md (Quick Reference)

**Purpose:** Rapid grep patterns to identify failures without running tests

**Contents:**
- Grep command for each category (full + quick versions)
- Examples of what to search for
- Quick scan patterns (faster, fewer results)
- Full scan patterns (comprehensive, with context)
- Summary script for quick overview

**Usage:**
```bash
# Quick overview of all categories
bash <(cat TRIAGE-GREP-PATTERNS.md | grep "^# Show\|^  " | head -30)

# Deep-dive on single category
grep -A 20 "Category A: WASM" TRIAGE-GREP-PATTERNS.md
```

---

## Key Hypotheses

### High-Impact (Critical/High Severity)

**A. WASM Binary Missing/Export** (CRITICAL)
- 50-100 failures
- Tests call WASM functions that don't exist or wrong feature flags
- Detection: `grep -r "autonomic_execute_cycle\|discover_dfg"`

**B. Payload Envelope** (HIGH, partially fixed in Track A)
- 50-100 failures
- CLI JSON output not wrapped in `{ payload: ... }`
- Detection: `grep -r "\.payload\." apps/wasm4pm/src/__tests__`

**E. Cross-Package Dependencies** (CRITICAL, cascading)
- 50-150 failures
- Unresolved imports, missing packages
- Detection: `pnpm list --depth 3 | grep ERR!`

**C. CLI Command Wiring** (HIGH)
- 30-50 failures
- Commands tested but not registered in CLI
- Detection: `comm -23 tested_commands.txt registered_commands.txt`

**D. Test Setup Failure** (HIGH)
- 40-80 failures
- `beforeEach`/`beforeAll` timeout or crash
- Detection: `grep -l "beforeEach.*async" *.test.ts`

### Medium-Impact (Estimated 100-150 failures)

- **F. Schema Validation** (Zod, receipt contracts)
- **G. Algorithm Registry** (Feature flags disable algorithms)
- **H. OTEL Spans** (Expected spans not emitted)

### Low-Impact (Estimated 50-80 failures)

- **I-L:** Fixture files, mocking, timeouts, output formatting

---

## Sampling Strategy

**20 representative samples** to validate hypotheses:

1. autoprocess-e2e → WASM export missing
2. algorithms-cli → Payload envelope
3. prolog8-cli → CLI command wiring
4. execute-learn-contracts → Test setup failure
5. backend-registry → Cross-package dependency (WASM)
6. feature-quality → Module import resolution
7. config-validation → Zod schema validation
8. otel-span-verification → OTEL span coverage
9. engine.test → Engine bootstrap timeout
10. cognition-wasm → WASM initialization
11. receipt.test → Receipt schema
12. marketplace-passport → Swarm dependencies
13. algorithm-selector → Registry/features
14. doctor.test → CLI command wiring
15. integration.test → Fixture loading
16. batch-cli → Async/timeout
17. classifiers.test → ML dependencies
18. output.test → Output formatting
19. sync.test → Mock configuration
20. otel-span-coverage (agents) → OTEL coverage

**Expected outcome:** Identify which 3-4 categories account for most failures

---

## Effort Breakdown

### Track C Execution Plan

**Phase 1: Triage (2-3 hours)**
- Run 20 samples via script
- Categorize errors from logs
- Build failure breakdown by category
- **Blocker:** None - fully parallelizable

**Phase 2: Root Cause Analysis (3-5 hours)**
- Deep-dive top 3 categories
- Find concrete fix list
- Build fix ordering strategy
- **Blocker:** Understanding of WASM, CLI architecture

**Phase 3: Implement Fixes (5-10 hours)**
- Fix top-impact categories (A, E, B, D, C)
- Test incrementally
- Reduce failure count from 692 to <300
- **Blocker:** May require refactoring

**Phase 4: Systematic Cleanup (2-5 hours)**
- Fix remaining categories (F-L)
- Final pass on edge cases
- Target: <200 failures (<10% failure rate)

**Total Effort:** 12-23 hours for ~90% pass rate

---

## Next Steps for Track C

1. **Execute sampling script**
   ```bash
   bash TRIAGE-SAMPLING-SCRIPT.sh 2>&1 | tee triage-results.log
   ```

2. **Analyze results**
   - Count failures by category
   - Identify top 3 contributors
   - Validate hypotheses

3. **Prioritize fixes** (estimated impact × effort)
   - **CRITICAL:** A, E (both HIGH impact, MEDIUM effort)
   - **HIGH:** B, C, D (HIGH impact, MEDIUM effort each)
   - **MEDIUM:** F, G, H (MEDIUM impact, LOW-MEDIUM effort)

4. **Implement in order**
   - E (Dependencies) first - unblocks other categories
   - A (WASM) second - affects 50-100 tests
   - B (Envelope) third - mostly done in Track A
   - D (Setup) and C (CLI) in parallel

5. **Document as you go**
   - Keep log of failures fixed per category
   - Track before/after pass counts
   - Update triage framework with actual results

---

## Risk Assessment

**Green Flags:**
- Clear categorization system (12 categories cover estimated 395-710 failures)
- Sampling strategy validates hypotheses before full fixes
- Low-impact categories (<100 failures) can be done in parallel

**Red Flags:**
- Category E (Dependencies) could cascade to 20+ dependent test files
- WASM build issues might require configuration changes (not just code fixes)
- CLI wiring might have multiple missing commands (need systematic audit)

**Mitigation:**
- Run sampling first to confirm hypotheses
- Fix Category E immediately after triage (unblocks others)
- Use grep patterns to identify ALL issues in a category before fixing

---

## Success Criteria

- ✅ **Track B-1 Complete:** Framework designed, sampling strategy ready
- ⏳ **Track C Ready:** Execute sampling, categorize 692 failures
- ⏳ **Track D Ready:** Implement fixes for top 3-4 categories
- ⏳ **Track E Ready:** Systematic cleanup of remaining failures

**Target:** 650-700 passing tests (90% pass rate) by end of Track D

---

## Files Created

1. **TRIAGE-FRAMEWORK-TRACK-B1.md** (12 KB)
   - Complete classification system
   - Root cause analysis
   - Detailed effort estimates

2. **TRIAGE-SAMPLING-SCRIPT.sh** (7 KB)
   - Automated sampling tool
   - Error categorization logic
   - Summary report generation

3. **TRIAGE-GREP-PATTERNS.md** (8 KB)
   - Quick reference patterns
   - Full + quick scan versions
   - Category-specific searches

---

## How to Use These Documents

### For Track C Kickoff
1. Read **TRIAGE-FRAMEWORK-TRACK-B1.md** (Section: Sampling Strategy)
2. Run **TRIAGE-SAMPLING-SCRIPT.sh**
3. Refer to **TRIAGE-GREP-PATTERNS.md** for quick category lookups

### For Deep Analysis
1. Use grep patterns to find affected test files
2. Run individual samples for detailed logs
3. Cross-reference with root cause hypotheses

### For Implementation (Track D)
1. Use effort estimates to prioritize fixes
2. Follow category priority (E → A → B → D → C → F-L)
3. Update triage framework with actual results as you go

---

## Contact / Questions

For questions about:
- **Sampling strategy:** See TRIAGE-FRAMEWORK-TRACK-B1.md § Sampling Strategy
- **Root causes:** See TRIAGE-FRAMEWORK-TRACK-B1.md § Root Cause Hypothesis
- **Detection patterns:** See TRIAGE-GREP-PATTERNS.md
- **Effort estimates:** See TRIAGE-FRAMEWORK-TRACK-B1.md § Effort Estimates

---

**Status:** Track B-1 COMPLETE ✅
**Next:** Execute Track C (Run sampling, categorize failures)
**Timeline:** 2-3 hours for Track C triage, 12-23 hours for Tracks C-E total
