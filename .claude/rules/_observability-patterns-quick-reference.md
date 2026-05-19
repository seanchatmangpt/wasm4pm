# Observability Instrumentation Patterns — Quick Reference

**Reference:** `.claude/rules/_observability-audit-findings.md` (full audit with examples)

---

## 3 Patterns at a Glance

### Pattern 1: Trace Correlation (CLI ↔ WASM)

```typescript
// CLI: Generate context, pass to WASM
const context = { trace_id, parent_span_id };
const result = wasm.discover_dfg(xes, JSON.stringify(context));

// WASM: Parse context, emit child span under same trace_id
const ctx: TraceContext = JSON.parse(context_json);
tracing::info_span!("wasm.discover_dfg", trace_id = ctx.trace_id, ...);
```

**Benefit:** Jaeger shows parent → child span hierarchy  
**Cost:** 4-6 hours; requires WASM signature changes  
**Priority:** HIGH (critical path visibility)

---

### Pattern 2: Error Span Emission (Silent Catches → Visible Errors)

```typescript
// Wrap catch blocks with span emission
try {
  validateXesSchema(xes);  // May throw
} catch (e) {
  emitErrorSpanForPhase(
    { phase: 'schema', recovered: false },
    e,
    elapsed,
    { 'xes.bytes': xes.length }
  );
  throw e;
}
```

**Benefit:** All 368 catch blocks emit observability proof  
**Cost:** 3-4 hours; Pareto: instrument 20 hottest sites first  
**Priority:** HIGH (FM-5 verification)

---

### Pattern 3: Pre-Command Validation Inside Span

```typescript
// Move validation into withSpan context
return await withSpanAndValidation('run', attrs,
  () => {  // Validation runs INSIDE span
    const format = ctx.args.format;
    if (!['json', 'human'].includes(format)) {
      return { valid: false, error: `Invalid format: ${format}` };
    }
    return { valid: true };
  },
  async () => { ... }  // Main task runs if valid
);
```

**Benefit:** Format errors, engine readiness visible in Jaeger  
**Cost:** 2-3 hours; UI refactoring (async validation in callback)  
**Priority:** MEDIUM (nice-to-have for early validation)

---

## Audit Summary

| Finding | Current | After Implementation |
|---------|---------|----------------------|
| CLI ↔ WASM trace correlation | Broken (separate trace_ids) | Fixed (same trace_id) |
| Error observability | 368 silent catches | ~300+ error spans |
| Pre-validation observability | Hidden (before span) | Visible (inside span) |
| FM-5 compliance | ~70% coverage | 100% coverage |

---

## Execution Order (Iteration 12+)

1. **Phase 1 (Week 1):** Pattern 2 (error spans) — highest ROI
2. **Phase 2 (Week 2):** Pattern 1 (trace correlation) — highest impact
3. **Phase 3 (Week 3):** Pattern 3 (validation spans) — polish

---

**See `_observability-audit-findings.md` for full code examples, tradeoffs, and implementation details.**
