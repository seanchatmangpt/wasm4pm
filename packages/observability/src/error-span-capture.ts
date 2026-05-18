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
 * Extract error context from any thrown value
 * Handles: Error instances, Error subclasses, strings, unknown objects
 */
export function extractErrorContext(e: unknown, severity: 'warning' | 'error' | 'fatal' = 'error'): ErrorContext {
  const timestamp = Date.now();

  if (e instanceof Error) {
    const errorWithCause = e as any;
    const cause = errorWithCause.cause instanceof Error ? extractErrorContext(errorWithCause.cause, 'error') : undefined;
    return {
      message: e.message,
      type: e.constructor.name,
      stack: e.stack,
      code: (e as any).code,
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
 * Wrap a span emission with error context capture
 * Ensures stack trace is included in attributes (not just message)
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
 * Wrap a function to emit error span on exception
 * Does NOT re-throw — use for non-critical operations
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
 * Wrap a function to emit error span and re-throw
 * Use for critical operations where error must propagate
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
 * Generate random trace ID (32 hex chars)
 */
function generateTraceId(): string {
  return Math.random().toString(16).substring(2) + Math.random().toString(16).substring(2);
}

/**
 * Generate random span ID (16 hex chars)
 */
function generateSpanId(): string {
  return Math.random().toString(16).substring(2);
}
