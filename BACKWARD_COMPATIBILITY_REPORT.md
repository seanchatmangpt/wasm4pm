# Backward Compatibility Assessment: ConformancePayload Envelope Wrapper

**Date:** 2026-05-30  
**Change:** Wrap bare ConformancePayload in CommandResult envelope (JSON output)  
**Status:** ⚠️ **BREAKING CHANGE** — detailed assessment below  
**Severity:** **High** — affects external clients and published API contract  
**Recommendation:** Phased rollout with migration period  

---

## Executive Summary

The proposed change to wrap ConformancePayload in a CommandResult envelope is a **breaking change** that affects:

1. ✅ **Internal tests** — easily updated (79 tests using `.payload`)
2. ❌ **External API clients** — direct JSON consumers at `./payload.*`
3. ❌ **Published documentation** — OpenAPI schema, CHANGELOG, WASM_API.md
4. ⚠️ **Downstream tools** — Hooks, scripts, CI/CD pipelines relying on flat structure

**Current shape (breaking without this fix):**
```json
{
  "schema": "...",
  "status": "...",
  "fitness": 0.85,
  "precision": 0.92,
  ...
}
```

**New shape (with envelope):**
```json
{
  "command": "conformance",
  "status": "ok",
  "message": "...",
  "exit_code": 0,
  "payload": {
    "schema": "...",
    "status": "...",
    "fitness": 0.85,
    "precision": 0.92,
    ...
  },
  "meta": { "run_id": "...", "timestamp": "...", ... }
}
```

---

## Impact Analysis

### 1. Internal Test Files (LOW IMPACT — Easily Updated)

**Files affected:** 79 test assertions across 6 test files

| File | Tests Using Payload | Impact |
|------|-------------------|--------|
| `conformance-trace-audit.test.ts` | 30+ | Direct `.payload.*` access |
| `conformance-cli.test.ts` | 15+ | Direct `.payload.*` access |
| `conformance-full-quality.test.ts` | 20+ | Direct `.payload.*` access |
| `mcpp-admission-gate.test.ts` | 10+ | Direct `.payload.*` access |
| `conformance-enhanced.test.ts` | 8+ | Direct `.payload.*` access |
| `prefix-conformance.test.ts` | 5+ | Direct `.payload.*` access |

**Current usage pattern:**
```typescript
const json = JSON.parse(result.stdout);
const { summary, fitness, precision } = json; // Direct access
expect(json.summary.conformance_rate).toBe(...);
```

**Required change pattern:**
```typescript
const json = JSON.parse(result.stdout);
const { summary, fitness, precision } = json.payload; // Access via .payload
expect(json.payload.summary.conformance_rate).toBe(...);
```

**Migration effort:** ~5 minutes (automated sed/regex replacement feasible)  
**Risk:** Low — tests are version-controlled, easy to verify

---

### 2. Lab Tests (Post-Publish Validation) — EXTERNAL, HIGH IMPACT

**Files affected:** `lab/tests/conformance.test.ts` (published npm artifact validation)

**Current state:**
```typescript
// lab/tests/conformance.test.ts assumes flat envelope
// These are tests of the PUBLISHED npm package, not dev build
```

**Problem:**
- Lab tests run against **installed npm package**, not local source
- If conformance CLI returns wrapped payload, lab tests must expect it
- Lab cannot be updated before release (chicken-egg problem)

**Risk:** **CRITICAL**
- Lab tests will fail on first run post-release
- External clients installing wasm4pm post-release will see breaking JSON structure
- No migration period for external consumers (they expect old format immediately)

---

### 3. Documented API Contracts — HIGH IMPACT

#### A. OpenAPI Schema (`.github/schemas/openapi.json`)

**Current status:** Document exists but incomplete (only covers npm registry metadata, not conformance output)

**Required update:**
```json
{
  "components": {
    "schemas": {
      "ConformanceResponse": {
        "type": "object",
        "properties": {
          "command": { "type": "string", "enum": ["conformance"] },
          "status": { "type": "string", "enum": ["ok", "error"] },
          "payload": {
            "$ref": "#/components/schemas/ConformancePayload"
          },
          "meta": { "$ref": "#/components/schemas/ResultMetadata" }
        }
      }
    }
  }
}
```

