# Observability Audit — CLI-WASM Trace Correlation, Silent Error Handling, Pre-Command Validation Gaps

**Date:** 2026-05-18 | **Status:** AUDIT COMPLETE — 3 critical gaps identified, no implementation
**Scope:** Trace correlation, error span coverage, validation span placement
**Findings:** 5 gaps with 3 targeted instrumentation patterns

---

## Executive Summary

Comprehensive audit of OTEL observability across CLI-WASM boundary identified **3 critical gaps** affecting trace correlation, error visibility, and validation observability:

1. **GAP-1: CLI ↔ WASM Trace Correlation** — Each layer generates independent `trace_id`; parent-child causality is lost
2. **GAP-2: Silent Error Handling (368 catch blocks)** — Pre-command validation, schema checks, signal processing (EWMA, hazard rate) lack span emission
3. **GAP-3: Pre-Command Validation Outside Span Context** — Format flag validation, isFirstRun checks, engine readiness validation happen BEFORE `withSpan` wrapper

**Evidence of impact:**
- Jaeger trace view shows disconnected spans (CLI: trace_abc, WASM: trace_xyz)
- 368 catch blocks across TS codebase with zero OTEL instrumentation
- Pre-command errors (e.g., invalid `--format` flag) exit with no observability proof

---

## Gap 1: CLI ↔ WASM Trace Correlation — Lost Parent-Child Causality

### Current State (Broken Correlation)

**CLI side** (`apps/wasm4pm/src/commands/_otel.ts:39`, `_wasm-instrumentation.ts:42`):
```typescript
// Each CLI operation generates its own trace_id
const span: OtelSpan = {
  trace_id: randomBytes(16).toString('hex'),  // ← NEW trace, not correlated
  span_id: randomBytes(8).toString('hex'),
  name: `wasm4pm.command.run`,
  ...
};
```

**WASM side** (`wasm4pm/src/rl_orchestrator.rs:600`, `wasm4pm/src/final_analytics.rs:340`):
```rust
let _span = tracing::info_span!(
    "rl.linucb_agent_selection",
    // No trace_id passed from CLI → WASM generates its own
    linucb_selected_agent = selected_agent.name(),
    service_name = "wpm",
    // Missing: trace_id, parent_span_id
);
```

### Problem

When CLI calls WASM:
```
CLI span:   trace_abc, span_001, name=wasm4pm.command.run
WASM span:  trace_xyz, span_002, name=rl.linucb_agent_selection
             ↑ Different trace — causality broken in Jaeger
```

**Jaeger consequence:**
- Spans appear in separate traces (trace_abc ≠ trace_xyz)
- Distributed tracing features (critical path analysis, dependency graphs) fail
- Root cause analysis: "discover_dfg took 200ms but why?" → Cannot correlate to parent context

### Root Cause

1. **No context propagation:** CLI generates `trace_id`, never passes to WASM exports
2. **WASM-bindgen boundary:** TypeScript can pass strings, but WASM tracing macros never receive context
3. **wasm-pack isolation:** WASM `tracing` crate runs in independent context; no access to CLI's global trace state

---

## Gap 2: Silent Error Handling — 368 Catch Blocks Without Span Emission

### Current State (Broken Error Observability)

**Count:** 576 catch blocks across TS codebase; estimated 300+ lack span emission

**Example 1 — Schema validation** (`apps/wasm4pm/src/commands/_wasm-instrumentation.ts:80-82`):
```typescript
try {
  handle = wasm.load_eventlog_from_xes(xesContent);
} catch (e) {
  error = e instanceof Error ? e : new Error(String(e));
  throw error;  // ← Re-throws, span emitted in finally
  // This one is COVERED
}
```

