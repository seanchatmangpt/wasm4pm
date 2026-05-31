# Track B-1: Test Failure Triage Framework

**Objective:** Design a classification system to triage the remaining ~692 test failures beyond the parsePayload envelope issue (Track A).

**Status:** RESEARCH COMPLETE - Framework designed, sampling strategy proposed, effort estimates provided

---

## Executive Summary

Based on analysis of 515 test files across packages and apps, an estimated **12-18 failure categories** are likely responsible for the ~692 failures. The failures fall into six major domains:

1. **WASM/Module Loading** (10-15% of failures)
2. **Import & Dependency Resolution** (15-20% of failures)
3. **CLI Wiring & Command Registration** (10-15% of failures)
4. **Schema Validation & Contracts** (15-20% of failures)
5. **Test Environment & Setup** (10-15% of failures)
6. **Algorithm Registry & Feature Flags** (10-15% of failures)
7. **OTEL/Observable Behavior** (5-10% of failures)
8. **Cross-Package Coupling** (5-10% of failures)

---

## Root Cause Hypothesis

### High-Impact Categories (Most Likely)

#### A. WASM Binary Missing or Incorrect Export

**Hypothesis:** Tests expect WASM exports that don't exist or are disabled by feature flags.

**Evidence:**
- File: `packages/kernel/vitest.config.ts:14-16` explicitly excludes tests requiring `wasm4pm` WASM binary
- Comment: "These load wasm4pm which requires the nodejs WASM binary"
- Pattern: `wasmMissing(r)` helper in autoprocess-e2e.test.ts checks for `autonomic_execute_cycle is not a function`
- Risk: Any test calling WASM functions fails if `wasm4pm/pkg/wasm4pm_bg.wasm` not built

**Affected Tests:** ~50-100 tests
- `packages/kernel/__tests__/backend-registry.test.ts` (excluded)
- `packages/kernel/__tests__/algorithms-error-handling.test.ts` (excluded)
- `packages/agents/src/__tests__/execute-learn-contracts.test.ts`
- `apps/wasm4pm/src/__tests__/autoprocess-*.test.ts` (all 8)
- Any test using `runCli(['algorithms', ...])` with WASM-dependent features

**Detection Pattern:**
```bash
grep -l "from 'wasm4pm'" packages/*/src/__tests__/*.test.ts
grep -l "autonomic_execute_cycle\|discover_dfg\|load_eventlog" apps/wasm4pm/src/__tests__/*.test.ts
```

**Severity:** CRITICAL - blocks ~100+ tests

---

#### B. Payload Envelope Mismatch (Already Known)

**Hypothesis:** CLI output not wrapped in `{ payload: ... }` or missing `status` field.

**Evidence:** Track A analyzed this in depth. Additional cases beyond initial fix:
- `wpm algorithms --format json` returns array instead of envelope
- `wpm doctor --format json` returns object instead of envelope
- Commands with `--format human` work but JSON format untested
- Multiple commands may not emit `status` field in JSON output

**Affected Tests:** ~50-100 tests
- `apps/wasm4pm/src/__tests__/algorithms-cli.test.ts` (lines 69-85)
- `apps/wasm4pm/src/__tests__/doctor-*.test.ts`
- Any CLI test with `--format json`

**Detection Pattern:**
```bash
grep -n "\.payload\|JSON\.parse(result\.stdout)" apps/wasm4pm/src/__tests__/*.test.ts | grep -v "^[^:]*:.*\.payload\." | head -20
```

**Severity:** HIGH - blocks ~50-100 tests

---

#### C. Missing or Misnamed CLI Command Exports

**Hypothesis:** Commands defined in `packages/` not registered in CLI, or registered with wrong name.

**Evidence:**
- 35+ CLI commands declared in `.claude.md`
- CLI registration happens in `apps/wasm4pm/src/cli.ts`
- Risk: Command implemented but not wired to CLI
- Pattern: Test calls `wpm <command>`, CLI doesn't recognize it

**Affected Tests:** ~30-50 tests
- `apps/wasm4pm/src/__tests__/algorithms-cli.test.ts` (commands must be registered)
- `apps/wasm4pm/src/__tests__/prolog8-*.test.ts` (prolog8 commands)
- `apps/wasm4pm/src/__tests__/swarm-*.test.ts` (swarm commands)
- `apps/wasm4pm/src/__tests__/agent-cli.test.ts` (agent commands)

