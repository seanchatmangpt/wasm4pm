# Track B-1: ConformancePayload Envelope Wrapper — Backward Compatibility Assessment

**Completed:** 2026-05-30  
**Status:** ✅ Comprehensive assessment complete  
**Recommendation:** ⚠️ BREAKING CHANGE — Requires phased rollout strategy

---

## Quick Assessment

| Aspect | Finding |
|--------|---------|
| **Is this a breaking change?** | ✅ **YES** — JSON output shape changed for all external consumers |
| **Will existing tests break?** | ✅ **YES** — 79 assertions across 6 test files require updates |
| **Will external scripts break?** | ✅ **YES** — Shell scripts using `jq '.fitness'` will silently return null |
| **Will lab tests fail?** | ✅ **YES** — External validation tests will fail on first run post-release |
| **Safe to merge on main?** | ✅ **YES**, if released as v26.5.0 minor (not patch) with migration guide |
| **Safe to release immediately?** | ❌ **NO** — External users would break with no migration path |
| **Recommended approach?** | ✅ **Phase 1 + 2 rollout** with 6-month deprecation period |

---

## Key Findings

### 1. **Scope of Impact: 6 Breaking Categories**

```
Category                           | Severity | Affected Users
───────────────────────────────────┼──────────┼──────────────────
Internal tests (79 assertions)     | Low      | This repo only
Lab tests (external validation)    | Medium   | Published npm package
Shell scripts (jq parsing)         | High     | Unknown (silent failures)
CI/CD pipelines                    | High     | Unknown
External Node.js clients           | High     | Unknown
Published API documentation        | High     | All external integrations
```

### 2. **Silent Failure Risk: CRITICAL**

External shell scripts will **silently fail** without error:

```bash
# User script (unchanged)
fitness=$(jq '.fitness' conformance.json)

# Before change: returns 0.85 ✓
# After change: returns null (jq silently succeeds!) ✗
# Script continues with $fitness="" — undetected bug!
```

This is the most dangerous type of breaking change because it fails silently.

### 3. **Lab Test Failure: CONFIRMED**

Lab tests run against the **published npm package**:
- Lab cannot be updated before release
- Lab will fail on first run post-release
- This is a chicken-egg problem

### 4. **Internal Tests: 79 Assertions**

All require updates from:
```typescript
// OLD (broken after change)
const payload = JSON.parse(result.stdout);
expect(payload.fitness).toBe(0.85);

// NEW (required after change)
const { payload } = JSON.parse(result.stdout);
expect(payload.fitness).toBe(0.85);
```

Migration effort: **~30-45 minutes** (automatable with sed/grep)

---

## Recommended Release Strategy: Phased Rollout

### Phase 1: v26.5.0 (Next Minor Release)

**Release action:**
- ✅ Wrap payload in CommandResult envelope
- ✅ Include `__DEPRECATED_NOTICE__` for backward compatibility
- ✅ Update all internal tests to use `.payload` accessor
- ✅ Update OpenAPI, WASM_API.md documentation
- ✅ Create MIGRATION_GUIDE.md for external users
- ✅ Add deprecation notice to release notes with timeline

**Impact on external users:**
- No immediate breakage
- Clear signal that change is coming
- 6+ months to migrate

**Requires:**
```
Release notes must include:
  "DEPRECATION: ConformancePayload JSON output format changing in v27.0.0
   Current format: { "schema": "...", "fitness": 0.85, ... }
   New format:    { "payload": { "schema": "...", "fitness": 0.85 }, ... }
   
   Migration guide: See MIGRATION_GUIDE.md
   Timeline: v27.0.0 will enforce new format (breaking change)"
```

### Phase 2: v27.0.0 (Next Major Release — ~6 months later)

**Release action:**
- ✅ Remove backward compatibility layer
- ✅ Enforce envelope-only output
- ✅ Update all documentation
- ✅ Mark as major version (signals breaking change)

**Impact:**
- Clean architecture (all commands use envelope)
- External users had time to migrate
- Following semantic versioning