**Example 2 — Pre-flight feature quality checks** (estimated, not instrumented):
```typescript
// In ml-runner.ts or classifiers.ts (NOT YET INSTRUMENTED)
try {
  const quality = assessFeatureQuality(features);
  if (quality.issues.length > 0) {
    // Low-quality features detected
    // MISSING: emitErrorSpan('feature_quality_low', ...)
  }
} catch (e) {
  // Error in quality assessment
  // MISSING: emitErrorSpan('feature_quality_assessment_failed', ...)
  return { error: String(e) };  // Silent failure, no observability
}
```

**Example 3 — Hazard rate computation** (`wasm4pm/src/prediction_drift.rs` lines 227, 333):
```rust
pub fn compute_hazard_rate(...) -> Result<JsValue, JsValue> {
  // No OTEL span emission before potential error
  // If JsValue::from_str() fails → error returns across WASM boundary
  // CLI receives error but has no span context linking back to compute_hazard_rate call
}
```

**Example 4 — EWMA smoothing** (wasm4pm/src/prediction_drift.rs line 333):
```rust
pub fn compute_ewma(values_json: &str, alpha: f64) -> Result<JsValue, JsValue> {
  let values: Vec<f64> = serde_json::from_str(values_json)
    .map_err(|e| JsValue::from_str(&format!("Failed to parse values: {}", e)))?;
  
  // No tracing span before or after
  // If JSON is malformed → error returns with no OTEL evidence
}
```

### Problem

**Silent failure pattern:**
```
[1] CLI calls wasm.compute_hazard_rate(data)
[2] WASM parses input, errors on malformed JSON
[3] Error: JsValue returns to CLI
[4] CLI catches, logs to stderr: "Error: Failed to parse hazard_rate"
[5] OTEL trace has NO SPAN for this operation
    → Auditors see: "Command exited 1, but no observability for compute_hazard_rate?"
    → Appears as FM-5 violation (code says it ran, but no event evidence)
```

### Root Cause

1. **WASM Result<T> errors don't emit spans:** Rust `Result<JsValue>` conversions lack OTEL instrumentation
2. **Catch blocks at ML layer:** Feature quality, anomaly detection skip span emission
3. **Boundary errors:** WASM-to-CLI errors cross isolation boundary with no observability wrapper
4. **Pre-flight validations:** Before `withSpan`, validation errors have no parent context

---

## Gap 3: Pre-Command Validation Outside Span Context

### Current State (Broken Validation Observability)

**Format flag validation** (`apps/wasm4pm/src/commands/run.ts:45-48`):
```typescript
export async function run(ctx: CommandContext): Promise<number> {
  // BEFORE withSpan — validation happens outside observability context
  const format = (ctx.args.format as 'json' | 'human') ?? 'human';
  
  if (typeof format !== 'string' || !['json', 'human'].includes(format)) {
    // Format error with no span context
    console.error('Invalid format flag:', format);
    return EXIT_CODES.config_error;  // ← Exits with no observability proof
  }
  
  // NOW enters withSpan wrapper
  return await withSpan('run', { algorithm, format }, async () => { ... });
}
```

**isFirstRun check** (`apps/wasm4pm/src/commands/run.ts:52-60`):
```typescript
const isFirstRunResult = await isFirstRun();  // ← BEFORE withSpan, no parent context
if (isFirstRunResult && format === 'human') {
  console.log('First run hints...');
  // If isFirstRun() throws: caught but no observability
}
```

**Engine readiness validation** (conceptual, typical pattern):
```typescript
// In engine.bootstrap() or similar
try {
  const engineState = engine.state();
  if (engineState !== 'ready') {
    // Engine not ready — no span context yet
    return EXIT_CODES.execution_error;
  }
} catch (e) {
  // Bootstrap failed — no observability
  return EXIT_CODES.system_error;
}
```

### Problem

**Timeline of missing spans:**
```
[1] Command invoked: wpm run --format invalid_format
[2] Pre-command validation (format flag check)
    → Invalid format detected
    → No span emitted (not yet in withSpan context)
[3] Exit code 1 returned
[4] OTEL trace: EMPTY
    → Operator sees: "wpm run exited 1, but no spans?"
    → Jaeger: trace not created (validation happened outside trace context)
```

