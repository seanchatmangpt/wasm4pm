# Track B-1: Rapid Triage Grep Patterns

Quick reference for identifying failure categories without running tests.

---

## Category A: WASM Export Missing

**What to search for:** Tests expecting WASM functions that don't exist or aren't exported.

```bash
# Files calling WASM functions
grep -r "autonomic_execute_cycle\|discover_dfg\|load_eventlog\|compute_hazard" \
  packages/*/src/__tests__/*.test.ts \
  apps/wasm4pm/src/__tests__/*.test.ts \
  --include="*.test.ts" \
  | head -20

# Files checking for WASM availability
grep -r "wasmMissing\|WASM.*not.*function\|wasm4pm_bg.wasm" \
  . --include="*.test.ts" | head -10

# Count affected test files
find . -name "*.test.ts" -exec grep -l "from 'wasm4pm'" {} \; | wc -l
```

**Quick scan:**
```bash
# Show affected test files
find . -name "*.test.ts" -exec grep -l "from 'wasm4pm'" {} \; | sort
```

**Estimated coverage:** 50-100 failures across ~30-50 test files

---

## Category B: Payload Envelope Mismatch

**What to search for:** Tests expecting `{ payload: ... }` wrapper that aren't getting it.

```bash
# Files checking for payload envelope
grep -rn "\.payload\." \
  apps/wasm4pm/src/__tests__/*.test.ts \
  | grep -v "// " | head -30

# Files doing JSON.parse on CLI output but not checking for payload
grep -rn "JSON\.parse.*stdout" \
  apps/wasm4pm/src/__tests__/*.test.ts \
  | head -20

# Files with envelope pattern checking
grep -rn "payload\|status.*success\|status.*error" \
  apps/wasm4pm/src/__tests__/*cli*.test.ts \
  | head -30

# Count tests checking for payload
grep -rc "\.payload\|\.status" apps/wasm4pm/src/__tests__/*.test.ts | grep -v ":0" | wc -l
```

**Quick scan:**
```bash
# Show which CLI tests check for payload
grep -l "\.payload" apps/wasm4pm/src/__tests__/*cli*.test.ts apps/wasm4pm/src/__tests__/doctor*.test.ts
```

**Estimated coverage:** 50-100 failures across ~20-30 test files

---

## Category C: CLI Command Not Registered

**What to search for:** Tests calling commands that aren't wired to the CLI.

```bash
# Extract all tested commands
find apps/wasm4pm/src/__tests__ -name "*.test.ts" \
  -exec grep -oh "runCli\(\['\([^']*\)" {} \; \
  | sed "s/runCli\(\['//g" \
  | sort -u > /tmp/tested_commands.txt

# Extract all registered commands
grep -oh "'[a-z-]*':" apps/wasm4pm/src/cli.ts \
  | sed "s/'//g" | sed "s/:$//g" \
  | sort -u > /tmp/registered_commands.txt

# Show commands tested but not registered
comm -23 /tmp/tested_commands.txt /tmp/registered_commands.txt

# Count unregistered commands
comm -23 /tmp/tested_commands.txt /tmp/registered_commands.txt | wc -l
```

**Quick scan:**
```bash
# Show first few tested but not registered
comm -23 \
  <(find apps/wasm4pm/src/__tests__ -name "*.test.ts" \
     -exec grep -oh "runCli\(\['\([^']*\)" {} \; \
     | sed "s/runCli\(\['//g" | sort -u) \
  <(grep -oh "'[a-z-]*':" apps/wasm4pm/src/cli.ts \
     | sed "s/'//g" | sed "s/:$//g" | sort -u)
```

**Estimated coverage:** 30-50 failures across ~15-20 test files

---

## Category D: Test Setup Failure (beforeEach/beforeAll)

**What to search for:** Tests with async setup that might timeout or fail.