**Detection Pattern:**
```bash
# Find all test command calls
grep -rh "runCli\(\['" apps/wasm4pm/src/__tests__/*.test.ts | sed "s/.*\['\([^']*\).*/\1/" | sort -u > /tmp/tested_commands.txt

# Find registered commands
grep -o "'[a-z-]*':" apps/wasm4pm/src/cli.ts | sed "s/'//g" | sed "s/://g" | sort -u > /tmp/registered_commands.txt

# Diff
comm -23 <(sort /tmp/tested_commands.txt) <(sort /tmp/registered_commands.txt)
```

**Severity:** HIGH - blocks ~30-50 tests

---

#### D. Test Environment Setup Issues (WasmLoader, Engine Init)

**Hypothesis:** Tests fail during setup phase (beforeEach/beforeAll) before test code runs.

**Evidence:**
- Pattern in files: `beforeEach(async () => { env = await createCliTestEnv() })`
- Risk: WasmLoader not initialized, Engine bootstrap timeout, temp directory creation fails
- FM-5 risk: Tests pass beforeEach but skip assertions (vacuous test)

**Affected Tests:** ~40-80 tests (any test with async setup)
- `packages/engine/src/engine.test.ts` (engine lifecycle)
- `packages/kernel/__tests__/eventlog-ir-converter.test.ts` (WASM setup)
- `apps/wasm4pm/src/__tests__/autoprocess-*.test.ts` (temp env creation)

**Detection Pattern:**
```bash
grep -l "beforeEach\|beforeAll" packages/*/src/__tests__/*.test.ts apps/wasm4pm/src/__tests__/*.test.ts
```

**Severity:** MEDIUM - blocks ~40-80 tests, but all fail together in affected files

---

#### E. Cross-Package Dependency Issues

**Hypothesis:** Tests import from sibling packages that aren't built or have unresolved exports.

**Evidence:**
- 11 packages with interdependencies
- Packages depend on `wasm4pm` WASM binary
- Pattern: `@wasm4pm/kernel` depends on `@wasm4pm/contracts`, `@wasm4pm/core`, `@wasm4pm/ml`
- Risk: One package's test fails, cascades to dependent packages

**Affected Tests:** ~50-150 tests (cascading failure)
- `packages/ml/src/__tests__/*.test.ts` (depends on `packages/kernel`)
- `packages/agents/src/__tests__/*.test.ts` (depends on `@wasm4pm/engine`)
- `apps/wasm4pm/src/__tests__/*.test.ts` (depends on all packages)

**Detection Pattern:**
```bash
# Find circular or broken dependencies
pnpm list --depth 3 2>&1 | grep -E "ERR!|unmet peer|not installed"
```

**Severity:** CRITICAL - single broken package can cascade to 20+ dependent tests

---

### Medium-Impact Categories

#### F. Schema Validation (Zod, OTEL, Receipt)

**Hypothesis:** Data structures don't match schema definitions; Zod validation fails.

**Evidence:**
- Zod schemas in `packages/config/src/schema.ts`
- Receipt contracts in `packages/contracts/src/receipt.ts`
- OTEL span contracts in `packages/observability/src/span-schema.ts`
- Risk: Command output doesn't match declared schema

**Affected Tests:** ~30-50 tests
- `packages/config/src/__tests__/config-validation.test.ts`
- `packages/contracts/src/__tests__/*.test.ts`
- Tests asserting on receipt/output structure

**Detection Pattern:**
```bash
grep -r "parseConfig\|validateReceipt\|spoof.*Schema" packages/*/src/__tests__/*.test.ts
```

**Severity:** MEDIUM - ~30-50 tests fail with "Schema validation error"

---

#### G. Algorithm Registry & Feature Flag Gating

**Hypothesis:** Tests expect algorithms that are disabled by feature flags or missing from deployment profile.

**Evidence:**
- 38 algorithms registered in `packages/kernel/src/registry.ts`
- Feature flags in `Cargo.toml` (mobile/iot/edge/fog/browser profiles)
- Risk: Test calls `registry.get('genetic_algorithm')` but it's not in mobile profile