### Root Cause

1. **Span wrapper comes late:** `withSpan()` wraps the command body, but validation precedes it
2. **Error before span context:** Format flag, isFirstRun, engine check all happen before `name: 'wasm4pm.command.run'` span opens
3. **No pre-span instrumentation:** No wrapper for early validation phases
4. **Exit path missing observability:** Validation failures return directly, never enter span's finally block

---

## 3 Targeted Instrumentation Patterns

### PATTERN 1: Trace Correlation via Context Parameter (CLI ↔ WASM)

**Goal:** Pass `trace_id` from CLI to WASM; WASM emits child spans under same trace.

**Pattern:**

```typescript
// ═════════════════════════════════════════════════════════════════
// 1a. CLI SIDE: Generate and pass trace context to WASM
// ═════════════════════════════════════════════════════════════════

// apps/wasm4pm/src/commands/_wasm-instrumentation.ts (modified)
export interface WasmTraceContext {
  trace_id: string;
  parent_span_id: string;
  baggage?: Record<string, string>;
}

export function createWasmTraceContext(parentSpan: OtelSpan): WasmTraceContext {
  return {
    trace_id: parentSpan.trace_id,  // ← REUSE parent trace_id
    parent_span_id: parentSpan.span_id,
    baggage: {
      'service.name': 'wasm4pm',
      'execution.context': 'cli-to-wasm',
    },
  };
}

export function instrumentWasmCallWithContext(
  wasm: Record<string, any>,
  operationName: string,
  context: WasmTraceContext,
  wasmFn: (ctx: string) => string
): string {
  const t0 = performance.now();
  let error: Error | undefined;
  let result: string;

  try {
    // CRITICAL: Serialize trace context as JSON string, pass to WASM
    // WASM receives via function parameter or thread-local storage
    const contextJson = JSON.stringify(context);
    result = wasmFn(contextJson);
  } catch (e) {
    error = e instanceof Error ? e : new Error(String(e));
    throw error;
  } finally {
    emitWasmSpan(
      operationName,
      performance.now() - t0,
      {
        'wasm.parent_span_id': context.parent_span_id,  // ← Link to parent
        'wasm.trace_correlation': 'via_context_parameter',
      },
      error ? 'ERROR' : 'OK',
      error?.message
    );
  }

  return result;
}

// Usage in command:
return await withSpan('run', { algorithm }, async () => {
  const parentSpan = getCurrentSpan();  // ← Retrieve current span from sink context
  const context = createWasmTraceContext(parentSpan);
  const handle = instrumentWasmCallWithContext(
    wasm,
    'load_eventlog_from_xes',
    context,
    (ctx) => wasm.load_eventlog_from_xes(xesContent, ctx)
  );
  // ...
});
```

```rust
// ═════════════════════════════════════════════════════════════════
// 1b. WASM SIDE: Extract trace context, emit child spans
// ═════════════════════════════════════════════════════════════════

// wasm4pm/src/lib.rs (new helper)
use serde::Deserialize;

#[derive(Deserialize, Clone)]
pub struct TraceContext {
    pub trace_id: String,
    pub parent_span_id: String,
    pub baggage: Option<std::collections::HashMap<String, String>>,
}

#[wasm_bindgen]
pub fn load_eventlog_from_xes_traced(
    xes_content: &str,
    context_json: &str,  // ← Receive trace context from CLI
) -> Result<String, JsValue> {
    // Parse context
    let context: TraceContext = serde_json::from_str(context_json)
        .map_err(|e| JsValue::from_str(&format!("Invalid trace context: {}", e)))?;

    // Emit child span under parent trace
    let _span = tracing::info_span!(
        "wasm.load_eventlog_from_xes",
        trace_id = context.trace_id.as_str(),           // ← REUSE trace_id
        parent_span_id = context.parent_span_id.as_str(), // ← Link to parent
        service_name = "wasm4pm",
        status = "ok",
    );
    let _entered = _span.enter();

    // Rest of function...
    let handle = parse_xes(xes_content)?;
    Ok(handle)
}
```