---

## Deliverables

### ✅ Documents Created

1. **BACKWARD_COMPATIBILITY_REPORT.md** (13 sections, comprehensive)
   - Impact analysis per consumer category
   - Version compatibility matrix
   - Migration guides (shell, Node.js)
   - Risk/mitigation analysis
   - Complete action checklist
   - Appendix with all affected files

2. **BACKWARD_COMPAT_SUMMARY.txt** (executive summary)
   - Quick reference format
   - Key risks
   - Affected files list
   - Decision matrix

3. **test_impact.txt** (test-specific details)
   - 7 test files analyzed
   - 79+ assertions identified
   - Per-file breaking details
   - Migration patterns

---

## Action Items for Release

### Before Release (Week 1)

- [ ] **Confirm strategy:** Validate recommendation to use Phase 1+2 with stakeholders
- [ ] **Update tests:** Migrate 79 assertions to use `.payload` accessor
- [ ] **Update lab:** Modify `lab/tests/conformance.test.ts` for wrapped format
- [ ] **Update docs:**
  - [ ] `.github/schemas/openapi.json` — add envelope schema
  - [ ] `WASM_API.md` — document new format (mark old as deprecated)
  - [ ] `CHANGELOG.md` — add deprecation notice
  - [ ] **NEW:** `MIGRATION_GUIDE.md` — external user instructions

### At Release (v26.5.0)

- [ ] Update version number
- [ ] Merge PR with envelope changes + backward compat layer
- [ ] Create GitHub release with:
  - Deprecation notice (prominent)
  - Migration guide link
  - Timeline: "v27.0.0 will enforce new format (breaking change)"
  - Before/after examples
- [ ] Announce: Issue tracker, blog, mailing list

### At Major Release (v27.0.0)

- [ ] Remove `__DEPRECATED_NOTICE__` field
- [ ] Enforce envelope-only output
- [ ] Update documentation to remove deprecation labels
- [ ] Create release notes highlighting breaking change

---

## Risk Assessment

| Risk | Probability | Severity | Mitigation |
|------|------------|----------|-----------|
| External scripts fail silently | **HIGH** | **CRITICAL** | Deprecation warning + 6mo grace period |
| Lab tests fail immediately | **CERTAIN** | **MEDIUM** | Update before release |
| External tools diverge | **MEDIUM** | **MEDIUM** | Provide migration scripts |
| Users skip v26.5.0 | **MEDIUM** | **HIGH** | Clear communication |

**Overall:** Risk is **manageable with proper communication and grace period**

---

## Safe to Merge?

### ✅ **YES**, if:
- [ ] Release targets v26.5.0 or higher (minor/major, NOT patch)
- [ ] All 79 internal tests updated to use `.payload` accessor
- [ ] Lab tests updated to expect wrapped format
- [ ] MIGRATION_GUIDE.md created for external users
- [ ] Release notes include deprecation notice + 6-month timeline
- [ ] OpenAPI and WASM_API.md updated

### ❌ **NO**, if:
- Releasing as patch version (v26.4.x)
- Lab tests not updated before release
- No migration guide for external users
- No deprecation notice in release notes

---

## Recommendation

**Use Phase 1 + Phase 2 phased rollout:**

1. **v26.5.0:** Introduce envelope with backward compat + deprecation warning
2. **v27.0.0:** Remove backward compat, enforce envelope (6 months later)

This approach:
- ✅ Respects semantic versioning
- ✅ Gives external users time to migrate
- ✅ Prevents silent failures
- ✅ Allows clean architecture evolution
- ✅ Demonstrates commitment to stability

---

## Supporting Documents

Full analysis available in:
- `BACKWARD_COMPATIBILITY_REPORT.md` — comprehensive (all sections)
- `BACKWARD_COMPAT_SUMMARY.txt` — quick reference
- `test_impact.txt` — test-specific details (in this directory)

---

**Assessment completed:** 2026-05-30  
**Ready for:** Architectural review and release planning decision
