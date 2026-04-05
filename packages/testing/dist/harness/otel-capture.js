/**
 * OTEL event capture for testing.
 *
 * Provides in-memory collectors that capture OTEL spans, events, and JSON log
 * entries so tests can assert on observability output without a real collector.
 */
/**
 * In-memory OTEL event collector for testing.
 */
export class OtelCapture {
    constructor() {
        this._spans = [];
        this._jsonEvents = [];
        this._cliEvents = [];
    }
    captureSpan(span) {
        this._spans.push({ ...span, events: [...(span.events ?? [])] });
    }
    captureJson(event) {
        this._jsonEvents.push({ ...event });
    }
    captureCli(event) {
        this._cliEvents.push({ ...event });
    }
    /** Convenience: capture a raw OTEL-like event object */
    captureRaw(event) {
        if ('trace_id' in event || 'traceId' in event) {
            this.captureSpan({
                traceId: (event.trace_id ?? event.traceId),
                spanId: (event.span_id ?? event.spanId),
                parentSpanId: (event.parent_span_id ?? event.parentSpanId),
                name: event.name ?? 'unknown',
                kind: event.kind,
                startTime: (event.start_time ?? event.startTime ?? Date.now()),
                endTime: (event.end_time ?? event.endTime),
                status: event.status,
                attributes: (event.attributes ?? {}),
                events: (event.events ?? []),
            });
        }
        else if ('component' in event) {
            this.captureJson({
                timestamp: event.timestamp ?? new Date().toISOString(),
                component: event.component,
                eventType: (event.event_type ?? event.eventType),
                runId: (event.run_id ?? event.runId),
                data: (event.data ?? {}),
            });
        }
        else {
            this.captureCli({
                level: event.level ?? 'info',
                message: event.message ?? '',
                timestamp: new Date(),
            });
        }
    }
    get spans() { return this._spans; }
    get jsonEvents() { return this._jsonEvents; }
    get cliEvents() { return this._cliEvents; }
    stats() {
        const traceIds = [...new Set(this._spans.map(s => s.traceId))];
        const components = [...new Set(this._jsonEvents.map(e => e.component))];
        return {
            spanCount: this._spans.length,
            eventCount: this._spans.reduce((sum, s) => sum + s.events.length, 0),
            jsonEventCount: this._jsonEvents.length,
            cliEventCount: this._cliEvents.length,
            traceIds,
            components,
        };
    }
    /** Find spans by name pattern */
    findSpans(namePattern) {
        const pattern = typeof namePattern === 'string' ? new RegExp(namePattern, 'i') : namePattern;
        return this._spans.filter(s => pattern.test(s.name));
    }
    /** Find spans that have a specific attribute */
    findSpansByAttribute(key, value) {
        return this._spans.filter(s => {
            if (!(key in s.attributes))
                return false;
            return value === undefined || s.attributes[key] === value;
        });
    }
    /** Find JSON events by component */
    findJsonEvents(component) {
        return this._jsonEvents.filter(e => e.component === component);
    }
    /** Assert that required OTEL attributes are present on all spans */
    assertRequiredAttributes(requiredKeys) {
        const errors = [];
        for (const span of this._spans) {
            for (const key of requiredKeys) {
                if (!(key in span.attributes) || span.attributes[key] === undefined) {
                    errors.push(`Span '${span.name}' (${span.spanId}) missing required attribute '${key}'`);
                }
            }
        }
        return errors;
    }
    /** Assert that OTEL is non-blocking: no span exceeds the given duration */
    assertNonBlocking(maxDurationMs) {
        const errors = [];
        for (const span of this._spans) {
            if (span.endTime && span.startTime) {
                const durationMs = (span.endTime - span.startTime) / 1000000;
                if (durationMs > maxDurationMs) {
                    errors.push(`Span '${span.name}' took ${durationMs.toFixed(1)}ms, exceeds ${maxDurationMs}ms limit`);
                }
            }
        }
        return errors;
    }
    /** Assert span parent-child relationships form valid trees */
    assertValidTraces() {
        const errors = [];
        const spanIds = new Set(this._spans.map(s => s.spanId));
        for (const span of this._spans) {
            if (span.parentSpanId && !spanIds.has(span.parentSpanId)) {
                errors.push(`Span '${span.name}' references unknown parent ${span.parentSpanId}`);
            }
        }
        return errors;
    }
    clear() {
        this._spans.length = 0;
        this._jsonEvents.length = 0;
        this._cliEvents.length = 0;
    }
}
export function createOtelCapture() {
    return new OtelCapture();
}
//# sourceMappingURL=otel-capture.js.map