```bash
# Files with before hooks
grep -r "beforeEach\|beforeAll" \
  packages/*/src/__tests__/*.test.ts \
  apps/wasm4pm/src/__tests__/*.test.ts \
  --include="*.test.ts" \
  | head -30

# Files creating test environments
grep -r "createTestEnv\|createCliTestEnv\|WasmLoader\|Engine\.bootstrap" \
  packages/*/src/__tests__/*.test.ts \
  apps/wasm4pm/src/__tests__/*.test.ts \
  --include="*.test.ts" \
  | head -30

# Count files with before hooks
find . -name "*.test.ts" -exec grep -l "beforeEach\|beforeAll" {} \; | wc -l
```

**Quick scan:**
```bash
# Show files with complex setup
grep -l "beforeEach.*async\|beforeAll.*async" \
  packages/*/src/__tests__/*.test.ts \
  apps/wasm4pm/src/__tests__/*.test.ts
```

**Estimated coverage:** 40-80 failures across ~15-25 test files

---

## Category E: Cross-Package Dependency Issues

**What to search for:** Broken dependencies, missing packages, circular imports.

```bash
# Check for unmet peer dependencies
pnpm list --depth 3 2>&1 | grep -E "ERR!|unmet peer|not installed"

# Show dependency graph
pnpm list --depth 1 2>&1 | head -50

# Find files importing from @wasm4pm packages
grep -r "from '@wasm4pm" \
  packages/*/src/__tests__/*.test.ts \
  apps/wasm4pm/src/__tests__/*.test.ts \
  | head -30

# Find files importing wasm4pm WASM
grep -r "from 'wasm4pm'" \
  packages/*/src/__tests__/*.test.ts \
  apps/wasm4pm/src/__tests__/*.test.ts \
  | head -30

# Count packages with dependency issues
pnpm list 2>&1 | grep -c "ERR!"
```

**Quick scan:**
```bash
# Show dependency issues
pnpm list 2>&1 | grep "ERR!" | head -20

# Show which packages import wasm4pm
grep -l "from 'wasm4pm'" packages/*/src/__tests__/*.test.ts apps/wasm4pm/src/__tests__/*.test.ts
```

**Estimated coverage:** 50-150 failures (cascading across dependent packages)

---

## Category F: Schema Validation Issues

**What to search for:** Zod validation failures, receipt schema mismatches.

```bash
# Files using config validation
grep -r "parseConfig\|validateReceipt\|ZodError\|schema\.parse" \
  packages/*/src/__tests__/*.test.ts \
  apps/wasm4pm/src/__tests__/*.test.ts \
  | head -30

# Files with Zod imports
grep -r "from 'zod'\|import.*Zod" \
  packages/*/src/__tests__/*.test.ts \
  | head -20

# Count schema validation tests
find . -name "*schema*.test.ts" -o -name "*validation*.test.ts" | wc -l
```

**Quick scan:**
```bash
# Show files testing schema validation
find . -name "*schema*.test.ts" -o -name "*validation*.test.ts" | sort
```

**Estimated coverage:** 30-50 failures across ~10-15 test files

---

## Category G: Algorithm Registry / Feature Flags

**What to search for:** Tests expecting algorithms that might be disabled.

```bash
# Files using registry
grep -r "registry\.get\|getForDeploymentProfile\|getRegistry" \
  packages/*/src/__tests__/*.test.ts \
  apps/wasm4pm/src/__tests__/*.test.ts \
  | head -30

# Files testing specific algorithms
grep -r "discover_genetic\|discover_ilp\|discover_aco\|discover_pso" \
  packages/*/src/__tests__/*.test.ts \
  apps/wasm4pm/src/__tests__/*.test.ts \
  | head -20

# Files testing deployment profiles
grep -r "mobile\|iot\|edge\|fog\|browser" \
  packages/*/src/__tests__/*algorithm*.test.ts \
  | grep -i profile | head -20
```

**Quick scan:**
```bash
# Show registry-dependent tests
grep -l "registry\.get\|getForDeploymentProfile" \
  apps/wasm4pm/src/__tests__/*.test.ts
```

**Estimated coverage:** 20-40 failures across ~10-15 test files