**Impact:** Must be published with release notes; external API consumers rely on OpenAPI for contract

---

#### B. WASM_API.md (Public API Documentation)

**Current state:** Documents WASM exports, mentions conformance but doesn't formally specify JSON output shape

**Required update:** Add formal response envelope specification

**Impact:** External integrations (e.g., CI/CD tools, dashboards) depend on documented schema

---

#### C. CHANGELOG.md

**Current state:** No explicit promise about JSON output format

**Required update:** Must document:
- Version where envelope was introduced
- Migration path for external clients
- Old format deprecated, new format required in next major

**Impact:** Affects downstream tools' upgrade strategies

---

### 4. Downstream Consumers — CRITICAL IMPACT

#### A. Hook Scripts & CI/CD Pipelines

**Locations affected:**
- `.claude/rules/_proof-gate-stop.sh` — parses `wpm conformance --format json --quiet`
- `scripts/` — any CI/CD conformance automation
- User scripts relying on `wpm conformance` output

**Current pattern:**
```bash
# User script assuming flat payload
fitness=$(jq '.fitness' < output.json)
precision=$(jq '.precision' < output.json)
```

**New pattern required:**
```bash
# Must access via .payload wrapper
fitness=$(jq '.payload.fitness' < output.json)
precision=$(jq '.payload.precision' < output.json)
```

**Impact:**
- **Breaking:** All shell scripts using `jq` will fail silently (jq returns null)
- **Silent failure risk:** Shell may not error on null, just use default behavior
- **Scope:** Unknown — depends on how many external scripts exist

---

#### B. Programmatic Clients (Python, Java, Node.js, etc.)

**Pattern example (Node.js client):**
```typescript
const response = await exec('wpm conformance log.xes --format json');
const payload = JSON.parse(response);
const fitness = payload.fitness; // ❌ Will be undefined post-change
```

**Impact:**
- **Breaking:** Direct property access fails silently
- **Scope:** Unknown — depends on adoption of wasm4pm as library

---

### 5. Configuration & Documentation Assumptions — MEDIUM IMPACT

#### Examples in documentation that assume flat structure:

**WASM_API.md example (hypothetical):**
```markdown
## Conformance Response

```json
{
  "schema": "wasm4pm.conformance.v1",
  "fitness": 0.85,
  "precision": 0.92
}
```
```

Must change to:
```json
{
  "payload": {
    "schema": "wasm4pm.conformance.v1",
    "fitness": 0.85,
    "precision": 0.92
  }
}
```

---

## Version Compatibility Matrix

| Scenario | Current (v26.4.x) | After Change | Compatible? |
|----------|-------------------|--------------|------------|
| **Internal tests** | Flat `.fitness` | `.payload.fitness` | ❌ NO |
| **Lab tests** | Flat structure | Wrapped | ❌ NO |
| **External scripts** | `jq '.fitness'` | `jq '.fitness'` → null | ❌ NO |
| **External clients** | Expect flat | Get wrapped | ❌ NO |
| **Hooks** | Parse flat | Receive wrapped | ❌ NO |
| **Human output** | Unchanged | Unchanged | ✅ YES |

---

## Backward Compatibility Classification

| Category | Impact | Severity | Breaking? |
|----------|--------|----------|-----------|
| Internal source code | 79 test assertions | Low | ✅ YES (easy fix) |
| Published API (npm) | External JSON consumers | High | ✅ YES (external users affected) |
| Documented contracts | OpenAPI, WASM_API.md | High | ✅ YES (if documented) |
| Downstream tools | Scripts, CI/CD, hooks | High | ✅ YES (silent failures likely) |
| Human output | CLI `--format human` | None | ✅ NO (unchanged) |

**Total:** **5 breaking changes, 0 non-breaking categories**

---

## Release Strategy Recommendations

### ⚠️ Option 1: Break Compatibility (NOT RECOMMENDED)

**Approach:** Release change immediately in next patch

**Pros:**
- Simplest implementation
- Aligns all commands (all use envelope structure)

**Cons:**
- ❌ External clients break with no migration path
- ❌ Lab tests fail immediately
- ❌ Scripts/hooks break silently
- ❌ Violates semantic versioning (breaking change in patch)
- ❌ Users will not upgrade (fear of breakage)

