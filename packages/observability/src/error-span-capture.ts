/**
 * error-span-capture.ts
 *
 * OTEL error span capture utilities (Iteration 10: Error Observability Audit)
 * Provides patterns for robust error detection, span emission, and stack trace capture.
 * Closes 3 gaps:
 * 1. Errors swallowed without span emission (status quo)
 * 2. Stack traces not captured in OTEL context
 * 3. Error chain (cause) not preserved across spans
 */

/**
 * OTEL span representation
 */
interface OtelSpan {
  trace_id: string;
  span_id: string;
  name: string;
  kind: string;
  start_time: number;
  end_time: number;
  status: { code: string; message: string };
  attributes: Record<string, unknown>;
}

/**
 * Error context with full chain and stack trace
 */
export interface ErrorContext {
  message: string;
  type: string;
  code?: string;
  stack?: string;
  cause?: ErrorContext;
  timestamp: number;
  severity: 'warning' | 'error' | 'fatal';
}

/**
 * Extract full error context from any thrown value, including cause chains and stack traces.
 *
 * Handles: Error instances, Error subclasses, plain strings, and unknown objects.
 * Walks `Error.cause` recursively to build the complete error chain.
 *
 * @param e - The thrown value (may be any type)
 * @param severity - Severity classification: 'warning' | 'error' | 'fatal' (default: 'error')
 * @returns Structured ErrorContext with type, message, stack, cause, and severity
 */
export function extractErrorContext(e: unknown, severity: 'warning' | 'error' | 'fatal' = 'error'): ErrorContext {
  const timestamp = Date.now();

  if (e instanceof Error) {
    // ES2022 Error.cause — present in Node 16.9+; cast once for the optional fields
    const errorWithCause = e as Error & { cause?: unknown; code?: unknown };
    const cause =
      errorWithCause.cause instanceof Error
        ? extractErrorContext(errorWithCause.cause, 'error')
        : undefined;
    return {
      message: e.message,
      type: e.constructor.name,
      stack: e.stack,
      code: typeof errorWithCause.code === 'string' ? errorWithCause.code : undefined,
      cause,
      timestamp,
      severity,
    };
  }

  if (typeof e === 'string') {
    return {
      message: e,
      type: 'String',
      timestamp,
      severity,
    };
  }

  return {
    message: String(e),
    type: typeof e === 'object' && e !== null ? (e.constructor?.name ?? 'Object') : typeof e,
    timestamp,
    severity,
  };
}

/**
 * Emit an OTEL error span with full error context (message, type, stack trace, cause chain).
 *
 * Always non-blocking: catches and silently discards any failure in the sink or context
 * extraction so callers on the hot path are never blocked by observability.
 *
 * @param sink - OTEL span sink function (e.g. from Kernel.setSpanSink)
 * @param spanName - Name for the emitted span (e.g. 'wasm.load_eventlog_from_xes')
 * @param error - The thrown value to capture
 * @param attributes - Additional span attributes merged into the emitted span
 */
export function emitErrorSpan(
  sink: (span: OtelSpan) => void,
  spanName: string,
  error: unknown,
  attributes: Record<string, unknown> = {},
): void {
  try {
    const ctx = extractErrorContext(error);
    const stackLines = ctx.stack ? ctx.stack.split('\n').slice(0, 5) : [];

    const span: OtelSpan = {
      trace_id: generateTraceId(),
      span_id: generateSpanId(),
      name: spanName,
      kind: 'INTERNAL',
      start_time: ctx.timestamp * 1_000_000,
      end_time: Date.now() * 1_000_000,
      status: {
        code: 'ERROR',
        message: ctx.message,
      },
      attributes: {
        'service.name': 'wasm4pm',
        'error.type': ctx.type,
        'error.message': ctx.message,
        'error.code': ctx.code,
        'error.severity': ctx.severity,
        'error.stack_trace': ctx.stack ? `${stackLines.join(' | ')}...` : undefined,
        'error.has_cause': !!ctx.cause,
        'error.cause_type': ctx.cause?.type,
        'error.cause_message': ctx.cause?.message,
        ...attributes,
      },
    };

    sink(span);
  } catch {
    // Never block on span emission — fail silently
  }
}

/**
 * Run an async function and emit an error span if it throws; swallows the error.
 *
 * Use for best-effort / non-critical operations where the caller should continue
 * even if the wrapped function fails. Returns `undefined` on error.
 *
 * @param sink - OTEL span sink function
 * @param operationName - Short name appended to `operation.` as the span name
 * @param fn - Async function to execute
 * @param attributes - Additional attributes merged into any emitted error span
 * @returns The function's return value, or `undefined` if it threw
 */