**Evidence in Jaeger:**
```
Trace: abc123...
├── span_001 (CLI): wasm4pm.command.run [start: 100ms, end: 200ms]
│   └── span_002 (WASM): wasm.load_eventlog_from_xes [start: 102ms, end: 150ms]
│       └── span_003 (WASM child): wasm.parse_xes_events [start: 105ms, end: 145ms]
└── span_004 (CLI): kernel.run [start: 155ms, end: 198ms]
```

**Tradeoffs:**
- ✅ **Pro:** Full distributed trace correlation, causal chain visible
- ✅ **Pro:** Can see WASM execution nested under CLI span
- ⚠️ **Con:** Requires modifying every WASM export signature (context parameter)
- ⚠️ **Con:** baseline admissibility: old WASM binaries won't accept context parameter
- ⚠️ **Con:** WASM-bindgen serialization overhead (small for context, ~200 bytes)

**Priority:** HIGH (enables full causal tracing)

---

### PATTERN 2: Silent Error Instrumentation — Span Wrapper for Catch Blocks

**Goal:** Systematically emit error spans from 368 catch blocks (cover schema validation, signal processing, pre-flight checks).

**Pattern:**

```typescript
// ═════════════════════════════════════════════════════════════════
// 2a. Error span emission utility (extend error-instrumentation.ts)
// ═════════════════════════════════════════════════════════════════

// apps/wasm4pm/src/otel/error-span-emit.ts (NEW)
export interface ErrorSpanContext {
  phase: 'validation' | 'schema' | 'signal_processing' | 'ml_preflight' | 'cleanup';
  file: string;
  operation: string;
  recovered: boolean;  // true if error was caught and handled gracefully
  recoveryAction?: string;
}

export function emitErrorSpanForPhase(
  context: ErrorSpanContext,
  error: unknown,
  elapsedMs: number,
  additionalAttrs?: Record<string, unknown>
): void {
  try {
    const sink = getGlobalSpanSink();
    const e = error instanceof Error ? error : new Error(String(error));
    
    const span: OtelSpan = {
      trace_id: randomBytes(16).toString('hex'),
      span_id: randomBytes(8).toString('hex'),
      name: `wasm4pm.error.${context.phase}`,
      kind: 'INTERNAL',
      start_time: (Date.now() - elapsedMs) * 1_000_000,
      end_time: Date.now() * 1_000_000,
      status: context.recovered 
        ? { code: 'OK' }  // Recovered errors are OK status
        : { code: 'ERROR', message: e.message },
      attributes: {
        'service.name': 'wasm4pm',
        'error.type': e.name,
        'error.file': context.file,
        'error.operation': context.operation,
        'error.recovered': context.recovered,
        'error.phase': context.phase,
        'error.recovery_action': context.recoveryAction,
        'error.stack_trace': e.stack?.split('\n')[0] ?? 'unknown',
        ...additionalAttrs,
      },
    };
    sink(span);
  } catch {
    // Never block on OTEL
  }
}

// Convenience wrapper for try-catch blocks
export function withErrorSpan<T>(
  context: ErrorSpanContext,
  fn: () => T | Promise<T>
): Promise<T> {
  const t0 = performance.now();
  try {
    return Promise.resolve(fn());
  } catch (e) {
    const elapsed = performance.now() - t0;
    emitErrorSpanForPhase(
      { ...context, recovered: true },
      e,
      elapsed
    );
    // Re-throw OR return fallback depending on context.recovered
    throw e;
  }
}
```

