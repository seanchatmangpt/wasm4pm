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

import type { OtelSpan } from './types.js';

/**
 * Error context with full chain and stack trace
 */
export interface ErrorContext {
  message: string;
  type: string;
  code?: string;
  stack?: string;
  cause?: ErrorContext; // For error chaining (Error.cause)
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
    const cause = e.cause instanceof Error ? extractErrorContext(e.cause, 'error') : undefined;
    return {
      message: e.message,
      type: e.constructor.name,
      stack: e.stack,
      code: (e as any).code, // For Node.js system errors (ENOENT, etc.)
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

  // Unknown object
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
    const stackLines = ctx.stack ? ctx.stack.split('\n').slice(0, 5) : []; // First 5 lines

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
  const t0 = Date.now();

  try {
    return await fn();
  } catch (e) {
    emitErrorSpan(sink, `operation.${operationName}`, e, {
      ...attributes,
      'error.recovered': true, // Marked as handled/recovered
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
      'error.fatal': true, // Error will propagate
    });
    throw e;
  }
}

/**
 * Check if error meets severity threshold for immediate action
 * Returns true if error should trigger fail-fast behavior
 */
export function isCriticalError(e: unknown): boolean {
  const ctx = extractErrorContext(e);

  // Memory errors, panics, system errors are critical
  const criticalTypes = ['OutOfMemory', 'RangeError', 'EvalError', 'SystemError', 'TypeError'];
  const criticalPrefixes = ['FATAL', 'PANIC', 'CRASH', 'SEGFAULT', 'OOM'];

  if (criticalTypes.includes(ctx.type)) return true;
  if (criticalPrefixes.some((p) => ctx.message.toUpperCase().startsWith(p))) return true;
  if (ctx.severity === 'fatal') return true;

  return false;
}

/**
 * Generate a random trace ID (16 bytes = 32 hex characters)
 */
function generateTraceId(): string {
  return Array.from({ length: 16 }, () => Math.floor(Math.random() * 256))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generate a random span ID (8 bytes = 16 hex characters)
 */
function generateSpanId(): string {
  return Array.from({ length: 8 }, () => Math.floor(Math.random() * 256))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Redact sensitive data from error message before emitting span
 * Patterns: passwords, tokens, API keys, personal data
 */
export function redactSensitiveData(message: string): string {
  return (
    message
      // Remove password fields
      .replace(/password\s*[:=]\s*[^\s,;]+/gi, 'password=***REDACTED***')
      // Remove token patterns
      .replace(/token\s*[:=]\s*[^\s,;]+/gi, 'token=***REDACTED***')
      // Remove API keys
      .replace(/api[_-]?key\s*[:=]\s*[^\s,;]+/gi, 'api_key=***REDACTED***')
      // Remove secrets
      .replace(/secret\s*[:=]\s*[^\s,;]+/gi, 'secret=***REDACTED***')
      // Remove authorization headers
      .replace(/authorization\s*[:=]\s*[^\s,;]+/gi, 'authorization=***REDACTED***')
  );
}

/**
 * Format error for human-readable output (console/CLI)
 */
export function formatErrorForCli(e: unknown): string {
  const ctx = extractErrorContext(e);

  let output = `${ctx.type}: ${ctx.message}`;

  if (ctx.code) {
    output += ` (code: ${ctx.code})`;
  }

  if (ctx.cause) {
    output += `\n  Caused by: ${ctx.cause.type}: ${ctx.cause.message}`;
  }

  return output;
}

/**
 * Format error for structured logging (JSON)
 */
export function formatErrorForJson(e: unknown): Record<string, unknown> {
  const ctx = extractErrorContext(e);

  return {
    error: {
      type: ctx.type,
      message: ctx.message,
      code: ctx.code,
      severity: ctx.severity,
      timestamp: ctx.timestamp,
      stack: ctx.stack ? ctx.stack.split('\n').slice(0, 3) : undefined,
      cause: ctx.cause
        ? {
            type: ctx.cause.type,
            message: ctx.cause.message,
          }
        : undefined,
    },
  };
}
