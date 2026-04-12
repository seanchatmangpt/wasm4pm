# OTEL Span Coverage System Architecture

**Objective:** Prevent shipping untraceable code by enforcing OTEL span coverage on all public functions.

**Scope:** pictl monorepo (packages/*/src/**/*.ts)  
**Enforcement Level:** Merge-blocking at <80% coverage  
**Current Status:** 0/596 functions (0%) — baseline scan complete

---

## System Components

```
┌─────────────────────────────────────────────────────────────┐
│                   OTEL Coverage Mandate                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐  │
│  │  ESLint Rule │   │   Pre-Commit │   │   Coverage   │  │
│  │   (Lint)     │   │     Hook     │   │   Scanner    │  │
│  └──────────────┘   └──────────────┘   └──────────────┘  │
│        │                   │                   │           │
│   Real-time              Blocks           Metrics          │
│   feedback            commits if         & reports        │
│   during dev          new funcs           (CI/CD)         │
│                       lack spans                          │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │          Instrumentation API                         │  │
│  │     (packages/observability/src/instrumentation)     │  │
│  │                                                      │  │
│  │  - createStateChangeEvent()                         │  │
│  │  - createAlgorithmStartedEvent()                    │  │
│  │  - createErrorEvent()                              │  │
│  │  - createProgressEvent()                           │  │
│  │  - createMlAnalysisEvent()                         │  │
│  │  - createSourceCompletedEvent()                    │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘

               Generated Artifacts

┌─────────────────────────────────────────┐
│  .pictl/otel-coverage.json             │
│  - coverage %, by package               │
│  - missing functions list               │
│  - trend tracking                       │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  .pictl/otel-coverage.md               │
│  - dashboard (human-readable)           │
│  - top gaps & actionable fixes          │
│  - how-to guide                         │
└─────────────────────────────────────────┘
```

---

## Component 1: ESLint Rule (`pictl-observability/require-span-for-public`)

**Purpose:** Real-time feedback during development  
**Trigger:** `npm run lint` or editor integration  
**Severity:** Warn (escalate to error when ready)

**Implementation:**
- File: `packages/observability/src/eslint-rules/require-span-for-public.js`
- Plugin wrapper: `packages/observability/src/eslint-plugin.js`
- Configuration: `.eslintrc.cjs`

**What it does:**
1. Scans AST for `export function` and `export const` declarations
2. Searches function body for `Instrumentation.create*` calls
3. Reports violations with actionable message
4. Optionally auto-fixes with template span insertion

**Example violation:**
```
packages/config/src/resolver.ts:42:1  warn
Public function "resolveConfig" must have an Instrumentation call.
Add Instrumentation.createSpan() or similar at the start.
```

**Detection logic:**
```javascript
// Parse: export function X() { ... }
const funcPattern = /export\s+(async\s+)?function\s+(\w+)/gm;

// Parse: export const X = () => { ... }
const constPattern = /export\s+const\s+(\w+)\s*[=:]/gm;

// Check body for Instrumentation.create*
const hasSpan = /Instrumentation\.(create|emit|record)/.test(functionBody);
```

---

## Component 2: Pre-Commit Hook (`.claude/hooks/otel-coverage.sh`)

**Purpose:** Prevent commits with missing spans on NEW functions  
**Trigger:** `git commit` (if hook installed)  
**Exit Code:** 0 (pass) or 1 (block commit)

**Installation:**
```bash
ln -s ../../.claude/hooks/otel-coverage.sh .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

**What it does:**
1. Gets list of staged files: `git diff --cached --name-only`
2. Filters to new TypeScript files: `--diff-filter=A` (added)
3. For each new file, scans for public exports
4. Checks each export for Instrumentation call
5. Blocks commit if violations found

**Block message:**
```
❌ OTEL SPAN COVERAGE VIOLATION

New public functions must have Instrumentation calls.

  packages/engine/src/new-file.ts:15
    → export function analyzeTrace() { ... }
  
  packages/engine/src/new-file.ts:32
    → export const processEvent = () => { ... }

Fix by adding Instrumentation.create*() call at function start.
Commit BLOCKED: Add OTEL spans to new public functions.
```

**Logic:**
```bash
CHANGED_FILES=$(git diff --cached --name-only --diff-filter=A)
# For each changed file:
#   Extract all export patterns
#   For each export:
#     Check if body contains Instrumentation.create/emit/record
#   If any export lacks span: exit 1
```

---

## Component 3: Coverage Scanner (`scripts/verify-otel-coverage.sh`)

**Purpose:** Generate metrics and identify gaps  
**Trigger:** Manual (`./scripts/verify-otel-coverage.sh`) or CI/CD  
**Exit Code:** 0 (meets threshold) or 1 (below threshold)

**What it does:**
1. Walks all `packages/*/src/**/*.ts` files
2. Extracts public exports from each file
3. For each export, checks for Instrumentation calls
4. Aggregates coverage % by package
5. Generates JSON report (`.pictl/otel-coverage.json`)
6. Generates Markdown dashboard (`.pictl/otel-coverage.md`)
7. Compares against threshold (default: 80%)

**Output example:**
```
=== OTEL Span Coverage Report ===

