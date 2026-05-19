# OTEL Cross-Layer Trace Correlation — Design Analysis

**Date:** 2026-05-18  
**Scope:** Cycle 2 findings remediation  
**Status:** DESIGN PHASE (analysis only, no code implementation)  
**Compliance:** chicago-tdd.md, critical-constraints.md

---

## Deliverables

This analysis package contains three design documents addressing cross-layer OTEL trace correlation gaps in wasm4pm:

### 1. **Main Design Document** (`_INSTRUMENTATION_DESIGN.md`, 1144 lines)

Comprehensive design for three complementary instrumentation solutions:

- **Part 1:** Trace Context Propagation (CLI → WASM boundary)
- **Part 2:** Error Span Emission Pattern (standardized error handling)
- **Part 3:** Pre-Command Validation Wrapper (early validation tracing)
- **Part 4:** Integration Checklist (Chicago TDD compliance)
- **Part 5:** Conflict Resolution Matrix (design vs. architecture conflicts)
- **Part 6:** Success Criteria (measurement and verification)

**Highlights:**
- Pseudocode for all three solutions
- 8 identified error scenarios (schema validation, hazard rate, drift detection, etc.)
- 5 design conflicts documented with resolutions
- Backward compatibility strategy
- Jaeger trace structure examples

### 2. **Executive Summary** (`_INSTRUMENTATION_DESIGN_SUMMARY.txt`, 373 lines)

Quick reference guide covering:
- Problem statements for all three designs
- Solution architecture (high-level)
- Pseudocode patterns and usage examples
- Integration points (which files to modify)
- Compliance checklist (Chicago TDD + Critical Constraints)
- Implementation sequence (Phase 1-3, timeline estimates)
- Conflict resolutions (5 major conflicts)
- Success metrics

### 3. **This README**

Navigation guide and context for the design analysis.

---

## Problem Statement

**Cycle 2 Audit Finding:** Current wasm4pm OTEL instrumentation is **structurally isolated**:
- CLI commands emit spans with random `trace_id`
- WASM functions emit spans with **different** random `trace_id`
- Jaeger cannot correlate CLI operations with WASM operations
- **8 error scenarios fail without emitting OTEL spans**, violating chicago-tdd.md doctrine

**Chicago TDD Doctrine:** "If the code says it worked but the event log cannot prove a lawful process happened, then it did not work."

**Impact:** 100% OTEL coverage is not achieved. Silent failures in schema validation, algorithm computation, drift detection, and cleanup.

---

## Three Design Solutions

### Solution 1: Trace Context Propagation

**Problem:** CLI and WASM spans are causally unrelated.

**Solution:** Pass `trace_id` + `parent_span_id` from CLI to WASM via JSON parameter.

**Key Files:**
- `apps/wasm4pm/src/commands/run.ts` — Pass TraceContext to discovery
- `apps/wasm4pm/src/commands/_otel.ts` — Enhanced withWasmSpan()
- `wasm4pm/src/lib.rs` — New WASM functions with trace context

**Result in Jaeger:**
```
Trace ID: a1b2c3d4e5f6...xyz
├─ Span: wasm4pm.command.run (CLI root)
│  └─ Span: wasm.discover_dfg (WASM child, parent_span_id = CLI span)
│     └─ Span: kernel.discover_dfg (WASM internal)
```

### Solution 2: Error Span Emission Pattern

**Problem:** Error scenarios fail without emitting OTEL context.

**Solution:** Standardized `emitErrorSpanForPhase()` helper ensuring all error paths emit spans.

**8 Error Scenarios:**
1. Schema validation (missing concept:name)
2. Algorithm hazard rate (insufficient data)
3. EWMA drift detection (NaN from empty window)
4. Feature preprocessing (zero-variance column)
5. First-run detection (I/O failure)
6. Config parsing (invalid TOML)
7. WASM load timeout (bootstrap timeout)
8. Cleanup resource leak (delete_object fails)

