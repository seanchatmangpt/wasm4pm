# OTEL Cross-Layer Trace Correlation — Design Document

**Date:** 2026-05-18  
**Scope:** Cycle 2 findings remediation — distributed trace context propagation from CLI to WASM  
**Status:** DESIGN PHASE (analysis only, no implementation)  
**Compliance:** chicago-tdd.md §100% OTEL coverage; critical-constraints.md §OTEL coverage

---

## Executive Summary

Current wasm4pm OTEL instrumentation is **structurally isolated**: CLI commands emit spans with random `trace_id` (line 39 in `_otel.ts`), WASM functions emit their own spans with different `trace_id` values, and cross-layer causality is lost. This design document proposes three complementary solutions to unify trace context across the CLI→WASM boundary:

1. **Trace Context Propagation** — Pass CLI-generated `trace_id` + `parent_span_id` to WASM via JSON parameter; WASM parses and uses them in child spans
2. **Error Span Emission Pattern** — Standardized `emitErrorSpanForPhase()` helper ensuring all error paths emit OTEL context before exiting
3. **Pre-Command Validation Wrapper** — `withSpanAndValidation()` wrapper trapping early validations (format checks, first-run, config) and emitting span context for all exit paths

**Problem Statement:** Cycle 2 audit identified that 8 error scenarios (schema validation, algorithm hazard rate, EWMA drift detection, ML preprocessing) fail without emitting OTEL spans. Chicago TDD doctrine requires 100% OTEL coverage: "if the code says it worked but the trace cannot prove it, then it didn't work."

**Design Goal:** Ensure every exit path (success, error, validation failure) emits a **linked, causally-traced OTEL span** with sufficient context for post-mortem analysis.

---

## Part 1: Trace Context Propagation (CLI → WASM → Return)

### 1.1 Problem Analysis

**Current State (Broken Causality):**

```
CLI: withSpan('run', ...) {
  trace_id = <random-16-bytes>          ← CLI generates random ID
  span_id = <random-8-bytes>
  name = 'wasm4pm.command.run'
  attributes = { algorithm: 'dfg', ... }
  
  WASM Call: wasm.discover_dfg(handle, key) {
    // WASM receives NO trace context
    // WASM emits spans with its OWN random trace_id
    trace_id = <DIFFERENT-random-16-bytes>  ← BROKEN: unrelated to CLI span
    span_id = <random-8-bytes>
    name = 'kernel.discover_dfg'
    ...
  }
  
  Return: WASM result → JSON
}
```

**Result:** CLI span and WASM span appear to be from two different distributed systems. Jaeger cannot correlate them.

**Root Cause:** WASM `#[wasm_bindgen]` functions receive only the algorithm result, not trace context. No mechanism to pass `trace_id` or `parent_span_id` from JavaScript to Rust-compiled WASM.

---

### 1.2 Design: TraceContext Parameter in WASM Input

**Proposed Solution:**

Extend the WASM discovery function input JSON to include optional `trace_context` field. WASM parses it and uses it in all emitted spans.

**Pseudocode — CLI Side:**

```typescript
// File: apps/wasm4pm/src/commands/run.ts

interface TraceContext {
  trace_id: string;        // 32-char hex from CLI root span
  parent_span_id: string;  // 16-char hex from CLI span
  baggage?: Record<string, string>;  // Optional: correlation IDs, user ID, etc.
}

async function runDiscoveryWithTraceContext(
  wasm: Record<string, any>,
  algo: Algorithm,
  logHandle: string,
  activityKey: string,
  traceCtx: TraceContext
): Promise<{ raw: unknown; elapsedMs: number }> {
  const t0 = performance.now();
  
  // Construct WASM input with trace context embedded
  const wasmInput = {
    log_handle: logHandle,
    activity_key: activityKey,
    algorithm: algo,
    trace_context: traceCtx,  // ← NEW: Pass trace context to WASM
  };
  
  // Call WASM with augmented input
  let raw: unknown;
  try {
    raw = withWasmSpan('discover_dfg', { algorithm: algo }, () =>
      wasm.discover_dfg_with_trace(JSON.stringify(wasmInput))
    );
  } catch (e) {
    // Error handling includes trace context
    emitErrorSpanForPhase('discovery', e, Date.now() - t0, {
      algorithm: algo,
      trace_id: traceCtx.trace_id,
      parent_span_id: traceCtx.parent_span_id,
    });
    throw e;
  }
  
  return { raw, elapsedMs: Date.now() - t0 };
}

// Usage in command's run() method:
await withSpan('run', { algorithm }, async () => {
  // Get trace context from current span
  const traceId = getActiveTraceId();  // ← NEW: retrieve active trace
  const parentSpanId = generateSpanId();
  
  const result = await runDiscoveryWithTraceContext(
    wasm,
    algorithm,
    logHandle,
    activityKey,
    { trace_id: traceId, parent_span_id: parentSpanId }
  );
  
  return result;
});
```

