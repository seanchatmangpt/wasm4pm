/**
 * OTEL setup — creates a real or no-op tracer based on config.
 * When disabled the no-op tracer is returned so callers pay zero overhead.
 * When enabled but the exporter is unavailable, warnings are logged and
 * execution continues unless `required` is true.
 */
import { NoopTracer } from './noop.js';
import { LiveSpan } from './spans.js';
import { generateSpanId } from './context.js';
// ---- OtelTracer (real implementation) ----
export class OtelTracer {
    constructor(config, requiredFields) {
        this.queue = [];
        this.flushChain = Promise.resolve();
        this.shuttingDown = false;
        this.config = config;
        this.requiredFields = requiredFields;
        this.startAutoFlush();
    }
    startSpan(name, options) {
        const ctx = options?.parent
            ? { traceId: options.parent.traceId, spanId: generateSpanId(), parentSpanId: options.parent.spanId, requiredFields: this.requiredFields }
            : { traceId: '', spanId: generateSpanId(), requiredFields: this.requiredFields };
        // If no parent, the span IS the root — needs its own traceId
        if (!options?.parent) {
            ctx.traceId = generateSpanId() + generateSpanId(); // 32 hex
        }
        return new LiveSpan(ctx, name, options?.kind ?? 'INTERNAL', this.requiredFields, options?.attributes ?? {}, (span) => this.enqueue(span));
    }
    enqueue(span) {
        const max = this.config.max_queue_size ?? 1000;
        if (this.queue.length >= max) {
            this.queue.shift();
            console.warn(`[observability] OTEL queue full (${max}), dropping oldest span`);
        }
        this.queue.push(span);
        const batch = this.config.batch_size ?? 100;
        if (this.queue.length >= batch && !this.shuttingDown) {
            this.flush().catch((e) => console.error(`[observability] OTEL export error: ${e}`));
        }
    }
    startAutoFlush() {
        const interval = this.config.timeout_ms ?? 5000;
        this.flushTimer = setInterval(() => {
            this.flush().catch((e) => console.error(`[observability] OTEL flush error: ${e}`));
        }, interval);
        if (this.flushTimer.unref)
            this.flushTimer.unref();
    }
    async flush() {
        if (this.queue.length === 0)
            return;
        this.flushChain = this.flushChain.then(() => this.doFlush());
        return this.flushChain;
    }
    async doFlush() {
        const batch = this.queue.splice(0, this.config.batch_size ?? 100);
        if (batch.length === 0)
            return;
        const payload = {
            resourceSpans: [
                {
                    resource: { attributes: [] },
                    scopeSpans: [
                        {
                            scope: { name: '@pictl/observability', version: '26.4.5' },
                            spans: batch.map((s) => ({
                                traceId: s.traceId,
                                spanId: s.spanId,
                                parentSpanId: s.parentSpanId,
                                name: s.name,
                                kind: s.kind,
                                startTimeUnixNano: String(s.startTimeNs),
                                endTimeUnixNano: String(s.endTimeNs ?? Date.now() * 1000000),
                                status: s.status ?? { code: 'UNSET' },
                                attributes: encodeAttributes(s.attributes),
                                events: s.events?.map((ev) => ({
                                    timeUnixNano: String(ev.timestampNs),
                                    name: ev.name,
                                    attributes: encodeAttributes(ev.attributes ?? {}),
                                })),
                            })),
                        },
                    ],
                },
            ],
        };
        try {
            await this.sendPayload(payload);
        }
        catch (err) {
            if (this.config.required) {
                throw err; // Propagate when required=true
            }
            console.warn(`[observability] OTEL export failed (non-blocking): ${err}`);
        }
    }
    async sendPayload(payload) {
        const url = this.config.endpoint.replace(/\/$/, '') + '/v1/traces';
        const timeout = this.config.timeout_ms ?? 5000;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal,
            });
            if (!res.ok) {
                throw new Error(`OTEL export HTTP ${res.status}: ${res.statusText}`);
            }
        }
        finally {
            clearTimeout(timer);
        }
    }
    async shutdown() {
        this.shuttingDown = true;
        if (this.flushTimer)
            clearInterval(this.flushTimer);
        while (this.queue.length > 0) {
            await this.doFlush();
        }
    }
}
// ---- Factory ----
/**
 * Create a Tracer based on config.
 * - Config missing or disabled -> NoopTracer (zero overhead)
 * - Enabled -> OtelTracer
 */
export function createTracer(config, requiredFields) {
    if (!config || !config.enabled) {
        return new NoopTracer();
    }
    return new OtelTracer(config, requiredFields);
}
// ---- Helpers ----
function encodeAttributes(attrs) {
    return Object.entries(attrs).map(([key, value]) => ({
        key,
        value: encodeValue(value),
    }));
}
function encodeValue(value) {
    if (typeof value === 'string')
        return { stringValue: value };
    if (typeof value === 'boolean')
        return { boolValue: value };
    if (typeof value === 'number') {
        return Number.isInteger(value)
            ? { intValue: String(value) }
            : { doubleValue: value };
    }
    return { stringValue: JSON.stringify(value) };
}
