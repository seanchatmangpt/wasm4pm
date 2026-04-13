/**
 * Agent 4: Soundness Verifier — RED Test
 *
 * Mandate: Verify van der Aalst soundness properties (deadlock-free, liveness, boundedness)
 * Ground Truth: Process must not deadlock, must complete, must not grow unbounded
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SoundnessVerifier } from '../harness/soundness-verifier';
import type { OcelEventLog } from '../harness/ocel-harvester';

describe('Agent 4: Soundness Verifier', () => {
  let verifier: SoundnessVerifier;

  beforeEach(() => {
    verifier = new SoundnessVerifier();
  });

  describe('Deadlock-Free Property', () => {
    it('detects absence of circular waits', async () => {
      const ocel: OcelEventLog = {
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

      const result = await verifier.verify(ocel);

      expect(result.deadlockFree).toBe(true);
      expect(result.deadlockCycles).toHaveLength(0);
    });

    it('detects circular wait patterns', async () => {
      // Simulate circular wait: A holds a, wants b. B holds b, wants a
      const ocel: OcelEventLog = {
        version: '2.0',
        events: [
          {
            id: '1',
            activity: 'acquire_a',
            timestamp: '2026-04-12T10:00:00Z',
            objects: ['proc_1'],
            attributes: { 'resource': 'a' },
          },
          {
            id: '2',
            activity: 'wait_b',
            timestamp: '2026-04-12T10:00:01Z',
            objects: ['proc_1'],
            attributes: { 'waiting_for': 'b' },
          },
          {
            id: '3',
            activity: 'acquire_b',
            timestamp: '2026-04-12T10:00:02Z',
            objects: ['proc_2'],
            attributes: { 'resource': 'b' },
          },
          {
            id: '4',
            activity: 'wait_a',
            timestamp: '2026-04-12T10:00:03Z',
            objects: ['proc_2'],
            attributes: { 'waiting_for': 'a' },
          },
        ],
        objects: [
          { id: 'proc_1', type: 'tool_invocation', state: 'in_progress', attributes: {} },
          { id: 'proc_2', type: 'tool_invocation', state: 'in_progress', attributes: {} },
        ],
        metadata: {
          source: 'test',
          harvestedAt: new Date().toISOString(),
          spanCount: 4,
        },
      };

      const result = await verifier.verify(ocel);

      expect(result.deadlockFree).toBe(false);
      expect(result.deadlockCycles.length).toBeGreaterThan(0);
    });
  });

  describe('Liveness Property', () => {
    it('verifies all activities eventually complete', async () => {
      const ocel: OcelEventLog = {
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

      const result = await verifier.verify(ocel);

      expect(result.liveness).toBe(true);
      expect(result.incompleteTasks).toHaveLength(0);
    });

    it('detects infinite loops', async () => {
      // Simulate infinite loop: a → b → a → b → a (no terminal state)
      const ocel: OcelEventLog = {
        version: '2.0',
        events: [
          { id: '1', activity: 'a', timestamp: '2026-04-12T10:00:00Z', objects: ['t1'], attributes: {} },
          { id: '2', activity: 'b', timestamp: '2026-04-12T10:00:01Z', objects: ['t1'], attributes: {} },
          { id: '3', activity: 'a', timestamp: '2026-04-12T10:00:02Z', objects: ['t1'], attributes: {} },
          { id: '4', activity: 'b', timestamp: '2026-04-12T10:00:03Z', objects: ['t1'], attributes: {} },
          { id: '5', activity: 'a', timestamp: '2026-04-12T10:00:04Z', objects: ['t1'], attributes: {} },
        ],
        objects: [{ id: 't1', type: 'tool_invocation', state: 'in_progress', attributes: {} }],
        metadata: {
          source: 'test',
          harvestedAt: new Date().toISOString(),
          spanCount: 5,
        },
      };

      const result = await verifier.verify(ocel);

      expect(result.liveness).toBe(false);
      expect(result.incompleteTasks.length).toBeGreaterThan(0);
    });
  });

  describe('Boundedness Property', () => {
    it('verifies resource consumption is bounded', async () => {
      const ocel: OcelEventLog = {
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

      const result = await verifier.verify(ocel);

      expect(result.bounded).toBe(true);
      expect(result.maxQueueDepth).toBeGreaterThan(0);
      expect(result.maxMemoryMb).toBeGreaterThan(0);
    });

    it('detects unbounded queue growth', async () => {
      // Simulate unbounded queue: producer adds infinitely without consumer
      const events = [];
      for (let i = 0; i < 1000; i++) {
        events.push({
          id: String(i),
          activity: 'produce',
          timestamp: new Date(Date.now() + i * 1000).toISOString(),
          objects: ['producer'],
          attributes: { 'queue_depth': i },
        });
      }

      const ocel: OcelEventLog = {
        version: '2.0',
        events,
        objects: [{ id: 'producer', type: 'tool_invocation', state: 'in_progress', attributes: {} }],
        metadata: {
          source: 'test',
          harvestedAt: new Date().toISOString(),
          spanCount: 1000,
        },
      };

      const result = await verifier.verify(ocel);

      expect(result.bounded).toBe(false);
      expect(result.maxQueueDepth).toBeGreaterThan(500);
    });
  });

  describe('Soundness Verdict', () => {
    it('returns SOUND when all three properties hold', async () => {
      const ocel: OcelEventLog = {
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

      const result = await verifier.verify(ocel);

      expect(result.verdict).toBe('SOUND');
    });

    it('returns UNSOUND when any property fails', async () => {
      const ocel: OcelEventLog = {
        version: '2.0',
        events: [
          { id: '1', activity: 'a', timestamp: '2026-04-12T10:00:00Z', objects: ['t1'], attributes: {} },
        ],
        objects: [{ id: 't1', type: 'tool_invocation', state: 'in_progress', attributes: {} }],
        metadata: {
          source: 'test',
          harvestedAt: new Date().toISOString(),
          spanCount: 1,
        },
      };

      const result = await verifier.verify(ocel);

      expect(result.verdict).toBe('UNSOUND');
    });
  });
});
