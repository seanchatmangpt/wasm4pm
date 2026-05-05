/**
 * Agent 1: OCEL Harvester
 *
 * Converts OpenTelemetry spans to Object-Centric Event Log (OCEL) format.
 * Ground truth: Wil van der Aalst — event log is the source of truth.
 *
 * Core transformation: OTEL spans → OCEL events + objects → process conformance truth
 */
export const capturedHarvestSpans = [];
export class OcelHarvester {
    constructor() {
        this.objectIndex = new Map();
        this.eventIndex = new Map();
    }
    async harvestWithInstrumentation(spans) {
        const harvestSpan = {
            name: 'agent_1.harvest',
            status: { code: 0 },
            attributes: {
                'agent_id': 'agent_1',
                'harvest.input_span_count': spans.length,
            },
        };
        try {
            for (const span of spans) {
                if (!span.name)
                    throw new Error('span missing required field: name');
                if (!span.spanId)
                    throw new Error('span missing required field: spanId');
                if (!span.startTimeUnixNano)
                    throw new Error('span missing required field: startTimeUnixNano');
            }
            const ocel = await this.convertSpansToOcel(spans);
            harvestSpan.attributes['harvest.event_count'] = ocel.events.length;
            harvestSpan.attributes['harvest.object_count'] = ocel.objects.length;
            harvestSpan.attributes['harvest.status'] = 'ok';
            capturedHarvestSpans.push(harvestSpan);
            return ocel;
        }
        catch (error) {
            harvestSpan.status.code = 2;
            harvestSpan.attributes['harvest.error'] = error instanceof Error ? error.message : String(error);
            harvestSpan.attributes['harvest.status'] = 'error';
            capturedHarvestSpans.push(harvestSpan);
            throw error;
        }
    }
    async convertSpansToOcel(spans) {
        this.objectIndex.clear();
        this.eventIndex.clear();
        // Phase 1: Create objects for each span (tool_invocation)
        const traceInvocations = new Map();
        for (const span of spans) {
            const traceKey = span.traceId;
            if (!traceInvocations.has(traceKey)) {
                const obj = {
                    id: `invocation-${traceKey}`,
                    type: 'tool_invocation',
                    state: 'in_progress',
                    attributes: { 'invocation:trace_id': traceKey },
                };
                traceInvocations.set(traceKey, obj);
                this.objectIndex.set(obj.id, obj);
            }
        }
        // Phase 2: Create result objects based on span attributes
        for (const span of spans) {
            if (span.attributes?.['pm.result_id']) {
                const resultId = String(span.attributes['pm.result_id']);
                const resultType = this.inferResultType(span.name);
                const obj = {
                    id: `result-${resultId}`,
                    type: resultType,
                    state: 'completed',
                    attributes: { 'result:span_id': span.spanId },
                };
                this.objectIndex.set(obj.id, obj);
            }
        }
        // Phase 3: Create events from spans
        const sortedSpans = spans.sort((a, b) => (a.startTimeUnixNano ?? 0) - (b.startTimeUnixNano ?? 0));
        for (const span of sortedSpans) {
            const activity = this.normalizeActivity(span.name);
            const timestamp = this.formatTimestamp(span.startTimeUnixNano ?? 0);
            // Collect objects for this event
            const objects = [];
            const traceKey = span.traceId;
            const invocationObj = traceInvocations.get(traceKey);
            if (invocationObj) {
                objects.push(invocationObj.id);
            }
            // Add result object if present
            if (span.attributes?.['pm.result_id']) {
                objects.push(`result-${span.attributes['pm.result_id']}`);
            }
            // Build event attributes
            const attributes = {
                'ocel:object_type': objects.length > 0 ? objects[0].split('-')[0] : 'unknown',
            };
            // Add causality info
            if (span.parentSpanId) {
                attributes['ocel:causality'] = span.parentSpanId;
            }
            // Copy span attributes, prefixed
            if (span.attributes) {
                for (const [key, value] of Object.entries(span.attributes)) {
                    attributes[`pm:${key}`] = value;
                }
            }
            const event = {
                id: span.spanId,
                activity,
                timestamp,
                objects,
                attributes,
            };
            this.eventIndex.set(event.id, event);
        }
        // Phase 4: Update object states based on final events
        for (const invocation of traceInvocations.values()) {
            const lastEvent = sortedSpans[sortedSpans.length - 1];
            if (lastEvent) {
                if (lastEvent.status?.code === 0) {
                    invocation.state = 'completed';
                }
                else {
                    invocation.state = 'failed';
                }
            }
        }
        return {
            version: '2.0',
            events: Array.from(this.eventIndex.values()),
            objects: Array.from(this.objectIndex.values()),
            metadata: {
                source: 'wasm4pm-otel-harvester',
                harvestedAt: new Date().toISOString(),
                spanCount: spans.length,
            },
        };
    }
    normalizeActivity(spanName) {
        return spanName
            .split('.')
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(':');
    }
    inferResultType(spanName) {
        if (spanName.includes('discovery'))
            return 'discovery_result';
        if (spanName.includes('conformance'))
            return 'conformance_result';
        if (spanName.includes('analysis'))
            return 'analysis_result';
        return 'receipt_chain';
    }
    formatTimestamp(nanoTime) {
        const millis = Math.floor(nanoTime / 1000000);
        return new Date(millis).toISOString();
    }
}
//# sourceMappingURL=ocel-harvester.js.map