---

## Category H: OTEL Span Missing / Coverage

**What to search for:** Tests expecting spans that aren't emitted.

```bash
# Files using OtelCapture
grep -r "OtelCapture\|createOtelCapture\|getAllSpans\|getSpans" \
  packages/*/src/__tests__/*.test.ts \
  apps/wasm4pm/src/__tests__/*.test.ts \
  | head -30

# Files asserting on spans
grep -r "expect.*spans\|expect.*span.*length" \
  packages/*/src/__tests__/*.test.ts \
  apps/wasm4pm/src/__tests__/*.test.ts \
  | head -20

# Files testing OTEL coverage
find . -name "*otel*.test.ts" -o -name "*span*.test.ts" | wc -l
```

**Quick scan:**
```bash
# Show OTEL-related test files
find . -name "*otel*.test.ts" -o -name "*span*.test.ts" | sort
```

**Estimated coverage:** 30-50 failures across ~10-15 test files

---

## Category I: Fixture File Missing

**What to search for:** Tests loading non-existent fixture files.

```bash
# Files loading fixtures
grep -r "fixtures/\|test-data/\|benches/\|\.xes\|\.ocel\|test\.json" \
  packages/*/src/__tests__/*.test.ts \
  apps/wasm4pm/src/__tests__/*.test.ts \
  | grep -v "^Binary" | head -30

# Files loading from fs
grep -r "readFileSync\|readFile\|fs\.read" \
  packages/*/src/__tests__/*.test.ts \
  apps/wasm4pm/src/__tests__/*.test.ts \
  | head -20

# Check what fixtures exist
find . -name "fixtures" -type d -exec ls -la {} \; | head -30
```

**Quick scan:**
```bash
# Show test files referencing fixtures
grep -l "fixtures/\|test-data/" \
  packages/*/src/__tests__/*.test.ts \
  apps/wasm4pm/src/__tests__/*.test.ts
```

**Estimated coverage:** 15-30 failures across ~8-12 test files

---

## Category J: Mock Configuration Issues

**What to search for:** Tests with vi.mock or mocking issues.

```bash
# Files using vi.mock
grep -r "vi\.mock\|vi\.spyOn\|vi\.fn" \
  packages/*/src/__tests__/*.test.ts \
  apps/wasm4pm/src/__tests__/*.test.ts \
  | head -30

# Files in cognition (known FM-5 mock violations)
grep -r "vi\.mock.*init\|mock.*wasm" \
  packages/cognition/src/__tests__/*.test.ts \
  | head -20

# Count files with mocks
find . -name "*.test.ts" -exec grep -l "vi\.mock\|vi\.spy" {} \; | wc -l
```

**Quick scan:**
```bash
# Show files with mocking
grep -l "vi\.mock\|vi\.spyOn" packages/cognition/src/__tests__/*.test.ts
```

**Estimated coverage:** 10-20 failures across ~5-8 test files

---

## Category K: Timeout/Async Issues

**What to search for:** Tests with timeouts, long-running operations.

```bash
# Files with explicit timeouts
grep -r "timeout\|maxBuffer\|45_000\|30_000\|10_000" \
  packages/*/src/__tests__/*.test.ts \
  apps/wasm4pm/src/__tests__/*.test.ts \
  | head -20

# Files with async operations
grep -r "async\|await\|Promise\|\.then" \
  packages/*/src/__tests__/*.test.ts \
  apps/wasm4pm/src/__tests__/*.test.ts \
  | grep -v "^Binary" | wc -l

# E2E tests (known to be slow)
find . -name "*e2e*.test.ts" -o -name "*integration*.test.ts" | wc -l
```

**Quick scan:**
```bash
# Show slow/timeout tests
grep -l "timeout\|45_000\|maxBuffer" \
  apps/wasm4pm/src/__tests__/*.test.ts
```

**Estimated coverage:** 10-20 failures across ~5-8 test files

---

## Category L: Output Formatting Issues

