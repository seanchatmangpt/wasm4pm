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
export declare function generateTraceId(): string;
/**
 * Generate a W3C-compliant span ID (16 hex chars = 8 bytes).
 */
export declare function generateSpanId(): string;
/**
 * Parse a W3C traceparent header.
 * Format: `00-{traceId}-{spanId}-{traceFlags}`
 * Returns undefined if the header is absent or malformed.
 */
export declare function parseTraceparent(header?: string): TraceContext | undefined;
/**
 * Create a W3C traceparent header string.
 */
export declare function createTraceparent(traceId: string, spanId: string, sampled?: boolean): string;
/**
 * Create a root SpanContext (no parent).
 */
export declare function createRootContext(requiredFields: RequiredFields): SpanContext;
/**
 * Create a child SpanContext from a parent.
 */
export declare function createChildContext(parent: SpanContext): SpanContext;
//# sourceMappingURL=context.d.ts.map