**Pseudocode — WASM Side (Rust):**

```rust
// File: wasm4pm/src/lib.rs or crates/wasm4pm-algos/src/discovery.rs

#[derive(Deserialize)]
struct TraceContext {
    trace_id: String,           // 32-char hex
    parent_span_id: String,     // 16-char hex
    #[serde(default)]
    baggage: Option<serde_json::Value>,
}

#[derive(Deserialize)]
struct DiscoveryInputWithTrace {
    log_handle: String,
    activity_key: String,
    algorithm: String,
    #[serde(default)]
    trace_context: Option<TraceContext>,
}

/// WASM boundary: receive trace context and use it in child spans.
#[wasm_bindgen]
pub fn discover_dfg_with_trace(input_json: &str) -> Result<JsValue, JsValue> {
    let input: DiscoveryInputWithTrace = serde_json::from_str(input_json)
        .map_err(|e| wasm_err(&format!("input schema rejected: {}", e)))?;

    // Extract trace context (if provided) or generate new one
    let trace_context = input.trace_context.unwrap_or_else(|| TraceContext {
        trace_id: generate_random_trace_id(),  // Fallback
        parent_span_id: generate_random_span_id(),
        baggage: None,
    });

    // All spans emitted during discovery inherit this trace context
    let _span = tracing::info_span!(
        "kernel.discover_dfg",
        trace_id = trace_context.trace_id.as_str(),
        parent_span_id = trace_context.parent_span_id.as_str(),
        algorithm = "dfg",
        log_handle = input.log_handle.as_str(),
        activity_key = input.activity_key.as_str(),
        service_name = "wasm4pm",
        status = "ok",
    );
    let _entered = _span.enter();

    // Execute discovery (existing logic)
    let result = discover_dfg_impl(
        &input.log_handle,
        &input.activity_key,
    ).map_err(|e| {
        // Error: emit error span with trace context
        let _error_span = tracing::error_span!(
            "kernel.discover_dfg.error",
            trace_id = trace_context.trace_id.as_str(),
            parent_span_id = trace_context.parent_span_id.as_str(),
            error = e.to_string().as_str(),
            service_name = "wasm4pm",
            status = "error",
        );
        let _e = _error_span.enter();
        wasm_err(&format!("discovery failed: {}", e))
    })?;

    // Return: include trace context in result for CLI correlation
    let return_value = serde_json::json!({
        "dfg": result,
        "_trace": {
            "trace_id": trace_context.trace_id,
            "span_id": generate_random_span_id(),
        },
    });

    to_js_str(&return_value)
}

// Helper: generate trace/span IDs (must match CLI format)
fn generate_random_trace_id() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let bytes: Vec<u8> = (0..16).map(|_| rng.gen()).collect();
    bytes.iter()
        .map(|b| format!("{:02x}", b))
        .collect::<String>()
}

fn generate_random_span_id() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let bytes: Vec<u8> = (0..8).map(|_| rng.gen()).collect();
    bytes.iter()
        .map(|b| format!("{:02x}", b))
        .collect::<String>()
}
```

**Integration Point — withWasmSpan Enhancement:**

```typescript
// File: apps/wasm4pm/src/commands/_otel.ts

export function withWasmSpan<T>(
  name: string,
  attrs: SpanAttrs,
  fn: () => T,
  getLateAttrs?: (result: T) => SpanAttrs,
  traceContext?: TraceContext,  // ← NEW: optional trace context
): T {
  const sink = getGlobalSpanSink();
  const startNs = Date.now() * 1_000_000;
  const traceId = traceContext?.trace_id ?? randomBytes(16).toString('hex');
  const spanId = traceContext?.parent_span_id ?? randomBytes(8).toString('hex');
  
  // ... existing span logic, but:
  const span: OtelSpan = {
    trace_id: traceId,              // ← Use provided trace context
    span_id: randomBytes(8).toString('hex'),  // New child span ID
    parent_span_id: spanId,         // ← Link to WASM parent
    name: `wasm.${name}`,
    kind: 'INTERNAL',
    start_time: startNs,
    end_time: Date.now() * 1_000_000,
    status: errMsg !== undefined ? { code: status, message: errMsg } : { code: status },
    attributes: {
      'service.name': 'wasm4pm',
      'trace.context': 'inherited-from-cli',  // Indicate correlation
      ...attrs,
      ...lateAttrs,
    },
  };
  sink(span);
  
  return result;
}
```

**Result in Jaeger:**

```
Trace ID: a1b2c3d4e5f6...xyz
├─ Span: wasm4pm.command.run (CLI root)
│  └─ Span: wasm.discover_dfg (WASM child, parent_span_id = CLI span ID)
│     └─ Span: kernel.discover_dfg (WASM internal, parent_span_id = wasm child)
│        └─ Event: process_edge_count = 5
│        └─ Event: trace_count = 100
└─ Span: wasm4pm.command.run.cleanup (CLI cleanup child)
```