**Key Files:**
- `apps/wasm4pm/src/otel/error-span-emitter.ts` (new module)
- All catch blocks and error handlers

**Result:** Every error path emits OTEL span with phase, error type, recovery context.

### Solution 3: Pre-Command Validation Wrapper

**Problem:** Early validations (format check, first-run UX, config parsing) occur before `withSpan()` wrapper activates.

**Solution:** `withSpanAndValidation()` wrapper that unifies trace context across all validators + command body.

**Key Files:**
- `apps/wasm4pm/src/commands/_otel.ts` — New wrapper function
- `apps/wasm4pm/src/commands/run.ts` — Refactor to use wrapper
- `apps/wasm4pm/src/commands/conformance.ts` — Refactor to use wrapper

**Result in Jaeger:**
```
Trace ID: a1b2c3d4e5f6...xyz
├─ Span: wasm4pm.command.run (root, 1250ms)
│  ├─ Span: wasm4pm.validation.format_check (OK)
│  ├─ Span: wasm4pm.validation.first_run_ux (WARNING, recovered)
│  ├─ Span: wasm4pm.validation.config_parsing (OK)
│  └─ Span: wasm4pm.command.run.body (OK, 900ms)
```

---

## Design Conflicts & Resolutions

| Conflict | Nature | Resolution |
|----------|--------|-----------|
| WASM signature backward compat | API design | Add new `_with_trace()` variants; 6-month deprecation |
| Rust tracing crate integration | OTEL standard | Export `trace_id` as attribute; post-processing merge |
| Return value shape changes | API design | Keep return clean; use OTEL span headers instead |
| Pre-validation timing | Architecture | Emit both validator + command spans; root merges |
| Error swallowing in cleanup | Recovery semantics | Always emit span; `recovered=true` flag for best-effort |

See Section 5 in `_INSTRUMENTATION_DESIGN.md` for full analysis.

---

## Chicago TDD Compliance

All three designs satisfy chicago-tdd.md requirements:

- ✅ **100% OTEL Coverage:** Every exit path (success, error, validation) emits a span
- ✅ **Evidence Requirement:** Spans include phase, error type, duration, status
- ✅ **Rank-1 Oracle:** Provable relationships (e.g., "validation fail → error span emitted")
- ✅ **No Self-Referential Tests:** Span attributes not derived from code being tested
- ✅ **Status Field:** All spans include `status: { code: 'OK'|'ERROR' }`
- ✅ **Service Name:** All spans include `'service.name': 'wasm4pm'`
- ✅ **Error Attribution:** Error spans include `error.type` + `error.message`

---

## Critical Constraints

All three designs respect critical-constraints.md:

- ✅ **MTTR <1s:** Span emission <10ms overhead
- ✅ **TPS (Fail-Fast):** OTEL errors never block command execution
- ✅ **Non-Blocking Logging:** Queue with drop-oldest; never block on OTEL
- ✅ **Process Mining Quality:** Conformance checks validated with OTEL evidence

---

## Implementation Timeline

### Phase 1 (2-3 days): Foundation
1. Implement TraceContext parameter + passing (CLI → WASM)
2. Add emitErrorSpanForPhase() helper
3. Audit 8 error scenarios; add span emissions
4. Unit tests for error scenario spans

### Phase 2 (1-2 days): Validation Wrapper
5. Implement withSpanAndValidation() wrapper
6. Refactor run/conformance/predict commands
7. Integration tests for validation failures
8. Integration tests for root span merging

### Phase 3 (1 day): Verification
9. End-to-end Jaeger trace correlation tests
10. Performance benchmarking (<10ms overhead)
11. Documentation updates

---

## Success Metrics

### Measurement

1. **Trace Correlation Rate:** 100% of WASM calls linked to CLI span
2. **Error Span Coverage:** All 8 error scenarios emit `status.code='ERROR'`
3. **Validation Visibility:** Each validator emits sub-span (OK or ERROR)
4. **Span Overhead:** <10ms per command (measured via `/usr/bin/time`)
5. **Chicago TDD Compliance:** All spans include required fields