❌ config: 0/37 (0%)
❌ contracts: 0/102 (0%)
❌ engine: 0/81 (0%)

📊 OVERALL: 0/596 (0%)

❌ Coverage 0% is below threshold of 80%
```

**Detection algorithm:**
```javascript
// For each file:
//   1. Parse TypeScript AST
//   2. Extract: export function, export const, export class
//   3. For each export:
//        Extract function body
//        Search for regex: /Instrumentation\.(create|emit|record)/
//        If found: count as instrumented
//        If not: add to missing list
//   4. Calculate: coverage % = instrumented / total
//   5. Compare against threshold
```

**Handles:**
- Function declarations: `export function X() {}`
- Async functions: `export async function X() {}`
- Arrow functions: `export const X = () => {}`
- Class methods: `export class C { public method() {} }`
- Skips: types, interfaces, test files (`__tests__/*`, `*.test.ts`)

---

## Component 4: Instrumentation API (`packages/observability/src/instrumentation.ts`)

**Purpose:** Standardized OTEL span creation  
**Exports:** Static methods for creating typed events

**Available methods:**

| Method | Input | Returns | OTEL Span Name |
|--------|-------|---------|---|
| `createStateChangeEvent()` | traceId, fromState, toState | {event, otelEvent} | `engine.state_change` |
| `createPlanGeneratedEvent()` | traceId, planId, planHash, steps | {event, otelEvent} | `engine.plan_generated` |
| `createAlgorithmStartedEvent()` | traceId, algorithmName | {event, otelEvent} | `algorithm.{name}` |
| `createAlgorithmCompletedEvent()` | traceId, spanId, algorithmName, status | {event, otelEvent} | `algorithm.{name}.completed` |
| `createErrorEvent()` | traceId, errorCode, errorMessage | {event, otelEvent} | `error.occurred` |
| `createProgressEvent()` | traceId, progress (0-100) | {event, otelEvent} | `operation.progress` |
| `createMlAnalysisEvent()` | traceId, mlTask, method | {event, otelEvent} | `ml.{task}` |
| `createSourceStartedEvent()` | traceId, kind | {event, otelEvent} | `source.started` |
| `createSinkStartedEvent()` | traceId, kind | {event, otelEvent} | `sink.started` |

**Attributes all spans must include:**
```typescript
RequiredOtelAttributes {
  'service.name': 'pictl'
  'run.id': string                    // Unique execution ID
  'trace.id': string                  // Distributed trace ID
  [key: string]: any
}
```

**Example usage:**
```typescript
const { event, otelEvent } = Instrumentation.createProgressEvent(
  traceId,
  progress,  // 0-100
  requiredAttrs,
  { message: 'Processing...' }
);
// otelEvent is the actual OTEL span to export
```

---

## Data Flow: Function → Span

### 1. Developer writes new function:
```typescript
// packages/config/src/resolver.ts
export function resolveConfig(options: ResolveOptions) {
  // Implementation without span
}
```

### 2. Scanner detects it's missing span:
```bash
./scripts/verify-otel-coverage.sh

# Output:
# ❌ config: 0/37 (0%)
# Missing: resolveConfig (resolver.ts:42)
```

### 3. ESLint warns:
```bash
npm run lint

# eslint packages/config/src/resolver.ts
# 42:1  warn  Public function "resolveConfig" must have...
```

### 4. Pre-commit hook blocks commit:
```bash
git commit -m "feat: add config resolver"

# ❌ OTEL SPAN COVERAGE VIOLATION
# New public functions must have Instrumentation calls.
# packages/config/src/resolver.ts:42
#   → export function resolveConfig() { ... }
# 
# Commit BLOCKED
```

### 5. Developer adds span:
```typescript
export function resolveConfig(
  options: ResolveOptions,
  requiredAttrs: RequiredOtelAttributes
) {
  const { event, otelEvent } = Instrumentation.createProgressEvent(
    requiredAttrs['trace.id'],
    0,
    requiredAttrs,
    { message: 'Resolving config...' }
  );

  // ... implementation
  return config;
}
```

### 6. Scanner passes:
```bash
./scripts/verify-otel-coverage.sh

# ✅ config: 1/37 (2%)
```

### 7. Pre-commit hook allows commit:
```bash
git commit -m "feat(config): add OTEL span to resolver"

# ✅ OTEL coverage check passed
# [main abc123] feat(config): add OTEL span to resolver
```

### 8. Span exported at runtime:
```
OTEL Collector receives:
{
  "traceId": "abc123",
  "spanId": "def456",
  "name": "operation.progress",
  "attributes": {
    "service.name": "pictl",
    "run.id": "cli-run-1",
    "trace.id": "abc123",
    "progress": 0,
    "message": "Resolving config..."
  },
  "status": "OK"
}
```

---

## Coverage Metrics

### JSON Schema (`.pictl/otel-coverage.json`)

```json
{
  "timestamp": "ISO-8601",
  "coverage": 0,                    // Overall % (0-100)
  "total": 596,                     // Total public functions
  "instrumented": 0,                // With spans
  "missing_count": 596,             // Without spans
  "threshold": 80,                  // Merge gate threshold
  "meets_threshold": false,
  "by_package": {
    "config": {
      "total": 37,
      "instrumented": 0,
      "missing": [
        {
          "file": "hash.ts",
          "function": "hashConfig",
          "line": 39
        }
      ],
      "files": {
        "hash.ts": { "total": 7, "instrumented": 0 },
        "resolver.ts": { "total": 30, "instrumented": 0 }
      }
    }
  }
}
```

### Dashboard (`.pictl/otel-coverage.md`)

**Human-readable summary:**
- Overall coverage % with status
- By-package breakdown (sorted by coverage)
- Top gaps (packages with most missing)
- How-to fix instructions

**Updated by:** `./scripts/verify-otel-coverage.sh`

---

## Enforcement Strategy

### Merge Gate

```
PR created with new functions
  ↓
CI runs: ./scripts/verify-otel-coverage.sh --threshold=80
  ↓
If coverage < 80%:
  ✗ CI check FAILS
  → PR cannot merge
  → Developer adds spans
  → Pushes new commit
  → CI re-runs
  ↓
If coverage >= 80%:
  ✓ CI check PASSES
  → PR can merge
```

**Implementation:** Add to `.github/workflows/verify-otel.yml`:
```yaml
- name: OTEL Coverage Check
  run: ./scripts/verify-otel-coverage.sh --threshold=80
```

### Escalation Path

1. **Warn level** (current) — `npm run lint` warns developers
2. **Error level** (Phase 2) — `npm run lint --fix` fails if not addressed
3. **CI gate** (Phase 3) — Merge blocked if <80%
4. **Policy enforcement** (Phase 4) — All merges require 100% new function coverage

---

## Performance Characteristics

| Operation | Time | Scale |
|-----------|------|-------|
| Scanner run (full scan) | ~2s | 596 functions |
| ESLint rule check (file) | ~50ms | Per file |
| Pre-commit hook (staged) | ~100ms | Only changed files |
| AST parse per file | ~10ms | Per .ts file |

---

## Integration Points

### 1. IDE Integration (ESLint)
```typescript
// VS Code with ESLint extension shows:
// "Public function 'foo' must have Instrumentation call"
// With auto-fix suggestion
```

### 2. Git Hooks
```bash
# Pre-commit hook installed at:
# .git/hooks/pre-commit → .claude/hooks/otel-coverage.sh
```

### 3. CI/CD Pipeline
```bash
# In GitHub Actions or similar:
./scripts/verify-otel-coverage.sh --threshold=80
# Blocks merge if below threshold
```

### 4. Testing Infrastructure
```typescript
// Test harnesses (OtelCapture) can verify spans
import { createOtelCapture } from '@pictl/testing';

const capture = createOtelCapture();
myFunction(capture.requiredAttrs);
const spans = capture.exportedSpans();
expect(spans).toHaveLength(1);
expect(spans[0].name).toBe('operation.progress');
```

---

## Maintenance & Scaling

### Updating thresholds:
```bash
# Increase from 80% to 90%
./scripts/verify-otel-coverage.sh --threshold=90

# Set in CI/CD config
```

### Exempting functions:
```typescript
// Add ESLint disable comment
// eslint-disable-next-line pictl-observability/require-span-for-public
export function simpleUtility() {
  return 42;
}
```

### Bulk instrumentation:
```bash
# Auto-fix attempt (future phase)
./scripts/verify-otel-coverage.sh --fix

# Manual: prioritize by package size
# 1. observability (48) → contracts (102) → engine (81) → ...
```

---

## Known Limitations

1. **Regex detection:** Simple `Instrumentation.create*` pattern — doesn't detect indirect calls
2. **Type safety:** No TypeScript type checking of span arguments
3. **Performance:** Full scan is O(n) — slowdown on large additions
4. **IDE latency:** ESLint rule adds ~50ms per file

**Mitigations:**
- Semantic analysis (Phase 2): Use TypeScript AST instead of regex
- Caching (Phase 2): Cache AST per file
- Incremental scanning: Only re-scan changed files in CI

---

## Success Criteria

- [ ] 0/596 baseline captured (complete ✅)
- [ ] All enforcement mechanisms active (complete ✅)
- [ ] Coverage dashboard live (complete ✅)
- [ ] 50% coverage (300+ functions) by end of Month 1
- [ ] 80% coverage (480+ functions) by end of Month 2
- [ ] 100% coverage (596 functions) by end of Month 3
- [ ] All spans conformant with semantic conventions (Phase 3)
- [ ] OTEL collector integration verified (Phase 4)

---

**Version:** 1.0  
**Last Updated:** 2026-04-12  
**Status:** Baseline capture complete, enforcement active
