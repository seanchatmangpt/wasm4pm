/**
 * Span definitions for every lifecycle phase.
 * Provides the Tracer/Span interfaces and factory functions
 * for bootstrap, planning, running, and watching spans.
 */
import { RequiredFields } from './fields.js';
import { SpanContext } from './context.js';
export type SpanKind = 'INTERNAL' | 'SERVER' | 'CLIENT' | 'PRODUCER' | 'CONSUMER';
export type SpanStatusCode = 'UNSET' | 'OK' | 'ERROR';
export interface SpanStatus {
    code: SpanStatusCode;
    message?: string;
}
export interface SpanEvent {
    name: string;
    timestampNs: number;
    attributes?: Record<string, unknown>;
}
/**
 * A single trace span. Call `end()` when the operation completes.
 */
export interface Span {
    readonly traceId: string;
    readonly spanId: string;
    readonly parentSpanId?: string;
    readonly name: string;
    readonly kind: SpanKind;
    readonly startTimeNs: number;
    endTimeNs?: number;
    status?: SpanStatus;
    attributes: Record<string, unknown>;
    events?: SpanEvent[];
    /** Mark span as ended (sets endTimeNs to now). */
    end(): void;
    /** Record an in-span event. */
    addEvent(name: string, attrs?: Record<string, unknown>): void;
    /** Set span status. */
    setStatus(code: SpanStatusCode, message?: string): void;
    /** Set a single attribute. */
    setAttribute(key: string, value: unknown): void;
}
/**
 * Tracer interface — implemented by OtelTracer (real) and NoopTracer.
 */
export interface Tracer {
    startSpan(name: string, options?: {
        kind?: SpanKind;
        parent?: SpanContext;
        attributes?: Record<string, unknown>;
    }): Span;
    flush(): Promise<void>;
    shutdown(): Promise<void>;
}
export declare class LiveSpan implements Span {
    readonly traceId: string;
    readonly spanId: string;
    readonly parentSpanId?: string;
    readonly name: string;
    readonly kind: SpanKind;
    readonly startTimeNs: number;
    endTimeNs?: number;
    status?: SpanStatus;
    attributes: Record<string, unknown>;
    events: SpanEvent[];
    private readonly onEnd;
    constructor(ctx: SpanContext, name: string, kind: SpanKind, requiredFields: RequiredFields, customAttrs: Record<string, unknown>, onEnd: (span: LiveSpan) => void);
    end(): void;
    addEvent(name: string, attrs?: Record<string, unknown>): void;
    setStatus(code: SpanStatusCode, message?: string): void;
    setAttribute(key: string, value: unknown): void;
}
export declare const BootstrapSpans: {
    readonly configLoad: () => string;
    readonly configValidation: () => string;
};
export declare const PlanningSpans: {
    readonly configResolution: () => string;
    readonly planGeneration: () => string;
};
export declare const RunningSpans: {
    readonly runStart: () => string;
    readonly sourceRead: () => string;
    readonly algorithmExec: (alg: string) => string;
    readonly sinkWrite: () => string;
    readonly runEnd: () => string;
};
export declare const WatchingSpans: {
    readonly heartbeat: () => string;
    readonly reconnect: () => string;
    readonly checkpointSave: () => string;
    readonly checkpointLoad: () => string;
};
//# sourceMappingURL=spans.d.ts.map