---

### 1.3 Conflict Analysis: Existing Architecture vs. Design

**Conflict 1: WASM Functions Don't Accept Extra Parameters**

*Issue:* Current `#[wasm_bindgen]` functions are `pub fn discover_dfg(handle: &str, activity_key: &str)`. Adding a third `trace_context_json` parameter breaks the existing signature.

*Resolution:* 
- Option A: Keep existing function, add new `discover_dfg_with_trace()` variant. CLI calls new variant; old callers still work.
- Option B: Change signature to `discover_dfg_v2(input_json: &str)` containing `{ handle, activity_key, trace_context }`. Deprecate old function.
- **Recommended:** Option A (backward compatible). Phased migration: 6 months allow old functions, then sunset.

**Conflict 2: Rust Tracing Spans Don't Automatically Inherit JavaScript trace_id**

*Issue:* Rust's `tracing` crate emits spans independently. Setting `trace_id` as an attribute doesn't make OTLP exporter treat it as the canonical trace ID.

*Resolution:*
- Use explicit `tracing::Span::record()` to inject trace context into the span at creation time.
- If using OTLP exporter with propagator, the exporter must be configured to recognize `trace_id` attribute as the distributed trace ID (non-standard).
- **Recommended:** Export span name + custom `trace_id` attribute, let Jaeger/collector correlate via `trace_id` field in attributes (same as OTEL standard). Post-processing can merge spans by `trace_id`.

**Conflict 3: Return Value vs. WASM Result Serialization**

*Issue:* Existing WASM functions return `Result<JsValue, JsValue>` with JSON string. Adding `_trace` field changes the return shape, may break CLI parsers.

*Resolution:*
- **Recommended:** Emit trace context via OTEL span (normal path), don't pollute return value. Store trace correlation in optional header or trailer field (e.g., `X-Trace-ID` HTTP header for future HTTP transport). Keep return value backward-compatible.
- Alternative: Add optional `_metadata` field to return JSON (if not present, ignore). Requires CLI parser to strip it before processing.

---

## Part 2: Error Span Emission Pattern

### 2.1 Problem: Silent Failures Without Span Context

**Current State:**

Cycle 2 audit identified 8 error scenarios that fail without emitting OTEL spans:

| Phase | Location | Error Type | Current Behavior | Missing |
|-------|----------|-----------|-------------------|---------|
| Schema Validation | `run.ts:~300` | Missing required field (concept:name) | Return error exit code 2 | OTEL span |
| Algorithm Hazard Rate | `ml-runner.ts:~220` | Insufficient data for regression | Throw exception | OTEL error span |
| EWMA Drift Detection | `drift-watch.ts:~150` | NaN from empty window | Silent catch, continue | OTEL span + recovery context |
| Feature Preprocessing | `bridge.ts:~180` | Zero-variance column | Log warning, skip feature | OTEL warning span |
| First Run Detection | `first-run-ux.ts:~45` | File I/O fails checking marker | Fallback to false | OTEL error span |
| Config File Parse | `config/resolver.ts:~100` | Invalid TOML syntax | Throw SyntaxError | OTEL parse error span |
| WASM Load Timeout | `engine.ts:~200` | Bootstrap timeout exceeded | Throw TimeoutError | OTEL timeout span |
| Cleanup Resource Leak | `commands/run.ts:~500` | delete_object fails | Swallow error, continue | OTEL recovery span |

**Problem:** These errors occur before or after `withSpan()` wrapper activates. No trace context exists to correlate failures.

---

### 2.2 Design: emitErrorSpanForPhase() Helper

**Pseudocode:**