export async function withErrorSpanCapture<T>(
  sink: (span: OtelSpan) => void,
  operationName: string,
  fn: () => Promise<T>,
  attributes: Record<string, unknown> = {},
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (e) {
    emitErrorSpan(sink, `operation.${operationName}`, e, {
      ...attributes,
      'error.recovered': true,
    });
    return undefined;
  }
}

/**
 * Run an async function, emit an error span if it throws, then re-throw the error.
 *
 * Use for critical operations where the error must propagate to the caller but
 * observability evidence must still be captured before it does.
 *
 * @param sink - OTEL span sink function
 * @param operationName - Short name appended to `operation.` as the span name
 * @param fn - Async function to execute
 * @param attributes - Additional attributes merged into any emitted error span
 * @returns The function's return value (re-throws on error)
 */
export async function withErrorSpanCaptureAndThrow<T>(
  sink: (span: OtelSpan) => void,
  operationName: string,
  fn: () => Promise<T>,
  attributes: Record<string, unknown> = {},
): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    emitErrorSpan(sink, `operation.${operationName}`, e, {
      ...attributes,
      'error.fatal': true,
    });
    throw e;
  }
}

/**
 * Determine if an error should be treated as critical (FATAL severity).
 *
 * Critical errors include: TypeError, RangeError, EvalError (JS engine faults),
 * and any error whose message starts with 'FATAL' or 'PANIC'.
 *
 * @param e - The thrown value to classify
 * @returns `true` if the error is critical and warrants process termination
 */
export function isCriticalError(e: unknown): boolean {
  if (e instanceof TypeError || e instanceof RangeError || e instanceof EvalError) {
    return true;
  }
  if (e instanceof Error) {
    const msg = e.message.toUpperCase();
    return msg.startsWith('FATAL') || msg.startsWith('PANIC');
  }
  return false;
}

/**
 * Redact sensitive data patterns (passwords, tokens, API keys, Authorization headers)
 * from a message string before it is included in OTEL spans or logs.
 *
 * Patterns redacted: `password=...`, `token=...`, `api_key=...`, `authorization: ...`
 * (case-insensitive, stops at whitespace or end of string).
 *
 * @param message - Raw error or log message potentially containing secrets
 * @returns The message with sensitive values replaced by `[REDACTED]`
 */
export function redactSensitiveData(message: string): string {
  return message
    .replace(/password\s*=\s*\S+/gi, 'password=[REDACTED]')
    .replace(/token\s*=\s*\S+/gi, 'token=[REDACTED]')
    .replace(/api[_-]?key\s*=\s*\S+/gi, 'api_key=[REDACTED]')
    .replace(/authorization\s*:\s*\S+/gi, 'authorization:[REDACTED]');
}

/**
 * Format an error for human-readable CLI output with a cause chain.
 *
 * Produces a multi-line string with the top-level error type, message, and
 * any nested cause chain indented under "Caused by:".
 *
 * @param e - The thrown value to format
 * @returns Multi-line human-readable string suitable for stderr / consola output
 */
export function formatErrorForCli(e: unknown): string {
  const ctx = extractErrorContext(e);
  const code = ctx.code ? ` [${ctx.code}]` : '';
  let out = `${ctx.type}${code}: ${ctx.message}`;
  let cause = ctx.cause;
  while (cause) {
    const causeCode = cause.code ? ` [${cause.code}]` : '';
    out += `\nCaused by: ${cause.type}${causeCode}: ${cause.message}`;
    cause = cause.cause;
  }
  return out;
}

/**
 * Format an error as a structured JSON-serialisable object for log pipelines.
 *
 * Includes type, message, optional code, the first 5 stack lines, and the
 * full cause chain. Suitable for `JSON.stringify` and JSONL log writers.
 *
 * @param e - The thrown value to format
 * @returns Plain object ready for JSON serialisation
 */
export function formatErrorForJson(e: unknown): Record<string, unknown> {
  const ctx = extractErrorContext(e);
  const stackLines = ctx.stack ? ctx.stack.split('\n').slice(0, 5) : [];
  const result: Record<string, unknown> = {
    type: ctx.type,
    message: ctx.message,
    severity: ctx.severity,
    timestamp: ctx.timestamp,
  };
  if (ctx.code !== undefined) result.code = ctx.code;
  if (stackLines.length > 0) result.stack = stackLines;
  if (ctx.cause) {
    result.cause = formatErrorForJson(ctx.cause);
  }
  return result;
}

/**
 * Generate random trace ID (32 hex chars) using Web Crypto API.
 */
function generateTraceId(): string {
  const buf = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(buf);
  } else {
    throw new Error('Cryptographic randomness not available in this environment. Deterministic seeding required.');
  }
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate random span ID (16 hex chars) using Web Crypto API.
 */
function generateSpanId(): string {
  const buf = new Uint8Array(8);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(buf);
  } else {
    throw new Error('Cryptographic randomness not available in this environment. Deterministic seeding required.');
  }
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
}