**Recommendation:** **DO NOT USE**

---

### ✅ Option 2: Phased Rollout with Deprecation Period (RECOMMENDED)

#### Phase 1 (v26.5.0): Introduce new envelope format + deprecation warning

**Release action:**
```typescript
// In conformance.ts output logic:
if (format === 'json') {
  const envelope = makeResult('conformance', payload, elapsedMs, exitCode);
  
  // DEPRECATION: Also include flat payload for backward compatibility
  const backCompatPayload = {
    ...payload,
    // Warn consumers about upcoming change
    __DEPRECATED_NOTICE__: 'Flat JSON structure deprecated; use .payload wrapper in v27.0.0'
  };
  
  process.stdout.write(JSON.stringify(envelope, null, 2) + '\n');
}
```

**Update documentation:**
- Update CHANGELOG.md: "Conformance JSON output now wrapped in CommandResult envelope; flat structure deprecated"
- Update WASM_API.md: Show both old and new examples, mark old as deprecated
- Update OpenAPI schema with version conditional

**External communication:**
- Release notes: "Breaking change coming in v27.0.0: conformance JSON output format changing"
- Migration guide: Show before/after, provide jq/sed migration scripts

**Testing:**
- Update all 79 internal tests to use `.payload`
- Lab tests: Update to expect wrapped format
- Add compatibility test: Ensure flat access still works but emits deprecation warning

**Impact on external users:**
- ✅ No immediate breakage (v26.5.0 still returns acceptable format)
- ⚠️ Deprecation warning signals change coming
- Time to migrate: Until v27.0.0 (6-12 months)

#### Phase 2 (v27.0.0): Remove backward compatibility, enforce envelope

**Release action:**
- Remove `__DEPRECATED_NOTICE__` and flat-structure fallback
- **Only** return wrapped envelope
- Update all documentation to reference envelope format

**Impact:**
- ✅ Clean architecture (all commands use envelope)
- ✅ Users had 6+ months to migrate
- ✅ Following semantic versioning (major version for breaking change)

**Requires:**
- Release notes heavily emphasizing breaking change
- Detailed migration guide in CHANGELOG
- Blog post / announcement

---

### Option 3: Soft Deprecation (ALTERNATIVE)

**Approach:** Add `--output-format` flag to choose between formats

```bash
# v26.5.0+
wpm conformance log.xes --output-format flat  # Current shape
wpm conformance log.xes --output-format envelope  # New shape (default in v27)
```

**Pros:**
- Gradual migration path
- Users can opt-in to new format

**Cons:**
- Additional CLI complexity
- Longer maintenance burden
- Still breaking if default changes

**Recommendation:** Less preferred than Phase 1+2 approach

---

## Migration Guide for External Users

### For Shell Scripts

**Before:**
```bash
fitness=$(jq '.fitness' conformance.json)
```

**After:**
```bash
fitness=$(jq '.payload.fitness' conformance.json)
```

**Automated migration script:**
```bash
# Provided in v26.5.0 release
sed 's/jq '\''\.\([a-z_]*\)'\''/jq '\''.payload.\1'\''/g' old_script.sh > new_script.sh
```

---

### For Programmatic Clients

**Before (Node.js):**
```typescript
const response = await exec('wpm conformance log.xes --format json');
const data = JSON.parse(response);
const fitness = data.fitness;
```

**After:**
```typescript
const response = await exec('wpm conformance log.xes --format json');
const data = JSON.parse(response);
const fitness = data.payload.fitness; // Envelope unwrapping
```

**Helper function for compatibility:**
```typescript
function parseConformanceResponse(json: string) {
  const parsed = JSON.parse(json);
  // Support both old and new formats
  return parsed.payload ?? parsed;
}

const data = parseConformanceResponse(response);
const fitness = data.fitness; // Works with both old and new
```

---

## Action Items

### Before Release

- [ ] **Decision point:** Confirm recommendation to use Option 2 (Phase 1+2)
- [ ] **Internal tests:** Update 79 test assertions to use `.payload` accessor
- [ ] **Lab tests:** Update `lab/tests/conformance.test.ts` to expect wrapped format
- [ ] **Documentation:**
  - [ ] Update `.github/schemas/openapi.json` with new envelope schema
  - [ ] Update `WASM_API.md` with before/after examples
  - [ ] Update `CHANGELOG.md` with deprecation notice
  - [ ] Create `MIGRATION_GUIDE.md` for external users