**What to search for:** Tests with strict regex matching on output.

```bash
# Files with regex matching on stdout/stderr
grep -r "expect.*toMatch\|expect.*stdout\|stripAnsi\|colorize" \
  packages/*/src/__tests__/*.test.ts \
  apps/wasm4pm/src/__tests__/*.test.ts \
  | head -30

# Files asserting on specific text patterns
grep -r "toContain\|toBe.*stdout\|stderr.*match" \
  packages/*/src/__tests__/*.test.ts \
  apps/wasm4pm/src/__tests__/*.test.ts \
  | head -20
```

**Quick scan:**
```bash
# Show tests with strict output matching
grep -l "toMatch.*stdout\|stdout.*toMatch" \
  apps/wasm4pm/src/__tests__/*.test.ts
```

**Estimated coverage:** 10-20 failures across ~5-8 test files

---

## Quick Triage Summary Script

```bash
#!/bin/bash
# Run this to get a quick failure breakdown estimate

echo "=== Quick Triage Breakdown ==="
echo ""
echo "Category A (WASM): $(find . -name "*.test.ts" -exec grep -l "from 'wasm4pm'" {} \; | wc -l) files"
echo "Category B (Envelope): $(grep -r "\.payload\." apps/wasm4pm/src/__tests__/*.test.ts 2>/dev/null | wc -l) assertions"
echo "Category C (CLI): $(comm -23 \
  <(find apps/wasm4pm/src/__tests__ -name "*.test.ts" -exec grep -oh "runCli\(\['\([^']*\)" {} \; | sed "s/runCli\(\['//g" | sort -u) \
  <(grep -oh "'[a-z-]*':" apps/wasm4pm/src/cli.ts | sed "s/'//g" | sed "s/:$//g" | sort -u) 2>/dev/null | wc -l) commands"
echo "Category D (Setup): $(find . -name "*.test.ts" -exec grep -l "beforeEach\|beforeAll" {} \; | wc -l) files"
echo "Category E (Dependencies): $(pnpm list 2>&1 | grep -c "ERR!" 2>/dev/null || echo 0) dependency issues"
echo "Category F (Schema): $(find . -name "*schema*.test.ts" -o -name "*validation*.test.ts" | wc -l) files"
echo "Category G (Registry): $(grep -rc "registry\.get" packages/*/src/__tests__/*.test.ts apps/wasm4pm/src/__tests__/*.test.ts 2>/dev/null | grep -v ":0" | wc -l) files"
echo "Category H (OTEL): $(grep -rc "OtelCapture" packages/*/src/__tests__/*.test.ts apps/wasm4pm/src/__tests__/*.test.ts 2>/dev/null | grep -v ":0" | wc -l) files"
echo "Category I (Fixtures): $(grep -rc "fixtures/" packages/*/src/__tests__/*.test.ts apps/wasm4pm/src/__tests__/*.test.ts 2>/dev/null | grep -v ":0" | wc -l) files"
echo "Category J (Mocks): $(grep -rc "vi\.mock" packages/*/src/__tests__/*.test.ts 2>/dev/null | grep -v ":0" | wc -l) files"
echo "Category K (Timeout): $(grep -rc "timeout\|45_000" packages/*/src/__tests__/*.test.ts apps/wasm4pm/src/__tests__/*.test.ts 2>/dev/null | grep -v ":0" | wc -l) files"
echo "Category L (Format): $(grep -rc "toMatch.*stdout" packages/*/src/__tests__/*.test.ts apps/wasm4pm/src/__tests__/*.test.ts 2>/dev/null | grep -v ":0" | wc -l) files"
```

---

## Usage Instructions

1. **For rapid overview:** Run the "Quick Triage Summary Script" above
2. **To find specific categories:** Use the grep patterns for each category
3. **To identify affected files:** Use the "Quick scan" patterns (shorter, faster)
4. **For deep analysis:** Use the full grep commands with `head -30` for context

All patterns assume you're running from repo root: `/Users/sac/wasm4pm/`