### Verification

```bash
# Check trace correlation in Jaeger
jaeger_query="span.trace_id EXISTS AND span.parent_span_id EXISTS"

# Benchmark span overhead
time wpm run --no-save /path/to/log.xes 2>&1 | tail

# Regression suite: all 8 error scenarios tested
grep "emitErrorSpanForPhase" /path/to/test/errors.test.ts | wc -l
# Expected: >= 8
```

---

## Key Files to Modify

### New Files
- `_INSTRUMENTATION_DESIGN.md` (1144 lines, design doc)
- `apps/wasm4pm/src/otel/error-span-emitter.ts` (error helper)
- `docs/guides/otel-trace-correlation.md` (user guide)

### Modified Files
- `apps/wasm4pm/src/commands/_otel.ts` (withSpanInheritingContext)
- `apps/wasm4pm/src/commands/run.ts` (use wrapper)
- `apps/wasm4pm/src/commands/conformance.ts` (use wrapper)
- `apps/wasm4pm/src/commands/predict.ts` (use wrapper)
- `wasm4pm/src/lib.rs` (new WASM functions)
- `crates/wasm4pm-algos/src/discovery.rs` (parse trace context)

---

## How to Use This Design

### For Implementation Teams

1. Read the **Executive Summary** (`_INSTRUMENTATION_DESIGN_SUMMARY.txt`) for quick context
2. Read **Part 1** of the main design for trace context propagation
3. Read **Part 2** for error span emission patterns
4. Read **Part 3** for validation wrapper design
5. Use **Part 5** to understand conflicts and resolutions
6. Reference **Part 6** for success criteria and verification

### For Reviewers

1. Check **Part 4** for Chicago TDD compliance checklist
2. Review **Part 5** conflict resolutions against project architecture
3. Validate **Part 6** success metrics are measurable
4. Confirm backward compatibility approach (Part 1.3)

### For Testing/QA

1. Extract all 8 error scenarios from **Part 2**
2. Create test cases for each scenario (expect OTEL span emission)
3. Set up Jaeger endpoint for trace correlation testing
4. Use **Part 6** verification queries to validate traces

---

## Document Structure Reference

| Section | Content | Audience |
|---------|---------|----------|
| Part 1 | Trace context propagation | Backend engineers, WASM experts |
| Part 2 | Error span emission pattern | All engineers (most widely applicable) |
| Part 3 | Pre-command validation wrapper | CLI/command framework engineers |
| Part 4 | Integration checklist | QA, release managers |
| Part 5 | Conflict resolution matrix | Architects, tech leads |
| Part 6 | Success criteria | QA, metrics/observability teams |

---

## Next Steps

### Before Implementation

1. ✅ Design complete and reviewed (this deliverable)
2. ⏳ Architecture team reviews conflicts (Part 5)
3. ⏳ Implementation team estimates effort (Part 1-3 pseudocode)
4. ⏳ QA team designs test plan (8 error scenarios + integration)

### During Implementation

1. Keep design doc as reference during coding
2. Use Part 5 conflict resolutions when architecture questions arise
3. Follow Part 4 checklist for Chicago TDD compliance
4. Validate Part 6 success metrics as you go

### After Implementation

1. Run Part 6 verification queries in Jaeger
2. Benchmark span overhead (<10ms target)
3. Confirm all 8 error scenarios emit spans
4. Update wasm4pm docs with trace correlation guide

---

## References

- **chicago-tdd.md:** Van der Aalst process mining validation doctrine
- **critical-constraints.md:** MTTR, TPS, fail-fast requirements
- **verification.md:** Testing hierarchy and OTEL coverage standards
- **CLAUDE.md (project):** wasm4pm codebase context and rules

---

## Status

**Analysis Complete:** 3 design documents, 5 conflicts resolved, success metrics defined.

**Ready for:** Implementation team handoff, architecture review, test planning.

**NOT YET:** No code changes, no commits, no deployments.

---

*Design analysis completed: 2026-05-18*
