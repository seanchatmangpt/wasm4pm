/**
 * OTEL event capture for testing.
 *
 * Provides in-memory collectors that capture OTEL spans, events, and JSON log
 * entries so tests can assert on observability output without a real collector.
 */
export interface CapturedOtelSpan {
    traceId: string;
    spanId: string;
    parentSpanId?: string;
    name: string;
    kind?: string;
    startTime: number;
    endTime?: number;
    status?: {
        code: string;
        message?: string;
    };
    attributes: Record<string, unknown>;
    events: Array<{
        name: string;
        timestamp: number;
        attributes?: Record<string, unknown>;
    }>;
}
export interface CapturedJsonEvent {
    timestamp: string;
    component: string;
    eventType: string;
    runId?: string;
    data: Record<string, unknown>;
}
export interface CapturedCliEvent {
    level: string;
    message: string;
    timestamp: Date;
}
export interface OtelCaptureStats {
    spanCount: number;
    eventCount: number;
    jsonEventCount: number;
    cliEventCount: number;
    traceIds: string[];
    components: string[];
}
/**
 * In-memory OTEL event collector for testing.
 */
export declare class OtelCapture {
    private _spans;
    private _jsonEvents;
    private _cliEvents;
    captureSpan(span: CapturedOtelSpan): void;
    captureJson(event: CapturedJsonEvent): void;
    captureCli(event: CapturedCliEvent): void;
    /** Convenience: capture a raw OTEL-like event object */
    captureRaw(event: Record<string, unknown>): void;
    get spans(): readonly CapturedOtelSpan[];
    get jsonEvents(): readonly CapturedJsonEvent[];
    get cliEvents(): readonly CapturedCliEvent[];
    stats(): OtelCaptureStats;
    /** Find spans by name pattern */
    findSpans(namePattern: string | RegExp): CapturedOtelSpan[];
    /** Find spans that have a specific attribute */
    findSpansByAttribute(key: string, value?: unknown): CapturedOtelSpan[];
    /** Find JSON events by component */
    findJsonEvents(component: string): CapturedJsonEvent[];
    /** Assert that required OTEL attributes are present on all spans */
    assertRequiredAttributes(requiredKeys: string[]): string[];
    /** Assert that OTEL is non-blocking: no span exceeds the given duration */
    assertNonBlocking(maxDurationMs: number): string[];
    /** Assert span parent-child relationships form valid trees */
    assertValidTraces(): string[];
    clear(): void;
}
export declare function createOtelCapture(): OtelCapture;
//# sourceMappingURL=otel-capture.d.ts.map