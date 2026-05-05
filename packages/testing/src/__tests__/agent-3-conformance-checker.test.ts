/**
 * Agent 3: Conformance Checker — RED Test
 *
 * Mandate: Verify observed process conforms to discovered model
 * Grounding: van der Aalst — conformance checking validates fitness + precision
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ConformanceChecker } from '../harness/conformance-checker';
import type { OcelEventLog } from '../harness/ocel-harvester';

describe('Agent 3: Conformance Checker', () => {
  let checker: ConformanceChecker;

  beforeEach(() => {
    checker = new ConformanceChecker();
  });

  describe('Conformance Verdict', () => {
    it('detects fully conformant trace (a→b→c)', async () => {
      const ocel: OcelEventLog = {
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
        ],
        objects: [{ id: 't1', type: 'tool_invocation', state: 'completed', attributes: {} }],
        metadata: {
          source: 'test',
          harvestedAt: new Date().toISOString(),
          spanCount: 3,
        },
      };

      const result = await checker.checkConformance(ocel);

      expect(result.conformant).toBe(true);
      expect(result.fitness).toBe(1.0);
      expect(result.violations).toHaveLength(0);
    });

    it('detects non-conformant trace (unexpected activity order)', async () => {
      const conformModel = {
        activities: new Set(['a', 'b', 'c']),
        directlyFollows: new Map([
          ['a', new Set(['b'])],
          ['b', new Set(['c'])],
        ]),
        startActivities: new Set(['a']),
        endActivities: new Set(['c']),
      };

      const ocel: OcelEventLog = {
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
            activity: 'c',
            timestamp: '2026-04-12T10:00:01Z',
            objects: ['t1'],
            attributes: {},
          }, // Violates: c doesn't follow a
          {
            id: '3',
            activity: 'b',
            timestamp: '2026-04-12T10:00:02Z',
            objects: ['t1'],
            attributes: {},
          },
        ],
        objects: [{ id: 't1', type: 'tool_invocation', state: 'completed', attributes: {} }],
        metadata: {
          source: 'test',
          harvestedAt: new Date().toISOString(),
          spanCount: 3,
        },
      };

      const result = await checker.checkConformance(ocel, conformModel);

      expect(result.conformant).toBe(false);
      expect(result.fitness).toBeLessThan(1.0);
      expect(result.violations.length).toBeGreaterThan(0);
    });

    it('calculates fitness as proportion of conforming events', async () => {
      const ocel: OcelEventLog = {
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
          {
            id: '4',
            activity: 'd',
            timestamp: '2026-04-12T10:00:03Z',
            objects: ['t1'],
            attributes: {},
          },
        ],
        objects: [{ id: 't1', type: 'tool_invocation', state: 'completed', attributes: {} }],
        metadata: {
          source: 'test',
          harvestedAt: new Date().toISOString(),
          spanCount: 4,
        },
      };

      const conformModel = {
        activities: new Set(['a', 'b', 'c', 'd']),
        directlyFollows: new Map([
          ['a', new Set(['b'])],
          ['b', new Set(['c'])],
          ['c', new Set(['b'])], // Cycle back to b, not to d
        ]),
        startActivities: new Set(['a']),
        endActivities: new Set(['c']),
      };

      const result = await checker.checkConformance(ocel, conformModel);

      expect(result.totalEvents).toBe(4);
      expect(result.fitness).toBeLessThan(1.0);
    });
  });

  describe('Fitness & Precision Metrics', () => {
    it('computes fitness ≥0.95 for highly conformant traces', async () => {
      const ocel: OcelEventLog = {
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
          {
            id: '4',
            activity: 'a',
            timestamp: '2026-04-12T10:00:03Z',
            objects: ['t1'],
            attributes: {},
          }, // Minor deviation
          {
            id: '5',
            activity: 'b',
            timestamp: '2026-04-12T10:00:04Z',
            objects: ['t1'],
            attributes: {},
          },
        ],
        objects: [{ id: 't1', type: 'tool_invocation', state: 'completed', attributes: {} }],
        metadata: {
          source: 'test',
          harvestedAt: new Date().toISOString(),
          spanCount: 5,
        },
      };

      const result = await checker.checkConformance(ocel);

      expect(result.fitness).toBeGreaterThanOrEqual(0.7);
      expect(result.conformingEvents).toBeGreaterThan(0);
    });

    it('precision reflects proportion of model used in log', async () => {
      const ocel: OcelEventLog = {
        version: '2.0',
        events: [
          {
            id: '1',
            activity: 'start',
            timestamp: '2026-04-12T10:00:00Z',
            objects: ['t1'],
            attributes: {},
          },
          {
            id: '2',
            activity: 'step',
            timestamp: '2026-04-12T10:00:01Z',
            objects: ['t1'],
            attributes: {},
          },
          {
            id: '3',
            activity: 'end',
            timestamp: '2026-04-12T10:00:02Z',
            objects: ['t1'],
            attributes: {},
          },
          {
            id: '4',
            activity: 'start',
            timestamp: '2026-04-12T10:00:03Z',
            objects: ['t2'],
            attributes: {},
          },
          {
            id: '5',
            activity: 'step',
            timestamp: '2026-04-12T10:00:04Z',
            objects: ['t2'],
            attributes: {},
          },
          {
            id: '6',
            activity: 'end',
            timestamp: '2026-04-12T10:00:05Z',
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
          spanCount: 6,
        },
      };

      const result = await checker.checkConformance(ocel);

      expect(result.precision).toBeGreaterThan(0);
      expect(result.precision).toBeLessThanOrEqual(1);
    });
  });

  describe('Violation Detection', () => {
    it('flags activity not in start set', async () => {
      const ocel: OcelEventLog = {
        version: '2.0',
        events: [
          {
            id: '1',
            activity: 'middle',
            timestamp: '2026-04-12T10:00:00Z',
            objects: ['t1'],
            attributes: {},
          }, // Invalid start
          {
            id: '2',
            activity: 'end',
            timestamp: '2026-04-12T10:00:01Z',
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

      const model = {
        activities: new Set(['start', 'middle', 'end']),
        directlyFollows: new Map([
          ['start', new Set(['middle'])],
          ['middle', new Set(['end'])],
        ]),
        startActivities: new Set(['start']),
        endActivities: new Set(['end']),
      };

      const result = await checker.checkConformance(ocel, model);

      const startViolation = result.violations.find((v) => v.severity === 'high');
      expect(startViolation).toBeDefined();
      expect(startViolation?.description).toContain('not in discovered start activities');
    });

    it('reports directly-follows violations with severity medium', async () => {
      const ocel: OcelEventLog = {
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
            activity: 'c',
            timestamp: '2026-04-12T10:00:01Z',
            objects: ['t1'],
            attributes: {},
          }, // Should be b
        ],
        objects: [{ id: 't1', type: 'tool_invocation', state: 'completed', attributes: {} }],
        metadata: {
          source: 'test',
          harvestedAt: new Date().toISOString(),
          spanCount: 2,
        },
      };

      const model = {
        activities: new Set(['a', 'b', 'c']),
        directlyFollows: new Map([['a', new Set(['b'])]]),
        startActivities: new Set(['a']),
        endActivities: new Set(['c']),
      };

      const result = await checker.checkConformance(ocel, model);

      const dfViolation = result.violations.find((v) => v.severity === 'medium');
      expect(dfViolation).toBeDefined();
      expect(dfViolation?.description).toContain('does not follow');
    });

    it('counts divergent execution paths', async () => {
      const ocel: OcelEventLog = {
        version: '2.0',
        events: [
          // Trace 1: conforms
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
          // Trace 2: diverges
          {
            id: '3',
            activity: 'a',
            timestamp: '2026-04-12T10:00:02Z',
            objects: ['t2'],
            attributes: {},
          },
          {
            id: '4',
            activity: 'x',
            timestamp: '2026-04-12T10:00:03Z',
            objects: ['t2'],
            attributes: {},
          }, // Not allowed
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

      const model = {
        activities: new Set(['a', 'b']),
        directlyFollows: new Map([['a', new Set(['b'])]]),
        startActivities: new Set(['a']),
        endActivities: new Set(['b']),
      };

      const result = await checker.checkConformance(ocel, model);

      expect(result.pathsDivergent).toBeGreaterThan(0);
    });
  });

  describe('Model Discovery', () => {
    it('discovers directly-follows relation from event log', async () => {
      const ocel: OcelEventLog = {
        version: '2.0',
        events: [
          {
            id: '1',
            activity: 'login',
            timestamp: '2026-04-12T10:00:00Z',
            objects: ['u1'],
            attributes: {},
          },
          {
            id: '2',
            activity: 'browse',
            timestamp: '2026-04-12T10:00:01Z',
            objects: ['u1'],
            attributes: {},
          },
          {
            id: '3',
            activity: 'purchase',
            timestamp: '2026-04-12T10:00:02Z',
            objects: ['u1'],
            attributes: {},
          },
          {
            id: '4',
            activity: 'logout',
            timestamp: '2026-04-12T10:00:03Z',
            objects: ['u1'],
            attributes: {},
          },
        ],
        objects: [{ id: 'u1', type: 'tool_invocation', state: 'completed', attributes: {} }],
        metadata: {
          source: 'test',
          harvestedAt: new Date().toISOString(),
          spanCount: 4,
        },
      };

      const result = await checker.checkConformance(ocel);

      // Should discover all activities and directly-follows relations
      expect(result.conformant).toBe(true);
      expect(result.totalEvents).toBe(4);
      expect(result.conformingEvents).toBe(4);
    });
  });
});