**Affected Tests:** ~20-40 tests
- `apps/wasm4pm/src/__tests__/algorithm-selector.test.ts`
- `apps/wasm4pm/src/__tests__/algorithm-coverage-comprehensive.test.ts`
- Profile-specific tests

**Detection Pattern:**
```bash
grep -r "registry\.get\|getForDeploymentProfile" apps/wasm4pm/src/__tests__/*.test.ts | grep -v "expect.*undefined"
```

**Severity:** MEDIUM - ~20-40 tests, but mostly in specialized test suites

---

#### H. OTEL Instrumentation Span Emission

**Hypothesis:** Tests expect OTEL spans that aren't being emitted, or spans have wrong attributes.

**Evidence:**
- chicago-tdd.md requires "100% OTEL coverage"
- Tests assert span presence: `expect(spans.length).toBeGreaterThan(0)`
- Risk: Code runs but doesn't emit spans; test passes assertion but proves nothing (FM-5)

**Affected Tests:** ~30-50 tests
- `packages/observability/src/__tests__/otel-span-*.test.ts`
- `apps/wasm4pm/src/__tests__/otel-span-*.test.ts`
- Tests using `OtelCapture` harness

**Detection Pattern:**
```bash
grep -r "OtelCapture\|getAllSpans\|getSpans" packages/*/src/__tests__/*.test.ts
```

**Severity:** MEDIUM - ~30-50 tests, primarily observability-focused

---

### Low-Impact Categories

#### I. Fixture File Missing (XES, OCEL, JSON test data)

**Hypothesis:** Test fixture files referenced but not present or symlink broken.

**Evidence:**
- Tests load from `fixtures/`, `test-data/`, `benches/`
- Risk: File path incorrect or symlink broken

**Affected Tests:** ~15-30 tests
- Discovery/conformance tests loading real XES files
- ML tests loading event logs

**Severity:** LOW - easy to fix, ~15-30 tests

---

#### J. Mock/Spy Configuration (vi.mock, vi.spy)

**Hypothesis:** Test setup issues with vitest mocking (FM-5 violations, improper mocks).

**Evidence:**
- Memory notes warn of FM-5 cognition mock violations
- Pattern: `vi.mock('../init.js')` needs careful management

**Affected Tests:** ~10-20 tests
- Cognition tests with mocked WASM init
- Tests mocking file system

**Severity:** LOW - ~10-20 tests, mostly in cognition package

---

#### K. Timeout/Async Issues

**Hypothesis:** Tests timeout waiting for promises, or async/await not properly handled.

**Evidence:**
- Tests with long timeouts: 45_000ms in autoprocess-e2e.test.ts
- WASM-dependent tests that need compilation time

**Affected Tests:** ~10-20 tests (slow tests)
- E2E tests
- Integration tests with real WASM

**Severity:** LOW - ~10-20 tests, not structural failures

---

#### L. Output Formatting Issues (Human vs JSON, Colors, Spacing)

**Hypothesis:** Test assertions on formatted output are too strict or formatting changed.

**Evidence:**
- Tests asserting on specific text output: `expect(result.stdout).toMatch(/dfg|alpha/i)`
- Risk: Color codes, spacing changes break regex

**Affected Tests:** ~10-20 tests
- CLI output formatting tests
- Doctor command tests

**Severity:** LOW - ~10-20 tests, easy to debug with visual inspection

---

## Triage Framework: 12 Categories

| Category | Count | Severity | Detection | Example Test |
|----------|-------|----------|-----------|--------------|
| **A. WASM Missing/Export** | 50-100 | CRITICAL | grep autonomic_execute_cycle | autoprocess-e2e |
| **B. Payload Envelope** | 50-100 | HIGH | grep \.payload (already known) | algorithms-cli |
| **C. CLI Command Not Registered** | 30-50 | HIGH | comm registered vs tested | prolog8-cli |
| **D. Test Setup Failure** | 40-80 | HIGH | grep beforeEach fails | engine.test |
| **E. Cross-Package Dependency** | 50-150 | CRITICAL | pnpm list --depth 3 | agents tests |
| **F. Schema Validation** | 30-50 | MEDIUM | grep validateReceipt | config-validation |
| **G. Algorithm Registry/Features** | 20-40 | MEDIUM | grep registry.get | algorithm-selector |
| **H. OTEL Span Missing** | 30-50 | MEDIUM | grep OtelCapture | otel-span-verification |
| **I. Fixture File Missing** | 15-30 | LOW | test-data/ not found | discovery-integration |
| **J. Mock Configuration** | 10-20 | LOW | vi.mock issues | cognition-integration |
| **K. Timeout/Async** | 10-20 | LOW | Promise.race timeout | e2e tests |
| **L. Output Formatting** | 10-20 | LOW | regex too strict | doctor.test |
| **TOTAL ESTIMATED** | **395-710** | — | — | — |

