/**
 * Agent 1: OCEL Harvester — RED Test
 *
 * Mandate: Convert OTEL spans to Object-Centric Event Log (OCEL) format
 * Ground Truth: van der Aalst doctrine — event log is the source of truth
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { OcelHarvester, capturedHarvestSpans } from '../harness/ocel-harvester';
describe('Agent 1: OCEL Harvester', () => {
    let harvester;
    beforeEach(() => {
        harvester = new OcelHarvester();
        capturedHarvestSpans.length = 0;
    });
    afterEach(() => {
        capturedHarvestSpans.length = 0;
    });
    describe('OCEL Conversion', () => {
        it('converts single OTEL span to OCEL event', async () => {
            // Arrange: Create minimal OTEL span
            const spans = [
                {
                    traceId: 'trace-1',
                    spanId: 'span-1',
                    parentSpanId: undefined,
                    name: 'pm.discovery',
                    startTimeUnixNano: 1712953200000000000,
                    endTimeUnixNano: 1712953200100000000,
                    kind: 2, // INTERNAL
                    status: { code: 0 }, // OK
                    attributes: {
                        'pm.algorithm': 'dfg',
                        'pm.input_size': 100,
                        'pm.fitness': 0.95,
                    },
                },
            ];
            // Act: Harvest spans with instrumentation
            const startTime = Date.now();
            const ocel = await harvester.harvestWithInstrumentation(spans);
            const endTime = Date.now();
            // Assert: OCEL structure is valid
            expect(ocel).toBeDefined();
            expect(ocel.objects).toHaveLength(1);
            expect(ocel.events).toHaveLength(1);
            const event = ocel.events[0];
            expect(event.id).toBe('span-1');
            expect(event.activity).toBe('pm:discovery');
            expect(event.timestamp).toBeDefined();
            expect(event.objects).toHaveLength(1);
            // Assert: Object-centric structure
            const obj = ocel.objects[0];
            expect(obj.id).toContain('trace-1');
            expect(obj.type).toBe('tool_invocation');
            expect(obj.state).toBe('completed');
            // Assert: Attributes preserved
            expect(event.attributes['pm:algorithm']).toBe('dfg');
            expect(event.attributes['pm:fitness']).toBe(0.95);
            // Assert: OTEL instrumentation captured
            expect(capturedHarvestSpans.length).toBeGreaterThan(0);
            const harvestSpan = capturedHarvestSpans[0];
            expect(harvestSpan.name).toBe('agent_1.harvest');
            expect(harvestSpan.attributes['harvest.event_count']).toBe(1);
            expect(harvestSpan.attributes['harvest.status']).toBe('ok');
            expect(harvestSpan.status.code).toBe(0);
        });
        it('handles multiple spans with causality', async () => {
            // Arrange: Create span chain (A → B → C)
            const spans = [
                {
                    traceId: 'trace-1',
                    spanId: 'span-1',
                    parentSpanId: undefined,
                    name: 'pm.discovery',
                    startTimeUnixNano: 1712953200000000000,
                    endTimeUnixNano: 1712953200100000000,
                    kind: 2,
                    status: { code: 0 },
                    attributes: { 'pm.algorithm': 'dfg' },
                },
                {
                    traceId: 'trace-1',
                    spanId: 'span-2',
                    parentSpanId: 'span-1',
                    name: 'pm.conformance',
                    startTimeUnixNano: 1712953200100000000,
                    endTimeUnixNano: 1712953200200000000,
                    kind: 2,
                    status: { code: 0 },
                    attributes: { 'pm.algorithm': 'token_replay' },
                },
                {
                    traceId: 'trace-1',
                    spanId: 'span-3',
                    parentSpanId: 'span-2',
                    name: 'pm.analysis',
                    startTimeUnixNano: 1712953200200000000,
                    endTimeUnixNano: 1712953200300000000,
                    kind: 2,
                    status: { code: 0 },
                    attributes: { 'pm.analysis_type': 'performance' },
                },
            ];
            // Act
            const ocel = await harvester.harvestWithInstrumentation(spans);
            // Assert: All events captured in order
            expect(ocel.events).toHaveLength(3);
            expect(ocel.events[0].activity).toBe('pm:discovery');
            expect(ocel.events[1].activity).toBe('pm:conformance');
            expect(ocel.events[2].activity).toBe('pm:analysis');
            // Assert: Causality (parent-child relationships) preserved
            expect(ocel.events[1].attributes['ocel:causality']).toContain('span-1');
            expect(ocel.events[2].attributes['ocel:causality']).toContain('span-2');
            // Assert: Same trace object
            expect(ocel.objects[0].state).toBe('in_progress'); // Still running
        });
        it('creates object for each distinct artifact (tool_invocation, discovery_result, etc.)', async () => {
            // Arrange: Spans with different object types
            const spans = [
                {
                    traceId: 'trace-1',
                    spanId: 'discovery-1',
                    parentSpanId: undefined,
                    name: 'pm.discovery',
                    startTimeUnixNano: 1712953200000000000,
                    endTimeUnixNano: 1712953200100000000,
                    kind: 2,
                    status: { code: 0 },
                    attributes: {
                        'pm.algorithm': 'dfg',
                        'pm.result_id': 'result-dfg-1',
                    },
                },
            ];
            // Act
            const ocel = await harvester.harvestWithInstrumentation(spans);
            // Assert: Multiple objects created (invocation + result)
            expect(ocel.objects.length).toBeGreaterThanOrEqual(2);
            const invocationObj = ocel.objects.find((o) => o.type === 'tool_invocation');
            const resultObj = ocel.objects.find((o) => o.type === 'discovery_result');
            expect(invocationObj).toBeDefined();
            expect(resultObj).toBeDefined();
            // Assert: Event links both objects
            const event = ocel.events[0];
            expect(event.objects).toContain(invocationObj?.id);
            expect(event.objects).toContain(resultObj?.id);
        });
        it('rejects malformed spans with clear error', async () => {
            // Arrange: Span missing required fields
            const invalidSpans = [
                {
                    traceId: 'trace-1',
                    spanId: 'span-1',
                    // Missing: name, startTime, endTime
                    kind: 2,
                    status: { code: 0 },
                },
            ];
            // Act & Assert
            await expect(harvester.harvestWithInstrumentation(invalidSpans)).rejects.toThrow('span missing required field: name');
        });
    });
    describe('OTEL Instrumentation', () => {
        it('emits agent_1.harvest span with metrics', async () => {
            const spans = [
                {
                    traceId: 'trace-1',
                    spanId: 'span-1',
                    parentSpanId: undefined,
                    name: 'pm.discovery',
                    startTimeUnixNano: 1712953200000000000,
                    endTimeUnixNano: 1712953200100000000,
                    kind: 2,
                    status: { code: 0 },
                    attributes: {},
                },
            ];
            await harvester.harvestWithInstrumentation(spans);
            expect(capturedHarvestSpans.length).toBeGreaterThan(0);
            const harvestSpan = capturedHarvestSpans[0];
            expect(harvestSpan.name).toBe('agent_1.harvest');
            expect(harvestSpan.status.code).toBe(0);
            expect(harvestSpan.attributes['agent_id']).toBe('agent_1');
            expect(harvestSpan.attributes['harvest.input_span_count']).toBe(1);
            expect(harvestSpan.attributes['harvest.event_count']).toBe(1);
            expect(harvestSpan.attributes['harvest.status']).toBe('ok');
        });
        it('emits error span on harvest failure', async () => {
            const invalidSpans = [
                {
                    traceId: 'trace-1',
                    spanId: 'span-1',
                },
            ];
            try {
                await harvester.harvestWithInstrumentation(invalidSpans);
            }
            catch {
                // Expected
            }
            expect(capturedHarvestSpans.length).toBeGreaterThan(0);
            const errorSpan = capturedHarvestSpans[0];
            expect(errorSpan.status.code).toBe(2);
            expect(errorSpan.attributes['harvest.error']).toBeDefined();
        });
    });
    describe('Van der Aalst Conformance', () => {
        it('produces OCEL that conforms to weaver semconv schema', async () => {
            // Arrange
            const spans = [
                {
                    traceId: 'trace-1',
                    spanId: 'span-1',
                    parentSpanId: undefined,
                    name: 'pm.discovery',
                    startTimeUnixNano: 1712953200000000000,
                    endTimeUnixNano: 1712953200100000000,
                    kind: 2,
                    status: { code: 0 },
                    attributes: { 'pm.algorithm': 'dfg' },
                },
            ];
            // Act
            const ocel = await harvester.harvestWithInstrumentation(spans);
            // Assert: OCEL schema conformance
            expect(ocel).toHaveProperty('events');
            expect(ocel).toHaveProperty('objects');
            expect(ocel).toHaveProperty('version');
            // All events must have required fields per semconv
            ocel.events.forEach((event) => {
                expect(event).toHaveProperty('id');
                expect(event).toHaveProperty('activity');
                expect(event).toHaveProperty('timestamp');
                expect(event).toHaveProperty('objects');
            });
            // All objects must have required fields per semconv
            ocel.objects.forEach((obj) => {
                expect(obj).toHaveProperty('id');
                expect(obj).toHaveProperty('type');
                expect(obj).toHaveProperty('state');
            });
        });
    });
});
//# sourceMappingURL=agent-1-ocel-harvester.test.js.map