```typescript
// File: apps/wasm4pm/src/otel/error-span-emitter.ts

/**
 * Emit an OTEL error span for a specific phase, with optional recovery context.
 * Used when errors occur outside normal withSpan() wrappers.
 *
 * @param phase - Phase name (schema_validation, drift_detection, wasm_load, etc.)
 * @param error - The thrown error or error message
 * @param elapsedMs - How long the phase ran before failure
 * @param attributes - Phase-specific context (algorithm, data size, etc.)
 * @param options - Recovery/causality hints
 */
export function emitErrorSpanForPhase(
  phase: string,
  error: Error | string,
  elapsedMs: number,
  attributes: Record<string, string | number | boolean> = {},
  options?: {
    traceId?: string;         // Inherit trace context from parent
    parentSpanId?: string;
    recovered?: boolean;      // Whether error was caught and recovered
    severity?: 'warning' | 'error' | 'fatal';  // For alerting
    cause?: Error;            // Underlying error chain
  }
): void {
  const sink = getGlobalSpanSink();
  const startNs = Date.now() * 1_000_000;
  const endNs = startNs + elapsedMs * 1_000_000;  // Backdate to actual duration
  
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorType = error instanceof Error
    ? error.constructor.name
    : typeof error === 'string' ? 'StringError' : 'UnknownError';

  const span: OtelSpan = {
    trace_id: options?.traceId ?? randomBytes(16).toString('hex'),
    span_id: randomBytes(8).toString('hex'),
    parent_span_id: options?.parentSpanId,
    name: `wasm4pm.phase.${phase}.error`,  // e.g., wasm4pm.phase.schema_validation.error
    kind: 'INTERNAL',
    start_time: startNs,
    end_time: endNs,
    status: {
      code: options?.severity === 'warning' ? 'UNSET' : 'ERROR',
      message: errorMessage,
    },
    attributes: {
      'service.name': 'wasm4pm',
      'phase': phase,
      'error.type': errorType,
      'error.message': errorMessage,
      'error.recovered': options?.recovered ?? false,
      'duration_ms': elapsedMs,
      'severity': options?.severity ?? 'error',
      // Include error cause chain (first 3 causes)
      ...(options?.cause && { 'error.cause': options.cause.message }),
      ...attributes,
    },
  };
  
  // Non-blocking emission
  try {
    sink(span);
  } catch (e) {
    // Swallow OTEL errors; never block on observability
    console.debug(`[otel] error span emission failed: ${e}`);
  }
}

/**
 * Emit a warning span for non-fatal issues (degraded but recovering).
 */
export function emitWarningSpanForPhase(
  phase: string,
  message: string,
  attributes: Record<string, string | number | boolean> = {},
  options?: { traceId?: string; parentSpanId?: string }
): void {
  emitErrorSpanForPhase(phase, message, 0, attributes, {
    ...options,
    severity: 'warning',
    recovered: true,
  });
}
```

**Call Site Example 1: Schema Validation (Early, Pre-Command)**

```typescript
// File: apps/wasm4pm/src/commands/run.ts, line ~300

async function validateEventLog(filePath: string, traceCtx?: TraceContext): Promise<void> {
  const t0 = performance.now();
  
  try {
    const xesContent = await fs.readFile(filePath, 'utf-8');
    const hasActivities = xesContent.includes('concept:name');
    const hasTimestamps = xesContent.includes('time:timestamp');
    
    if (!hasActivities || !hasTimestamps) {
      const missingFields = [];
      if (!hasActivities) missingFields.push('concept:name');
      if (!hasTimestamps) missingFields.push('time:timestamp');
      
      // EMIT ERROR SPAN BEFORE EXITING
      emitErrorSpanForPhase('schema_validation', 
        `Event log missing required attributes: ${missingFields.join(', ')}`,
        Date.now() - t0,
        {
          'file': filePath,
          'missing_attributes': missingFields.join(','),
          'severity': 'error',
        },
        {
          traceId: traceCtx?.trace_id,
          parentSpanId: traceCtx?.parent_span_id,
          severity: 'error',
        }
      );
      
      throw new Error(`Event log schema invalid: missing ${missingFields.join(', ')}`);
    }
  } catch (e) {
    // If this is the first error, emit span (unless already emitted above)
    if (!(e instanceof SchemaValidationError)) {
      emitErrorSpanForPhase('schema_validation_io',
        e instanceof Error ? e.message : String(e),
        Date.now() - t0,
        { 'file': filePath },
        {
          traceId: traceCtx?.trace_id,
          parentSpanId: traceCtx?.parent_span_id,
          severity: 'error',
        }
      );
    }
    throw e;
  }
}
```

**Call Site Example 2: Algorithm Hazard Rate (ML Phase)**

```typescript
// File: apps/wasm4pm/src/ml-runner.ts, line ~220

async function computeHazardRate(
  traces: EventTrace[],
  model: SurvivalModel
): Promise<{ hazard: number; ci: [number, number] }> {
  const t0 = performance.now();
  
  try {
    if (traces.length < 30) {
      // EMIT WARNING: Insufficient sample size, but can still compute
      emitWarningSpanForPhase('hazard_rate_computation',
        `Insufficient sample size for confidence: ${traces.length} traces (< 30)`,
        {
          'trace_count': traces.length,
          'confidence_impact': 'wide_ci',
        }
      );
    }
    
    const result = model.computeHazard(traces);
    
    if (Number.isNaN(result.hazard) || !Number.isFinite(result.hazard)) {
      // EMIT ERROR: NaN hazard rate is fatal
      emitErrorSpanForPhase('hazard_rate_computation',
        'Hazard rate computation returned NaN (possible numerical instability)',
        Date.now() - t0,
        {
          'trace_count': traces.length,
          'model_type': model.constructor.name,
        },
        {
          severity: 'error',
          recovered: false,  // Cannot continue with NaN
        }
      );
      throw new Error('Hazard rate computation failed: NaN result');
    }
    
    return result;
  } catch (e) {
    // Comprehensive error context
    emitErrorSpanForPhase('hazard_rate_computation',
      e instanceof Error ? e.message : String(e),
      Date.now() - t0,
      {
        'trace_count': traces.length,
        'model_type': model?.constructor.name ?? 'unknown',
      },
      {
        severity: 'error',
        recovered: false,
        cause: e instanceof Error ? e : undefined,
      }
    );
    throw e;
  }
}
```

