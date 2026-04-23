/**
 * Shared types for pictl testing harnesses
 */
export interface OtelSpan {
    traceId: string;
    spanId: string;
    parentSpanId?: string;
    name: string;
    startTimeUnixNano: number;
    endTimeUnixNano: number;
    kind: 0 | 1 | 2 | 3 | 4;
    status: {
        code: 0 | 1 | 2;
        message?: string;
    };
    attributes?: Record<string, unknown>;
}
export interface OtelResource {
    attributes: Record<string, unknown>;
}
export interface OtelInstrumentationScope {
    name: string;
    version?: string;
}
//# sourceMappingURL=types.d.ts.map