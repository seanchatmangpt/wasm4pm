/**
 * OTEL setup — creates a real or no-op tracer based on config.
 * When disabled the no-op tracer is returned so callers pay zero overhead.
 * When enabled but the exporter is unavailable, warnings are logged and
 * execution continues unless `required` is true.
 */
import { type Span, type Tracer, type SpanKind } from './spans.js';
import { RequiredFields } from './fields.js';
import { SpanContext } from './context.js';
export interface OtelConfig {
    /** Master switch. Default: false. */
    enabled: boolean;
    /** OTLP exporter transport. */
    exporter: 'otlp_http' | 'otlp_grpc';
    /** Collector endpoint URL. */
    endpoint: string;
    /** If true, export failures throw instead of warning. Default: false. */
    required: boolean;
    /** HTTP timeout in ms. Default: 5000. */
    timeout_ms?: number;
    /** Max queued spans before dropping oldest. Default: 1000. */
    max_queue_size?: number;
    /** Spans per export batch. Default: 100. */
    batch_size?: number;
}
export declare class OtelTracer implements Tracer {
    private readonly config;
    private readonly requiredFields;
    private queue;
    private flushTimer?;
    private flushChain;
    private shuttingDown;
    constructor(config: OtelConfig, requiredFields: RequiredFields);
    startSpan(name: string, options?: {
        kind?: SpanKind;
        parent?: SpanContext;
        attributes?: Record<string, unknown>;
    }): Span;
    private enqueue;
    private startAutoFlush;
    flush(): Promise<void>;
    private doFlush;
    private sendPayload;
    shutdown(): Promise<void>;
}
/**
 * Create a Tracer based on config.
 * - Config missing or disabled -> NoopTracer (zero overhead)
 * - Enabled -> OtelTracer
 */
export declare function createTracer(config: OtelConfig | undefined, requiredFields: RequiredFields): Tracer;
//# sourceMappingURL=otel.d.ts.map