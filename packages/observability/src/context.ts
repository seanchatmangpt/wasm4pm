/**
 * Trace context propagation following W3C Trace Context spec.
 * Generates trace/span IDs, parses/creates traceparent headers,
 * and manages parent-child span relationships.
 */

import { RequiredFields } from './fields.js';

/**
 * Parsed W3C traceparent header components.
 */
export interface TraceContext {
  traceId: string;
  spanId: string;
  traceFlags: string;
}

/**
 * Active span context for parent-child relationships.
 */
export interface SpanContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  requiredFields: RequiredFields;
}

/**
 * Generate a W3C-compliant trace ID (32 hex chars = 16 bytes).
 */
export function generateTraceId(): string {
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate a W3C-compliant span ID (16 hex chars = 8 bytes).
 */
export function generateSpanId(): string {
  const bytes = new Uint8Array(8);
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 8; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Parse a W3C traceparent header.
 * Format: `00-{traceId}-{spanId}-{traceFlags}`
 * Returns undefined if the header is absent or malformed.
 */
export function parseTraceparent(header?: string): TraceContext | undefined {
  if (!header) return undefined;
  const parts = header.split('-');
  if (parts.length !== 4 || parts[0] !== '00') return undefined;
  const [, traceId, spanId, traceFlags] = parts;
  if (traceId.length !== 32 || spanId.length !== 16 || traceFlags.length !== 2) {
    return undefined;
  }
  return { traceId, spanId, traceFlags };
}

/**
 * Create a W3C traceparent header string.
 */
export function createTraceparent(
  traceId: string,
  spanId: string,
  sampled = true
): string {
  return `00-${traceId}-${spanId}-${sampled ? '01' : '00'}`;
}

/**
 * Create a root SpanContext (no parent).
 */
export function createRootContext(requiredFields: RequiredFields): SpanContext {
  return {
    traceId: generateTraceId(),
    spanId: generateSpanId(),
    requiredFields,
  };
}

/**
 * Create a child SpanContext from a parent.
 */
export function createChildContext(parent: SpanContext): SpanContext {
  return {
    traceId: parent.traceId,
    spanId: generateSpanId(),
    parentSpanId: parent.spanId,
    requiredFields: parent.requiredFields,
  };
}