**Call Site Example 3: EWMA Drift Detection (Streaming Phase)**

```typescript
// File: apps/wasm4pm/src/commands/drift-watch.ts, line ~150

async function updateEWMAWindow(
  event: ProcessEvent,
  window: EWMAState
): Promise<{ updated: boolean; drift: boolean; recovered: boolean }> {
  const t0 = performance.now();
  let recovered = false;
  
  try {
    const prevValue = window.smoothed;
    
    // Compute new EWMA value
    const alpha = 0.3;
    const newValue = alpha * event.throughput + (1 - alpha) * (window.smoothed ?? event.throughput);
    
    // Detect NaN (can occur if event.throughput is NaN)
    if (Number.isNaN(newValue)) {
      emitWarningSpanForPhase('ewma_computation',
        'EWMA window update skipped: NaN detected (empty or invalid throughput)',
        {
          'previous_smoothed': prevValue ?? 'undefined',
          'event_throughput': event.throughput,
          'alpha': alpha,
        },
        {
          // Inherit trace context if available
          traceId: window._traceId,
          parentSpanId: window._spanId,
        }
      );
      
      // Recovery: skip this sample, continue with previous value
      recovered = true;
      return {
        updated: false,
        drift: false,
        recovered: true,
      };
    }
    
    // Drift detection using threshold
    const threshold = window.mean + 2 * window.stdDev;
    const isDrift = newValue > threshold;
    
    window.smoothed = newValue;
    
    if (isDrift) {
      emitErrorSpanForPhase('ewma_drift_detected',
        `Drift detected: EWMA ${newValue.toFixed(2)} exceeds threshold ${threshold.toFixed(2)}`,
        Date.now() - t0,
        {
          'window_size': window.samples.length,
          'mean': window.mean,
          'stddev': window.stdDev,
          'ewma_value': newValue,
          'threshold': threshold,
        },
        {
          severity: 'warning',
          recovered: true,  // Drift is detected but handled
        }
      );
    }
    
    return {
      updated: true,
      drift: isDrift,
      recovered: false,
    };
  } catch (e) {
    // Unexpected error in EWMA computation
    emitErrorSpanForPhase('ewma_computation_error',
      e instanceof Error ? e.message : String(e),
      Date.now() - t0,
      { 'event_throughput': event.throughput },
      {
        severity: 'error',
        recovered: false,
      }
    );
    // Re-throw to halt drift watching
    throw e;
  }
}
```

**Integration with Chicago TDD:**

Each `emitErrorSpanForPhase()` call satisfies chicago-tdd.md requirement:
- ✅ **OTEL Span:** Error span emitted with phase name, error type, attributes
- ✅ **Status Code:** Span includes `status: { code: 'ERROR', message: ... }`
- ✅ **Service Name:** Always sets `'service.name': 'wasm4pm'`
- ✅ **Attributes:** Includes phase-specific context (algorithm, data size, error type)
- ✅ **Error Causality:** Captures original error message and type

---

## Part 3: Pre-Command Validation Wrapper

### 3.1 Problem: Early Exits Without Span Context

**Current State:**

Commands like `wpm run <log.xes>` perform early validations (first-run UX, format checks, config parsing) **before** the command-level `withSpan()` wrapper activates. If any validation fails, the command exits without emitting a span.

**Example:**

```typescript
// apps/wasm4pm/src/commands/run.ts

export const run = defineCommand({
  async run(ctx: CommandContext) {
    // Pre-command phase (NO SPAN CONTEXT YET)
    const isFirstRunVal = await isFirstRun();  // ← Can fail silently
    if (isFirstRunVal) {
      console.log(formatFirstRunHints());
      process.exit(0);  // ← EXIT WITHOUT SPAN
    }
    
    const config = await resolveConfig();  // ← Can throw SyntaxError
    if (!config.input) {
      console.error('Missing input file');
      process.exit(EXIT_CODES.config_error);  // ← EXIT WITHOUT SPAN
    }
    
    // NOW withSpan() wrapper activates
    await withSpan('run', { algorithm: config.algorithm }, async () => {
      // ... command logic
    });
  }
});
```

**Problem:** If config parsing fails (invalid TOML) or first-run check fails (I/O error), no OTEL span is emitted. Jaeger sees zero evidence of the failure.

---

### 3.2 Design: withSpanAndValidation() Wrapper

**Pseudocode:**