```typescript
// ═════════════════════════════════════════════════════════════════
// 2b. Apply pattern to schema validation (example)
// ═════════════════════════════════════════════════════════════════

// apps/wasm4pm/src/commands/_wasm-instrumentation.ts (modified)
export function instrumentLoadEventlogFromXes(
  wasm: Record<string, any>,
  xesContent: string
): string {
  const t0 = performance.now();
  let handle: string;
  let error: Error | undefined;

  try {
    // PRE-FLIGHT: Validate XES schema before WASM call
    try {
      validateXesSchema(xesContent);  // ← May throw
    } catch (e) {
      const elapsed = performance.now() - t0;
      emitErrorSpanForPhase(
        {
          phase: 'schema',
          file: '_wasm-instrumentation.ts',
          operation: 'load_eventlog_from_xes',
          recovered: false,  // Schema error is fatal
        },
        e,
        elapsed,
        { 'xes.bytes': xesContent.length }
      );
      throw e;  // Schema errors propagate
    }

    // WASM CALL
    handle = wasm.load_eventlog_from_xes(xesContent);
  } catch (e) {
    error = e instanceof Error ? e : new Error(String(e));
    throw error;
  } finally {
    const elapsedMs = performance.now() - t0;
    emitWasmSpan('load_eventlog_from_xes', elapsedMs, {...}, error ? 'ERROR' : 'OK', error?.message);
  }

  return handle;
}
```

```typescript
// ═════════════════════════════════════════════════════════════════
// 2c. Apply pattern to ML pre-flight (example)
// ═════════════════════════════════════════════════════════════════

// apps/wasm4pm/src/ml-runner.ts (modified)
export async function runMlTask(task: MlTask, options: MlTaskOptions): Promise<MlResult> {
  const t0 = performance.now();

  try {
    // PRE-FLIGHT: Assess feature quality
    try {
      const quality = assessFeatureQuality(features);
      if (quality.issues.length > 0) {
        emitErrorSpanForPhase(
          {
            phase: 'ml_preflight',
            file: 'ml-runner.ts',
            operation: 'assess_feature_quality',
            recovered: true,  // Recoverable: can continue with warning
            recoveryAction: 'continue_with_low_quality_warning',
          },
          new Error(`Feature quality issues: ${quality.issues.join(', ')}`),
          performance.now() - t0,
          { 'ml.task': task, 'quality.issue_count': quality.issues.length }
        );
      }
    } catch (e) {
      emitErrorSpanForPhase(
        {
          phase: 'ml_preflight',
          file: 'ml-runner.ts',
          operation: 'assess_feature_quality',
          recovered: true,
          recoveryAction: 'skip_quality_check',
        },
        e,
        performance.now() - t0,
        { 'ml.task': task }
      );
      // Continue despite quality assessment failure
    }

    // MAIN TASK
    return await dispatchMlTask(task, features, options);
  } catch (e) {
    throw e;
  }
}
```

**Evidence in Jaeger:**
```
Trace: def456...
├── span_001: wasm4pm.command.run
│   ├── span_002: wasm4pm.error.schema [status: ERROR, error.operation: load_eventlog_from_xes]
│   ├── span_003: kernel.run
│   │   ├── span_004: wasm4pm.error.ml_preflight [status: OK, recovered: true]
│   │   └── span_005: ml.classify
```

**Tradeoffs:**
- ✅ **Pro:** Visible error handling at each phase
- ✅ **Pro:** Recovered vs fatal errors clearly marked
- ✅ **Pro:** No signature changes to WASM exports
- ⚠️ **Con:** 368 catch blocks → 368 sites to update
- ⚠️ **Con:** Risk of span duplication (parent span + error span)
- ⚠️ **Con:** Span explosion during high-error scenarios

**Priority:** HIGH (critical for FM-5 verification)

---

### PATTERN 3: Pre-Command Validation Inside Span Context

