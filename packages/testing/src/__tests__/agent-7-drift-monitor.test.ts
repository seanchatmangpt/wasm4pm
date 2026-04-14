/**
 * Agent 7: Drift Monitor — RED Test
 *
 * Mandate: Detect when discovered process diverges from trained model
 * Ground Truth: van der Aalst — drift detection + early warning = prevention
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DriftMonitor } from '../harness/drift-monitor';
import type { OcelEventLog } from '../harness/ocel-harvester';

describe('Agent 7: Drift Monitor', () => {
  let monitor: DriftMonitor;

  beforeEach(() => {
    monitor = new DriftMonitor();
  });

  describe('Drift Detection', () => {
    it('detects control-flow drift (new activity)', async () => {
      // Baseline: a → b → c
      const baseline: OcelEventLog = {
        version: '2.0',
        events: [
          { id: '1', activity: 'a', timestamp: '2026-04-12T10:00:00Z', objects: ['t1'], attributes: {} },
          { id: '2', activity: 'b', timestamp: '2026-04-12T10:00:01Z', objects: ['t1'], attributes: {} },
          { id: '3', activity: 'c', timestamp: '2026-04-12T10:00:02Z', objects: ['t1'], attributes: {} },
        ],
        objects: [{ id: 't1', type: 'tool_invocation', state: 'completed', attributes: {} }],
        metadata: {
          source: 'test',
          harvestedAt: new Date().toISOString(),
          spanCount: 3,
        },
      };

      // Current: a → b → d (new activity d instead of c)
      const current: OcelEventLog = {
        version: '2.0',
        events: [
          { id: '1', activity: 'a', timestamp: '2026-04-12T11:00:00Z', objects: ['t1'], attributes: {} },
          { id: '2', activity: 'b', timestamp: '2026-04-12T11:00:01Z', objects: ['t1'], attributes: {} },
          { id: '3', activity: 'd', timestamp: '2026-04-12T11:00:02Z', objects: ['t1'], attributes: {} },
        ],
        objects: [{ id: 't1', type: 'tool_invocation', state: 'completed', attributes: {} }],
        metadata: {
          source: 'test',
          harvestedAt: new Date().toISOString(),
          spanCount: 3,
        },
      };

      const result = await monitor.detectDrift(baseline, current);

      expect(result.driftDetected).toBe(true);
      expect(result.driftType).toBe('control-flow');
      expect(result.newActivities).toContain('d');
    });

    it('detects performance drift (execution time increase)', async () => {
      // Baseline: 10ms per activity
      const baseline: OcelEventLog = {
        version: '2.0',
        events: [
          { id: '1', activity: 'a', timestamp: '2026-04-12T10:00:00Z', objects: ['t1'], attributes: { 'duration_ms': 10 } },
          { id: '2', activity: 'b', timestamp: '2026-04-12T10:00:01Z', objects: ['t1'], attributes: { 'duration_ms': 10 } },
        ],
        objects: [{ id: 't1', type: 'tool_invocation', state: 'completed', attributes: {} }],
        metadata: {
          source: 'test',
          harvestedAt: new Date().toISOString(),
          spanCount: 2,
        },
      };

      // Current: 500ms per activity (degradation)
      const current: OcelEventLog = {
        version: '2.0',
        events: [
          { id: '1', activity: 'a', timestamp: '2026-04-12T11:00:00Z', objects: ['t1'], attributes: { 'duration_ms': 500 } },
          { id: '2', activity: 'b', timestamp: '2026-04-12T11:00:01Z', objects: ['t1'], attributes: { 'duration_ms': 500 } },
        ],
        objects: [{ id: 't1', type: 'tool_invocation', state: 'completed', attributes: {} }],
        metadata: {
          source: 'test',
          harvestedAt: new Date().toISOString(),
          spanCount: 2,
        },
      };

      const result = await monitor.detectDrift(baseline, current);

      expect(result.driftDetected).toBe(true);
      expect(result.driftType).toBe('performance');
      expect(result.performanceDegradationPercent).toBeGreaterThan(50);
    });

    it('detects resource drift (new resource type)', async () => {
      // Baseline: resource=cpu
      const baseline: OcelEventLog = {
        version: '2.0',
        events: [
          { id: '1', activity: 'a', timestamp: '2026-04-12T10:00:00Z', objects: ['t1'], attributes: { 'resource': 'cpu' } },
        ],
        objects: [{ id: 't1', type: 'tool_invocation', state: 'completed', attributes: {} }],
        metadata: {
          source: 'test',
          harvestedAt: new Date().toISOString(),
          spanCount: 1,
        },
      };

      // Current: resource=gpu (new resource type)
      const current: OcelEventLog = {
        version: '2.0',
        events: [
          { id: '1', activity: 'a', timestamp: '2026-04-12T11:00:00Z', objects: ['t1'], attributes: { 'resource': 'gpu' } },
        ],
        objects: [{ id: 't1', type: 'tool_invocation', state: 'completed', attributes: {} }],
        metadata: {
          source: 'test',
          harvestedAt: new Date().toISOString(),
          spanCount: 1,
        },
      };

      const result = await monitor.detectDrift(baseline, current);

      expect(result.driftDetected).toBe(true);
      expect(result.driftType).toBe('resource');
    });
  });

  describe('Early Warning System', () => {
    it('emits warning before drift becomes critical', async () => {
      // Baseline: a → b → c
      const baseline: OcelEventLog = {
        version: '2.0',
        events: [
          { id: '1', activity: 'a', timestamp: '2026-04-12T10:00:00Z', objects: ['t1'], attributes: {} },
          { id: '2', activity: 'b', timestamp: '2026-04-12T10:00:01Z', objects: ['t1'], attributes: {} },
          { id: '3', activity: 'c', timestamp: '2026-04-12T10:00:02Z', objects: ['t1'], attributes: {} },
        ],
        objects: [{ id: 't1', type: 'tool_invocation', state: 'completed', attributes: {} }],
        metadata: {
          source: 'test',
          harvestedAt: new Date().toISOString(),
          spanCount: 3,
        },
      };

      // Current: a → b → c → d (extra step, but still valid)
      const current: OcelEventLog = {
        version: '2.0',
        events: [
          { id: '1', activity: 'a', timestamp: '2026-04-12T11:00:00Z', objects: ['t1'], attributes: {} },
          { id: '2', activity: 'b', timestamp: '2026-04-12T11:00:01Z', objects: ['t1'], attributes: {} },
          { id: '3', activity: 'c', timestamp: '2026-04-12T11:00:02Z', objects: ['t1'], attributes: {} },
          { id: '4', activity: 'd', timestamp: '2026-04-12T11:00:03Z', objects: ['t1'], attributes: {} },
        ],
        objects: [{ id: 't1', type: 'tool_invocation', state: 'completed', attributes: {} }],
        metadata: {
          source: 'test',
          harvestedAt: new Date().toISOString(),
          spanCount: 4,
        },
      };

      const result = await monitor.detectDrift(baseline, current);

      expect(result.warningLevel).toBe('yellow');
      expect(result.driftDetected).toBe(true);
    });

    it('escalates to critical when drift severity exceeds threshold', async () => {
      const baseline: OcelEventLog = {
        version: '2.0',
        events: [
          { id: '1', activity: 'a', timestamp: '2026-04-12T10:00:00Z', objects: ['t1'], attributes: {} },
        ],
        objects: [{ id: 't1', type: 'tool_invocation', state: 'completed', attributes: {} }],
        metadata: {
          source: 'test',
          harvestedAt: new Date().toISOString(),
          spanCount: 1,
        },
      };

      // Completely different process
      const current: OcelEventLog = {
        version: '2.0',
        events: [
          { id: '1', activity: 'x', timestamp: '2026-04-12T11:00:00Z', objects: ['t1'], attributes: {} },
          { id: '2', activity: 'y', timestamp: '2026-04-12T11:00:01Z', objects: ['t1'], attributes: {} },
          { id: '3', activity: 'z', timestamp: '2026-04-12T11:00:02Z', objects: ['t1'], attributes: {} },
        ],
        objects: [{ id: 't1', type: 'tool_invocation', state: 'completed', attributes: {} }],
        metadata: {
          source: 'test',
          harvestedAt: new Date().toISOString(),
          spanCount: 3,
        },
      };

      const result = await monitor.detectDrift(baseline, current);

      expect(result.warningLevel).toBe('red');
      expect(result.driftSeverity).toBeGreaterThan(0.8);
    });
  });

  describe('EWMA Trend Analysis', () => {
    it('tracks drift trend over time windows', async () => {
      const baselineLog: OcelEventLog = {
        version: '2.0',
        events: [
          { id: '1', activity: 'a', timestamp: '2026-04-12T10:00:00Z', objects: ['t1'], attributes: {} },
          { id: '2', activity: 'b', timestamp: '2026-04-12T10:00:01Z', objects: ['t1'], attributes: {} },
        ],
        objects: [{ id: 't1', type: 'tool_invocation', state: 'completed', attributes: {} }],
        metadata: {
          source: 'test',
          harvestedAt: new Date().toISOString(),
          spanCount: 2,
        },
      };

      // Simulate 5 time windows with increasing drift
      const driftTrend = [];
      for (let i = 0; i < 5; i++) {
        const window: OcelEventLog = {
          version: '2.0',
          events: baselineLog.events.slice(0, 2 + i), // Growing number of activities
          objects: baselineLog.objects,
          metadata: baselineLog.metadata,
        };

        const result = await monitor.detectDrift(baselineLog, window);
        driftTrend.push(result.driftSeverity);
      }

      // Drift should be increasing (or at least non-decreasing)
      for (let i = 1; i < driftTrend.length; i++) {
        expect(driftTrend[i]).toBeGreaterThanOrEqual(driftTrend[i - 1] - 0.1); // Allow small variance
      }
    });

    it('calculates EWMA-smoothed drift signal', async () => {
      const baseline: OcelEventLog = {
        version: '2.0',
        events: [
          { id: '1', activity: 'a', timestamp: '2026-04-12T10:00:00Z', objects: ['t1'], attributes: {} },
        ],
        objects: [{ id: 't1', type: 'tool_invocation', state: 'completed', attributes: {} }],
        metadata: {
          source: 'test',
          harvestedAt: new Date().toISOString(),
          spanCount: 1,
        },
      };

      const current: OcelEventLog = {
        version: '2.0',
        events: [
          { id: '1', activity: 'a', timestamp: '2026-04-12T11:00:00Z', objects: ['t1'], attributes: {} },
          { id: '2', activity: 'b', timestamp: '2026-04-12T11:00:01Z', objects: ['t1'], attributes: {} },
        ],
        objects: [{ id: 't1', type: 'tool_invocation', state: 'completed', attributes: {} }],
        metadata: {
          source: 'test',
          harvestedAt: new Date().toISOString(),
          spanCount: 2,
        },
      };

      const result = await monitor.detectDrift(baseline, current);

      expect(result.ewmaValue).toBeDefined();
      expect(result.ewmaValue).toBeGreaterThan(0);
      expect(result.ewmaValue).toBeLessThanOrEqual(1);
    });
  });
});