- [ ] **Deprecation warning:** Add `__DEPRECATED_NOTICE__` to Phase 1 output
- [ ] **Release notes:** Emphasize deprecation timeline (v26.5.0 → v27.0.0)

### At Release Time (v26.5.0)

- [ ] Update version to `26.5.0` in `package.json` (or appropriate version)
- [ ] Merge PR with envelope changes + backward compat layer
- [ ] Create GitHub release with:
  - Deprecation notice (prominent)
  - Migration guide link
  - Timeline to removal (v27.0.0)
  - Examples of updated commands
- [ ] Announce on issue tracker / mailing list
- [ ] Post blog post / article about deprecation

### At Major Release (v27.0.0 — ~6 months later)

- [ ] Remove backward compatibility layer
- [ ] Enforce envelope-only output
- [ ] Update all documentation to remove "deprecated" labels
- [ ] Create release notes highlighting breaking change

---

## Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| External scripts break silently | **HIGH** | **HIGH** | Deprecation warning + 6mo timeline |
| Lab tests fail on first run | **CERTAIN** | **MEDIUM** | Update lab tests before release |
| Users skip v26.5.0 (fear of breakage) | **MEDIUM** | **HIGH** | Clear communication + migration guide |
| Downstream tools diverge (some update, some don't) | **HIGH** | **MEDIUM** | Provide automated migration scripts |

---

## Recommended Decision Tree

```
Is breaking change acceptable in current SLA?
├─ YES (major version bump)
│  └─ Use Option 2: Phase 1 (v26.5) + Phase 2 (v27.0)
├─ NO (must maintain compatibility)
│  ├─ Use Option 3: Add --output-format flag
│  └─ Requires longer maintenance burden
└─ MAYBE (depends on user base)
   └─ Validate impact with top N external users first
```

---

## Conclusion

**The envelope wrapper is a breaking change** that requires:

1. ✅ **Phase 1 (v26.5.0):** Introduce envelope with deprecation notice
2. ✅ **Phase 2 (v27.0.0):** Remove deprecation, enforce envelope
3. ✅ **Communicate:** Clear timeline, migration guide, examples
4. ✅ **Test:** Update all internal and external tests
5. ✅ **Document:** Update OpenAPI, WASM_API.md, CHANGELOG

**Safe to merge on main?** ✅ **YES**, if:
- Targeting next minor or major release (not patch)
- Release notes include deprecation + migration guide
- Phase 2 removal is explicitly scheduled

**Safe to release immediately?** ❌ **NO** — would break external users with no recourse

---

## Appendix: Files Requiring Updates

### Source Code Changes
- ✅ `apps/wasm4pm/src/commands/conformance.ts` — Use makeResult() envelope

### Test Updates (79 test assertions)
- `apps/wasm4pm/src/__tests__/conformance-trace-audit.test.ts` — Add `.payload` accessors
- `apps/wasm4pm/src/__tests__/conformance-cli.test.ts` — Add `.payload` accessors
- `apps/wasm4pm/src/__tests__/conformance-full-quality.test.ts` — Add `.payload` accessors
- `apps/wasm4pm/src/__tests__/mcpp-admission-gate.test.ts` — Add `.payload` accessors
- `apps/wasm4pm/src/__tests__/conformance-enhanced.test.ts` — Add `.payload` accessors
- `apps/wasm4pm/src/__tests__/prefix-conformance.test.ts` — Add `.payload` accessors
- `lab/tests/conformance.test.ts` — Expect wrapped format

### Documentation Updates
- `.github/schemas/openapi.json` — Add ConformanceResponse envelope schema
- `WASM_API.md` — Document new envelope structure, deprecate flat structure
- `CHANGELOG.md` — Add deprecation notice and timeline
- `MIGRATION_GUIDE.md` — New file with external user migration instructions

### Optional: Helper Scripts
- `scripts/migrate-conformance-parsers.sh` — Automated sed/jq migration for bash users
- `packages/testing/src/helpers/parse-conformance.ts` — Helper for backward-compatible parsing

---

**Report prepared:** 2026-05-30  
**Status:** Ready for architectural review
