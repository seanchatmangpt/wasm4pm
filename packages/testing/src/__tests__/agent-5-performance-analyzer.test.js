/**
 * Agent 5: Performance Analyzer — RED Test
 *
 * Mandate: Quantify process execution time, resource usage, bottlenecks
 * Grounding: van der Aalst — time perspective + cost perspective on processes
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { PerformanceAnalyzer } from '../harness/performance-analyzer';
describe('Agent 5: Performance Analyzer', () => {
    let analyzer;
    beforeEach(() => {
        analyzer = new PerformanceAnalyzer();
    });
    describe('Activity Metrics', () => {
        it('calculates avg duration per activity', async () => {
            const ocel = {
                version: '2.0',
                events: [
                    {
                        id: '1',
                        activity: 'process',
                        timestamp: '2026-04-12T10:00:00Z',
                        objects: ['t1'],
                        attributes: { duration_ms: 100 },
                    },
                    {
                        id: '2',
                        activity: 'validate',
                        timestamp: '2026-04-12T10:00:01Z',
                        objects: ['t1'],
                        attributes: { duration_ms: 50 },
                    },
                    {
                        id: '3',
                        activity: 'process',
                        timestamp: '2026-04-12T10:00:02Z',
                        objects: ['t2'],
                        attributes: { duration_ms: 120 },
                    },
                ],
                objects: [
                    { id: 't1', type: 'tool_invocation', state: 'completed', attributes: {} },
                    { id: 't2', type: 'tool_invocation', state: 'completed', attributes: {} },
                ],
                metadata: {
                    source: 'test',
                    harvestedAt: new Date().toISOString(),
                    spanCount: 3,
                },
            };
            const result = await analyzer.analyzePerformance(ocel);
            const processMetric = result.activityMetrics.find((m) => m.activity === 'process');
            expect(processMetric).toBeDefined();
            expect(processMetric?.avgDurationMs).toBeGreaterThan(0);
            expect(processMetric?.count).toBe(2);
        });
        it('tracks min/max duration and standard deviation', async () => {
            const ocel = {
                version: '2.0',
                events: [
                    {
                        id: '1',
                        activity: 'task',
                        timestamp: '2026-04-12T10:00:00Z',
                        objects: ['t1'],
                        attributes: { duration_ms: 50 },
                    },
                    {
                        id: '2',
                        activity: 'task',
                        timestamp: '2026-04-12T10:00:01Z',
                        objects: ['t1'],
                        attributes: { duration_ms: 100 },
                    },
                    {
                        id: '3',
                        activity: 'task',
                        timestamp: '2026-04-12T10:00:02Z',
                        objects: ['t1'],
                        attributes: { duration_ms: 150 },
                    },
                ],
                objects: [{ id: 't1', type: 'tool_invocation', state: 'completed', attributes: {} }],
                metadata: {
                    source: 'test',
                    harvestedAt: new Date().toISOString(),
                    spanCount: 3,
                },
            };
            const result = await analyzer.analyzePerformance(ocel);
            const taskMetric = result.activityMetrics.find((m) => m.activity === 'task');
            expect(taskMetric?.minDurationMs).toBe(50);
            expect(taskMetric?.maxDurationMs).toBe(150);
            expect(taskMetric?.stdDevMs).toBeGreaterThan(0);
        });
        it('aggregates cost metrics per activity', async () => {
            const ocel = {
                version: '2.0',
                events: [
                    {
                        id: '1',
                        activity: 'expensive',
                        timestamp: '2026-04-12T10:00:00Z',
                        objects: ['t1'],
                        attributes: { duration_ms: 100, cost: 50 },
                    },
                    {
                        id: '2',
                        activity: 'cheap',
                        timestamp: '2026-04-12T10:00:01Z',
                        objects: ['t1'],
                        attributes: { duration_ms: 50, cost: 5 },
                    },
                ],
                objects: [{ id: 't1', type: 'tool_invocation', state: 'completed', attributes: {} }],
                metadata: {
                    source: 'test',
                    harvestedAt: new Date().toISOString(),
                    spanCount: 2,
                },
            };
            const result = await analyzer.analyzePerformance(ocel);
            const expensiveMetric = result.activityMetrics.find((m) => m.activity === 'expensive');
            expect(expensiveMetric?.totalCostUnits).toBe(50);
            expect(expensiveMetric?.avgCostPerExecution).toBe(50);
        });
    });
    describe('Bottleneck Detection', () => {
        it('identifies activities consuming most time', async () => {
            const ocel = {
                version: '2.0',
                events: [
                    {
                        id: '1',
                        activity: 'quick',
                        timestamp: '2026-04-12T10:00:00Z',
                        objects: ['t1'],
                        attributes: { duration_ms: 10 },
                    },
                    {
                        id: '2',
                        activity: 'slow',
                        timestamp: '2026-04-12T10:00:01Z',
                        objects: ['t1'],
                        attributes: { duration_ms: 1000 },
                    },
                ],
                objects: [{ id: 't1', type: 'tool_invocation', state: 'completed', attributes: {} }],
                metadata: {
                    source: 'test',
                    harvestedAt: new Date().toISOString(),
                    spanCount: 2,
                },
            };
            const result = await analyzer.analyzePerformance(ocel);
            const topBottleneck = result.bottlenecks[0];
            expect(topBottleneck.activity).toBe('slow');
            expect(topBottleneck.bottleneckScore).toBeGreaterThan(0.5);
        });
        it('calculates bottleneck contribution percentage', async () => {
            const ocel = {
                version: '2.0',
                events: [
                    {
                        id: '1',
                        activity: 'a',
                        timestamp: '2026-04-12T10:00:00Z',
                        objects: ['t1'],
                        attributes: { duration_ms: 100 },
                    },
                    {
                        id: '2',
                        activity: 'b',
                        timestamp: '2026-04-12T10:00:01Z',
                        objects: ['t1'],
                        attributes: { duration_ms: 900 },
                    },
                ],
                objects: [{ id: 't1', type: 'tool_invocation', state: 'completed', attributes: {} }],
                metadata: {
                    source: 'test',
                    harvestedAt: new Date().toISOString(),
                    spanCount: 2,
                },
            };
            const result = await analyzer.analyzePerformance(ocel);
            const bottleneck = result.bottlenecks.find((b) => b.activity === 'b');
            expect(bottleneck?.contributionPercent).toBeGreaterThan(80);
        });
        it('emits recommendations for high-impact bottlenecks', async () => {
            const ocel = {
                version: '2.0',
                events: [
                    {
                        id: '1',
                        activity: 'main_bottleneck',
                        timestamp: '2026-04-12T10:00:00Z',
                        objects: ['t1'],
                        attributes: { duration_ms: 5000 },
                    },
                ],
                objects: [{ id: 't1', type: 'tool_invocation', state: 'completed', attributes: {} }],
                metadata: {
                    source: 'test',
                    harvestedAt: new Date().toISOString(),
                    spanCount: 1,
                },
            };
            const result = await analyzer.analyzePerformance(ocel);
            expect(result.recommendation).toContain('main_bottleneck');
        });
    });
    describe('Critical Path Analysis', () => {
        it('identifies longest execution sequence', async () => {
            const ocel = {
                version: '2.0',
                events: [
                    // Trace 1: a→b→c (fastest)
                    {
                        id: '1',
                        activity: 'a',
                        timestamp: '2026-04-12T10:00:00Z',
                        objects: ['t1'],
                        attributes: {},
                    },
                    {
                        id: '2',
                        activity: 'b',
                        timestamp: '2026-04-12T10:00:01Z',
                        objects: ['t1'],
                        attributes: {},
                    },
                    {
                        id: '3',
                        activity: 'c',
                        timestamp: '2026-04-12T10:00:02Z',
                        objects: ['t1'],
                        attributes: {},
                    },
                    // Trace 2: x→y→z→w (longest)
                    {
                        id: '4',
                        activity: 'x',
                        timestamp: '2026-04-12T10:01:00Z',
                        objects: ['t2'],
                        attributes: {},
                    },
                    {
                        id: '5',
                        activity: 'y',
                        timestamp: '2026-04-12T10:02:00Z',
                        objects: ['t2'],
                        attributes: {},
                    },
                    {
                        id: '6',
                        activity: 'z',
                        timestamp: '2026-04-12T10:03:00Z',
                        objects: ['t2'],
                        attributes: {},
                    },
                    {
                        id: '7',
                        activity: 'w',
                        timestamp: '2026-04-12T10:04:00Z',
                        objects: ['t2'],
                        attributes: {},
                    },
                ],
                objects: [
                    { id: 't1', type: 'tool_invocation', state: 'completed', attributes: {} },
                    { id: 't2', type: 'tool_invocation', state: 'completed', attributes: {} },
                ],
                metadata: {
                    source: 'test',
                    harvestedAt: new Date().toISOString(),
                    spanCount: 7,
                },
            };
            const result = await analyzer.analyzePerformance(ocel);
            expect(result.criticalPath.length).toBeGreaterThan(0);
            expect(result.criticalPathDurationMs).toBeGreaterThan(0);
        });
        it('critical path duration reflects longest trace', async () => {
            const ocel = {
                version: '2.0',
                events: [
                    {
                        id: '1',
                        activity: 'step1',
                        timestamp: '2026-04-12T10:00:00Z',
                        objects: ['t1'],
                        attributes: {},
                    },
                    {
                        id: '2',
                        activity: 'step2',
                        timestamp: '2026-04-12T10:00:05Z',
                        objects: ['t1'],
                        attributes: {},
                    },
                ],
                objects: [{ id: 't1', type: 'tool_invocation', state: 'completed', attributes: {} }],
                metadata: {
                    source: 'test',
                    harvestedAt: new Date().toISOString(),
                    spanCount: 2,
                },
            };
            const result = await analyzer.analyzePerformance(ocel);
            // 5 seconds between events = 5000ms
            expect(result.criticalPathDurationMs).toBe(5000);
        });
    });
    describe('Trace Timing', () => {
        it('calculates total and average trace time', async () => {
            const ocel = {
                version: '2.0',
                events: [
                    // Trace 1: 2 seconds
                    {
                        id: '1',
                        activity: 'a',
                        timestamp: '2026-04-12T10:00:00Z',
                        objects: ['t1'],
                        attributes: {},
                    },
                    {
                        id: '2',
                        activity: 'b',
                        timestamp: '2026-04-12T10:00:02Z',
                        objects: ['t1'],
                        attributes: {},
                    },
                    // Trace 2: 4 seconds
                    {
                        id: '3',
                        activity: 'a',
                        timestamp: '2026-04-12T10:00:10Z',
                        objects: ['t2'],
                        attributes: {},
                    },
                    {
                        id: '4',
                        activity: 'b',
                        timestamp: '2026-04-12T10:00:14Z',
                        objects: ['t2'],
                        attributes: {},
                    },
                ],
                objects: [
                    { id: 't1', type: 'tool_invocation', state: 'completed', attributes: {} },
                    { id: 't2', type: 'tool_invocation', state: 'completed', attributes: {} },
                ],
                metadata: {
                    source: 'test',
                    harvestedAt: new Date().toISOString(),
                    spanCount: 4,
                },
            };
            const result = await analyzer.analyzePerformance(ocel);
            expect(result.totalProcessTimeMs).toBe(6000); // 2000 + 4000
            expect(result.avgTraceTimeMs).toBe(3000); // Average of 2 traces
            expect(result.minTraceTimeMs).toBe(2000);
            expect(result.maxTraceTimeMs).toBe(4000);
        });
    });
    describe('Resource & Concurrency', () => {
        it('estimates resource utilization from concurrent activities', async () => {
            const ocel = {
                version: '2.0',
                events: [
                    {
                        id: '1',
                        activity: 'task1',
                        timestamp: '2026-04-12T10:00:00Z',
                        objects: ['obj1', 'obj2'],
                        attributes: {},
                    },
                ],
                objects: [
                    { id: 'obj1', type: 'tool_invocation', state: 'completed', attributes: {} },
                    { id: 'obj2', type: 'tool_invocation', state: 'completed', attributes: {} },
                ],
                metadata: {
                    source: 'test',
                    harvestedAt: new Date().toISOString(),
                    spanCount: 1,
                },
            };
            const result = await analyzer.analyzePerformance(ocel);
            expect(result.resourceUtilizationPercent).toBeGreaterThan(0);
            expect(result.resourceUtilizationPercent).toBeLessThanOrEqual(100);
        });
        it('calculates parallelization potential', async () => {
            const ocel = {
                version: '2.0',
                events: [
                    {
                        id: '1',
                        activity: 'a',
                        timestamp: '2026-04-12T10:00:00Z',
                        objects: ['t1'],
                        attributes: {},
                    },
                    {
                        id: '2',
                        activity: 'b',
                        timestamp: '2026-04-12T10:00:00Z',
                        objects: ['t1'],
                        attributes: {},
                    },
                ],
                objects: [{ id: 't1', type: 'tool_invocation', state: 'completed', attributes: {} }],
                metadata: {
                    source: 'test',
                    harvestedAt: new Date().toISOString(),
                    spanCount: 2,
                },
            };
            const result = await analyzer.analyzePerformance(ocel);
            expect(result.parallelizationPotential).toBeGreaterThanOrEqual(0);
            expect(result.parallelizationPotential).toBeLessThanOrEqual(1);
        });
    });
});
//# sourceMappingURL=agent-5-performance-analyzer.test.js.map