```typescript
// File: apps/wasm4pm/src/commands/_otel.ts

/**
 * Enhanced span wrapper that captures early validation failures.
 * Wraps both pre-command validation AND the command body in a single trace context.
 *
 * Flow:
 * 1. Create root span with unique trace_id
 * 2. Run pre-command validations (all errors emit sub-spans)
 * 3. Run command body (wrapped in withSpan)
 * 4. Emit cleanup/teardown spans
 * 5. Root span closes with summary status
 */
export async function withSpanAndValidation<T>(
  commandName: string,
  validators: Array<{
    name: string;
    fn: (ctx: ValidationContext) => Promise<void>;
    critical?: boolean;  // If true, validation failure exits
  }>,
  commandFn: (ctx: CommandContext) => Promise<T>,
  attrs?: SpanAttrs,
): Promise<T> {
  const sink = getGlobalSpanSink();
  
  // Create root trace context (shared with all child spans)
  const rootTraceId = randomBytes(16).toString('hex');
  const rootSpanId = randomBytes(8).toString('hex');
  
  const rootStartNs = Date.now() * 1_000_000;
  const validationStartNs = rootStartNs;
  
  let rootStatus: 'OK' | 'ERROR' = 'OK';
  let rootErrorMsg: string | undefined;
  let validationsPassed = 0;
  let validationsFailed = 0;
  
  const validationContext: ValidationContext = {
    traceId: rootTraceId,
    parentSpanId: rootSpanId,
    commandName,
  };

  // PHASE 1: Run pre-command validations
  for (const validator of validators) {
    const validatorStartNs = Date.now() * 1_000_000;
    let validatorStatus: 'OK' | 'ERROR' = 'OK';
    let validatorError: Error | undefined;
    
    try {
      await validator.fn(validationContext);
      validationsPassed++;
    } catch (e) {
      validatorStatus = 'ERROR';
      validatorError = e instanceof Error ? e : new Error(String(e));
      validationsFailed++;
      
      // Emit sub-span for validation failure
      const validatorSpan: OtelSpan = {
        trace_id: rootTraceId,
        span_id: randomBytes(8).toString('hex'),
        parent_span_id: rootSpanId,
        name: `wasm4pm.validation.${validator.name}`,
        kind: 'INTERNAL',
        start_time: validatorStartNs,
        end_time: Date.now() * 1_000_000,
        status: {
          code: validator.critical ? 'ERROR' : 'UNSET',  // Warning vs Error
          message: validatorError.message,
        },
        attributes: {
          'service.name': 'wasm4pm',
          'validation.name': validator.name,
          'validation.critical': validator.critical ?? false,
          'error.type': validatorError.constructor.name,
          'error.message': validatorError.message,
        },
      };
      
      try {
        sink(validatorSpan);
      } catch {
        /* never block on OTEL */
      }
      
      // If critical, fail fast
      if (validator.critical) {
        rootStatus = 'ERROR';
        rootErrorMsg = `Validation failed: ${validator.name}: ${validatorError.message}`;
        break;
      }
    }
  }
  
  // PHASE 2: If pre-command validations passed, run command body
  let result: T;
  try {
    if (rootStatus === 'ERROR') {
      // Skip command if critical validation failed
      throw new Error(rootErrorMsg!);
    }
    
    // Run command wrapped in withSpan (same trace context as parent)
    result = await withSpanInheritingContext(
      commandName,
      { ...attrs, validations_passed: validationsPassed },
      commandFn,
      rootTraceId,
      rootSpanId
    );
  } catch (e) {
    rootStatus = 'ERROR';
    rootErrorMsg = e instanceof Error ? e.message : String(e);
    throw e;
  } finally {
    // Emit root span summarizing validation + command
    const rootEndNs = Date.now() * 1_000_000;
    const rootSpan: OtelSpan = {
      trace_id: rootTraceId,
      span_id: rootSpanId,
      name: `wasm4pm.command.${commandName}`,
      kind: 'INTERNAL',
      start_time: rootStartNs,
      end_time: rootEndNs,
      status: rootStatus === 'OK'
        ? { code: 'OK' }
        : { code: 'ERROR', message: rootErrorMsg },
      attributes: {
        'service.name': 'wasm4pm',
        'command': commandName,
        'validations.passed': validationsPassed,
        'validations.failed': validationsFailed,
        ...attrs,
      },
    };
    
    try {
      sink(rootSpan);
    } catch {
      /* never block on OTEL */
    }
  }
  
  return result;
}

/**
 * Internal: run command with inherited trace context (not new random IDs).
 */
async function withSpanInheritingContext<T>(
  name: string,
  attrs: SpanAttrs,
  fn: (ctx: CommandContext) => Promise<T>,
  traceId: string,       // ← Inherit from parent
  parentSpanId: string,  // ← Link to parent
  getLateAttrs?: () => SpanAttrs,
): Promise<T> {
  const sink = getGlobalSpanSink();
  const startNs = Date.now() * 1_000_000;
  let status: 'OK' | 'ERROR' = 'OK';
  let errMsg: string | undefined;

  const commandContext: CommandContext = {
    traceId,
    parentSpanId,
    commandName: name,
  };

  try {
    return await fn(commandContext);
  } catch (e) {
    status = 'ERROR';
    errMsg = e instanceof Error ? e.message : String(e);
    throw e;
  } finally {
    try {
      const lateAttrs = getLateAttrs ? getLateAttrs() : {};
      const span: OtelSpan = {
        trace_id: traceId,                // ← Inherited
        span_id: randomBytes(8).toString('hex'),
        parent_span_id: parentSpanId,     // ← Linked
        name: `wasm4pm.command.${name}`,
        kind: 'INTERNAL',
        start_time: startNs,
        end_time: Date.now() * 1_000_000,
        status: errMsg !== undefined ? { code: status, message: errMsg } : { code: status },
        attributes: { 'service.name': 'wasm4pm', command: name, ...attrs, ...lateAttrs },
      };
      sink(span);
    } catch {
      /* never block on OTEL */
    }
  }
}

// Context types
interface ValidationContext {
  traceId: string;
  parentSpanId: string;
  commandName: string;
}

interface CommandContext {
  traceId: string;
  parentSpanId: string;
  commandName: string;
}
```