---

## Sampling Strategy: 20 Representative Failures

To identify which categories are actually responsible for failures, test **20 samples** across different test files:

### Sampling Plan (One per package/domain)

1. **apps/wasm4pm/__tests__/algorithms-cli.test.ts:65** → Check if payload envelope works for JSON output
2. **apps/wasm4pm/src/__tests__/autoprocess-e2e.test.ts** → Check if WASM exports exist (`autonomic_execute_cycle`)
3. **apps/wasm4pm/src/__tests__/prolog8-cli.test.ts:50** → Check if `wpm prolog8` command is registered
4. **packages/agents/src/__tests__/execute-learn-contracts.test.ts** → Check if test setup/beforeEach fails
5. **packages/kernel/__tests__/backend-registry.test.ts** → Check if WASM binary required (currently excluded)
6. **packages/ml/src/__tests__/feature-quality.test.ts** → Check if module imports resolve
7. **packages/config/src/__tests__/config-validation.test.ts** → Check for Zod schema failures
8. **packages/observability/src/__tests__/otel-span-verification.test.ts** → Check if spans emit
9. **packages/engine/src/engine.test.ts** → Check if engine bootstrap times out
10. **packages/cognition/src/__tests__/cognition-wasm.integration.test.ts** → Check WASM init/mocking
11. **packages/contracts/src/__tests__/receipt.test.ts** → Check receipt schema validation
12. **packages/swarm/src/__tests__/marketplace-passport.test.ts** → Check cross-package coupling
13. **apps/wasm4pm/src/__tests__/algorithm-selector.test.ts** → Check registry.get() failures
14. **apps/wasm4pm/src/__tests__/doctor-*.test.ts** → Check CLI command wiring
15. **packages/testing/__tests__/integration.test.ts** → Check fixture loading (e.g., test.xes files)
16. **apps/wasm4pm/src/__tests__/batch-cli.test.ts** → Check async/timeout issues
17. **packages/ml/src/__tests__/classifiers.test.ts** → Check dependency resolution
18. **apps/wasm4pm/src/__tests__/output.test.ts** → Check formatting (human vs JSON)
19. **packages/supabase/src/__tests__/sync.test.ts** → Check external API mocking
20. **packages/agents/src/__tests__/otel-span-coverage.test.ts** → Check OTEL observability

### Execution Plan

For each sample, run:
```bash
cd <package-dir> && npm test -- <test-file>.test.ts 2>&1 | tee sample-N.log
```

Then analyze error message:
- **Error contains "is not a function"** → Category A (WASM Missing)
- **Error contains "\.payload"** → Category B (Envelope)
- **Error contains "command not found"** → Category C (CLI Wiring)
- **Error in beforeEach/beforeAll** → Category D (Setup)
- **Error contains "not installed\|unmet peer"** → Category E (Dependency)
- **Error contains "validation failed\|Zod"** → Category F (Schema)
- **Error contains "undefined algorithm"** → Category G (Registry)
- **Error contains "span not found"** → Category H (OTEL)
- **Error contains "ENOENT"** → Category I (Fixture)
- **Error contains "not mocked"** → Category J (Mock)
- **Error contains "timeout"** → Category K (Async)
- **Error contains "regex doesn't match"** → Category L (Format)

---

## Detection Patterns by Category

### Grep Patterns for Rapid Scanning