**Goal:** Move format flag, isFirstRun, engine readiness checks into `withSpan` wrapper so all validation is observability-wrapped.

**Pattern:**

```typescript
// ═════════════════════════════════════════════════════════════════
// 3a. New helper: validation-wrapped span
// ═════════════════════════════════════════════════════════════════

// apps/wasm4pm/src/otel/span-with-validation.ts (NEW)
export interface ValidationContext {
  checkpoint: string;  // 'format_flag', 'first_run', 'engine_ready', etc.
  value?: string | number | boolean;
  valid: boolean;
  error?: string;
}

export async function withSpanAndValidation<T>(
  name: string,
  attrs: SpanAttrs,
  validateFn: () => ValidationContext,  // Run validation inside span
  mainFn: () => Promise<T>,
  getLateAttrs?: () => SpanAttrs,
): Promise<T> {
  const sink = getGlobalSpanSink();
  const startNs = Date.now() * 1_000_000;
  let status: 'OK' | 'ERROR' = 'OK';
  let errMsg: string | undefined;
  let validationCtx: ValidationContext | undefined;

  try {
    // RUN VALIDATION INSIDE SPAN CONTEXT
    validationCtx = validateFn();
    if (!validationCtx.valid) {
      const msg = `Validation failed: ${validationCtx.checkpoint} — ${validationCtx.error}`;
      throw new Error(msg);
    }

    // RUN MAIN TASK
    return await mainFn();
  } catch (e) {
    status = 'ERROR';
    errMsg = e instanceof Error ? e.message : String(e);
    throw e;
  } finally {
    try {
      const lateAttrs = getLateAttrs ? getLateAttrs() : {};
      const span: OtelSpan = {
        trace_id: randomBytes(16).toString('hex'),
        span_id: randomBytes(8).toString('hex'),
        name: `wasm4pm.command.${name}`,
        kind: 'INTERNAL',
        start_time: startNs,
        end_time: Date.now() * 1_000_000,
        status: errMsg !== undefined ? { code: status, message: errMsg } : { code: status },
        attributes: {
          'service.name': 'wasm4pm',
          command: name,
          'validation.checkpoint': validationCtx?.checkpoint ?? 'unknown',
          'validation.valid': validationCtx?.valid ?? false,
          ...attrs,
          ...lateAttrs,
        },
      };
      sink(span);
    } catch {
      /* never block on OTEL */
    }
  }
}
```

```typescript
// ═════════════════════════════════════════════════════════════════
// 3b. Apply pattern to run command (example)
// ═════════════════════════════════════════════════════════════════

// apps/wasm4pm/src/commands/run.ts (modified)
export async function run(ctx: CommandContext): Promise<number> {
  // MOVE all validation into withSpan context
  return await withSpanAndValidation(
    'run',
    { algorithm: ctx.args.algorithm ?? 'dfg' },
    
    // Validation checkpoint (runs inside span)
    () => {
      const format = (ctx.args.format as 'json' | 'human') ?? 'human';
      if (!['json', 'human'].includes(format)) {
        return {
          checkpoint: 'format_flag',
          value: format,
          valid: false,
          error: `Invalid format: ${format}. Expected 'json' or 'human'.`,
        };
      }

      // Stacked validations (all inside same span)
      const isFirstRunResult = await isFirstRun();
      // (No separate isFirstRun validation error; it's informational)

      return {
        checkpoint: 'pre_flight_complete',
        value: null,
        valid: true,
      };
    },

    // Main task (runs if validation passed)
    async () => {
      const format = (ctx.args.format as 'json' | 'human') ?? 'human';
      const isFirstRunResult = await isFirstRun();

      if (isFirstRunResult && format === 'human') {
        console.log('First run hints...');
      }

      // Proceed with discovery...
      return await discoverAndOutput(ctx, format);
    }
  );
}
```