**Usage Example: Refactored run Command**

```typescript
// File: apps/wasm4pm/src/commands/run.ts

export const run = defineCommand({
  async run(ctx: CommandContext) {
    // Wrap the entire command lifecycle in one trace
    await withSpanAndValidation(
      'run',
      [
        {
          name: 'format_check',
          fn: async (valCtx) => {
            const formatFlag = ctx.args.format ?? 'human';
            if (!['human', 'json'].includes(formatFlag)) {
              emitErrorSpanForPhase('format_check',
                `Invalid format flag: ${formatFlag}`,
                0,
                { 'format_flag': formatFlag },
                {
                  traceId: valCtx.traceId,
                  parentSpanId: valCtx.parentSpanId,
                  severity: 'error',
                }
              );
              throw new Error(`Invalid format: ${formatFlag}`);
            }
          },
          critical: true,  // Fail fast if format is invalid
        },
        {
          name: 'first_run_ux',
          fn: async (valCtx) => {
            const t0 = performance.now();
            try {
              const isFirstRunVal = await isFirstRun();
              if (isFirstRunVal) {
                emitErrorSpanForPhase('first_run_ux',
                  'First-run hint displayed',
                  Date.now() - t0,
                  { 'action': 'show_hints' },
                  {
                    traceId: valCtx.traceId,
                    parentSpanId: valCtx.parentSpanId,
                    severity: 'warning',
                    recovered: true,
                  }
                );
                console.log(formatFirstRunHints());
                process.exit(0);
              }
            } catch (e) {
              emitErrorSpanForPhase('first_run_ux_io',
                e instanceof Error ? e.message : String(e),
                Date.now() - t0,
                {},
                {
                  traceId: valCtx.traceId,
                  parentSpanId: valCtx.parentSpanId,
                  severity: 'warning',  // Non-critical
                  recovered: true,
                }
              );
              // Continue despite I/O failure
            }
          },
          critical: false,  // Non-critical: continue if it fails
        },
        {
          name: 'config_parsing',
          fn: async (valCtx) => {
            const t0 = performance.now();
            try {
              const config = await resolveConfig(ctx.args);
              if (!config.input) {
                emitErrorSpanForPhase('config_validation',
                  'Missing required input file',
                  Date.now() - t0,
                  {},
                  {
                    traceId: valCtx.traceId,
                    parentSpanId: valCtx.parentSpanId,
                    severity: 'error',
                  }
                );
                throw new Error('Missing input file');
              }
            } catch (e) {
              emitErrorSpanForPhase('config_parsing_error',
                e instanceof Error ? e.message : String(e),
                Date.now() - t0,
                {},
                {
                  traceId: valCtx.traceId,
                  parentSpanId: valCtx.parentSpanId,
                  severity: 'error',
                }
              );
              throw e;
            }
          },
          critical: true,
        },
      ],
      async (cmdCtx) => {
        // Command body now has trace context available
        const config = await resolveConfig(ctx.args);
        
        // Load event log
        const logHandle = await wasm.load_eventlog_from_xes(xesContent);
        
        // Run discovery (with trace context inheritance)
        const result = await runDiscoveryWithTraceContext(
          wasm,
          config.algorithm,
          logHandle,
          config.activityKey,
          { trace_id: cmdCtx.traceId, parent_span_id: cmdCtx.parentSpanId }
        );
        
        // Format output
        const output = makeResult(result, config.format);
        emitResult(output);
        
        return output;
      },
      { algorithm: ctx.args.algorithm ?? 'heuristic' }
    );
  }
});
```

**Result in Jaeger:**

```
Trace ID: a1b2c3d4e5f6...xyz
├─ Span: wasm4pm.command.run (root, duration 1250ms)
│  ├─ Span: wasm4pm.validation.format_check (sub, OK)
│  ├─ Span: wasm4pm.validation.first_run_ux (sub, WARNING, recovered)
│  ├─ Span: wasm4pm.validation.config_parsing (sub, OK)
│  └─ Span: wasm4pm.command.run (body, duration 900ms)
│     ├─ Span: wasm4pm.file.load_xes (sub, OK, 100ms)
│     ├─ Span: wasm.discover_dfg (WASM boundary, 700ms)
│     │  └─ Span: kernel.discover_dfg (WASM internal, 650ms)
│     └─ Span: wasm4pm.output.format (sub, OK, 10ms)
```