```bash
# A. WASM Missing
find . -name "*.test.ts" -exec grep -l "autonomic_execute_cycle\|discover_dfg\|load_eventlog" {} \;

# B. Payload Envelope
grep -r "JSON\.parse.*stdout\|\.payload" apps/wasm4pm/src/__tests__/*.test.ts | grep -v "expect.*\.payload\."

# C. CLI Command Wiring
grep -rh "runCli\(\['" apps/wasm4pm/src/__tests__/*.test.ts | sed "s/.*\['\([^']*\).*/\1/" | sort -u > /tmp/tested.txt
grep -o "'[a-z-]*': " apps/wasm4pm/src/cli.ts | sed "s/'//g" | sed "s/: //g" | sort -u > /tmp/registered.txt
comm -23 <(sort /tmp/tested.txt) <(sort /tmp/registered.txt)

# D. Setup Failures
grep -l "beforeEach\|beforeAll" packages/*/src/__tests__/*.test.ts

# E. Dependency Issues
pnpm list --depth 3 2>&1 | grep -E "ERR!|unmet peer|not installed"

# F. Schema Validation
grep -r "parseConfig\|validateReceipt\|ZodError" packages/*/src/__tests__/*.test.ts

# G. Algorithm Registry
grep -r "registry\.get.*undefined\|getForDeploymentProfile" apps/wasm4pm/src/__tests__/*.test.ts

# H. OTEL Spans
grep -r "OtelCapture\|getAllSpans\|expect.*spans\." packages/observability/src/__tests__/*.test.ts

# I. Fixture Files
grep -r "fixtures/\|test-data/\|benches/" packages/*/src/__tests__/*.test.ts | head -20

# J. Mocking
grep -r "vi\.mock\|vi\.spy" packages/*/src/__tests__/*.test.ts

# K. Timeout
grep -r "timeout\|maxBuffer\|45_000" packages/*/src/__tests__/*.test.ts

# L. Output Formatting
grep -r "expect.*stdout.*toMatch\|colorize\|stripAnsi" packages/*/src/__tests__/*.test.ts
```

---

## Effort Estimates for Track C

### Phase 1: Triage (Identify which categories apply)
- **Time:** 2-3 hours
- **Scope:** Run 20 samples, categorize errors
- **Output:** Breakdown of ~692 failures by category (e.g., "200 Category A, 150 Category B, ...")
- **Blocker:** None - can run in parallel with other work

### Phase 2: Root Cause Analysis (Top 3 categories)
- **Time:** 3-5 hours
- **Scope:** Deep-dive into highest-impact categories (A, B, E, D in order)
- **Output:** Concrete fix list for top 300-400 failures
- **Blocker:** Requires understanding of WASM build, CLI architecture

### Phase 3: Implement Fixes (By category)
- **Time:** 5-10 hours (depends on category complexity)
- **Scope:** Fix WASM exports, CLI wiring, envelope wrapping, setup issues
- **Output:** Reduced failure count to <200 (estimate)
- **Blocker:** Some categories may require refactoring

### Phase 4: Residual Failures (Systematic cleanup)
- **Time:** 2-5 hours
- **Scope:** Fix remaining <200 failures in categories F-L
- **Output:** ~90%+ of tests passing (estimate 650-700 total)

**Total Effort:** **12-23 hours** to reach ~700 passing tests (90% success rate)

---

## Recommendations for Track C Kickoff

1. **Execute sampling strategy immediately** (2-3 hours)
   - Run 20 samples in parallel
   - Categorize by error message
   - Identify which categories actually cause failures

2. **Prioritize by impact × effort**
   - Category A (WASM): HIGH impact, MEDIUM effort
   - Category B (Envelope): HIGH impact, LOW effort (already partially done in Track A)
   - Category E (Dependencies): CRITICAL impact, MEDIUM effort
   - Category D (Setup): HIGH impact, MEDIUM effort

3. **Parallelize where possible**
   - Category A (WASM) and Category C (CLI) can be fixed independently
   - Category E (Dependencies) blocks other categories; fix first
   - Categories F-L are independent; can fix in parallel

4. **Document as you go**
   - Keep failure log by category
   - Track before/after pass counts
   - Report weekly progress

---

## Summary

**Expected failure breakdown (estimate):**
- Category A (WASM): 50-100 failures
- Category B (Envelope): 50-100 failures (partially fixed in Track A)
- Category E (Dependencies): 50-150 failures (highest cascading risk)
- Category D (Setup): 40-80 failures
- Category C (CLI Wiring): 30-50 failures
- Categories F-L: ~100-150 failures combined

**Recommended approach:** Implement in order A → E → B → D → C → F-L, with sampling strategy to validate assumptions upfront.

**Success metric:** Reach 650-700 passing tests (90%) by end of Track C.
