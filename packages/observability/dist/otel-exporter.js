/**
 * OpenTelemetry event exporter with non-blocking queue and batch export
 * Events are queued and exported in batches to OTLP HTTP endpoint
 * Never blocks execution; errors are logged but don't fail execution
 * PRD §18.5: "Telemetry must never break execution unless explicitly required"
 */
/**
 * Batched OTEL event exporter
 * Manages queue, batching, timeouts, and HTTP export
 * All operations are non-blocking and async
 */
export class OtelExporter {
    constructor(config) {
        this.queue = [];
        this.flushPromise = Promise.resolve();
        this.isShuttingDown = false;
        this.config = config;
        if (config.enabled) {
            this.startAutoFlush();
        }
    }
    /**
     * Start automatic flush timer
     */
    startAutoFlush() {
        const timeout = this.config.timeout_ms ?? 5000;
        this.flushTimer = setInterval(() => {
            this.flush().catch((error) => {
                // Non-blocking: log error but don't break execution
                console.error(`[observability] OTEL flush failed: ${error}`);
            });
        }, timeout);
        // Allow process to exit even if timer is pending
        if (this.flushTimer.unref) {
            this.flushTimer.unref();
        }
    }
    /**
     * Emit an OTEL event (non-blocking)
     * Returns immediately; queuing happens synchronously, export happens asynchronously
     */
    emit(event) {
        if (!this.config.enabled)
            return;
        const maxSize = this.config.max_queue_size ?? 1000;
        // Drop oldest if queue is full (PRD §18.5: never block)
        if (this.queue.length >= maxSize) {
            this.queue.shift();
            console.warn(`[observability] OTEL queue full (${maxSize}), dropping oldest event`);
        }
        this.queue.push(event);
        // Auto-flush if batch size reached
        const batchSize = this.config.batch_size ?? 100;
        if (this.queue.length >= batchSize && !this.isShuttingDown) {
            // Non-blocking: fire and forget
            this.flush().catch((error) => {
                console.error(`[observability] OTEL export failed: ${error}`);
            });
        }
    }
    /**
     * Flush queued events to OTEL HTTP endpoint
     */
    async flush() {
        if (this.queue.length === 0)
            return;
        // Chain flushes to avoid concurrent exports
        this.flushPromise = this.flushPromise.then(() => this.doFlush());
        return this.flushPromise;
    }
    /**
     * Internal flush implementation
     */
    async doFlush() {
        const events = this.queue.splice(0, this.config.batch_size ?? 100);
        if (events.length === 0)
            return;
        try {
            await this.exportEvents(events);
        }
        catch (error) {
            // Non-blocking: log but don't throw
            // If required=true, we could escalate, but PRD §18.5 says errors shouldn't break execution
            if (this.config.required) {
                console.error(`[observability] Required OTEL export failed: ${error}`);
            }
            else {
                console.debug(`[observability] Optional OTEL export failed: ${error}`);
            }
        }
    }
    /**
     * Export events to OTEL HTTP endpoint
     * This is the actual HTTP export logic
     */
    async exportEvents(events) {
        const payload = {
            resourceSpans: [
                {
                    resource: {
                        attributes: [], // Could add resource attributes
                    },
                    scopeSpans: [
                        {
                            scope: {
                                name: '@wasm4pm/observability',
                                version: '26.4.5',
                            },
                            spans: events.map((event) => ({
                                traceId: event.trace_id,
                                spanId: event.span_id,
                                parentSpanId: event.parent_span_id,
                                name: event.name,
                                kind: event.kind ?? 'INTERNAL',
                                startTimeUnixNano: event.start_time.toString(),
                                endTimeUnixNano: (event.end_time ?? Date.now() * 1000000).toString(),
                                status: event.status ?? { code: 'UNSET' },
                                attributes: this.encodeAttributes(event.attributes),
                                events: event.events?.map((evt) => ({
                                    timeUnixNano: evt.timestamp.toString(),
                                    name: evt.name,
                                    attributes: this.encodeAttributes(evt.attributes ?? {}),
                                })),
                            })),
                        },
                    ],
                },
            ],
        };
        const timeout = this.config.timeout_ms ?? 5000;
        await this.sendToEndpoint(payload, timeout);
    }
    /**
     * Send payload to OTEL endpoint via HTTP POST
     */
    async sendToEndpoint(payload, timeoutMs) {
        // Use AbortController for timeout
        const controller = new AbortController();
        const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(this.getExportUrl(), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
                signal: controller.signal,
            });
            if (!response.ok) {
                throw new Error(`OTEL export failed with status ${response.status}: ${response.statusText}`);
            }
        }
        finally {
            clearTimeout(timeoutHandle);
        }
    }
    /**
     * Get the correct OTEL export URL based on exporter type
     */
    getExportUrl() {
        const endpoint = this.config.endpoint.replace(/\/$/, ''); // Remove trailing slash
        if (this.config.exporter === 'otlp_http') {
            return `${endpoint}/v1/traces`;
        }
        else if (this.config.exporter === 'otlp_grpc') {
            // For gRPC, we'd typically use a different client library
            // For now, return HTTP endpoint as fallback
            return `${endpoint}/v1/traces`;
        }
        throw new Error(`Unknown OTEL exporter: ${this.config.exporter}`);
    }
    /**
     * Encode attributes for OTEL format
     * OTEL uses typed attributes
     */
    encodeAttributes(attrs) {
        return Object.entries(attrs).map(([key, value]) => ({
            key,
            value: this.encodeValue(value),
        }));
    }
    /**
     * Encode a single attribute value
     */
    encodeValue(value) {
        if (typeof value === 'string') {
            return { stringValue: value };
        }
        else if (typeof value === 'number') {
            if (Number.isInteger(value)) {
                return { intValue: value.toString() };
            }
            else {
                return { doubleValue: value };
            }
        }
        else if (typeof value === 'boolean') {
            return { boolValue: value };
        }
        else {
            return { stringValue: JSON.stringify(value) };
        }
    }
    /**
     * Gracefully shutdown exporter
     * Flushes any remaining events
     */
    async shutdown() {
        this.isShuttingDown = true;
        try {
            // Stop auto-flush timer
            if (this.flushTimer) {
                clearInterval(this.flushTimer);
            }
            // Flush remaining events
            while (this.queue.length > 0) {
                await this.flush();
            }
            return {
                success: true,
                timestamp: new Date(),
            };
        }
        catch (error) {
            return {
                success: false,
                error: String(error),
                timestamp: new Date(),
            };
        }
    }
}