All exit paths (validation failures, command success, command errors) now emit linked OTEL spans.

---

## Part 4: Integration Checklist (Chicago TDD Compliance)

### 4.1 OTEL Requirements

- [ ] **Service Name:** All spans include `'service.name': 'wasm4pm'`
- [ ] **Status Field:** All spans include `status: { code: 'OK'|'ERROR', message?: string }`
- [ ] **Trace Context:** Child spans inherit `trace_id` and include `parent_span_id`
- [ ] **Error Attribution:** Error spans include `error.type` and `error.message`
- [ ] **Phase Context:** Error spans include `phase` attribute for forensics
- [ ] **Causality:** All child spans linked to parent via `parent_span_id`
- [ ] **Non-Blocking:** OTEL emission failures never block command execution

### 4.2 Chicago TDD Doctrine

- [ ] **100% OTEL Coverage:** Every exit path (success, error, validation failure) emits a span
- [ ] **Evidence Requirement:** Test assertions verify spans are emitted with correct attributes
- [ ] **Rank-1 Oracle:** Mathematical proofs (e.g., "validation fail → error span emitted")
- [ ] **No Self-Referential Tests:** Don't derive expected span attributes from the code being tested

### 4.3 Critical Constraints

- [ ] **MTTR:** Span emission <10ms overhead (measured)
- [ ] **TPS (Fail-Fast):** OTEL errors never block command; always catch and continue
- [ ] **Error Visibility:** All error exits (exit codes 1, 2, 3, 4, 5) emit OTEL spans

### 4.4 Implementation Sequence

**Phase 1 (2-3 days):**
1. Implement `TraceContext` parameter passing (CLI → WASM)
2. Add `emitErrorSpanForPhase()` helper
3. Audit 8 error scenarios; add span emissions

**Phase 2 (1-2 days):**
4. Implement `withSpanAndValidation()` wrapper
5. Refactor run/conformance/predict commands
6. Add integration tests for validation failures

**Phase 3 (1 day):**
7. End-to-end trace correlation tests in Jaeger
8. Performance benchmarking (span overhead)
9. Documentation updates

---

## Part 5: Conflict Resolution Matrix

| Conflict | Nature | Resolution | Owner |
|----------|--------|-----------|-------|
| WASM signature compatibility | Design vs. backward compat | Add new `_with_trace()` functions; deprecate old | Backend |
| Rust tracing crate integration | OTEL standard vs. tracing lib | Export `trace_id` attribute; post-processing merge | Observability |
| Return value shape changes | Design vs. serialization | Keep return payload clean; emit trace via span headers | API |
| Pre-validation timing | When to emit span | Emit both pre-span + command span; root merges both | CLI |
| Error swallowing in cleanup | Design (recovery) vs. visibility | Always emit span; `recovered: true` flag indicates best-effort | Error Handling |

---

## Part 6: Success Criteria

### Measurement

1. **Trace Correlation Rate:** 100% of WASM calls have `parent_span_id` linking to CLI span
2. **Error Span Coverage:** All 8 identified error scenarios emit spans with `status.code = 'ERROR'`
3. **Validation Visibility:** `withSpanAndValidation()` emits sub-spans for each validator
4. **Span Overhead:** <10ms per command (measured via `/usr/bin/time`)
5. **Chicago TDD Compliance:** All spans include `service.name`, `status`, error context

### Verification Queries

```sparql
# Jaeger: Find all command runs with cross-layer spans
SELECT span
WHERE span.trace_id EXISTS
  AND span.attributes['service.name'] = 'wasm4pm'
  AND (span.name STARTS_WITH 'wasm4pm.command.' OR span.name STARTS_WITH 'wasm.')
GROUP BY trace_id
HAVING COUNT(DISTINCT span.name) >= 2  -- At least CLI + WASM span
```

```bash
# CLI: Measure span emission overhead
time wpm run --no-save /path/to/log.xes 2>&1 | grep -E "span|duration"
# Expected: overhead <10ms
```

---

## Conclusion

This design provides three complementary mechanisms to unify OTEL trace context across the CLI→WASM boundary and eliminate silent failures:

1. **Trace Context Propagation** ensures WASM spans inherit CLI trace IDs
2. **Error Span Emission** ensures all error paths emit OTEL context before exiting
3. **Pre-Command Validation Wrapper** ensures early validations emit sub-spans in the command's trace

Together, these ensure **100% OTEL coverage** per chicago-tdd.md doctrine: every exit path, success or error, emits a linked OTEL span with sufficient context for post-mortem analysis and Jaeger correlation.

**No implementation undertaken in this design phase.** Analysis only.