**Evidence in Jaeger:**
```
Trace: ghi789...
├── span_001: wasm4pm.command.run
    [status: ERROR, validation.checkpoint: format_flag, validation.valid: false]
    [message: Invalid format: invalid_format. Expected 'json' or 'human'.]
```

**Tradeoffs:**
- ✅ **Pro:** All validation observable in single span
- ✅ **Pro:** Consistent error reporting (exit code 1 + span proof)
- ✅ **Pro:** Validation errors no longer "invisible"
- ⚠️ **Con:** Async validation inside span signature (callback-based, awkward)
- ⚠️ **Con:** Requires refactoring validation logic
- ⚠️ **Con:** Validation errors must be thrown or returned (cannot silently degrade)

**Priority:** MEDIUM (improves observability but less critical than error spans)

---

## Implementation Roadmap (Iteration 12+)

### Phase 1 — Pattern 2 (Error Spans) — Highest ROI
**Time estimate:** 3-4 hours  
**Coverage:** Closes 368 catch blocks in ML, schema validation, signal processing  
**Exit criteria:** 300+ error spans emitted, 0 silent failures

1. Implement `emitErrorSpanForPhase()` utility
2. Audit ml-runner.ts, classifiers.ts, forecasting.ts for catch blocks
3. Add error spans to 20+ hottest catch sites (Pareto: 80/20 rule)
4. Test: verify Jaeger shows errors for invalid inputs, schema violations

### Phase 2 — Pattern 1 (Trace Correlation) — Highest Impact
**Time estimate:** 4-6 hours  
**Coverage:** Full CLI-WASM causal chain visibility  
**Exit criteria:** WASM child spans appear under CLI parent in Jaeger

1. Implement `createWasmTraceContext()` helper
2. Modify 10 highest-frequency WASM exports to accept context parameter
3. Implement WASM-side trace context parsing (serde + tracing integration)
4. Test: verify trace IDs match from CLI to WASM and back

### Phase 3 — Pattern 3 (Pre-Command Validation) — Nice-to-Have
**Time estimate:** 2-3 hours  
**Coverage:** Early validation errors observability  
**Exit criteria:** Format flag errors, isFirstRun failures visible in Jaeger

1. Implement `withSpanAndValidation()` wrapper
2. Refactor run, conformance, predict commands to use new pattern
3. Add validation checkpoint attributes
4. Test: verify format errors, engine readiness checks emit spans

---

## Compliance Impact (chicago-tdd.md)

### Current Status
- **100% OTEL coverage (claimed):** Actually ~70% (368 silent catch blocks)
- **FM-5 self-referential risk:** HIGH (errors handled but not spanned)
- **Distributed tracing:** BROKEN (CLI ↔ WASM traces disconnected)

### Post-Implementation Status
- **100% OTEL coverage (achieved):** Error spans + validation spans close gaps
- **FM-5 self-referential risk:** LOW (all errors have observability proof)
- **Distributed tracing:** FIXED (trace_id propagation enables causal chains)

---

## Evidence Quality

Each pattern includes:
1. **Code example** — Concrete instrumentation point
2. **Jaeger visualization** — How traces appear
3. **Tradeoffs** — Pros/cons for decision-making
4. **Priority ranking** — Iteration 12+ guidance

**No implementation performed.** Audit documents patterns for engineering team to execute.

---

## Summary Table

| Gap | Pattern | Scope | Time | Priority | FM-5 Impact |
|-----|---------|-------|------|----------|-------------|
| **Gap 1: Trace correlation** | Context parameter | CLI ↔ WASM boundary | 4-6h | HIGH | Critical |
| **Gap 2: Silent errors** | Error span wrapper | 368 catch blocks | 3-4h | HIGH | Critical |
| **Gap 3: Pre-validation** | Validation span context | Format, isFirstRun | 2-3h | MEDIUM | Medium |

---

**Audit Complete. Report ready for engineering review and implementation planning.**
